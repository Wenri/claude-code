import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  applyTarget117ScheduleRoutineRepoWordingSourceRecovery,
  TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_INPUT_FILE,
  TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_OUTPUT_FILE,
  TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-schedule-routine-repo-wording-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-schedule-routine-repo-wording-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'fdfa7a7faf6ddda8eb1685251b98bb2deee375a2e8ded2931ace365c8e5b8d31'
const artifactRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts',
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  }, label)
  return bytes
}

function artifactPath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, fixture.inputs.sourceFile.path.slice(4))
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  return filename
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const bytes = execFileSync(
    'git',
    [
      'show',
      `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.sourceFile.path}`,
    ],
    { cwd: repositoryRoot },
  )
  assert.deepEqual(descriptor(bytes), fixture.inputs.sourceFile.input)
  const filename = sourceFilename(sourceRoot)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
  return { temporaryRoot, sourceRoot }
}

function copySelectedSource(sourceRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const outputRoot = path.join(temporaryRoot, 'src')
  const filename = sourceFilename(outputRoot)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.copyFileSync(sourceFilename(sourceRoot), filename)
  return { temporaryRoot, sourceRoot: outputRoot }
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function targetTemplateOccurrences(source, expectedValue) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = []
  walk(ast, node => {
    if (
      node.type === 'TemplateElement' &&
      (node.value?.cooked ?? node.value?.raw) === expectedValue
    ) {
      occurrences.push({ start: node.start, end: node.end })
    }
  })
  occurrences.sort((left, right) => left.start - right.start)
  return occurrences
}

let typescriptPromise
async function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        repositoryRoot,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href,
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function descendants(ts, root, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function exactDeclaration(ts, sourceFile, bytes, phase) {
  const expected = fixture.inputs.sourceFile.declaration
  const declarations = descendants(
    ts,
    sourceFile,
    node =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === expected.name,
  )
  assert.equal(declarations.length, 1)
  const declaration = declarations[0]
  const range = expected[phase]
  const start = declaration.getStart(sourceFile)
  const end = declaration.end
  assert.deepEqual({
    start,
    end,
    ...descriptor(bytes.subarray(start, end)),
  }, range, `${phase}: ${expected.name}`)
  return declaration
}

function assertPostimage(ts, sourceRoot, label) {
  const bytes = readExact(
    sourceFilename(sourceRoot),
    fixture.inputs.sourceFile.output,
    label,
  )
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    fixture.inputs.sourceFile.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const declaration = exactDeclaration(ts, sourceFile, bytes, 'output')
  const matchingTemplates = descendants(
    ts,
    declaration,
    node =>
      ts.isTemplateExpression(node) &&
      node.templateSpans.at(-1)?.literal.text === fixture.row.residue[1],
  )
  assert.equal(matchingTemplates.length, 1)
  const template = matchingTemplates[0]
  assert.deepEqual([
    template.head.text,
    ...template.templateSpans.map(span => span.literal.text),
  ], [
    'Claude GitHub App not installed on ',
    '/',
    fixture.row.residue[1],
  ])
  const conditionals = descendants(
    ts,
    declaration,
    node => ts.isConditionalExpression(node) && node.whenFalse === template,
  )
  assert.equal(conditionals.length, 1)
  assert.equal(conditionals[0].condition.getText(sourceFile), 'webSetupEnabled')
  const rendered = Function('repo', `return ${template.getText(sourceFile)}`)({
    owner: 'anthropic',
    name: 'demo',
  })
  assert.equal(
    rendered,
    'Claude GitHub App not installed on anthropic/demo — install at https://claude.ai/code/onboarding?magic=github-app-setup if your routine needs this repo.',
  )
  return bytes
}

test(
  '2.1.117 schedule wording fixture pins one exact replay and owner row',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 1,
      recoveredFiles: 1,
      replacements: 1,
      ownerOverrides: 1,
    })
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
      'case-owned helper',
    )
    assert.deepEqual(TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_INPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.input,
    })
    assert.deepEqual(TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_OUTPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.output,
    })
    assert.deepEqual(
      TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_OWNER_OVERRIDES.map(
        override => ({
          key: override.key,
          targetIndex: override.targetIndex,
          paths: [...override.paths],
          declarations: [...override.declarations],
          evidenceIds: [...override.evidenceIds],
        }),
      ),
      [{
        key: `${caseName}:${fixture.row.targetIndex}`,
        targetIndex: fixture.row.targetIndex,
        paths: [fixture.row.owner],
        declarations: fixture.row.declarations,
        evidenceIds: fixture.evidenceIds,
      }],
    )
    assert.equal(
      execFileSync(
        'git',
        ['rev-parse', `${fixture.inputs.rawTargetSourceCommit}^{tree}`],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.inputs.rawTargetSourceTree,
    )
    assert.equal(
      execFileSync(
        'git',
        [
          'rev-parse',
          `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.sourceFile.path}`,
        ],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.inputs.sourceFile.blob,
    )
  },
)

test(
  '2.1.117 bundle authenticates the complete schedule unit and routine residue',
  { skip: !selected },
  () => {
    const baseline = readExact(
      artifactPath(
        'CLAUDE_CODE_BASELINE_2_1_116_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
      'authenticated 2.1.116 bundle',
    ).toString('utf8')
    const target = readExact(
      artifactPath(
        'CLAUDE_CODE_TARGET_2_1_117_BUNDLE',
        fixture.inputs.targetBundle,
      ),
      fixture.inputs.targetBundle,
      'authenticated 2.1.117 bundle',
    ).toString('utf8')
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
          'structural ledger',
        ),
      ),
    )
    const [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash] =
      fixture.row.targetUnit
    const region = ledger.regions.find(row => row.target.index === index)
    assert.ok(region, `u${index}`)
    assert.deepEqual([
      region.classification,
      region.target.nodeType,
      region.target.start,
      region.target.end,
      region.target.tokenCount,
      region.target.sourceHash,
      region.target.coarseHash,
    ], [classification, nodeType, start, end, tokenCount, sourceHash, coarseHash])
    const unit = Buffer.from(target.slice(start, end))
    assert.deepEqual(descriptor(unit), { bytes: end - start, sha256: sourceHash })
    const unitAst = parse(unit.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    assert.equal(unitAst.body.length, 1)
    assert.equal(unitAst.body[0].type, nodeType)

    const [kind, value, residueStart, residueEnd, occurrence, baselineCount] =
      fixture.row.residue
    assert.equal(kind, 'string')
    const baselineOccurrences = targetTemplateOccurrences(baseline, value)
    const targetOccurrences = targetTemplateOccurrences(target, value)
    assert.equal(baselineOccurrences.length, baselineCount)
    assert.equal(targetOccurrences.length, 1)
    assert.deepEqual(targetOccurrences[occurrence - 1], {
      start: residueStart,
      end: residueEnd,
    })
    assert.ok(residueStart >= start && residueEnd <= end)
    const targetTemplates = []
    walk(unitAst, node => {
      if (
        node.type === 'TemplateLiteral' &&
        node.quasis.at(-1)?.value.cooked === value
      ) {
        targetTemplates.push(node)
      }
    })
    assert.equal(targetTemplates.length, 1)
    assert.deepEqual(
      targetTemplates[0].quasis.map(quasi => quasi.value.cooked),
      ['Claude GitHub App not installed on ', '/', value],
    )
  },
)

test(
  '2.1.117 schedule wording replay is dual-state, typed, and executable',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const raw = materializeRawSource('target117-schedule-routine-wording-raw-')
    try {
      const rawBytes = fs.readFileSync(sourceFilename(raw.sourceRoot))
      const rawSourceFile = ts.createSourceFile(
        fixture.inputs.sourceFile.path,
        rawBytes.toString('utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      exactDeclaration(ts, rawSourceFile, rawBytes, 'input')
      assert.match(rawBytes.toString('utf8'), /if your trigger needs this repo\./)
      assert.doesNotMatch(rawBytes.toString('utf8'), /if your routine needs this repo\./)

      const first = applyTarget117ScheduleRoutineRepoWordingSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(first.status, 'recovered')
      const second = applyTarget117ScheduleRoutineRepoWordingSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(second.status, 'already-recovered')
      const outputBytes = assertPostimage(
        ts,
        raw.sourceRoot,
        'recovered schedule source',
      )
      assert.deepEqual(
        Buffer.from(
          outputBytes
            .toString('utf8')
            .replace('if your routine needs this repo.', 'if your trigger needs this repo.'),
        ),
        rawBytes,
        'one bounded same-width wording replacement',
      )
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
    }

    const packagedRoot = path.resolve(
      process.env.CLAUDE_CODE_RECOVERED_2_1_117_SOURCE_ROOT ??
        path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
    )
    assert.ok(fs.existsSync(packagedRoot), 'packaged Target117 source root exists')
    const packaged = copySelectedSource(
      packagedRoot,
      'target117-schedule-routine-wording-packaged-',
    )
    try {
      const result = applyTarget117ScheduleRoutineRepoWordingSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.ok(['recovered', 'already-recovered'].includes(result.status))
      assertPostimage(ts, packaged.sourceRoot, 'packaged schedule source')
    } finally {
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.117 schedule wording replay rejects raw and postimage mutation',
  { skip: !selected },
  () => {
    const raw = materializeRawSource('target117-schedule-wording-mutated-')
    try {
      const filename = sourceFilename(raw.sourceRoot)
      fs.appendFileSync(filename, '\n// mutation\n')
      const before = fs.readFileSync(filename)
      assert.throws(
        () => applyTarget117ScheduleRoutineRepoWordingSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }),
        /Refusing non-target schedule routine repository wording recovery/,
      )
      assert.deepEqual(fs.readFileSync(filename), before)
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
    }

    const recovered = materializeRawSource(
      'target117-schedule-wording-postimage-mutated-',
    )
    try {
      applyTarget117ScheduleRoutineRepoWordingSourceRecovery({
        sourceRoot: recovered.sourceRoot,
      })
      const filename = sourceFilename(recovered.sourceRoot)
      fs.appendFileSync(filename, '\n// mutation\n')
      const before = fs.readFileSync(filename)
      assert.throws(
        () => applyTarget117ScheduleRoutineRepoWordingSourceRecovery({
          sourceRoot: recovered.sourceRoot,
        }),
        /Refusing non-target schedule routine repository wording recovery/,
      )
      assert.deepEqual(fs.readFileSync(filename), before)
    } finally {
      fs.rmSync(recovered.temporaryRoot, { recursive: true, force: true })
    }
  },
)
