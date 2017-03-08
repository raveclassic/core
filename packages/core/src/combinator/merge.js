/** @license MIT License (c) copyright 2010-2016 original author or authors */
/** @author Brian Cavalier */
/** @author John Hann */

import Pipe from '../sink/Pipe'
import IndexSink from '../sink/IndexSink'
import { empty } from '../source/core'
import { all, tryDispose } from '../disposable/dispose'
import { copy, reduce } from '@most/prelude'

/**
 * @returns {Stream} stream containing events from all streams in the argument
 * list in time order.  If two events are simultaneous they will be merged in
 * arbitrary order.
 */
export function merge (/* ...streams*/) {
  return mergeArray(copy(arguments))
}

/**
 * @param {Array} streams array of stream to merge
 * @returns {Stream} stream containing events from all input observables
 * in time order.  If two events are simultaneous they will be merged in
 * arbitrary order.
 */
export const mergeArray = streams =>
  streams.length === 0 ? empty()
    : streams.length === 1 ? streams[0]
    : mergeStreams(streams)

/**
 * This implements fusion/flattening for merge.  It will
 * fuse adjacent merge operations.  For example:
 * - a.merge(b).merge(c) effectively becomes merge(a, b, c)
 * - merge(a, merge(b, c)) effectively becomes merge(a, b, c)
 * It does this by concatenating the sources arrays of
 * any nested Merge sources, in effect "flattening" nested
 * merge operations into a single merge.
 */
const mergeStreams = streams =>
  new Merge(reduce(appendSources, [], streams))

const appendSources = (sources, stream) =>
  sources.concat(stream instanceof Merge ? stream.sources : stream)

class Merge {
  constructor (sources) {
    this.sources = sources
  }

  run (sink, scheduler) {
    const l = this.sources.length
    const disposables = new Array(l)
    const sinks = new Array(l)

    const mergeSink = new MergeSink(disposables, sinks, sink)

    for (let indexSink, i = 0; i < l; ++i) {
      indexSink = sinks[i] = new IndexSink(i, mergeSink)
      disposables[i] = this.sources[i].run(indexSink, scheduler)
    }

    return all(disposables)
  }
}

class MergeSink extends Pipe {
  constructor (disposables, sinks, sink) {
    super(sink)
    this.disposables = disposables
    this.activeCount = sinks.length
  }

  event (t, indexValue) {
    this.sink.event(t, indexValue.value)
  }

  end (t, indexedValue) {
    tryDispose(t, this.disposables[indexedValue.index], this.sink)
    if (--this.activeCount === 0) {
      this.sink.end(t, indexedValue.value)
    }
  }
}
