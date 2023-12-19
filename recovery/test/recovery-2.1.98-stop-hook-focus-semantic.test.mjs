import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target98 pins the Stop-hook Tab and Delete focus evolution',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.97, 2.1.98, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
    )
    assert.equal(
      sha256(targetBytes),
      '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const region = structural.regions[15319]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.index,
        region.target.nodeType,
        region.target.parseStatus,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [
        15319,
        'FunctionDeclaration',
        'parsed',
        11283943,
        11286786,
        '13924f9f1f7660907b8a87b024d41aec0ef98e5da029fef544a86f5953b80a9f',
      ],
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    assert.equal(sha256(target.slice(11283943, 11286786)), region.target.sourceHash)
    assert.equal(baseline.includes('action:"switch focus"'), false)
    for (const fragment of [
      'if(w6.key==="tab"){w6.preventDefault()',
      'if(X==="delete"&&w6.key==="return")w6.preventDefault()',
      'chord:"tab",action:"switch focus"',
      'X==="delete"?"› ":"  ","Delete this hook"',
      'title:"Set Stop hook (this session only)"',
    ]) assert.ok(target.includes(fragment), fragment)
    assert.ok(latest.includes('action:"switch focus"'))
  },
)

test(
  'current source retains the evolved focus and input-guide graph',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !fs.existsSync(
          path.join(sourceRoot, 'commands/stop-hook/StopHookDialog.tsx'),
        )
        ? 'Stop-hook owner is introduced by the earlier 2.1.91-to-2.1.92 lineage supplement'
        : false,
  },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'commands/stop-hook/StopHookDialog.tsx'),
      'utf8',
    )
    for (const fragment of [
      "if (event.key === 'tab')",
      'event.preventDefault()',
      'setFocusedField(toggleFocusedField)',
      "if (focusedField === 'delete' && event.key === 'return')",
      '<KeyboardShortcutHint chord="tab" action="switch focus" />',
      'Delete this hook',
    ]) assert.ok(source.includes(fragment), fragment)
  },
)
