import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  applyTarget119LaterDonorRuntimeReplay,
  TARGET119_LATER_DONOR_RUNTIME_FILES,
  TARGET119_LATER_DONOR_RUNTIME_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-later-donor-runtime-source-gaps.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-later-donor-runtime-source-gaps.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/replay-later-donor-runtime-source-gaps.mjs',
)
const builderPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/build-later-donor-runtime-source-gap-fixture.mjs',
)
const historicalSourceRoot = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.119/src',
)
const donorSourceRoot = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.121/src',
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? historicalSourceRoot,
)
const targetBundlePath = path.resolve(
  process.env.CLAUDE_CODE_2_1_119_BUNDLE ??
    path.join(
      root,
      '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
    ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  'c38161dce98a7a5e91a167e6a6300c1f50d6e47816d52b2b13f45a8cdf8a1a0c'
const HELPER_SHA256 =
  'cb5d5a2c2de419bb039ac3a0592e15ffce72228fdd2a53c289e58055290b40c1'
const BUILDER_SHA256 =
  'bd975d0560668fccb01e2366b0465d4c2cfb61e6dec5ed53a88af3655e528630'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function canonicalFlags(value) {
  return [...value].sort().join('')
}

function identity(kind, value) {
  return JSON.stringify([
    kind,
    kind === 'regexp'
      ? { pattern: value.pattern, flags: canonicalFlags(value.flags) }
      : value,
  ])
}

function targetOccurrences(source) {
  const occurrences = new Map()
  function add(kind, value, node) {
    const key = identity(kind, value)
    const values = occurrences.get(key) ?? []
    values.push({ start: node.start, end: node.end })
    occurrences.set(key, values)
  }
  function visit(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Literal') {
      if (node.regex) add('regexp', node.regex, node)
      else if (typeof node.value === 'string') add('string', node.value, node)
      else if (typeof node.value === 'number') {
        add('number', String(node.value), node)
      }
    } else if (node.type === 'TemplateElement') {
      add('string', node.value?.cooked ?? node.value?.raw, node)
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (property) add('property', property.name, property)
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(
    parse(source, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    }),
  )
  for (const values of occurrences.values()) {
    values.sort((left, right) => left.start - right.start)
  }
  return occurrences
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function assertTypeScriptParses(ts, filename, source) {
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, filename)
}

test(
  'Target119 later-donor replay fixture pins three complete target units',
  { skip: !selected, timeout: 120_000 },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(sha256(fs.readFileSync(builderPath)), BUILDER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.criterion,
      'exact-target119-unit-and-residue-with-exact-target121-source-postimage',
    )
    assert.deepEqual(fixture.summary, {
      units: 3,
      residues: 3,
      sourceFiles: 3,
      targetIndicesSha256:
        '6886bc68331582c83321d459f0dd946a96b70259a6f641edf4182e6be448801f',
      residueIdentitiesSha256:
        'f9c05067c9ea3808543954a1e367b10744378480a7bc2d1772bf2a7d55fbea1b',
    })
    assert.deepEqual(
      fixture.ownerOverrides,
      TARGET119_LATER_DONOR_RUNTIME_OWNER_OVERRIDES,
    )
    assert.deepEqual(
      fixture.inputs.sourceFiles.map(file => ({
        path: file.path,
        before: file.before,
        after: file.after,
      })),
      TARGET119_LATER_DONOR_RUNTIME_FILES,
    )

    const bundle = fs.readFileSync(targetBundlePath)
    assert.deepEqual(descriptor(bundle), fixture.inputs.targetBundle)
    const bundleSource = bundle.toString('utf8')
    const occurrences = targetOccurrences(bundleSource)
    for (const row of fixture.rows) {
      const unit = bundleSource.slice(row.target.start, row.target.end)
      assert.equal(Buffer.byteLength(unit), row.target.bytes)
      assert.equal(sha256(unit), row.target.sourceHash)
      for (const marker of row.targetMarkers) {
        assert.ok(unit.includes(marker), `u${row.targetIndex}: ${marker}`)
      }
      for (const residue of row.residues) {
        const key = identity(residue.kind, residue.value)
        const occurrence =
          (occurrences.get(key) ?? [])[residue.targetOrdinal - 1]
        assert.ok(occurrence, `u${row.targetIndex}: ${key}`)
        assert.deepEqual(
          [occurrence.start, occurrence.end],
          [residue.start, residue.end],
          `u${row.targetIndex}: ${key} range`,
        )
      }
    }
  },
)

test(
  'Target119 later-donor replay is bounded, exact, parseable, and idempotent',
  { skip: !selected, timeout: 120_000 },
  async () => {
    const ts = await loadTypeScript()
    const states = new Set()
    for (const input of fixture.inputs.sourceFiles) {
      const relative = input.path.replace(/^src\//, '')
      const raw = fs.readFileSync(path.join(historicalSourceRoot, relative))
      const donor = fs.readFileSync(path.join(donorSourceRoot, relative))
      assert.deepEqual(descriptor(raw), input.before, `${input.path}: raw`)
      assert.deepEqual(
        descriptor(donor),
        {
          bytes: input.authenticatedDonor.bytes,
          sha256: input.authenticatedDonor.sha256,
        },
        `${input.path}: authenticated Target121 donor`,
      )
      assert.deepEqual(descriptor(donor), input.after, `${input.path}: postimage`)
      assertTypeScriptParses(ts, input.path, donor.toString('utf8'))

      const actual = fs.readFileSync(path.join(sourceRoot, relative))
      const actualDescriptor = descriptor(actual)
      if (
        actualDescriptor.bytes === input.before.bytes &&
        actualDescriptor.sha256 === input.before.sha256
      ) {
        states.add('raw')
      } else if (
        actualDescriptor.bytes === input.after.bytes &&
        actualDescriptor.sha256 === input.after.sha256
      ) {
        states.add('recovered')
      } else {
        assert.fail(
          `${input.path}: source root is neither raw nor recovered ` +
            `${actualDescriptor.bytes}/${actualDescriptor.sha256}`,
        )
      }
    }
    assert.equal(states.size, 1, 'three-file source state is atomic')

    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target119-later-donor-runtime-'),
    )
    try {
      for (const input of fixture.inputs.sourceFiles) {
        const relative = input.path.replace(/^src\//, '')
        const destination = path.join(temporaryRoot, relative)
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        fs.copyFileSync(path.join(historicalSourceRoot, relative), destination)
      }
      assert.deepEqual(
        applyTarget119LaterDonorRuntimeReplay({ sourceRoot: temporaryRoot }),
        { status: 'recovered' },
      )
      for (const input of fixture.inputs.sourceFiles) {
        const relative = input.path.replace(/^src\//, '')
        const replayed = fs.readFileSync(path.join(temporaryRoot, relative))
        const donor = fs.readFileSync(path.join(donorSourceRoot, relative))
        assert.deepEqual(descriptor(replayed), input.after, input.path)
        assert.deepEqual(replayed, donor, `${input.path}: exact donor bytes`)
        assertTypeScriptParses(ts, input.path, replayed.toString('utf8'))
      }
      assert.deepEqual(
        applyTarget119LaterDonorRuntimeReplay({ sourceRoot: temporaryRoot }),
        { status: 'already-recovered' },
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  'Target119 later-donor coverage changes only as one three-unit group',
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
    for (const expected of TARGET119_LATER_DONOR_RUNTIME_OWNER_OVERRIDES) {
      const row = rows.get(expected.targetIndex)
      assert.ok(row, `u${expected.targetIndex}: coverage row`)
      const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
      const provisional =
        JSON.stringify(paths) === JSON.stringify(expected.paths) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(['source-map-attribution', 'semantic-test'])
      const corrected =
        JSON.stringify(paths) === JSON.stringify(expected.paths) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(expected.evidenceIds) &&
        row.behavior === expected.behavior
      assert.ok(
        provisional || corrected,
        `u${expected.targetIndex}: exact provisional or corrected coverage`,
      )
      states.add(corrected ? 'corrected' : 'provisional')
    }
    assert.equal(states.size, 1, 'three-unit coverage correction is atomic')
  },
)
