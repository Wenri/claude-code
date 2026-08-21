import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_DEFAULT_BRANCH_OWNER_OVERRIDES,
  TARGET119_DEFAULT_BRANCH_PROOF_SPEC,
} from '../cases/2.1.118-to-2.1.119/recovered/default-branch-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-default-branch-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/default-branch-owner-overrides.mjs',
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  'd79ea95aa3bfc0c37d2fc47386955e954f142e43489fe09d14a91cdeedef7690'
const HELPER_SHA256 =
  '53f1b4a5f21c36bc24005ca411e2b22956d0b9882174c3c9fdab7da78c0fa47f'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  }, label)
  return bytes
}

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function declarationName(ts, statement) {
  if (ts.isFunctionDeclaration(statement)) return statement.name?.text
  if (!ts.isVariableStatement(statement)) return undefined
  const names = statement.declarationList.declarations.flatMap(declaration =>
    ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
  )
  return names.length === 1 ? names[0] : undefined
}

function canonicalResidues() {
  return fixture.row.residues.map(residue => [
    fixture.row.targetIndex,
    residue.kind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOrdinal,
  ])
}

function findTargetResolver(unit) {
  const parsed = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
  let resolver
  function visit(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      node.id.name === fixture.target.resolver.binding
    ) {
      assert.equal(resolver, undefined)
      resolver = node.init
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(parsed)
  assert(resolver)
  return resolver
}

function allOffsets(source, needle) {
  const result = []
  let offset = 0
  while ((offset = source.indexOf(needle, offset)) >= 0) {
    result.push(offset)
    offset += needle.length
  }
  return result
}

test(
  'Target119 default-branch fixture and override remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      TARGET119_DEFAULT_BRANCH_OWNER_OVERRIDES[0],
      {
        key: `${caseName}:2486`,
        targetIndex: fixture.row.targetIndex,
        paths: fixture.row.ownerPaths,
        evidenceIds: fixture.evidenceIds,
        behavior: TARGET119_DEFAULT_BRANCH_OWNER_OVERRIDES[0].behavior,
      },
    )
    assert.deepEqual(
      {
        targetIndex: TARGET119_DEFAULT_BRANCH_PROOF_SPEC.targetIndex,
        ownerPaths: TARGET119_DEFAULT_BRANCH_PROOF_SPEC.ownerPaths,
        declarations: TARGET119_DEFAULT_BRANCH_PROOF_SPEC.declarations,
        residues: TARGET119_DEFAULT_BRANCH_PROOF_SPEC.residues,
      },
      {
        targetIndex: fixture.row.targetIndex,
        ownerPaths: fixture.row.ownerPaths,
        declarations: fixture.row.declarations,
        residues: fixture.row.residues,
      },
    )
    assert.equal(
      sha256(JSON.stringify([fixture.row.targetIndex])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(canonicalResidues())),
      fixture.summary.residueIdentitiesSha256,
    )
  },
)

test(
  'authenticated complete git unit and default-branch resolver remain exact',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const baseline = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'Target118 bundle',
    ).toString('utf8')
    const target = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 bundle',
    ).toString('utf8')
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.structural.path),
          fixture.inputs.structural,
          'Target119 structural delta',
        ),
      ),
    )
    const frozenAnalysis = JSON.parse(
      readExact(
        path.join(root, fixture.inputs.frozenAnalysis.path),
        fixture.inputs.frozenAnalysis,
        'Target119 frozen owner analysis',
      ),
    )
    const unit = fixture.target.unit
    const unitText = target.slice(unit.start, unit.end)
    assert.deepEqual(descriptor(Buffer.from(unitText)), {
      bytes: unit.bytes,
      sha256: unit.sha256,
    })
    const region = structural.regions[unit.targetIndex].target
    assert.deepEqual(
      {
        index: region.index,
        nodeType: region.nodeType,
        start: region.start,
        end: region.end,
        sourceHash: region.sourceHash,
      },
      {
        index: unit.targetIndex,
        nodeType: unit.nodeType,
        start: unit.start,
        end: unit.end,
        sourceHash: unit.sha256,
      },
    )
    const resolver = findTargetResolver(unitText)
    const resolverText = unitText.slice(resolver.start, resolver.end)
    assert.deepEqual(
      {
        start: unit.start + resolver.start,
        end: unit.start + resolver.end,
        ...descriptor(Buffer.from(resolverText)),
      },
      {
        start: fixture.target.resolver.start,
        end: fixture.target.resolver.end,
        bytes: fixture.target.resolver.bytes,
        sha256: fixture.target.resolver.sha256,
      },
    )
    const analysisRow = frozenAnalysis.analysis.sourceSupplementGaps.find(
      row => row.targetIndex === unit.targetIndex,
    )
    assert.deepEqual(analysisRow.ownerPaths, ['utils/git.ts'])
    assert.equal(analysisRow.residues, 3)
    assert.equal(analysisRow.unsupportedResidues, 3)

    assert.deepEqual(allOffsets(baseline, '"master"'), [961471, 11902404])
    assert.deepEqual(allOffsets(target, '"master"').slice(0, 3), [
      989181,
      999861,
      999879,
    ])
    assert.deepEqual(allOffsets(baseline, '"show-ref"'), [])
    assert.deepEqual(allOffsets(target, '"show-ref"'), [999923])
    assert.deepEqual(allOffsets(baseline, '/^origin\\//'), [])
    assert.deepEqual(allOffsets(target, '/^origin\\//'), [999828])
  },
)

test(
  'recovered git entry point and filesystem resolver preserve the exact branch order',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const sources = new Map()
    for (const input of fixture.inputs.sourceFiles) {
      sources.set(
        input.path,
        readExact(
          path.join(sourceRoot, input.path.replace(/^src\//, '')),
          input,
          input.path,
        ).toString('utf8'),
      )
    }
    for (const expected of fixture.source.declarations) {
      const source = sources.get(expected.path)
      const sourceFile = ts.createSourceFile(
        expected.path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0, expected.path)
      const matches = sourceFile.statements.filter(
        statement => declarationName(ts, statement) === expected.name,
      )
      assert.equal(matches.length, 1, `${expected.path}#${expected.name}`)
      const declaration = matches[0]
      const start = declaration.getStart(sourceFile)
      const end = declaration.end
      assert.deepEqual(
        {
          path: expected.path,
          name: expected.name,
          start,
          end,
          ...descriptor(Buffer.from(source.slice(start, end))),
        },
        expected,
      )
    }
    const gitSource = sources.get('src/utils/git.ts')
    assert(gitSource.includes('getCachedDefaultBranch,'))
    const wrapper = gitSource.slice(
      fixture.source.declarations[0].start,
      fixture.source.declarations[0].end,
    )
    assert.equal(wrapper.split('getCachedDefaultBranch()').length - 1, 1)
    const filesystem = sources.get('src/utils/git/gitFilesystem.ts')
    const resolver = filesystem.slice(
      fixture.source.declarations[1].start,
      fixture.source.declarations[1].end,
    )
    for (const marker of [
      "'refs/remotes/origin/HEAD'",
      "'refs/remotes/origin/'",
      "['main', 'master']",
      '`refs/remotes/origin/${branchFromSymref}`',
      '`refs/remotes/origin/${candidate}`',
      "return 'main'",
    ]) {
      assert(resolver.includes(marker), marker)
    }
    assert(!resolver.includes('show-ref'))
    assert(!resolver.includes('symbolic-ref'))
  },
)

test(
  'command-backed target and filesystem-backed source resolve the same branches',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const targetBundle = fs.readFileSync(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      'utf8',
    )
    const unit = targetBundle.slice(
      fixture.target.unit.start,
      fixture.target.unit.end,
    )
    const resolver = findTargetResolver(unit)
    const targetResolverSource = unit.slice(resolver.start, resolver.end)
    const filesystem = fs.readFileSync(
      path.join(sourceRoot, 'utils/git/gitFilesystem.ts'),
      'utf8',
    )
    const sourceResolver = filesystem.slice(
      fixture.source.declarations[1].start,
      fixture.source.declarations[1].end,
    )
    const sourceJavascript = ts.transpileModule(sourceResolver, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText

    async function runTarget(scenario) {
      const calls = []
      const exec = async (git, args, options) => {
        calls.push({ git, args, options })
        if (args[0] === 'symbolic-ref') {
          return {
            code: scenario.symref ? 0 : 1,
            stdout: scenario.symref ? `origin/${scenario.symref}\n` : '',
          }
        }
        const branch = args.at(-1).slice('refs/remotes/origin/'.length)
        return { code: scenario.refs.includes(branch) ? 0 : 1, stdout: '' }
      }
      const fn = new Function(
        'O6',
        'T6',
        'ov8',
        `return (${targetResolverSource})`,
      )(exec, () => 'git', async () => scenario.cached ?? 'cached-main')
      return { value: await fn(scenario.cwd), calls }
    }

    async function runSource(scenario) {
      const resolveGitDir = async () => scenario.gitDir
      const getCommonDir = async () => scenario.commonDir ?? null
      const readRawSymref = async (dir, ref, prefix) => {
        assert.equal(ref, 'refs/remotes/origin/HEAD')
        assert.equal(prefix, 'refs/remotes/origin/')
        return scenario.symref ?? null
      }
      const resolveRef = async (dir, ref) => {
        const branch = ref.slice('refs/remotes/origin/'.length)
        return scenario.refs.includes(branch) ? `${branch}-sha` : null
      }
      const fn = new Function(
        'resolveGitDir',
        'getCommonDir',
        'readRawSymref',
        'resolveRef',
        `${sourceJavascript};return computeDefaultBranch`,
      )(resolveGitDir, getCommonDir, readRawSymref, resolveRef)
      return fn()
    }

    const scenarios = [
      { cwd: '/repo', gitDir: '/repo/.git', symref: 'develop', refs: ['develop'] },
      { cwd: '/repo', gitDir: '/repo/.git', symref: 'develop', refs: ['main'] },
      { cwd: '/repo', gitDir: '/repo/.git', symref: null, refs: ['master'] },
      { cwd: '/repo', gitDir: '/repo/.git', symref: null, refs: [] },
    ]
    for (const scenario of scenarios) {
      const target = await runTarget(scenario)
      assert.equal(await runSource(scenario), target.value)
      assert.equal(target.calls[0].args[0], 'symbolic-ref')
      for (const call of target.calls.slice(1)) {
        assert.deepEqual(call.args.slice(0, 3), [
          'show-ref',
          '--verify',
          '--quiet',
        ])
        assert.equal(call.options.cwd, scenario.cwd)
        assert.equal(call.options.preserveOutputOnError, false)
      }
    }
    assert.equal(
      (await runTarget({ cwd: undefined, gitDir: null, refs: [], cached: 'trunk' }))
        .value,
      'trunk',
    )
    assert.equal(await runSource({ gitDir: null, refs: [] }), 'main')
  },
)
