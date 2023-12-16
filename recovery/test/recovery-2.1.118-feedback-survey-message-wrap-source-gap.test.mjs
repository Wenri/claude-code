import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  applyTarget118FeedbackSurveyMessageWrapSourceRecovery,
  TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_EVIDENCE_IDS,
  TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_INPUT_FILES,
  TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_OUTPUT_FILES,
  TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-feedback-survey-message-wrap-source-gap.mjs'
import { constructTarget118StrictTransitiveFiles } from '../cases/2.1.117-to-2.1.118/recovered/replay-strict-transitive-source-gaps.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-feedback-survey-message-wrap-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 = '3284fb06b76496e84af9b38c15701730e448ca830611db69197409801b6754f3'
const rawSourceRoot = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.118/src',
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function readPinned(input, base = root) {
  const bytes = fs.readFileSync(path.join(base, input.path))
  assert.deepEqual(descriptor(bytes), expectedDescriptor(input))
  return bytes
}

function count(source, needle) {
  return source.split(needle).length - 1
}

function withTempSource(bytes, callback) {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target118-feedback-wrap-'),
  )
  const sourceRoot = path.join(temp, 'src')
  const filename = path.join(
    sourceRoot,
    'components/FeedbackSurvey/FeedbackSurveyView.tsx',
  )
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
  try {
    return callback({ sourceRoot, filename, temp })
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

let typescriptPromise
function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function declarationBytes(ts, source) {
  const sourceFile = ts.createSourceFile(
    fixture.sourceState.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const declarations = []
  const visit = node => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === fixture.sourceState.outputDeclaration.name
    ) {
      declarations.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(declarations.length, 1)
  return {
    sourceFile,
    declaration: declarations[0],
    bytes: Buffer.from(
      source.slice(
        declarations[0].getStart(sourceFile),
        declarations[0].end,
      ),
    ),
  }
}

test(
  'Target118 feedback-survey wrap fixture and replay exports are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    readPinned(fixture.inputs.helper)
    assert.deepEqual(
      TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_INPUT_FILES.map(expected => ({
        ...expected,
      })),
      fixture.sourceState.inputFiles.map(expected => ({
        path: fixture.sourceState.path,
        ...expected,
      })),
    )
    assert.deepEqual(
      TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_OUTPUT_FILES.map(expected => ({
        ...expected,
      })),
      fixture.sourceState.outputFiles.map(expected => ({
        path: fixture.sourceState.path,
        ...expected,
      })),
    )
    assert.deepEqual(
      TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
      })),
      [
        {
          targetIndex: fixture.targetUnit.targetIndex,
          paths: fixture.ownerOverride.paths,
          declarations: fixture.ownerOverride.declarations,
          evidenceIds: fixture.evidenceIds,
        },
      ],
    )
  },
)

test(
  'authenticated predecessor and target both retain the exact wrap contract',
  { skip: !selected },
  () => {
    for (const [input, unit] of [
      [fixture.inputs.baselineBundle, fixture.baselineUnit],
      [fixture.inputs.targetBundle, fixture.targetUnit],
    ]) {
      const bundle = readPinned(input)
      const source = bundle.subarray(unit.start, unit.end)
      assert.deepEqual(descriptor(source), expectedDescriptor(unit))
      const marker = Buffer.from('wrap:"wrap"')
      assert.equal(source.indexOf(marker), unit.wrapMarkerOffset)
      assert.equal(source.indexOf(marker, unit.wrapMarkerOffset + 1), -1)
      const context = source.subarray(
        unit.wrapMarkerOffset - 40,
        unit.wrapMarkerOffset + marker.length + 40,
      )
      assert.deepEqual(descriptor(context), expectedDescriptor(unit.wrapContext))
    }
    const targetBundle = readPinned(fixture.inputs.targetBundle)
    for (const residue of fixture.targetUnit.residues) {
      assert.equal(
        targetBundle.subarray(residue[2], residue[3]).toString(),
        residue[1],
      )
    }
    assert.equal(
      sha256(JSON.stringify([fixture.targetUnit.targetIndex])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(
        JSON.stringify(
          fixture.targetUnit.residues.map(row => [
            fixture.targetUnit.targetIndex,
            ...row,
          ]),
        ),
      ),
      fixture.summary.residueIdentitiesSha256,
    )
  },
)

test(
  'raw and strict-transitive states replay atomically and idempotently',
  { skip: !selected },
  async () => {
    const raw = readPinned(
      {
        path: fixture.sourceState.path.replace(/^src\//, ''),
        ...fixture.sourceState.inputFiles[0],
      },
      rawSourceRoot,
    )
    const strictTransitive = constructTarget118StrictTransitiveFiles({
      sourceRoot: rawSourceRoot,
    }).get(fixture.sourceState.path)
    assert.ok(strictTransitive)
    assert.deepEqual(
      descriptor(strictTransitive),
      expectedDescriptor(fixture.sourceState.inputFiles[1]),
    )
    const ts = await loadTypeScript()
    for (const [index, input] of [raw, strictTransitive].entries()) {
      withTempSource(input, ({ sourceRoot, filename }) => {
        const first = applyTarget118FeedbackSurveyMessageWrapSourceRecovery({
          sourceRoot,
        })
        assert.equal(first.changed, true)
        assert.equal(
          first.state,
          fixture.sourceState.outputFiles[index].state,
        )
        const output = fs.readFileSync(filename)
        assert.deepEqual(
          descriptor(output),
          expectedDescriptor(fixture.sourceState.outputFiles[index]),
        )
        const second = applyTarget118FeedbackSurveyMessageWrapSourceRecovery({
          sourceRoot,
        })
        assert.equal(second.changed, false)
        const source = output.toString()
        assert.equal(count(source, fixture.sourceState.inputJsx), 0)
        assert.equal(count(source, fixture.sourceState.outputJsx), 1)
        const parsed = declarationBytes(ts, source)
        assert.deepEqual(
          descriptor(parsed.bytes),
          expectedDescriptor(fixture.sourceState.outputDeclaration),
        )
        const exactTextChildren = []
        const visit = node => {
          if (
            ts.isJsxElement(node) &&
            node.openingElement.tagName.getText(parsed.sourceFile) === 'Text' &&
            node.children.some(
              child =>
                ts.isJsxExpression(child) &&
                child.expression?.getText(parsed.sourceFile) === 'message',
            )
          ) {
            exactTextChildren.push(node)
          }
          ts.forEachChild(node, visit)
        }
        visit(parsed.declaration)
        assert.equal(exactTextChildren.length, 1)
        const attributes = new Map(
          exactTextChildren[0].openingElement.attributes.properties.map(
            attribute => [attribute.name?.getText(parsed.sourceFile), attribute],
          ),
        )
        assert.equal(attributes.get('bold')?.initializer?.getText(parsed.sourceFile), '{true}')
        assert.equal(attributes.get('wrap')?.initializer?.getText(parsed.sourceFile), '"wrap"')
      })
    }
  },
)

test(
  'replay rejects drift and symlink inputs before publication',
  { skip: !selected },
  () => {
    const raw = readPinned(
      {
        path: fixture.sourceState.path.replace(/^src\//, ''),
        ...fixture.sourceState.inputFiles[0],
      },
      rawSourceRoot,
    )
    withTempSource(Buffer.concat([raw, Buffer.from('\n// drift\n')]), ({ sourceRoot }) => {
      assert.throws(
        () =>
          applyTarget118FeedbackSurveyMessageWrapSourceRecovery({ sourceRoot }),
        /unsupported preimage/,
      )
    })
    withTempSource(raw, ({ sourceRoot, filename, temp }) => {
      const real = path.join(temp, 'real.tsx')
      fs.renameSync(filename, real)
      fs.symlinkSync(real, filename)
      assert.throws(
        () =>
          applyTarget118FeedbackSurveyMessageWrapSourceRecovery({ sourceRoot }),
        /expected a real source file/,
      )
    })
  },
)

test(
  'coverage accepts only the provisional or complete replay proof state',
  { skip: !selected },
  () => {
    const coverage = JSON.parse(
      gunzipSync(
        fs.readFileSync(
          path.join(
            root,
            'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
          ),
        ),
      ),
    )
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(row)
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const paths = row.ownerIds.map(id => owners.get(id)).sort()
    const provisional =
      JSON.stringify(paths) ===
        JSON.stringify([...fixture.ownerOverride.paths].sort()) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(paths) ===
        JSON.stringify([...fixture.ownerOverride.paths].sort()) &&
      JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds) &&
      row.behavior ===
        TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_OWNER_OVERRIDES[0].behavior
    assert.equal(row.disposition, 'source-runtime-covered')
    assert.equal(provisional || corrected, true)
  },
)
