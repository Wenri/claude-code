#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import v8 from 'node:v8'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { parse, tokenizer } from 'acorn'
import {
  accountGeneratedDelta,
  encodeStructuralLedger,
} from '../lib/structural-delta.mjs'
import { generateReadableBundleDiff } from '../readable-diff/generator.mjs'

export const RELEASE_2_1_123 = Object.freeze({
  case: '2.1.122-to-2.1.123',
  release: '2.1.123',
  baseline: {
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
  target: {
    bytes: 13_949_576,
    sha256:
      '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd',
  },
  normalizedTarget: {
    bytes: 13_949_576,
    sha256:
      'd08802b85a5caf467db38fd74f14435ea4e476b4241b7f847533b9e3cdeeaa7c',
  },
  syntheticBaseline: {
    bytes: 13_949_764,
    sha256:
      'f33bda99465bcb10ccd4f2e9461fcec1d3913a7fc680668210283a14f0186d73',
  },
  targetTokens: 4_394_501,
  targetUnits: 22_302,
})

const METADATA_REPLACEMENTS = Object.freeze([
  {
    field: 'version',
    baseline: '2.1.122',
    target: '2.1.123',
  },
  {
    field: 'buildTimestamp',
    baseline: '2026-04-28T01:31:31Z',
    target: '2026-04-29T00:34:52Z',
  },
  {
    field: 'sourceRevision',
    baseline: '70046c58fb1c720f82bcbf39a3447dadf5bd33b2',
    target: '54903ade25087ef906df59ec6a608cc3a50a3f06',
  },
])

const EXPECTED_SLICES = Object.freeze([
  {
    id: 'baseline-combined-provider-and-kill-switch',
    surface: 'baseline',
    text:
      'function Tb(){let H=qK();return(H==="firstParty"||' +
      'H==="anthropicAws"||H==="foundry")&&!IH(process.env.' +
      'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)}',
    bytes: 142,
    sha256:
      '427f9782618293253302a1f6ef03077d67b20f456505e8fe391b60cfb4145abb',
  },
  {
    id: 'target-provider-only-helper',
    surface: 'target',
    text:
      'function an8(){let H=qK();return H==="firstParty"||' +
      'H==="anthropicAws"||H==="foundry"}',
    bytes: 85,
    sha256:
      '2f5a5d66fb2a75ebceac10fb1113c8a94bc41dad7fe94f34fe3185c69e603d86',
  },
  {
    id: 'target-kill-switch-helper',
    surface: 'target',
    text:
      'function bp(){return an8()&&!IH(process.env.' +
      'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)}',
    bytes: 84,
    sha256:
      '1c0dac7880f360d384fd1c70fe65925f5a3b8c5314a064dd9537aba152660679',
  },
  {
    id: 'baseline-outgoing-beta-filter',
    surface: 'baseline',
    text:
      'function tqK(H){if(Tb())return H;return H.filter(($)=>' +
      'sqK.has($))}',
    bytes: 66,
    sha256:
      'ca09b678e0cfc1fe27b2722b8ba3549e545fdd401ba4bb8bfb00fea22c237874',
  },
  {
    id: 'target-outgoing-beta-filter',
    surface: 'target',
    text:
      'function eqK(H){if(an8())return H;return H.filter(($)=>' +
      'tqK.has($))}',
    bytes: 67,
    sha256:
      'fe762ab7c6ec7e91341e58afb1daa3b5a3b842f2d0efdb1a1f2d01dff6876351',
  },
  {
    id: 'baseline-oauth-wif-condition',
    surface: 'baseline',
    text: 'if(Iq()||_&&!eL()&&oI())$.push(Lw)',
    bytes: 34,
    sha256:
      '29abf396b11aacacf2bfc4d688ccc079e25683257993f22e82d581884954051d',
  },
  {
    id: 'target-oauth-wif-condition',
    surface: 'target',
    text: 'if(Iq()||an8()&&!eL()&&oI())$.push(Lw)',
    bytes: 38,
    sha256:
      '7e5200863422ed9f1268f2a25f25a220f31985534c717384d9d0a491722196e8',
  },
  {
    id: 'oauth-beta-binding',
    surface: 'both',
    text: 'Lw="oauth-2025-04-20"',
    bytes: 21,
    sha256:
      '82d73766b4363a65a1b838bc6aba61fc0e543b0b482a79013cfbe32872d4d314',
  },
])

const EXPECTED_NODE_TYPE_DELTA = Object.freeze([
  { key: 'BlockStatement', baseline: 68_556, target: 68_557, delta: 1 },
  { key: 'CallExpression', baseline: 210_760, target: 210_762, delta: 2 },
  {
    key: 'FunctionDeclaration',
    baseline: 16_443,
    target: 16_444,
    delta: 1,
  },
  { key: 'Identifier', baseline: 1_277_369, target: 1_277_371, delta: 2 },
  { key: 'ReturnStatement', baseline: 50_699, target: 50_700, delta: 1 },
])

const OUTPUTS = Object.freeze({
  attribution: 'attribution',
  exactLedger: 'structural/known-delta-ledger.json.gz',
  metadataLedger: 'structural/metadata-normalized-delta.json.gz',
  proof: 'structural/known-delta-proof.json',
  rawLedger: 'structural/generated-delta.json.gz',
  readable: 'readable-diff',
})

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

function assertDeepEqual(actual, expected, label) {
  const actualText = JSON.stringify(actual)
  const expectedText = JSON.stringify(expected)
  if (actualText !== expectedText) {
    throw new Error(
      `${label}: expected ${expectedText}, got ${actualText}`,
    )
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function evidence(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function fileEvidence(filename) {
  return evidence(fs.readFileSync(filename))
}

function occurrences(contents, fragment) {
  assert(fragment.length > 0, 'cannot count an empty fragment')
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function authenticate(filename, expected, label) {
  const bytes = fs.readFileSync(filename)
  const actual = evidence(bytes)
  assertDeepEqual(actual, expected, `${label} artifact identity`)
  return { bytes, source: bytes.toString('utf8'), evidence: actual }
}

function literalKey(node) {
  if (node.type === 'TemplateElement') {
    return `template:${JSON.stringify(node.value.raw)}:` +
      JSON.stringify(node.value.cooked)
  }
  if (node.type !== 'Literal') return null
  if (node.regex) return `regex:${node.regex.pattern}/${node.regex.flags}`
  if (node.bigint !== undefined) return `bigint:${node.bigint}`
  const type = node.value === null ? 'null' : typeof node.value
  return `${type}:${JSON.stringify(node.value)}`
}

function isSemanticIdentifier(parent, key) {
  if (!parent) return false
  if (
    (parent.type === 'MemberExpression' ||
      parent.type === 'OptionalMemberExpression') &&
    key === 'property' &&
    !parent.computed
  ) {
    return true
  }
  if (
    ['Property', 'PropertyDefinition', 'MethodDefinition'].includes(
      parent.type,
    ) &&
    key === 'key' &&
    !parent.computed
  ) {
    return true
  }
  if (parent.type === 'MetaProperty') return true
  if (parent.type === 'ImportSpecifier' && key === 'imported') return true
  if (parent.type === 'ExportSpecifier' && key === 'exported') return true
  if (parent.type === 'LabeledStatement' && key === 'label') return true
  if (
    ['BreakStatement', 'ContinueStatement'].includes(parent.type) &&
    key === 'label'
  ) {
    return true
  }
  return false
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function collectInventory(source, label) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const result = {
    literals: new Map(),
    moduleSurface: new Map(),
    nodeTypes: new Map(),
    operators: new Map(),
    semanticProperties: new Map(),
  }
  const stack = [{ key: null, node: ast, parent: null }]
  while (stack.length > 0) {
    const { key, node, parent } = stack.pop()
    if (!node || typeof node !== 'object') continue
    increment(result.nodeTypes, node.type)
    const literal = literalKey(node)
    if (literal !== null) increment(result.literals, literal)
    if (typeof node.operator === 'string') {
      increment(result.operators, `${node.type}:${node.operator}`)
    }
    if (
      node.type === 'Identifier' &&
      isSemanticIdentifier(parent, key)
    ) {
      increment(result.semanticProperties, `${parent.type}:${node.name}`)
    }
    if (
      [
        'ImportDeclaration',
        'ExportNamedDeclaration',
        'ExportDefaultDeclaration',
        'ExportAllDeclaration',
        'ImportExpression',
      ].includes(node.type)
    ) {
      increment(
        result.moduleSurface,
        `${node.type}:${node.source?.value ?? ''}`,
      )
    }
    for (const [childKey, value] of Object.entries(node)) {
      if (['end', 'loc', 'raw', 'start'].includes(childKey)) continue
      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index -= 1) {
          if (value[index]?.type) {
            stack.push({ key: childKey, node: value[index], parent: node })
          }
        }
      } else if (value?.type) {
        stack.push({ key: childKey, node: value, parent: node })
      }
    }
  }
  assertEqual(ast.body.length, label === 'baseline' ? 22_301 : 22_302,
    `${label} top-level statement count`)
  return result
}

function mapDelta(baseline, target) {
  return [...new Set([...baseline.keys(), ...target.keys()])]
    .sort()
    .filter(key => (baseline.get(key) ?? 0) !== (target.get(key) ?? 0))
    .map(key => {
      const baselineCount = baseline.get(key) ?? 0
      const targetCount = target.get(key) ?? 0
      return {
        key,
        baseline: baselineCount,
        target: targetCount,
        delta: targetCount - baselineCount,
      }
    })
}

function expectedLiteralDelta() {
  return METADATA_REPLACEMENTS.flatMap(replacement => [
    {
      key: `string:${JSON.stringify(replacement.baseline)}`,
      baseline: 162,
      target: 0,
      delta: -162,
    },
    {
      key: `string:${JSON.stringify(replacement.target)}`,
      baseline: 0,
      target: 162,
      delta: 162,
    },
  ]).sort((left, right) => left.key.localeCompare(right.key))
}

function witnessRecord(spec, baseline, target) {
  const contents =
    spec.surface === 'baseline'
      ? baseline
      : spec.surface === 'target'
        ? target
        : null
  assertEqual(Buffer.byteLength(spec.text), spec.bytes, `${spec.id} bytes`)
  assertEqual(sha256(spec.text), spec.sha256, `${spec.id} SHA-256`)
  if (contents !== null) {
    assertEqual(occurrences(contents, spec.text), 1, `${spec.id} count`)
    return { ...spec, count: 1 }
  }
  const baselineCount = occurrences(baseline, spec.text)
  const targetCount = occurrences(target, spec.text)
  assertEqual(baselineCount, 1, `${spec.id} baseline count`)
  assertEqual(targetCount, 1, `${spec.id} target count`)
  return { ...spec, baselineCount, targetCount }
}

export function normalizeRelease21123Metadata({
  baseline,
  baselineInventory,
  target,
  targetInventory,
}) {
  const rawLiteralDelta = mapDelta(
    baselineInventory.literals,
    targetInventory.literals,
  )
  assertDeepEqual(
    rawLiteralDelta,
    expectedLiteralDelta(),
    'raw literal multiset delta',
  )

  const replacementsByTarget = new Map(
    METADATA_REPLACEMENTS.map(replacement => [replacement.target, replacement]),
  )
  const targetAst = parse(target, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const edits = []
  const literalCounts = new Map()
  const stack = [targetAst]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (
      node.type === 'Literal' &&
      typeof node.value === 'string' &&
      replacementsByTarget.has(node.value)
    ) {
      const replacement = replacementsByTarget.get(node.value)
      assertEqual(
        node.raw,
        JSON.stringify(replacement.target),
        `${replacement.field} target literal encoding`,
      )
      edits.push({
        end: node.end,
        start: node.start,
        text: JSON.stringify(replacement.baseline),
      })
      literalCounts.set(
        replacement.field,
        (literalCounts.get(replacement.field) ?? 0) + 1,
      )
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) stack.push(child)
      } else if (value?.type) {
        stack.push(value)
      }
    }
  }
  edits.sort((left, right) => right.start - left.start)
  let normalized = target
  for (const edit of edits) {
    normalized =
      normalized.slice(0, edit.start) + edit.text + normalized.slice(edit.end)
  }
  const replacements = []
  for (const replacement of METADATA_REPLACEMENTS) {
    const baselineTargetCount = occurrences(baseline, replacement.target)
    const baselineValueCount = occurrences(baseline, replacement.baseline)
    const targetValueCount = occurrences(target, replacement.target)
    const targetBaselineCount = occurrences(target, replacement.baseline)
    const rawCardinality = replacement.field === 'version' ? 163 : 162
    assertEqual(
      baselineTargetCount,
      0,
      `${replacement.field} target value in baseline`,
    )
    assertEqual(
      baselineValueCount,
      rawCardinality,
      `${replacement.field} baseline cardinality`,
    )
    assertEqual(
      targetValueCount,
      rawCardinality,
      `${replacement.field} target cardinality`,
    )
    assertEqual(
      targetBaselineCount,
      0,
      `${replacement.field} baseline value in target`,
    )
    assertEqual(
      replacement.baseline.length,
      replacement.target.length,
      `${replacement.field} replacement width`,
    )
    assertEqual(
      literalCounts.get(replacement.field),
      162,
      `${replacement.field} literal cardinality`,
    )
    replacements.push({
      field: replacement.field,
      count: 162,
      rawCount: rawCardinality,
      baseline: {
        value: replacement.baseline,
        sha256: sha256(replacement.baseline),
      },
      target: {
        value: replacement.target,
        sha256: sha256(replacement.target),
      },
    })
  }
  assertDeepEqual(
    evidence(normalized),
    RELEASE_2_1_123.normalizedTarget,
    'metadata-normalized target identity',
  )
  return { normalized, rawLiteralDelta, replacements }
}

export function synthesizeRelease21123KnownDelta({ baseline, target }) {
  const slices = EXPECTED_SLICES.map(spec =>
    witnessRecord(spec, baseline, target),
  )
  const baselineCombined = EXPECTED_SLICES[0].text
  const renamedCombined = baselineCombined.replace(
    'function Tb()',
    'function AUDIT_BETAS_OK()',
  )
  const providerHelper =
    'function AUDIT_PROVIDER_OK(){let H=qK();return H==="firstParty"||' +
    'H==="anthropicAws"||H==="foundry"}'
  const combinedHelper =
    'function AUDIT_BETAS_OK(){return AUDIT_PROVIDER_OK()&&' +
    '!IH(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)}'
  const baselineFilter =
    'function tqK(H){if(AUDIT_BETAS_OK())return H;return H.filter(($)=>' +
    'sqK.has($))}'
  const targetFilter =
    'function tqK(H){if(AUDIT_PROVIDER_OK())return H;return H.filter(($)=>' +
    'sqK.has($))}'
  const baselineOauth = 'if(Iq()||_&&!eL()&&oI())'
  const targetOauth = 'if(Iq()||AUDIT_PROVIDER_OK()&&!eL()&&oI())'

  const callCounts = {
    baselineCombined: occurrences(baseline, 'Tb()'),
    targetKillSwitch: occurrences(target, 'bp()'),
    targetProvider: occurrences(target, 'an8()'),
  }
  assertDeepEqual(
    callCounts,
    { baselineCombined: 12, targetKillSwitch: 11, targetProvider: 4 },
    'minified helper call cardinalities',
  )

  let synthetic = baseline.split('Tb()').join('AUDIT_BETAS_OK()')
  assertEqual(
    occurrences(synthetic, renamedCombined),
    1,
    'renamed combined helper count',
  )
  synthetic = synthetic.replace(
    renamedCombined,
    `${providerHelper}${combinedHelper}`,
  )
  assertEqual(
    occurrences(synthetic, baselineFilter),
    1,
    'baseline provider filter count',
  )
  synthetic = synthetic.replace(baselineFilter, targetFilter)
  assertEqual(
    occurrences(synthetic, baselineOauth),
    1,
    'baseline OAuth condition count',
  )
  synthetic = synthetic.replace(baselineOauth, targetOauth)

  const syntheticCallCounts = {
    killSwitch: occurrences(synthetic, 'AUDIT_BETAS_OK()'),
    provider: occurrences(synthetic, 'AUDIT_PROVIDER_OK()'),
  }
  assertDeepEqual(
    syntheticCallCounts,
    { killSwitch: 11, provider: 4 },
    'synthetic helper call cardinalities',
  )
  assertDeepEqual(
    evidence(synthetic),
    RELEASE_2_1_123.syntheticBaseline,
    'synthetic known-delta identity',
  )
  return { callCounts, slices, synthetic, syntheticCallCounts }
}

function ledgerSummary(report) {
  return {
    baseline: report.baseline,
    target: report.target,
    globalBindingPairCount: report.globalBindingEvidence.pairCount,
    pairCount: report.pairCount,
    coverage: report.coverage,
    unmatchedBaselineCount: report.unmatchedBaseline.length,
    unresolvedTargetCount: report.unresolvedTarget.length,
    changedTargetIndices: report.regions
      .filter(region => region.classification === 'changed')
      .map(region => region.target.index),
    unresolvedTargetIndices: report.unresolvedTarget.map(
      region => region.target.index,
    ),
  }
}

function assertRawLedger(report) {
  assertEqual(report.baseline.tokenCount, 4_394_491, 'raw baseline tokens')
  assertEqual(report.baseline.unitCount, 22_301, 'raw baseline units')
  assertEqual(report.target.tokenCount, 4_394_501, 'raw target tokens')
  assertEqual(report.target.unitCount, 22_302, 'raw target units')
  assertDeepEqual(
    report.coverage.units,
    { changed: 9, matched: 22_201, moved: 0, unresolved: 92, total: 22_302 },
    'raw unit coverage',
  )
  assertEqual(report.coverage.tokens.changed, 7_865, 'raw changed tokens')
  assertEqual(report.coverage.tokens.matched, 4_253_806, 'raw matched tokens')
  assertEqual(report.coverage.tokens.moved, 0, 'raw moved tokens')
  assertEqual(
    report.coverage.tokens.unresolved,
    132_830,
    'raw unresolved tokens',
  )
  assertEqual(report.globalBindingEvidence.pairCount, 31_607,
    'raw global binding pairs')
  assertEqual(report.pairCount, 22_210, 'raw paired units')
  assertEqual(report.unmatchedBaseline.length, 91, 'raw unmatched baseline')
  assertEqual(report.unresolvedTarget.length, 92, 'raw unresolved target')
}

function assertMetadataLedger(report) {
  assertDeepEqual(
    report.coverage.units,
    { changed: 7, matched: 22_292, moved: 0, unresolved: 3, total: 22_302 },
    'metadata-normalized unit coverage',
  )
  assertEqual(
    report.coverage.tokens.changed,
    7_803,
    'metadata-normalized changed tokens',
  )
  assertEqual(
    report.coverage.tokens.matched,
    4_386_130,
    'metadata-normalized matched tokens',
  )
  assertEqual(report.coverage.tokens.moved, 0,
    'metadata-normalized moved tokens')
  assertEqual(
    report.coverage.tokens.unresolved,
    568,
    'metadata-normalized unresolved tokens',
  )
  assertEqual(report.globalBindingEvidence.pairCount, 31_628,
    'metadata-normalized global binding pairs')
  assertEqual(report.pairCount, 22_299, 'metadata-normalized paired units')
  assertEqual(report.unmatchedBaseline.length, 2,
    'metadata-normalized unmatched baseline')
  assertDeepEqual(
    report.regions
      .filter(region => region.classification === 'changed')
      .map(region => region.target.index),
    [6_281, 6_282, 6_284, 10_140, 19_574, 19_588, 19_592],
    'metadata-normalized changed target indices',
  )
  assertDeepEqual(
    report.unresolvedTarget.map(region => region.target.index),
    [6_279, 6_280, 6_286],
    'metadata-normalized unresolved target indices',
  )
  assertDeepEqual(
    report.unmatchedBaseline.map(region => region.index),
    [6_279, 6_285],
    'metadata-normalized unmatched baseline indices',
  )
}

function assertExactLedger(report) {
  for (const [label, artifact] of [
    ['synthetic baseline', report.baseline],
    ['metadata-normalized target', report.target],
  ]) {
    assertEqual(artifact.tokenCount, RELEASE_2_1_123.targetTokens,
      `${label} tokens`)
    assertEqual(artifact.unitCount, RELEASE_2_1_123.targetUnits,
      `${label} units`)
    assertEqual(artifact.failureCount, 0, `${label} parse failures`)
  }
  assertDeepEqual(
    report.coverage.units,
    {
      changed: 0,
      matched: RELEASE_2_1_123.targetUnits,
      moved: 0,
      unresolved: 0,
      total: RELEASE_2_1_123.targetUnits,
    },
    'known-delta exact unit coverage',
  )
  assertEqual(report.coverage.tokens.changed, 0, 'exact changed tokens')
  assertEqual(
    report.coverage.tokens.matched,
    RELEASE_2_1_123.targetTokens,
    'exact matched tokens',
  )
  assertEqual(report.coverage.tokens.moved, 0, 'exact moved tokens')
  assertEqual(report.coverage.tokens.unresolved, 0, 'exact unresolved tokens')
  assertEqual(report.coverage.tokens.resolvedFraction, 1,
    'exact resolved fraction')
  assertEqual(report.coverage.tokens.exactStructuralFraction, 1,
    'exact structural fraction')
  assertEqual(report.globalBindingEvidence.pairCount, 31_630,
    'exact global binding pairs')
  assertEqual(report.pairCount, RELEASE_2_1_123.targetUnits,
    'exact paired units')
  assertEqual(report.unmatchedBaseline.length, 0, 'exact unmatched baseline')
  assertEqual(report.unresolvedTarget.length, 0, 'exact unresolved target')
}

function artifactPath(root, relative) {
  const resolvedRoot = path.resolve(root)
  const filename = path.resolve(resolvedRoot, relative)
  assert(
    filename.startsWith(`${resolvedRoot}${path.sep}`),
    `artifact path escapes output root: ${relative}`,
  )
  return filename
}

function writeArtifact(root, relative, value) {
  const filename = artifactPath(root, relative)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  const temporary = `${filename}.part-${process.pid}`
  fs.writeFileSync(temporary, value)
  fs.renameSync(temporary, filename)
  return { path: relative, ...fileEvidence(filename) }
}

function canonicalJsonLines(rows) {
  assert(rows.length > 0, 'canonical JSONL report must not be empty')
  const decoded = Buffer.from(`${rows.map(row => JSON.stringify(row)).join('\n')}\n`)
  return gzipSync(decoded, { level: 9, mtime: 0 })
}

function tokenRanges(source, boundaries, expectedTotal, label) {
  const counts = Array.from({ length: boundaries.length - 1 }, () => 0)
  const scanner = tokenizer(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  let rangeIndex = 0
  while (true) {
    const token = scanner.getToken()
    if (token.type.label === 'eof') break
    while (
      rangeIndex < counts.length - 1 &&
      token.start >= boundaries[rangeIndex + 1]
    ) {
      rangeIndex += 1
    }
    assert(
      token.start >= boundaries[rangeIndex] &&
        token.end <= boundaries[rangeIndex + 1],
      `${label}: token crosses attribution boundary`,
    )
    counts[rangeIndex] += 1
  }
  assertEqual(
    counts.reduce((sum, count) => sum + count, 0),
    expectedTotal,
    `${label} attribution token total`,
  )
  let tokenOffset = 0
  return counts.map((tokenCount, index) => {
    const result = {
      offsetStart: boundaries[index],
      offsetEnd: boundaries[index + 1],
      tokenStart: tokenOffset,
      tokenEnd: tokenOffset + tokenCount,
      tokenCount,
      utf16Length: boundaries[index + 1] - boundaries[index],
      sha256: sha256(source.slice(boundaries[index], boundaries[index + 1])),
    }
    tokenOffset += tokenCount
    return result
  })
}

function sourceLocation(source, offset) {
  const prefix = source.slice(0, offset)
  const lines = prefix.split('\n')
  return { line: lines.length, column: lines.at(-1).length }
}

function buildIncrementalAttribution({ baseline, target }) {
  const baselineBoundaries = [0, 2_858_499, 2_860_286, baseline.length]
  const targetBoundaries = [0, 2_858_499, 2_860_318, target.length]
  const baselineRanges = tokenRanges(
    baseline,
    baselineBoundaries,
    4_394_491,
    'baseline',
  )
  const targetRanges = tokenRanges(
    target,
    targetBoundaries,
    RELEASE_2_1_123.targetTokens,
    'target',
  )
  assertDeepEqual(
    baselineRanges.map(range => range.tokenCount),
    [958_828, 823, 3_434_840],
    'baseline attribution token partitions',
  )
  assertDeepEqual(
    targetRanges.map(range => range.tokenCount),
    [958_828, 833, 3_434_840],
    'target attribution token partitions',
  )

  const sources = [
    {
      runIndex: 0,
      sourceIndex: 0,
      source: '../src/utils/betas.ts',
      sourceKind: 'application',
      mappedSegmentCount: 1,
      mappedStart: {
        offset: baselineBoundaries[1],
        ...sourceLocation(baseline, baselineBoundaries[1]),
      },
      mappedEnd: {
        offset: baselineBoundaries[2],
        ...sourceLocation(baseline, baselineBoundaries[2]),
      },
      envelopeStart: baselineBoundaries[1],
      envelopeEnd: baselineBoundaries[2],
      exactAnchorCount: 0,
      monotoneAnchorCount: 0,
      nonMonotoneAnchorCount: 0,
      targetAnchorClusters: [],
      partitionEvidence: {
        exactGeneratedCount: 0,
        exactGeneratedTargetUtf16: 0,
        changedHighConfidenceCount: 1,
        changedHighConfidenceTargetUtf16: targetRanges[1].utf16Length,
        candidateCount: 0,
      },
    },
  ]
  const initializers = [
    {
      initializerIndex: 0,
      helperKind: 'esm-initializer',
      expressionOffset: 2_859_236,
      regionStart: targetBoundaries[1],
      regionEnd: targetBoundaries[2],
      utf16Length: targetRanges[1].utf16Length,
      status: 'anchored-single-baseline-unit',
      uniqueLiteralAnchorCount: 1,
      sourceVotes: [
        {
          sourceIndex: 0,
          source: '../src/utils/betas.ts',
          votes: 1,
        },
      ],
      baselineInitializerVotes: [
        {
          baselineInitializerIndex: 0,
          votes: 1,
        },
      ],
    },
  ]
  const classifications = [
    {
      classification: 'exact-generated',
      confidence: 'exact',
      attributedSourceIndex: null,
      sourceCandidates: [],
      boundaries: { left: null, right: null },
    },
    {
      classification: 'changed-same-source',
      confidence: 'high',
      attributedSourceIndex: 0,
      sourceCandidates: [0],
      boundaries: { left: 0, right: 0 },
    },
    {
      classification: 'exact-generated',
      confidence: 'exact',
      attributedSourceIndex: null,
      sourceCandidates: [],
      boundaries: { left: null, right: null },
    },
  ]
  const partitions = classifications.map((classification, index) => ({
    id: `partition-${String(index + 1).padStart(6, '0')}`,
    leftAnchorId: null,
    rightAnchorId: null,
    baseline: baselineRanges[index],
    target: targetRanges[index],
    deltas: {
      tokenCount:
        targetRanges[index].tokenCount - baselineRanges[index].tokenCount,
      utf16Length:
        targetRanges[index].utf16Length - baselineRanges[index].utf16Length,
    },
    rawIdentical:
      baseline.slice(
        baselineRanges[index].offsetStart,
        baselineRanges[index].offsetEnd,
      ) ===
      target.slice(
        targetRanges[index].offsetStart,
        targetRanges[index].offsetEnd,
      ),
    classification: classification.classification,
    confidence: classification.confidence,
    attributedSourceIndex: classification.attributedSourceIndex,
    boundarySourceIndices: classification.boundaries,
    sourceCandidates: classification.sourceCandidates,
    relocatedSourceCandidates: [],
    evidence:
      classification.classification === 'exact-generated'
        ? 'scope-normalized exact after authenticated metadata and known-delta synthesis'
        : 'localized adjacent delta owned by ../src/utils/betas.ts',
  }))
  const ranges = partitions.map((partition, partitionIndex) => ({
    kind: 'partition',
    id: partition.id,
    target: partition.target,
    classification: partition.classification,
    confidence: partition.confidence,
    sourceIndices:
      partition.attributedSourceIndex === null ? [] : [partition.attributedSourceIndex],
    partitionIndex,
  }))
  assertEqual(
    ranges.at(-1).target.offsetEnd,
    target.length,
    'incremental attribution target coverage',
  )
  const reportBuffers = {
    sources: canonicalJsonLines(sources),
    targetInitializers: canonicalJsonLines(initializers),
    targetPartitions: canonicalJsonLines(partitions),
    targetRanges: canonicalJsonLines(ranges),
  }
  const reportFiles = {
    sources: {
      path: 'sources.jsonl.gz',
      ...evidence(reportBuffers.sources),
    },
    targetInitializers: {
      path: 'target-initializers.jsonl.gz',
      ...evidence(reportBuffers.targetInitializers),
    },
    targetPartitions: {
      path: 'target-partitions.jsonl.gz',
      ...evidence(reportBuffers.targetPartitions),
    },
    targetRanges: {
      path: 'target-ranges.jsonl.gz',
      ...evidence(reportBuffers.targetRanges),
    },
  }
  const changedUtf16 = targetRanges[1].utf16Length
  const exactUtf16 = target.length - changedUtf16
  const summary = {
    schemaVersion: 1,
    kind: 'generated-source-ownership-and-attribution-inventory',
    offsetUnit: 'utf16-code-units',
    claim:
      'Fail-closed incremental attribution from the authenticated adjacent ' +
      'bundles and zero-residue known-delta proof: exact-generated before ' +
      'and after one changed region owned by ../src/utils/betas.ts.',
    artifacts: {
      baselineBundle: RELEASE_2_1_123.baseline,
      targetBundle: RELEASE_2_1_123.target,
    },
    options: {
      strategy: 'authenticated-known-delta-contiguous-partition',
      changedTargetOffsetStart: targetBoundaries[1],
      changedTargetOffsetEnd: targetBoundaries[2],
    },
    baselineOwnership: {
      sourceCount: 1,
      sourceKinds: { application: 1, nodeModules: 0, vendor: 0 },
      mappedSegmentCount: 1,
      contiguousRunCount: 1,
      eachSourceHasExactlyOneContiguousRun: true,
      generatedHeaderUtf16: targetBoundaries[1],
    },
    literalEvidence: {
      uniqueCommonAnchorCount: 0,
      monotoneAnchorCount: 0,
      nonMonotoneAnchorCount: 0,
      monotoneFraction: 1,
      partitionCount: 3,
      tokenCountDelta: 10,
      utf16LengthDelta: 32,
      locatedSourceCount: 1,
      locatedApplicationSourceCount: 1,
      splitTargetClusterSourceCount: 0,
    },
    initializerEvidence: {
      baseline: { count: 1 },
      target: {
        count: 1,
        statuses: { 'anchored-single-baseline-unit': 1 },
      },
      targetNetCountDelta: 0,
    },
    coverage: {
      partitionCount: 3,
      targetPartitionUtf16: target.length,
      exactAnchorCount: 0,
      exactAnchorTargetUtf16: 0,
      exactGeneratedPartitionCount: 2,
      exactGeneratedTargetUtf16: exactUtf16,
      changedHighConfidencePartitionCount: 1,
      changedHighConfidenceTargetUtf16: changedUtf16,
      changedCandidatePartitionCount: 0,
      changedCandidateTargetUtf16: 0,
      unresolvedPartitionCount: 0,
      unresolvedTargetUtf16: 0,
      accountedTargetUtf16: target.length,
      targetUtf16: target.length,
      unaccountedTargetUtf16: 0,
      targetRangeCount: 3,
      targetRangeUtf16: target.length,
    },
    reportFiles,
    limitations: [
      'This is release-incremental attribution, not a baseline source-map inventory.',
      'Exact-generated means scope-normalized token identity after the authenticated metadata normalization and known-delta synthesis.',
      'Comments and whitespace are outside the semantic ownership claim.',
    ],
  }
  const summaryBuffer = Buffer.from(`${JSON.stringify(summary, null, 2)}\n`)
  return { reportBuffers, summary, summaryBuffer }
}

function compareInventories(baseline, normalizedTarget) {
  const baselineInventory = collectInventory(baseline, 'baseline')
  const targetInventory = collectInventory(normalizedTarget, 'target')
  const result = {
    literalDelta: mapDelta(
      baselineInventory.literals,
      targetInventory.literals,
    ),
    moduleSurfaceDelta: mapDelta(
      baselineInventory.moduleSurface,
      targetInventory.moduleSurface,
    ),
    nodeTypeDelta: mapDelta(
      baselineInventory.nodeTypes,
      targetInventory.nodeTypes,
    ),
    operatorDelta: mapDelta(
      baselineInventory.operators,
      targetInventory.operators,
    ),
    semanticPropertyDelta: mapDelta(
      baselineInventory.semanticProperties,
      targetInventory.semanticProperties,
    ),
  }
  assertDeepEqual(result.literalDelta, [], 'normalized literal delta')
  assertDeepEqual(result.moduleSurfaceDelta, [], 'module surface delta')
  assertDeepEqual(result.nodeTypeDelta, EXPECTED_NODE_TYPE_DELTA,
    'node-type delta')
  assertDeepEqual(result.operatorDelta, [], 'operator delta')
  assertDeepEqual(result.semanticPropertyDelta, [], 'semantic property delta')
  return result
}

function createCoreProof({
  baselinePath,
  baselineSource,
  targetPath,
  targetSource,
}) {
  const baselineInventory = collectInventory(baselineSource, 'baseline')
  const targetInventory = collectInventory(targetSource, 'target')
  const normalization = normalizeRelease21123Metadata({
    baseline: baselineSource,
    baselineInventory,
    target: targetSource,
    targetInventory,
  })
  const synthesis = synthesizeRelease21123KnownDelta({
    baseline: baselineSource,
    target: targetSource,
  })
  const finiteInventories = compareInventories(
    baselineSource,
    normalization.normalized,
  )
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'claude-code-2.1.123-semantic-delta-'),
  )
  try {
    const normalizedTargetPath = path.join(
      temporary,
      'target-metadata-normalized.js',
    )
    const syntheticBaselinePath = path.join(
      temporary,
      'baseline-known-delta.js',
    )
    fs.writeFileSync(normalizedTargetPath, normalization.normalized)
    fs.writeFileSync(syntheticBaselinePath, synthesis.synthetic)

    const rawReport = accountGeneratedDelta(baselinePath, targetPath)
    assertRawLedger(rawReport)
    const rawLedger = encodeStructuralLedger(rawReport, { gzip: true })
    const rawSummary = ledgerSummary(rawReport)

    const metadataReport = accountGeneratedDelta(
      baselinePath,
      normalizedTargetPath,
    )
    assertMetadataLedger(metadataReport)
    const metadataLedger = encodeStructuralLedger(metadataReport, {
      gzip: true,
    })
    const metadataSummary = ledgerSummary(metadataReport)

    const exactReport = accountGeneratedDelta(
      syntheticBaselinePath,
      normalizedTargetPath,
    )
    assertExactLedger(exactReport)
    const exactLedger = encodeStructuralLedger(exactReport, { gzip: true })
    const exactSummary = ledgerSummary(exactReport)
    const attribution = buildIncrementalAttribution({
      baseline: baselineSource,
      target: targetSource,
    })

    const proof = {
      schemaVersion: 1,
      kind: 'release-2.1.123-known-semantic-delta-proof',
      case: RELEASE_2_1_123.case,
      release: RELEASE_2_1_123.release,
      complete: true,
      claim:
        'After exact build-identity normalization, the complete active ' +
        '2.1.122-to-2.1.123 token delta is the OAuth beta provider/kill-' +
        'switch predicate split recorded here. Scope-normalized top-level ' +
        'token identity is exact after synthesis; comments and whitespace ' +
        'are outside the semantic claim.',
      authenticatedInputs: {
        baseline: RELEASE_2_1_123.baseline,
        target: RELEASE_2_1_123.target,
      },
      metadataNormalization: {
        replacementCardinalityPerValue: 162,
        replacements: normalization.replacements,
        rawLiteralDelta: normalization.rawLiteralDelta,
        normalizedTarget: RELEASE_2_1_123.normalizedTarget,
      },
      knownDelta: {
        oauthBetaHeader: 'oauth-2025-04-20',
        callCounts: synthesis.callCounts,
        syntheticCallCounts: synthesis.syntheticCallCounts,
        slices: synthesis.slices,
        syntheticBaseline: RELEASE_2_1_123.syntheticBaseline,
      },
      finiteInventories,
      ledgers: {
        rawAdjacent: rawSummary,
        metadataNormalized: metadataSummary,
        knownDeltaExact: exactSummary,
      },
      attribution: attribution.summary,
    }
    return {
      attribution,
      ledgers: { exactLedger, metadataLedger, rawLedger },
      proof,
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

function readableSummary(metadata, root) {
  assertEqual(metadata.statements.baseline, 22_301,
    'readable baseline statements')
  assertEqual(metadata.statements.target, 22_302,
    'readable target statements')
  assertDeepEqual(
    metadata.matching,
    {
      duplicateSharedFingerprints: 707,
      structurallyUniquePairs: 15_531,
      uniqueBaselineFingerprints: 15_622,
      uniqueTargetFingerprints: 15_623,
    },
    'readable structural matching',
  )
  assertEqual(metadata.renames.accepted, 8_533, 'readable accepted renames')
  assertEqual(metadata.renames.edits, 22_177, 'readable rename edits')
  assertEqual(metadata.renames.rejected, 11_208, 'readable rejected renames')
  assertEqual(
    metadata.verification.comparisonInvariantHashesEqual,
    true,
    'readable comparison invariant',
  )
  const outputNames = Object.keys(metadata.outputs).sort()
  assertDeepEqual(
    outputNames,
    ['normalized.diff.gz', 'renames.tsv', 'statements.diff'],
    'readable output names',
  )
  return {
    metadata: {
      path: `${OUTPUTS.readable}/metadata.json`,
      ...fileEvidence(path.join(root, 'metadata.json')),
    },
    statements: metadata.statements,
    matching: metadata.matching,
    renames: {
      accepted: metadata.renames.accepted,
      edits: metadata.renames.edits,
      rejected: metadata.renames.rejected,
    },
    comparisonInvariantHashesEqual:
      metadata.verification.comparisonInvariantHashesEqual,
    outputs: Object.fromEntries(
      outputNames.map(name => [
        name,
        {
          path: `${OUTPUTS.readable}/${name}`,
          ...fileEvidence(path.join(root, name)),
        },
      ]),
    ),
  }
}

export function buildRelease21123SemanticDelta({
  baselinePath,
  outputRoot,
  progress = () => {},
  targetPath,
}) {
  const baseline = authenticate(
    path.resolve(baselinePath),
    RELEASE_2_1_123.baseline,
    '2.1.122 baseline',
  )
  const target = authenticate(
    path.resolve(targetPath),
    RELEASE_2_1_123.target,
    '2.1.123 target',
  )
  const root = path.resolve(outputRoot)
  fs.mkdirSync(root, { recursive: true })
  const rootStatus = fs.lstatSync(root)
  assert(rootStatus.isDirectory() && !rootStatus.isSymbolicLink(),
    'output root must be a real directory')

  progress('Building authenticated structural ledgers')
  const core = createCoreProof({
    baselinePath: path.resolve(baselinePath),
    baselineSource: baseline.source,
    targetPath: path.resolve(targetPath),
    targetSource: target.source,
  })
  const artifacts = {
    rawLedger: writeArtifact(root, OUTPUTS.rawLedger, core.ledgers.rawLedger),
    metadataLedger: writeArtifact(
      root,
      OUTPUTS.metadataLedger,
      core.ledgers.metadataLedger,
    ),
    exactLedger: writeArtifact(
      root,
      OUTPUTS.exactLedger,
      core.ledgers.exactLedger,
    ),
    attribution: {
      summary: writeArtifact(
        root,
        `${OUTPUTS.attribution}/summary.json`,
        core.attribution.summaryBuffer,
      ),
      sources: writeArtifact(
        root,
        `${OUTPUTS.attribution}/sources.jsonl.gz`,
        core.attribution.reportBuffers.sources,
      ),
      targetInitializers: writeArtifact(
        root,
        `${OUTPUTS.attribution}/target-initializers.jsonl.gz`,
        core.attribution.reportBuffers.targetInitializers,
      ),
      targetPartitions: writeArtifact(
        root,
        `${OUTPUTS.attribution}/target-partitions.jsonl.gz`,
        core.attribution.reportBuffers.targetPartitions,
      ),
      targetRanges: writeArtifact(
        root,
        `${OUTPUTS.attribution}/target-ranges.jsonl.gz`,
        core.attribution.reportBuffers.targetRanges,
      ),
    },
  }

  progress('Generating readable adjacent-bundle diff')
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'claude-code-2.1.123-readable-'),
  )
  let readable
  try {
    const readableRoot = path.join(temporary, 'readable-diff')
    const metadata = generateReadableBundleDiff({
      baselinePath: path.resolve(baselinePath),
      expectedBaselineSha256: RELEASE_2_1_123.baseline.sha256,
      expectedTargetSha256: RELEASE_2_1_123.target.sha256,
      outputPath: readableRoot,
      progress,
      retainIntermediates: false,
      targetPath: path.resolve(targetPath),
    })
    readable = readableSummary(metadata, readableRoot)
    for (const name of ['metadata.json', ...Object.keys(metadata.outputs)]) {
      writeArtifact(
        root,
        `${OUTPUTS.readable}/${name}`,
        fs.readFileSync(path.join(readableRoot, name)),
      )
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }

  const proof = {
    ...core.proof,
    artifacts,
    readableDiff: readable,
  }
  const proofBytes = Buffer.from(`${JSON.stringify(proof, null, 2)}\n`)
  const proofEvidence = writeArtifact(root, OUTPUTS.proof, proofBytes)
  return { proof, proofEvidence }
}

export function rebuildRelease21123Core({ baselinePath, targetPath }) {
  const baseline = authenticate(
    path.resolve(baselinePath),
    RELEASE_2_1_123.baseline,
    '2.1.122 baseline',
  )
  const target = authenticate(
    path.resolve(targetPath),
    RELEASE_2_1_123.target,
    '2.1.123 target',
  )
  return createCoreProof({
    baselinePath: path.resolve(baselinePath),
    baselineSource: baseline.source,
    targetPath: path.resolve(targetPath),
    targetSource: target.source,
  })
}

export const release21123SemanticDeltaInternals = Object.freeze({
  outputs: OUTPUTS,
  readableSummary,
})

function parseArguments(argv) {
  const result = {}
  const allowed = new Set(['baseline', 'output', 'target'])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    assert(argument.startsWith('--'), `Unexpected argument: ${argument}`)
    const key = argument.slice(2)
    assert(allowed.has(key), `Unknown argument: ${argument}`)
    assert(result[key] === undefined, `Duplicate argument: ${argument}`)
    const value = argv[index + 1]
    assert(value && !value.startsWith('--'), `Missing value for ${argument}`)
    result[key] = value
    index += 1
  }
  return result
}

function usage() {
  console.error(
    'Usage: build-2.1.123-semantic-delta.mjs --baseline 2.1.122.js ' +
      '--target 2.1.123.js --output CASE_ROOT',
  )
}

function restartWithLargeHeapIfNeeded(args) {
  if (v8.getHeapStatistics().heap_size_limit >= 6 * 1024 * 1024 * 1024) {
    return false
  }
  const result = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=8192',
      fileURLToPath(import.meta.url),
      ...args,
    ],
    { stdio: 'inherit' },
  )
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
  return true
}

function main() {
  const argv = process.argv.slice(2)
  const args = parseArguments(argv)
  if (!args.baseline || !args.target || !args.output) {
    usage()
    process.exitCode = 2
    return
  }
  if (restartWithLargeHeapIfNeeded(argv)) return
  const result = buildRelease21123SemanticDelta({
    baselinePath: args.baseline,
    outputRoot: args.output,
    progress(message) {
      console.error(`${message}...`)
    },
    targetPath: args.target,
  })
  console.log(
    JSON.stringify(
      {
        status: '2.1.123-semantic-delta-built',
        output: path.resolve(args.output),
        proof: result.proofEvidence,
        exact: result.proof.ledgers.knownDeltaExact.coverage,
      },
      null,
      2,
    ),
  )
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedAsScript) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
  }
}
