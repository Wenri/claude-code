import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(
  new URL('../../src/QueryEngine.ts', import.meta.url),
  'utf8',
)

test('2.1.90 bundle contains the incremental transcript cursor', () => {
  const targetBundlePath = process.env.CLAUDE_CODE_2_1_90_BUNDLE
  assert.ok(
    targetBundlePath,
    'CLAUDE_CODE_2_1_90_BUNDLE environment variable must be set',
  )
  const target = fs.readFileSync(targetBundlePath, 'utf8')

  assert.equal(
    target.includes(
      'let s=[...this.mutableMessages],r=0,z6,l=()=>{let b6=r;' +
        'if(b6>=s.length)return Promise.resolve(null);' +
        'let B6=b6===0?s:s.slice(b6);r=s.length;let S6=z6;' +
        'for(let N6=B6.length-1;N6>=0;N6--){let _6=B6[N6];' +
        'if(oJ6(_6)&&N36(_6)){z6=_6.uuid;break}}' +
        'return Gm(B6,void 0,S6,s)};',
    ),
    true,
  )
  assert.equal(
    target.includes('s.splice(0,N6),r=s.length'),
    true,
  )
})

test('QueryEngine recovery preserves cursor, parent, and await semantics', () => {
  assert.match(
    source,
    /const end = transcriptCursorEnd\([\s\S]*?Math\.max\(start, initialTranscriptLength\),[\s\S]*?!forceIncompleteAssistant,[\s\S]*?\)/,
  )
  assert.match(
    source,
    /const newMessages =\s+start === 0 && end === messages\.length\s+\? messages\s+: messages\.slice\(start, end\)/,
  )
  assert.match(
    source,
    /if \(isLoggableMessage\(message\) && isChainParticipant\(message\)\) \{\s+lastRecordedUuid = message\.uuid/,
  )
  assert.match(
    source,
    /return recordTranscript\(\s+newMessages,\s+undefined,\s+startingParentUuid,\s+messages,\s+\)/,
  )
  assert.match(
    source,
    /await recordTranscript\(this\.mutableMessages\.slice\(0, tailIdx \+ 1\)\)\s+transcriptCursor = 0\s+lastRecordedUuid = undefined/,
  )
  assert.match(
    source,
    /messages\.splice\(0, localBoundaryIdx\)\s+transcriptCursor = messages\.length/,
  )
  assert.match(
    source,
    /if \(message\.type === 'assistant'\) \{\s+void recordNewMessages\(\)\s+\} else \{\s+await recordNewMessages\(\)/,
  )

  assert.equal(source.match(/\brecordTranscript\(/g)?.length, 3)
  assert.equal(source.match(/\brecordNewMessages\(\)/g)?.length, 7)
  assert.equal(source.match(/\brecordNewMessages\(true\)/g)?.length, 4)
})
