import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.89-to-2.1.90'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetPath = process.env.CLAUDE_CODE_2_1_90_BUNDLE
const baselinePath = process.env.CLAUDE_CODE_2_1_89_BUNDLE
const targetSha =
  '069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9'
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

function around(text, needle, before = 1000, after = 2500) {
  const offset = text.indexOf(needle)
  assert.notEqual(offset, -1, needle)
  return text.slice(Math.max(0, offset - before), offset + after)
}

test(
  'target90 introduces default suppression for every handled LogSelector key',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath || !baselinePath
        ? 'CLAUDE_CODE_2_1_89_BUNDLE and CLAUDE_CODE_2_1_90_BUNDLE are required'
        : false,
  },
  () => {
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(targetBytes), targetSha)
    const target = targetBytes.toString('utf8')
    const baseline = fs.readFileSync(baselinePath, 'utf8')
    const region = structural.regions[14395]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [
        10_589_207,
        10_609_599,
        'e3e68f2df9a545c06c2c8c617963a075e3a35229190ae203b88e55541b537694',
      ],
    )
    assert.equal(
      sha256(target.slice(region.target.start, region.target.end)),
      region.target.sourceHash,
    )

    const targetHandler = around(target, 'tengu_session_all_projects_toggled')
    const baselineHandler = around(
      baseline,
      'tengu_session_all_projects_toggled',
    )
    for (const fragment of [
      'key==="a"&&J)Q1.preventDefault()',
      'key==="b"){Q1.preventDefault()',
      'key==="w"&&c){Q1.preventDefault()',
      'Uz==="/"&&eq)Q1.preventDefault()',
      'key==="r"&&B3)Q1.preventDefault()',
      'key==="v"&&B3)Q1.preventDefault()',
      '!/^[a-z]+\\d*$/.test(Q1.key)',
      '!/^\\s+$/.test(Q1.key))Q1.preventDefault()',
    ]) {
      assert.ok(targetHandler.includes(fragment), fragment)
    }
    assert.equal(
      /preventDefault\(\)[\s\S]{0,160}tengu_session_all_projects_toggled/.test(
        baselineHandler,
      ),
      false,
    )
  },
)

test(
  'materialized target90 LogSelector owns the complete event suppression graph',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'components/LogSelector.tsx'),
      'utf8',
    )
    const historical = semanticCase === caseName
    const handlerAnchor = historical
      ? 't53 = (input, key, event) =>'
      : 'function handleKeyDown(event: KeyboardEvent): void'
    assert.ok(source.includes(handlerAnchor), handlerAnchor)
    const handlerStart = source.indexOf(handlerAnchor)
    const handlerEnd = source.indexOf(
      historical ? 't53 = $[147]' : 'function handlePaste',
      handlerStart,
    )
    assert.ok(handlerStart >= 0 && handlerEnd > handlerStart)
    const handler = source.slice(handlerStart, handlerEnd)
    assert.ok(
      (handler.match(/event\.preventDefault\(\);/g) ?? []).length >=
        (historical ? 12 : 6),
    )
    const protectedAnchors = historical
      ? [
          'lowerInput === "a" && key.ctrl',
          'lowerInput === "b" && key.ctrl',
          'lowerInput === "w" && key.ctrl',
          'lowerInput === "/" && keyIsNotCtrlOrMeta',
          'lowerInput === "r" && key.ctrl',
          'lowerInput === "v" && key.ctrl',
        ]
      : [
          "event.ctrl && event.key === 'a' && onToggleAllProjects",
          "event.ctrl && event.key === 'b'",
          "event.ctrl && event.key === 'w' && hasMultipleWorktrees",
          "lowerKey === '/' && unmodified",
          "event.ctrl && event.key === 'r' && focusedLog",
          "event.ctrl && event.key === 'v'",
        ]
    if (historical) {
      protectedAnchors.push(
        'exitSearchMode();',
        'handleAgenticSearch();',
        'setIsAgenticSearchOptionFocused(false);',
        'if (hasTags && key.tab)',
        '!/^[a-z]+\\d*$/.test(input)',
      )
    }
    for (const anchor of protectedAnchors) {
      const at = handler.indexOf(anchor)
      assert.notEqual(at, -1, anchor)
      assert.ok(
        handler.slice(Math.max(0, at - 120), at + 220).includes(
          'event.preventDefault();',
        ),
        `${anchor}: preventDefault`,
      )
    }
  },
)
