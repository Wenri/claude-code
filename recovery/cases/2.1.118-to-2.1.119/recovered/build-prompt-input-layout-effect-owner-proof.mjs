import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  parse,
  tokenizer,
} from '../../../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_EVIDENCE_IDS,
  TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_OWNER_OVERRIDES,
} from './prompt-input-layout-effect-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.118-to-2.1.119'
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-prompt-input-layout-effect-owner-proof.json',
)
const structuralPath =
  'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz'
const reportPath =
  '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json'
const sourcePath = 'src/components/PromptInput/PromptInput.tsx'
const packageSourcePath =
  '.recovery-tmp/semantic-trees/2.1.119/src/components/PromptInput/PromptInput.tsx'
const overridePath =
  'recovery/cases/2.1.118-to-2.1.119/recovered/prompt-input-layout-effect-owner-overrides.mjs'

const units = [
  {
    role: 'supportingTarget117',
    version: '2.1.117',
    index: 19389,
    bundlePath:
      '.recovery-tmp/authenticated-artifacts/2.1.117-linux-x64/cli.inner.js',
    start: 11823758,
    end: 11852137,
  },
  {
    role: 'baseline',
    version: '2.1.118',
    index: 19583,
    bundlePath:
      '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
    start: 11923400,
    end: 11951768,
  },
  {
    role: 'target',
    version: '2.1.119',
    index: 20509,
    bundlePath:
      '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
    start: 12383150,
    end: 12412273,
  },
]

const sourceVersions = [
  {
    version: '2.1.117',
    commit: 'ff0339d35906735273ae3130a187bb8e30581871',
  },
  {
    version: '2.1.118',
    commit: 'bd846a24e3886322888f02b9f747c132a4a32314',
  },
  {
    version: '2.1.119',
    commit: '351cd4d13f70a564dc2d90f59ab0093dc6fc7b05',
  },
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return {
    bytes: Buffer.isBuffer(value) ? value.length : Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function normalizedToken(token) {
  if (token.type.label === 'name') return 'ID'
  if (token.type.label === 'num' || token.type.label === 'string') {
    return `${token.type.label}:${JSON.stringify(token.value)}`
  }
  if (token.type.label === 'regexp') {
    return `regexp:/${token.value.pattern}/${token.value.flags}`
  }
  return token.type.label
}

function normalizedTokens(source) {
  const values = []
  const stream = tokenizer(source, { ecmaVersion: 'latest' })
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') break
    values.push({
      value: normalizedToken(token),
      start: token.start,
      end: token.end,
    })
  }
  return values
}

function walk(node, visit, parents = []) {
  if (!node || typeof node !== 'object') return
  visit(node, parents)
  for (const [key, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const value of child) walk(value, visit, [...parents, node])
    } else {
      walk(child, visit, [...parents, node])
    }
  }
}

function alphaCanonical(node) {
  const identifiers = new Map()
  let nextIdentifier = 0
  function canonical(value, parent, key) {
    if (Array.isArray(value)) {
      return value.map(child => canonical(child, parent, key))
    }
    if (!value || typeof value !== 'object') return value
    if (value.type === 'Identifier') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          key === 'property' &&
          !parent.computed) ||
        (parent?.type === 'Property' && key === 'key' && !parent.computed)
      let name = value.name
      if (!preserve) {
        if (!identifiers.has(name)) {
          identifiers.set(name, `ID${nextIdentifier}`)
          nextIdentifier += 1
        }
        name = identifiers.get(name)
      }
      return { type: 'Identifier', name }
    }
    const output = {}
    for (const [childKey, child] of Object.entries(value)) {
      if (['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) continue
      output[childKey] = canonical(child, value, childKey)
    }
    return output
  }
  return JSON.stringify(canonical(node, null, ''))
}

function hookProof(source, unitStart) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
  let match
  walk(ast, (node, parents) => {
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.name === 'useLayoutEffect'
    ) {
      if (match) throw new Error('multiple useLayoutEffect calls in PromptInput')
      match = { node, parents }
    }
  })
  if (!match) throw new Error('missing compiled useLayoutEffect call')
  const statement = [...match.parents]
    .reverse()
    .find(node => node.type === 'ExpressionStatement')
  if (!statement) throw new Error('useLayoutEffect statement not found')
  const statementText = source.slice(statement.start, statement.end)
  const canonical = alphaCanonical(statement)
  const tokens = normalizedTokens(source)
  const tokenIndex = tokens.findIndex(
    token => token.start === match.node.property.start,
  )
  if (tokenIndex < 17) throw new Error('hook token context is too short')
  const context = `${tokens
    .slice(tokenIndex - 17, tokenIndex + 18)
    .map(token => token.value)
    .join('\n')}\n`
  return {
    property: {
      start: unitStart + match.node.property.start,
      end: unitStart + match.node.property.end,
    },
    statement: {
      start: unitStart + statement.start,
      end: unitStart + statement.end,
      ...descriptor(statementText),
      text: statementText,
    },
    alphaCanonical: descriptor(canonical),
    tokenIndex,
    context: {
      tokens: 35,
      ...descriptor(context),
      text: context,
    },
  }
}

function git(args, encoding = null) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding,
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString() || `git ${args.join(' ')} failed`)
  }
  return result.stdout
}

const imported = await import(
  pathToFileURL(
    path.join(
      root,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ).href
)
const ts = imported.default ?? imported

function sourceProof(bytes) {
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  if (sourceFile.parseDiagnostics.length !== 0) {
    throw new Error('PromptInput source does not parse')
  }
  const declarations = []
  let useLayoutEffectAstOccurrences = 0
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'PromptInput') {
      declarations.push(node)
    }
    if (
      (ts.isPropertyAccessExpression(node) &&
        node.name.text === 'useLayoutEffect') ||
      (ts.isIdentifier(node) && node.text === 'useLayoutEffect')
    ) {
      useLayoutEffectAstOccurrences += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  if (declarations.length !== 1) {
    throw new Error(`expected one PromptInput declaration, got ${declarations.length}`)
  }
  const declaration = declarations[0]
  const declarationText = declaration.getText(sourceFile)
  return {
    file: descriptor(bytes),
    declaration: {
      characterStart: declaration.getStart(sourceFile),
      characterEnd: declaration.end,
      ...descriptor(declarationText),
    },
    useLayoutEffectAstOccurrences,
    useLayoutEffectTextOccurrences: (source.match(/useLayoutEffect/g) ?? [])
      .length,
    missingCompiledMarkers: [
      'useLayoutEffect',
      'forceRedraw',
      'chat:clearInput',
    ].filter(marker => !source.includes(marker)),
  }
}

function rowTuple(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
  ]
}

function rowSet(rows) {
  const identities = rows.map(rowTuple)
  return {
    rows: identities.length,
    canonicalBytes: Buffer.byteLength(JSON.stringify(identities)),
    canonicalSha256: sha256(JSON.stringify(identities)),
    identities,
  }
}

const structuralBytes = fs.readFileSync(path.join(root, structuralPath))
const structural = JSON.parse(gunzipSync(structuralBytes))
const baselineRegion = structural.unmatchedBaseline.find(row => row.index === 19583)
const targetRegion = structural.regions.find(row => row.target.index === 20509)
if (!baselineRegion || !targetRegion) throw new Error('PromptInput units not found')

const unitProofs = {}
for (const unit of units) {
  const bundle = fs.readFileSync(path.join(root, unit.bundlePath))
  const value = bundle.subarray(unit.start, unit.end)
  const source = value.toString('utf8')
  const tokens = normalizedTokens(source)
  const normalized = `${tokens.map(token => token.value).join('\n')}\n`
  unitProofs[unit.role] = {
    version: unit.version,
    index: unit.index,
    classification: unit.role === 'target' ? targetRegion.classification : 'unresolved',
    nodeType: 'FunctionDeclaration',
    start: unit.start,
    end: unit.end,
    tokenCount: tokens.length,
    sourceHash: sha256(value),
    coarseHash:
      unit.role === 'target'
        ? targetRegion.target.coarseHash
        : unit.role === 'baseline'
          ? baselineRegion.coarseHash
          : undefined,
    bundle: {
      path: unit.bundlePath,
      ...descriptor(bundle),
    },
    normalized: descriptor(normalized),
    hook: hookProof(source, unit.start),
  }
  unitProofs[unit.role]._normalizedText = normalized
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'target119-prompt-input.'))
const baselineTokensPath = path.join(temporary, 'target118.tokens')
const targetTokensPath = path.join(temporary, 'target119.tokens')
fs.writeFileSync(baselineTokensPath, unitProofs.baseline._normalizedText)
fs.writeFileSync(targetTokensPath, unitProofs.target._normalizedText)
const normalizedDiff = spawnSync(
  'diff',
  [
    '--label',
    'target118',
    '--label',
    'target119',
    '-U',
    '0',
    baselineTokensPath,
    targetTokensPath,
  ],
  { encoding: 'utf8' },
)
fs.rmSync(temporary, { recursive: true, force: true })
if (normalizedDiff.status !== 1 || normalizedDiff.stderr !== '') {
  throw new Error(normalizedDiff.stderr || 'expected a normalized unit diff')
}
for (const unit of Object.values(unitProofs)) delete unit._normalizedText

const sourceLineage = []
for (const version of sourceVersions) {
  const bytes = git(['show', `${version.commit}:${sourcePath}`])
  sourceLineage.push({
    ...version,
    blob: git(['rev-parse', `${version.commit}:${sourcePath}`], 'utf8').trim(),
    ...sourceProof(bytes),
  })
}
const packagedSource = sourceProof(
  fs.readFileSync(path.join(root, packageSourcePath)),
)

const reportBytes = fs.readFileSync(path.join(root, reportPath))
const report = JSON.parse(reportBytes)
const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
  row => row.structural.index === 20509,
)
const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
  row => row.structural.index === 20509,
)
const strictRows = report.rows.filter(row => row.structural.index === 20509)

const evidenceCatalog = [
  {
    id: TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_EVIDENCE_IDS[0],
    kind: 'target-fragment',
    path: 'recovery/test/recovery-2.1.119-prompt-input-layout-effect-owner-proof.test.mjs',
    detail:
      'Pins the complete authenticated Target118 and Target119 PromptInput units, their exact normalized eight-hunk evolution, and every Target119 owner and added-owner residue.',
  },
  {
    id: TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_EVIDENCE_IDS[1],
    kind: 'semantic-test',
    path: 'recovery/test/recovery-2.1.119-prompt-input-layout-effect-owner-proof.test.mjs',
    detail:
      'Pins the unique useLayoutEffect statement in Targets117, 118, and 119, proves identical alpha-canonical AST and 35-token context, and executes the generation-zero, redraw, and missing-instance branches.',
  },
  {
    id: TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_EVIDENCE_IDS[2],
    kind: 'static-ast',
    path: 'recovery/test/recovery-2.1.119-prompt-input-layout-effect-owner-proof.test.mjs',
    detail:
      'Pins the exact Target117-Target119 PromptInput source declarations and proves all omit the compiled layout effect, redraw dependency, clear-input generation state, and action registration, blocking isolated source replay.',
  },
]

const fixture = {
  schemaVersion: 1,
  case: caseName,
  status: 'case-owned-static-inherited-runtime-proof-source-replay-blocked',
  criterion:
    'Admit Target119 u20509 only when the complete PromptInput unit and all residue partitions are pinned, the local useLayoutEffect statement is exact inherited runtime from the immediate Target118 predecessor, and every authenticated authored source state is proven to omit the larger clear-input redraw graph.',
  ownerBehavior:
    'PromptInput keeps a clear-input generation counter whose layout effect asks the active Ink instance to force a redraw after a committed clear. The exact statement and its 35-token neighborhood persist from Target117 through Target119. The Target119 useLayoutEffect residue is therefore global occurrence-order drift, not a Target119 addition. Authored source omits the state, effect, Ink instances dependency, callback increment, and chat:clearInput registration, so this proof is static and authorizes no source mutation.',
  summary: {
    units: 1,
    ownerRows: ownerRows.length,
    addedOwnerRows: addedRows.length,
    productionStrictRowsBeforeCorrection: strictRows.length,
    productionStrictRowsAfterCorrection: 0,
    ownerOverrides: 1,
    sourceReplayHelpers: 0,
  },
  evidenceIds: TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_EVIDENCE_IDS,
  evidenceCatalog,
  inputs: {
    override: {
      path: overridePath,
      ...descriptor(fs.readFileSync(path.join(root, overridePath))),
    },
    structuralLedger: {
      path: structuralPath,
      ...descriptor(structuralBytes),
    },
    typedReport: {
      path: reportPath,
      observedPreCorrectionSha256: sha256(reportBytes),
      mutableAfterCorrection: true,
    },
    packagedSource: {
      path: packageSourcePath,
      ...packagedSource,
    },
  },
  ownerOverride: {
    paths: [...TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_OWNER_OVERRIDES[0].paths],
    declarations: [
      ...TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_OWNER_OVERRIDES[0].declarations,
    ],
  },
  units: unitProofs,
  normalizedUnitEvolution: {
    baselineTokenIndexAtHook: unitProofs.baseline.hook.tokenIndex,
    targetTokenIndexAtHook: unitProofs.target.hook.tokenIndex,
    tokenIndexShiftBeforeHook:
      unitProofs.target.hook.tokenIndex - unitProofs.baseline.hook.tokenIndex,
    diff: {
      hunks: normalizedDiff.stdout.match(/^@@/gm)?.length ?? 0,
      ...descriptor(normalizedDiff.stdout),
      text: normalizedDiff.stdout,
    },
  },
  hookLineage: {
    alphaCanonical: unitProofs.target.hook.alphaCanonical,
    context: unitProofs.target.hook.context,
    runtimeIdentifiers: {
      react: 'Kq',
      generation: 'xE',
      instances: 'K5',
      process: 'process',
    },
  },
  sourceLineage: {
    path: sourcePath,
    snapshots: sourceLineage,
    packaged: packagedSource,
    sourceDiff118To119: (() => {
      const value = git([
        'diff',
        '--unified=0',
        sourceVersions[1].commit,
        sourceVersions[2].commit,
        '--',
        sourcePath,
      ])
      const numstat = git(
        [
          'diff',
          '--numstat',
          sourceVersions[1].commit,
          sourceVersions[2].commit,
          '--',
          sourcePath,
        ],
        'utf8',
      )
        .trim()
        .split('\t')
      return {
        insertions: Number(numstat[0]),
        deletions: Number(numstat[1]),
        ...descriptor(value),
      }
    })(),
    replayBlocker:
      'No authenticated Target117, Target118, or Target119 authored PromptInput declaration contains useLayoutEffect, forceRedraw, or chat:clearInput. The compiled hook depends on a state/setter pair and the clear-input callback increment, while the source action map omits the callback entirely. Replaying only the residue would be graph-incomplete, and no exact authored donor authenticates the full graph.',
  },
  residues: {
    identityFields: [
      'targetIndex',
      'literalKind',
      'value',
      'start',
      'end',
      'baselineOccurrenceCount',
      'targetOccurrenceNumber',
      'targetAdded',
    ],
    allOwner: rowSet(ownerRows),
    addedOwner: rowSet(addedRows),
    productionStrict: rowSet(strictRows),
  },
}

fs.writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(JSON.stringify({ fixturePath, ...descriptor(fs.readFileSync(fixturePath)) }))
