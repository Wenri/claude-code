import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  consumeSSEChunks,
} from '../cases/2.1.89-to-2.1.90/recovered/sse-stream-buffer-model.mjs'

const transportSourcePath = fileURLToPath(
  new URL('../../src/cli/transports/SSETransport.ts', import.meta.url),
)

function parseDelimitedFrames(buffer) {
  const frames = []
  let position = 0
  let boundary

  while ((boundary = buffer.indexOf('\n\n', position)) !== -1) {
    frames.push(buffer.slice(position, boundary))
    position = boundary + 2
  }

  return { frames, remaining: buffer.slice(position) }
}

test('parses complete frames when the delimiter spans decoded chunks', () => {
  const result = consumeSSEChunks(
    [
      'event: first\ndata: alpha\n',
      '',
      '\n',
      'event: second\ndata: be',
      'ta\n\n',
      'incomplete tail',
    ],
    parseDelimitedFrames,
  )

  assert.deepEqual(result.frames, [
    'event: first\ndata: alpha',
    'event: second\ndata: beta',
  ])
  assert.deepEqual(result.parseInputs, [
    'event: first\ndata: alpha\n\n',
    'event: second\ndata: beta\n\n',
  ])
  assert.deepEqual(result.remainingChunks, ['incomplete tail'])
  assert.equal(result.previousChunkEndsWithNewline, false)
})

test('defers parsing a large frame until a boundary is observed', () => {
  const frameChunkCount = 10_000
  let parseCalls = 0
  const parseFrames = buffer => {
    parseCalls++
    return parseDelimitedFrames(buffer)
  }

  const result = consumeSSEChunks(
    [
      'data: ',
      ...Array.from({ length: frameChunkCount }, () => 'x'),
      '\n',
      '\n',
    ],
    parseFrames,
  )

  assert.equal(parseCalls, 1)
  assert.equal(result.parseInputs.length, 1)
  assert.equal(
    result.parseInputs[0],
    `data: ${'x'.repeat(frameChunkCount)}\n\n`,
  )
  assert.deepEqual(result.frames, [`data: ${'x'.repeat(frameChunkCount)}`])
  assert.deepEqual(result.remainingChunks, [])
})

test('detects a split delimiter after retaining an incomplete frame', () => {
  const result = consumeSSEChunks(
    ['data: first\n\ndata: second\n', '\n'],
    parseDelimitedFrames,
  )

  assert.deepEqual(result.frames, ['data: first', 'data: second'])
  assert.deepEqual(result.parseInputs, [
    'data: first\n\ndata: second\n',
    'data: second\n\n',
  ])
  assert.deepEqual(result.remainingChunks, [])
})

test('production source uses the recovered boundary-gated chunk algorithm', () => {
  const source = fs.readFileSync(transportSourcePath, 'utf8')

  assert.match(source, /let chunks: string\[\] = \[\]/)
  assert.match(
    source,
    /\(previousChunkEndsWithNewline && chunk\[0\] === '\\n'\)/,
  )
  assert.match(source, /chunk\.includes\('\\n\\n'\)/)
  assert.match(source, /parseSSEFrames\(chunks\.join\(''\)\)/)
  assert.match(source, /chunks = remaining \? \[remaining\] : \[\]/)
})
