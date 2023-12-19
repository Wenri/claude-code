import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export function sha256Target113Replay(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(source, value) {
  if (value.length === 0) return 0
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(value, offset)) !== -1) {
    count++
    offset += value.length
  }
  return count
}

/**
 * Synchronously materialize the exact Target113 source candidate in memory.
 * Every operation accepts only its one pinned preimage or the exact idempotent
 * result. No source-tree writes are performed.
 */
export function buildTarget113SecondHalfHistoricalCandidate({
  replayFixture,
  sourceRoot,
}) {
  const candidate = new Map()
  const appliedByGroup = new Map()
  const getSource = ownerPath => {
    if (candidate.has(ownerPath)) return candidate.get(ownerPath)
    const relative = ownerPath.replace(/^src\//, '')
    const filename = path.join(sourceRoot, relative)
    const source = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : null
    candidate.set(ownerPath, source)
    return source
  }

  for (const group of replayFixture.groups) {
    let applied = 0
    for (const operation of group.operations) {
      const before = getSource(operation.path)
      if (operation.op === 'add-file') {
        if (before === null) {
          assert.equal(
            sha256Target113Replay(operation.content),
            operation.contentSha256,
            `${group.id}: ${operation.path} add-file payload hash`,
          )
          candidate.set(operation.path, operation.content)
          applied++
        } else {
          assert.equal(
            sha256Target113Replay(before),
            operation.contentSha256,
            `${group.id}: ${operation.path} add-file is exact or absent`,
          )
        }
        continue
      }

      assert.notEqual(before, null, `${group.id}: ${operation.path} exists`)
      let after = before
      if (operation.op === 'replace-exact') {
        if (
          (operation.after === '' && occurrences(before, operation.before) === 0) ||
          occurrences(before, operation.after) === 1
        ) {
          continue
        }
        assert.equal(
          occurrences(before, operation.before),
          1,
          `${group.id}: exact replacement preimage occurs once`,
        )
        after = before.replace(operation.before, operation.after)
      } else if (
        operation.op === 'insert-before' ||
        operation.op === 'insert-after'
      ) {
        if (before.includes(operation.content)) continue
        assert.equal(
          occurrences(before, operation.anchor),
          1,
          `${group.id}: insertion anchor occurs once`,
        )
        after = before.replace(
          operation.anchor,
          operation.op === 'insert-before'
            ? operation.content + operation.anchor
            : operation.anchor + operation.content,
        )
      } else if (operation.op === 'replace-region') {
        if (before.includes(operation.replacement)) continue
        assert.equal(
          occurrences(before, operation.startAnchor),
          1,
          `${group.id}: region start occurs once`,
        )
        assert.equal(
          occurrences(before, operation.endAnchor),
          1,
          `${group.id}: region end occurs once`,
        )
        const start = before.indexOf(operation.startAnchor)
        const end =
          before.indexOf(operation.endAnchor, start) + operation.endAnchor.length
        const removed = before.slice(start, end)
        assert.equal(
          sha256Target113Replay(removed),
          operation.beforeSha256,
          `${group.id}: region preimage hash`,
        )
        after = before.slice(0, start) + operation.replacement + before.slice(end)
      } else if (operation.op === 'replace-file') {
        if (sha256Target113Replay(before) === operation.afterSha256) continue
        assert.equal(
          sha256Target113Replay(before),
          operation.beforeSha256,
          `${group.id}: ${operation.path} whole-file preimage hash`,
        )
        assert.equal(
          sha256Target113Replay(operation.content),
          operation.afterSha256,
          `${group.id}: ${operation.path} whole-file payload hash`,
        )
        after = operation.content
      } else if (operation.op === 'replace-prefix') {
        const markerOffset = before.indexOf(operation.suffixMarker)
        assert.notEqual(
          markerOffset,
          -1,
          `${group.id}: ${operation.path} suffix marker exists`,
        )
        const prefix = before.slice(0, markerOffset)
        if (sha256Target113Replay(prefix) === operation.afterSha256) continue
        assert.equal(
          sha256Target113Replay(prefix),
          operation.beforeSha256,
          `${group.id}: ${operation.path} prefix preimage hash`,
        )
        assert.equal(
          sha256Target113Replay(operation.content),
          operation.afterSha256,
          `${group.id}: ${operation.path} prefix payload hash`,
        )
        after = operation.content + before.slice(markerOffset)
      } else {
        assert.fail(`${group.id}: unsupported operation ${operation.op}`)
      }
      candidate.set(operation.path, after)
      applied++
    }
    appliedByGroup.set(group.id, applied)
  }
  return { appliedByGroup, candidate }
}
