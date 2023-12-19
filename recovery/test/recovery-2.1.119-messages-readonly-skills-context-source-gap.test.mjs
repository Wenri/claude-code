import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  TARGET119_MESSAGES_CONTEXT_EVIDENCE_IDS,
  TARGET119_MESSAGES_CONTEXT_INPUT,
  TARGET119_MESSAGES_CONTEXT_OUTPUT,
  TARGET119_MESSAGES_CONTEXT_OWNER_OVERRIDES,
  TARGET119_MESSAGES_CONTEXT_READ_ONLY_AFTER,
  TARGET119_MESSAGES_CONTEXT_READ_ONLY_BEFORE,
  TARGET119_MESSAGES_CONTEXT_SKILLS_AFTER,
  TARGET119_MESSAGES_CONTEXT_SKILLS_BEFORE,
  applyTarget119MessagesContextSourceRecovery,
  buildTarget119MessagesContextOutput,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-messages-readonly-skills-context-source-gap.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-messages-readonly-skills-context-source-gap.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/replay-messages-readonly-skills-context-source-gap.mjs',
)
const builderPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/build-messages-readonly-skills-context-source-gap-fixture.mjs',
)
const coveragePath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const historicalSourceRoot = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.119/src',
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? historicalSourceRoot,
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  'aecc56fd92eb7a62db1bc47fe82aa349e649615c0e458adeb390c7d519eae6d1'
const HELPER_SHA256 =
  'c45839b7eb40a553a362dcb496828f643cd4e25939dbf68af42a66d83dc745b6'
const BUILDER_SHA256 =
  '61dd7b5153e780b4518ad1c02ad012cd23bf364f30fe1e3de5e96016bac72858'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(bytes),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return bytes
}

function artifactPath(version, expected) {
  const environment = `CLAUDE_CODE_${version.replaceAll('.', '_')}_BUNDLE`
  return process.env[environment]
    ? path.resolve(process.env[environment])
    : path.join(artifactRoot, expected.artifact)
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function sourceState(bytes) {
  const actual = descriptor(bytes)
  if (
    actual.bytes === TARGET119_MESSAGES_CONTEXT_INPUT.bytes &&
    actual.sha256 === TARGET119_MESSAGES_CONTEXT_INPUT.sha256
  ) {
    return 'raw'
  }
  if (
    actual.bytes === TARGET119_MESSAGES_CONTEXT_OUTPUT.bytes &&
    actual.sha256 === TARGET119_MESSAGES_CONTEXT_OUTPUT.sha256
  ) {
    return 'recovered'
  }
  assert.fail(`unknown Target119 messages source ${actual.bytes}/${actual.sha256}`)
}

function rawSourceFrom(bytes) {
  if (sourceState(bytes) === 'raw') return bytes.toString('utf8')
  const raw = bytes
    .toString('utf8')
    .replace(
      TARGET119_MESSAGES_CONTEXT_READ_ONLY_AFTER,
      TARGET119_MESSAGES_CONTEXT_READ_ONLY_BEFORE,
    )
    .replace(
      TARGET119_MESSAGES_CONTEXT_SKILLS_AFTER,
      TARGET119_MESSAGES_CONTEXT_SKILLS_BEFORE,
    )
  assert.deepEqual(descriptor(raw), {
    bytes: TARGET119_MESSAGES_CONTEXT_INPUT.bytes,
    sha256: TARGET119_MESSAGES_CONTEXT_INPUT.sha256,
  })
  return raw
}

function canonicalResidues() {
  return fixture.rows.flatMap(row =>
    row.residues.map(residue => [
      row.targetIndex,
      residue.kind,
      residue.value,
      residue.start,
      residue.end,
      residue.baselineCount,
      residue.targetOrdinal,
    ]),
  )
}

function decodedTargetResidue(actual, residue) {
  if (residue.kind === 'property') return actual
  let decoded = actual
    .replaceAll('\\u2014', '—')
    .replaceAll('\\`', '`')
  if (decoded.startsWith('"') && !residue.value.startsWith('"')) {
    decoded = decoded.slice(1)
  }
  if (decoded.endsWith('"') && !residue.value.endsWith('"')) {
    decoded = decoded.slice(0, -1)
  }
  return decoded
}

function findFunction(ts, sourceFile, name) {
  const matches = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.equal(matches.length, 1, `one ${name} declaration`)
  return matches[0]
}

function findTemplate(ts, sourceFile, source, marker) {
  const matches = []
  function visit(node) {
    if (
      (ts.isTemplateExpression(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.getText(sourceFile).includes(marker)
    ) {
      matches.push(source.slice(node.getStart(sourceFile), node.end))
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, `one template containing ${marker}`)
  return matches[0]
}

function evaluateReadOnlyTarget(unit, embedded, allowedTools) {
  return Function(
    'fX',
    'Q5',
    'lq',
    'N_',
    'A9',
    'fY',
    `'use strict';${unit};return Tu1()`,
  )(
    () => embedded,
    () => true,
    'Read',
    'Glob',
    'Grep',
    () => ({ allowedTools }),
  )
}

function evaluateReadOnlySource(declaration, embedded, allowedTools) {
  const javascript = declaration.replace(
    'function getReadOnlyToolNames(): string',
    'function getReadOnlyToolNames()',
  )
  return Function(
    'hasEmbeddedSearchTools',
    'FILE_READ_TOOL_NAME',
    'GLOB_TOOL_NAME',
    'GREP_TOOL_NAME',
    'getCurrentProjectConfig',
    `'use strict';${javascript};return getReadOnlyToolNames()`,
  )(
    () => embedded,
    'Read',
    'Glob',
    'Grep',
    () => ({ allowedTools }),
  )
}

test(
  'Target119 messages fixture, helper, builder, and coverage evolve atomically',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(sha256(fs.readFileSync(builderPath)), BUILDER_SHA256)
    assert.deepEqual(fixture.evidenceIds, TARGET119_MESSAGES_CONTEXT_EVIDENCE_IDS)
    assert.deepEqual(
      fixture.ownerOverrides,
      TARGET119_MESSAGES_CONTEXT_OWNER_OVERRIDES,
    )
    assert.deepEqual(fixture.summary, {
      units: 2,
      residues: 15,
      targetIndicesSha256:
        '28f0cf50689337230c610c7cc72c62f872f2c0f5397210c484d877752542834a',
      residueIdentitiesSha256:
        '36f38d373885e967cdc2ea014127f5224e62358c99b83ac183a5c1674c44a385',
    })
    assert.equal(
      sha256(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(canonicalResidues())),
      fixture.summary.residueIdentitiesSha256,
    )

    const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
    const ownerById = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const states = TARGET119_MESSAGES_CONTEXT_OWNER_OVERRIDES.map(expected => {
      const row = coverage.rows.find(item => item.targetIndex === expected.targetIndex)
      assert(row, `coverage u${expected.targetIndex}`)
      assert.deepEqual(row.ownerIds.map(id => ownerById.get(id)), [...expected.paths])
      const recovered = expected.evidenceIds.every(id =>
        row.evidenceIds.includes(id),
      )
      if (recovered) {
        assert.deepEqual(row.evidenceIds, [...expected.evidenceIds])
        assert.equal(row.behavior, expected.behavior)
      } else {
        assert.deepEqual(row.evidenceIds, ['source-map-attribution', 'semantic-test'])
      }
      return recovered
    })
    assert(
      states.every(Boolean) || states.every(state => !state),
      'messages coverage must be entirely provisional or entirely recovered',
    )
  },
)

test(
  'authenticated Target119 units and all fifteen owner residues remain exact',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    readExact(
      artifactPath('2.1.118', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'Target118 bundle',
    )
    const target = readExact(
      artifactPath('2.1.119', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 bundle',
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
    for (const row of fixture.rows) {
      const regions = structural.regions.filter(
        region => region.target.index === row.targetIndex,
      )
      assert.equal(regions.length, 1)
      const region = regions[0]
      assert.deepEqual(
        {
          classification: region.classification,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          bytes: region.target.end - region.target.start,
          tokenCount: region.target.tokenCount,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        row.target,
      )
      assert.equal(
        sha256(target.subarray(row.target.start, row.target.end)),
        row.target.sourceHash,
      )
      for (const residue of row.residues) {
        assert(
          residue.start >= row.target.start && residue.end <= row.target.end,
          `u${row.targetIndex} residue is inside the complete target unit`,
        )
        const actual = target.subarray(residue.start, residue.end).toString('utf8')
        assert.equal(
          decodedTargetResidue(actual, residue),
          typeof residue.value === 'string' ? residue.value : residue.value.pattern,
          `u${row.targetIndex} target residue ${residue.kind}`,
        )
      }
    }
    const readOnlyUnit = target
      .subarray(fixture.rows[0].target.start, fixture.rows[0].target.end)
      .toString('utf8')
    assert.match(readOnlyUnit, /`\\`find\\`\/\$\{N_\}`/)
    assert.match(readOnlyUnit, /`\\`grep\\`\/\$\{A9\}`/)
    assert.match(readOnlyUnit, /allowedTools/)
    const attachmentUnit = target
      .subarray(fixture.rows[1].target.start, fixture.rows[1].target.end)
      .toString('utf8')
    assert.match(attachmentUnit, /case"invoked_skills"/)
    assert.match(attachmentUnit, /H\.skills\.length===0/)
    assert.match(attachmentUnit, /IMPORTANT: Do NOT re-execute these skills/)
    assert.match(attachmentUnit, /isMeta:!0/)
  },
)

test(
  'recovered source AST and executable branches match the authenticated runtime',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const live = fs.readFileSync(
      path.join(sourceRoot, fixture.inputs.sourcePreimage.path.replace(/^src\//, '')),
    )
    const raw = rawSourceFrom(live)
    const post = buildTarget119MessagesContextOutput(raw)
    assert.deepEqual(descriptor(post), {
      bytes: fixture.inputs.sourcePostimage.bytes,
      sha256: fixture.inputs.sourcePostimage.sha256,
    })

    for (const [state, source] of [
      ['preimage', raw],
      ['postimage', post],
    ]) {
      const sourceFile = ts.createSourceFile(
        'messages.ts',
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      for (const expected of fixture.sourceDeclarations[state]) {
        const declaration = findFunction(ts, sourceFile, expected.name)
        const text = source.slice(declaration.getStart(sourceFile), declaration.end)
        assert.deepEqual(
          {
            name: expected.name,
            start: declaration.getStart(sourceFile),
            end: declaration.end,
            ...descriptor(text),
          },
          expected,
        )
      }
    }

    const postFile = ts.createSourceFile(
      'messages.ts',
      post,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const readOnlyDeclaration = findFunction(
      ts,
      postFile,
      'getReadOnlyToolNames',
    )
    const readOnlySource = post.slice(
      readOnlyDeclaration.getStart(postFile),
      readOnlyDeclaration.end,
    )
    const target = fs.readFileSync(
      artifactPath('2.1.119', fixture.inputs.targetBundle),
      'utf8',
    )
    const targetReadOnly = target.slice(
      fixture.rows[0].target.start,
      fixture.rows[0].target.end,
    )
    for (const scenario of [
      { embedded: false, allowedTools: undefined },
      { embedded: false, allowedTools: ['Read', 'Glob'] },
      { embedded: true, allowedTools: undefined },
      { embedded: true, allowedTools: ['Read'] },
    ]) {
      assert.equal(
        evaluateReadOnlySource(
          readOnlySource,
          scenario.embedded,
          scenario.allowedTools,
        ),
        evaluateReadOnlyTarget(
          targetReadOnly,
          scenario.embedded,
          scenario.allowedTools,
        ),
      )
    }

    const targetAttachment = target.slice(
      fixture.rows[1].target.start,
      fixture.rows[1].target.end,
    )
    const targetAttachmentFile = ts.createSourceFile(
      'target.js',
      targetAttachment,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    )
    const sourceTemplate = findTemplate(
      ts,
      postFile,
      post,
      'skills were invoked EARLIER',
    )
    const targetTemplate = findTemplate(
      ts,
      targetAttachmentFile,
      targetAttachment,
      'skills were invoked EARLIER',
    )
    const renderedSkills =
      '### Skill: test-skill\nPath: /tmp/test/SKILL.md\n\n## Input\noriginal argument'
    const sourceMessage = Function(
      'skillsContent',
      `'use strict';return ${sourceTemplate}`,
    )(renderedSkills)
    const targetMessage = Function(
      'q',
      `'use strict';return ${targetTemplate}`,
    )(renderedSkills)
    assert.equal(sourceMessage, targetMessage)
    assert.match(sourceMessage, /before the conversation was compacted/)
    assert.match(sourceMessage, /Do NOT re-execute these skills/)
    assert.match(sourceMessage, /they are NOT the user's current message/)
    assert(sourceMessage.endsWith(renderedSkills))
  },
)

test(
  'Target119 messages replay is idempotent, parse-clean, and fail-closed',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  t => {
    const live = fs.readFileSync(
      path.join(sourceRoot, fixture.inputs.sourcePreimage.path.replace(/^src\//, '')),
    )
    const raw = rawSourceFrom(live)
    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target119-messages-context-'),
    )
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
    const filename = path.join(temporary, 'utils/messages.ts')
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, raw)
    assert.deepEqual(
      applyTarget119MessagesContextSourceRecovery({ sourceRoot: temporary }),
      { changed: true, path: 'src/utils/messages.ts' },
    )
    assert.deepEqual(descriptor(fs.readFileSync(filename)), {
      bytes: TARGET119_MESSAGES_CONTEXT_OUTPUT.bytes,
      sha256: TARGET119_MESSAGES_CONTEXT_OUTPUT.sha256,
    })
    assert.deepEqual(
      applyTarget119MessagesContextSourceRecovery({ sourceRoot: temporary }),
      { changed: false, path: 'src/utils/messages.ts' },
    )
    const build = spawnSync(
      'bun',
      [
        'build',
        filename,
        '--target=node',
        '--external=*',
        '--outfile',
        path.join(temporary, 'messages.js'),
      ],
      { cwd: root, encoding: 'utf8' },
    )
    assert.equal(build.status, 0, build.stderr)

    const mixed = raw.replace(
      TARGET119_MESSAGES_CONTEXT_READ_ONLY_BEFORE,
      TARGET119_MESSAGES_CONTEXT_READ_ONLY_AFTER,
    )
    fs.writeFileSync(filename, mixed)
    const mixedBefore = fs.readFileSync(filename)
    assert.throws(
      () => applyTarget119MessagesContextSourceRecovery({ sourceRoot: temporary }),
      /rejected/,
    )
    assert.deepEqual(fs.readFileSync(filename), mixedBefore)

    fs.writeFileSync(filename, `${raw}\n`)
    const driftBefore = fs.readFileSync(filename)
    assert.throws(
      () => applyTarget119MessagesContextSourceRecovery({ sourceRoot: temporary }),
      /rejected/,
    )
    assert.deepEqual(fs.readFileSync(filename), driftBefore)
  },
)
