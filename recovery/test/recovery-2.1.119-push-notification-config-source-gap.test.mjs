import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  buildTarget119PushNotificationConfigOutput,
  TARGET119_PUSH_NOTIFICATION_CONFIG_EVIDENCE_IDS,
  TARGET119_PUSH_NOTIFICATION_CONFIG_FILES,
  TARGET119_PUSH_NOTIFICATION_CONFIG_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-push-notification-config-source-gap.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-push-notification-config-source-gap.json',
)
const builderPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/build-push-notification-config-source-gap-fixture.mjs',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/replay-push-notification-config-source-gap.mjs',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '3f06329aab18fabb2483a28eeb9a95fb478ce638c0c0c65daf00bb336c665413'
const BUILDER_SHA256 =
  '51d3507267c94972cc0e8c12474fd4288db9170bc31da6d413a789bcb05a8ab4'
const HELPER_SHA256 =
  'a047f37116d272ab274ec32124d42963be63c58de53c3fd6de4ac4735a938b14'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function readExact(filename, expected, label = filename) {
  const value = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(value),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return value
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function findFunction(ts, sourceFile, name) {
  return sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
}

test(
  'Target119 push-notification replay fixture and helper are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(builderPath)), BUILDER_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      fixture.evidenceIds,
      TARGET119_PUSH_NOTIFICATION_CONFIG_EVIDENCE_IDS,
    )
    assert.deepEqual(
      fixture.ownerOverrides,
      TARGET119_PUSH_NOTIFICATION_CONFIG_OWNER_OVERRIDES,
    )
    assert.deepEqual(fixture.inputs.sourceFiles, TARGET119_PUSH_NOTIFICATION_CONFIG_FILES)
    assert.deepEqual(fixture.summary, {
      units: 2,
      residues: 2,
      targetIndicesSha256:
        '955ac8fdabe3a7c6abb2b598c5fe0f205c509b4e851b10bc8acd9035bcc8d541',
      residueIdentitiesSha256:
        'c9dc78843bd16509746d369d204c0b4193c8b8248442d88a97d807b5ed14497e',
    })
  },
)

test(
  'authenticated Target119 units call the exact settings-backed config getter',
  { skip: !selected },
  () => {
    const target = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 bundle',
    ).toString('utf8')
    const targetAst = parse(target, {
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const getters = targetAst.body.filter(
      node =>
        node.type === 'FunctionDeclaration' &&
        node.id?.name === fixture.targetConfigGetter.name,
    )
    assert.equal(getters.length, 1)
    const getter = getters[0]
    assert.deepEqual(
      {
        name: getter.id.name,
        start: getter.start,
        end: getter.end,
        bytes: getter.end - getter.start,
        sha256: sha256(target.slice(getter.start, getter.end)),
        requiredMarkers: fixture.targetConfigGetter.requiredMarkers,
      },
      fixture.targetConfigGetter,
    )
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.structural.path),
          fixture.inputs.structural,
          'Target119 structural ledger',
        ),
      ),
    )
    const regions = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    for (const row of fixture.rows) {
      const region = regions.get(row.targetIndex)
      assert(region)
      assert.deepEqual(
        {
          classification: region.classification,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          bytes: region.target.end - region.target.start,
          sourceHash: region.target.sourceHash,
          requiredMarkers: row.target.requiredMarkers,
        },
        row.target,
      )
      const unit = target.slice(row.target.start, row.target.end)
      assert.equal(sha256(unit), row.target.sourceHash)
      for (const marker of row.target.requiredMarkers) assert(unit.includes(marker))
      assert.equal(row.residues.length, 1)
      const residue = row.residues[0]
      const residueText = target.slice(residue.start, residue.end)
      assert.equal(
        residue.kind === 'string' ? JSON.parse(residueText) : residueText,
        residue.value,
      )
    }
  },
)

test(
  'Target119 push-notification source replay is atomic and declaration-scoped',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const states = new Set()
    const postimages = new Map()
    for (const file of fixture.inputs.sourceFiles) {
      const filename = path.join(sourceRoot, file.path.replace(/^src\//, ''))
      const bytes = fs.readFileSync(filename)
      const actual = descriptor(bytes)
      if (
        actual.bytes === file.input.bytes &&
        actual.sha256 === file.input.sha256
      ) {
        states.add('raw')
        const output = Buffer.from(
          buildTarget119PushNotificationConfigOutput(
            bytes.toString('utf8'),
            file,
          ),
        )
        assert.deepEqual(descriptor(output), file.output)
        postimages.set(file.path, output)
      } else {
        assert.deepEqual(actual, file.output, file.path)
        states.add('package')
        postimages.set(file.path, bytes)
      }
    }
    assert.equal(states.size, 1)
    for (const row of fixture.rows) {
      const source = postimages.get(row.ownerPath).toString('utf8')
      const sourceFile = ts.createSourceFile(
        row.ownerPath,
        source,
        ts.ScriptTarget.Latest,
        true,
        row.ownerPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      const declarations = findFunction(ts, sourceFile, row.declaration.name)
      assert.equal(declarations.length, 1)
      const declaration = declarations[0]
      const start = declaration.getStart(sourceFile)
      const end = declaration.end
      const text = source.slice(start, end)
      assert.deepEqual(
        {
          kind: 'FunctionDeclaration',
          name: declaration.name.text,
          start,
          end,
          bytes: end - start,
          sha256: sha256(text),
          requiredMarkers: row.declaration.requiredMarkers,
        },
        row.declaration,
      )
      for (const marker of row.declaration.requiredMarkers) {
        assert(text.includes(marker), `${row.ownerPath}:${marker}`)
      }
      assert.equal(text.includes('config.agentPushNotifEnabled'), false)
    }
  },
)

test(
  'Target119 push-notification coverage evolves atomically',
  { skip: !selected },
  () => {
    const coverage = JSON.parse(
      gunzipSync(
        fs.readFileSync(
          path.join(
            root,
            'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
          ),
        ),
      ),
    )
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
    const states = new Set()
    for (const proof of fixture.rows) {
      const row = rows.get(proof.targetIndex)
      assert(row)
      const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
      const provisional =
        JSON.stringify(paths) === JSON.stringify(proof.priorOwnerPaths) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(['source-map-attribution', 'semantic-test'])
      const corrected =
        JSON.stringify(paths) === JSON.stringify([proof.ownerPath]) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(fixture.evidenceIds) &&
        row.behavior === proof.behavior
      assert(provisional || corrected, `u${proof.targetIndex}`)
      states.add(corrected ? 'corrected' : 'provisional')
    }
    assert.equal(states.size, 1)
  },
)
