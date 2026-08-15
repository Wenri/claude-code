import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

const retainedNames = [
  'addSessionMirror',
  'appendEntryToFileAsync',
  'ENTRY_APPEND_POLICY',
  'findDeferredToolMarkerInTranscript',
  'listSubagentIdsFromDisk',
]

test('authenticates retained session-storage surfaces and live cardinality', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')
    for (const name of retainedNames) {
      assert.equal(
        bundle.split(name).length - 1,
        1,
        `${version}: one ${name} export`,
      )
    }

    const addMirror = bundle.match(/addSessionMirror:\(\)=>([\w$]+)/)?.[1]
    const listAgents = bundle.match(
      /listSubagentIdsFromDisk:\(\)=>([\w$]+)/,
    )?.[1]
    assert.ok(addMirror && listAgents, `${version}: live helper aliases`)
    assert.equal(
      bundle.split(addMirror).length - 1,
      3,
      `${version}: mirror export, definition and SDK caller`,
    )
    assert.equal(
      bundle.split(listAgents).length - 1,
      4,
      `${version}: list export, definition and two callers`,
    )

    const append = bundle.match(/appendEntryToFileAsync:\(\)=>([\w$]+)/)?.[1]
    assert.ok(append, `${version}: async append alias`)
    assert.match(
      bundle,
      new RegExp(
        `async function ${append.replaceAll('$', '\\$')}\\([\\w$]+,[\\w$]+\\)\\{let [\\w$]+=[\\w$]+\\([\\w$]+\\)\\+\`\\n\`;try\\{await [\\w$]+\\.appendFile\\([\\w$]+,[\\w$]+,\\{mode:384\\}\\)\\}catch\\{await [\\w$]+\\.mkdir\\([\\w$]+\\.dirname\\([\\w$]+\\),\\{recursive:!0,mode:448\\}\\),await [\\w$]+\\.appendFile\\([\\w$]+,[\\w$]+,\\{mode:384\\}\\)\\}[\\w$]+\\(\\)\\.fireMirror\\([\\w$]+,\\[[\\w$]+\\]\\)\\}`,
      ),
      `${version}: exact async append and mirror semantics`,
    )

    const policy = bundle.match(/ENTRY_APPEND_POLICY:\(\)=>([\w$]+)/)?.[1]
    assert.ok(policy, `${version}: policy alias`)
    const policyStart = bundle.indexOf(`${policy}={`)
    assert.notEqual(policyStart, -1, `${version}: policy definition`)
    const policyWitness = bundle.slice(policyStart, policyStart + 900)
    assert.match(
      policyWitness,
      /user:"dedup-transcript",assistant:"dedup-transcript",attachment:"dedup-transcript",system:"dedup-transcript",progress:"dedup-transcript"/,
    )
    assert.match(
      policyWitness,
      /"content-replacement":"route-by-agent","fork-context-ref":"route-by-agent"/,
    )
  }
})

test('source exposes target names while preserving compatibility aliases', () => {
  const source = readFileSync(
    new URL('../../src/utils/sessionStorage.ts', import.meta.url),
    'utf8',
  )
  const print = readFileSync(
    new URL('../../src/cli/print.ts', import.meta.url),
    'utf8',
  )
  const recovery = readFileSync(
    new URL('../../src/utils/conversationRecovery.ts', import.meta.url),
    'utf8',
  )
  const bridge = readFileSync(
    new URL('../../src/bridge/initReplBridge.ts', import.meta.url),
    'utf8',
  )

  for (const name of retainedNames) {
    assert.match(source, new RegExp(`export (?:async )?(?:function|const) ${name}`))
  }
  assert.match(source, /registerSessionMirror = addSessionMirror/)
  assert.match(
    source,
    /findLastDeferredToolUse = findDeferredToolMarkerInTranscript/,
  )
  assert.match(source, /listLocalAgentIds = listSubagentIdsFromDisk/)
  assert.match(print, /addSessionMirror\(\(filePath, entries\) =>/)
  assert.match(recovery, /findDeferredToolMarkerInTranscript\(transcriptPath\)/)
  assert.match(bridge, /await listSubagentIdsFromDisk\(\)/)
  assert.match(
    source,
    /export async function appendEntryToFileAsync[\s\S]*?await fsAppendFile[\s\S]*?fireSessionMirror\(fullPath, \[entry\]\)/,
  )
})
