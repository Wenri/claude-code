import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const recoveredSourceRoot = path.join(repositoryRoot, 'src')
const comparisonSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? recoveredSourceRoot,
)
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.113-provider-setup-residue-proofs.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const structuralPath = path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
)
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))

const FIXTURE_SHA256 =
  '6ba3ee5fe2098e83e44e6763c669f2ef8b9e38f1119a410259eb47085df8016b'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function identity(kind, value) {
  return `${kind}:${JSON.stringify(value)}`
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === fixture.artifact.targetInnerSha256) return bytes.toString('utf8')
  assert.equal(digest, fixture.artifact.targetWrapperSha256)
  const inner = bytes.subarray(
    fixture.artifact.targetWrapperPrefixLength,
    bytes.length - fixture.artifact.targetWrapperSuffixLength,
  )
  assert.equal(sha256(inner), fixture.artifact.targetInnerSha256)
  return inner.toString('utf8')
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
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

function targetOccurrences(fragment, absoluteStart) {
  const ast = parse(fragment, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = []
  const add = (kind, value, start, end) =>
    occurrences.push({
      end: absoluteStart + end,
      identity: identity(kind, value),
      start: absoluteStart + start,
    })
  walk(ast, node => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      add('string', node.value, node.start, node.end)
    }
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.type === 'Identifier'
    ) {
      add('property', node.property.name, node.property.start, node.property.end)
    }
  })
  return { ast, occurrences }
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

function sourceFilename(root, owner) {
  const filename = path.join(root, owner.replace(/^src\//, ''))
  return fs.existsSync(filename) ? filename : null
}

function parseSource(ts, root, owner, sourceOverrides) {
  const overridden = sourceOverrides?.get(owner)
  const filename = overridden === undefined ? sourceFilename(root, owner) : owner
  assert.ok(filename, `${owner}: source file exists`)
  const source = overridden === undefined ? fs.readFileSync(filename, 'utf8') : overridden
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, `${owner}: parses`)
  return { filename, parsed, source }
}

function declarationName(ts, node) {
  if (ts.isFunctionDeclaration(node)) return node.name?.text
  if (ts.isVariableStatement(node)) {
    const declaration = node.declarationList.declarations.find(item =>
      ts.isIdentifier(item.name),
    )
    return declaration?.name?.text
  }
  return undefined
}

function findDeclaration(ts, parsed, name) {
  let found
  function visit(node) {
    if (!found && declarationName(ts, node) === name) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return found
}

function declarationKind(ts, node) {
  if (ts.isFunctionDeclaration(node)) return 'FunctionDeclaration'
  if (ts.isVariableStatement(node)) return 'VariableDeclaration'
  return null
}

function findSwitchCase(ts, parsed, declaration, label) {
  let found
  function visit(node) {
    if (
      !found &&
      ts.isCaseClause(node) &&
      ts.isStringLiteralLike(node.expression) &&
      node.expression.text === label
    ) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  assert.ok(found, `${label}: switch case`)
  return found
}

function sourceImports(ts, parsed) {
  const imports = []
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const module = statement.moduleSpecifier.text
    const bindings = statement.importClause.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.push({
          imported: element.propertyName?.text ?? element.name.text,
          local: element.name.text,
          module,
        })
      }
    }
  }
  return imports
}

function assertImports(actual, expected, label) {
  for (const wanted of expected ?? []) {
    assert.ok(
      actual.some(
        item =>
          item.module === wanted.module &&
          item.imported === wanted.imported &&
          item.local === wanted.local,
      ),
      `${label}: ${wanted.module}:${wanted.imported}:${wanted.local}`,
    )
  }
}

function assertSourceRow(ts, root, row, sourceOverrides) {
  const parsed = parseSource(ts, root, row.correctedOwner, sourceOverrides)
  const imports = sourceImports(ts, parsed.parsed)
  assertImports(imports, row.source.imports, `u${row.targetIndex}`)
  if (row.source.declaration) {
    const declaration = findDeclaration(
      ts,
      parsed.parsed,
      row.source.declaration,
    )
    assert.ok(declaration, `u${row.targetIndex}: ${row.source.declaration}`)
    assert.equal(declarationKind(ts, declaration), row.source.kind)
    if (row.source.sha256) {
      assert.equal(
        sha256(declaration.getText(parsed.parsed)),
        row.source.sha256,
        `u${row.targetIndex}: declaration hash`,
      )
    }
    if (row.source.switchCase) {
      const switchCase = findSwitchCase(
        ts,
        parsed.parsed,
        declaration,
        row.source.switchCase,
      )
      assert.equal(
        sha256(switchCase.getText(parsed.parsed)),
        row.source.switchCaseSha256,
        `u${row.targetIndex}: switch-case hash`,
      )
    }
  }
  if (row.source.supportingDeclaration) {
    const supporting = findDeclaration(
      ts,
      parsed.parsed,
      row.source.supportingDeclaration,
    )
    assert.ok(supporting, `u${row.targetIndex}: supporting declaration`)
    assert.equal(
      sha256(supporting.getText(parsed.parsed)),
      row.source.supportingDeclarationSha256,
    )
  }
  return parsed
}

function extractAddedOwnerFromSupplement(bytes, ownerPath) {
  const patch = bytes.toString('utf8')
  const marker = `diff --git a/${ownerPath} b/${ownerPath}`
  const start = patch.indexOf(marker)
  assert.notEqual(start, -1, `${ownerPath}: transitive diff exists`)
  assert.equal(patch.indexOf(marker, start + marker.length), -1)
  const next = patch.indexOf('\ndiff --git ', start + marker.length)
  const block = patch.slice(start, next === -1 ? patch.length : next)
  assert.ok(block.includes('new file mode 100644'))
  assert.ok(block.includes('\n--- /dev/null\n'))
  const hunk = block.indexOf('@@ ')
  assert.notEqual(hunk, -1, `${ownerPath}: add-file hunk`)
  const body = block.slice(block.indexOf('\n', hunk) + 1)
  return (
    body
      .split('\n')
      .filter(line => line.startsWith('+') && !line.startsWith('+++'))
      .map(line => line.slice(1))
      .join('\n') + '\n'
  )
}

function compileTarget(fragment, dependencies, name) {
  return Function(
    ...Object.keys(dependencies),
    `${fragment}; return ${name}`,
  )(...Object.values(dependencies))
}

function compileSource(ts, parsed, declaration, dependencies, name) {
  const source = declaration.getText(parsed).replace(/^export\s+/, '')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return Function(
    ...Object.keys(dependencies),
    `${output}; return ${name}`,
  )(...Object.values(dependencies))
}

test('the target113 provider-setup residue fixture is exact and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, {
    units: 8,
    residues: 14,
    recoveredPackageGapResidues: 4,
    exactAlternateSourceResidues: 7,
    reactMemoCacheResidues: 2,
    compilerLoweredImportResidues: 1,
  })
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [11641, 11659, 11668, 11710, 11711, 11722, 11736, 11739],
  )
  const classifications = fixture.rows.flatMap(row =>
    row.residues.map(residue => residue.classification),
  )
  assert.equal(
    classifications.filter(value => value === 'recovered-source-gap').length,
    fixture.summary.recoveredPackageGapResidues,
  )
  assert.equal(
    classifications.filter(value => value === 'exact-alternate-source').length,
    fixture.summary.exactAlternateSourceResidues,
  )
  assert.equal(
    classifications.filter(value => value === 'react-memo-cache').length,
    fixture.summary.reactMemoCacheResidues,
  )
  assert.equal(
    classifications.filter(
      value => value === 'compiler-lowered-runtime-import',
    ).length,
    fixture.summary.compilerLoweredImportResidues,
  )
  for (const row of fixture.rows) {
    const region = structural.regions[row.targetIndex]
    assert.equal(region?.target?.index, row.targetIndex)
    assert.deepEqual(
      {
        classification: region.classification,
        end: region.target.end,
        nodeType: region.target.nodeType,
        sourceHash: region.target.sourceHash,
        start: region.target.start,
      },
      row.target,
      `u${row.targetIndex}: structural identity`,
    )
    for (const residue of row.residues) {
      assert.ok(residue.targetOccurrenceNumber > residue.baselineOccurrenceCount)
      assert.ok(residue.start >= row.target.start)
      assert.ok(residue.end <= row.target.end)
    }
  }
})

test(
  'current source pins every corrected declaration, switch clause, and runtime import',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  async () => {
    const ts = await loadTypeScript()
    for (const [name, owner] of Object.entries(fixture.owners)) {
      const filename = sourceFilename(recoveredSourceRoot, owner.path)
      assert.ok(filename, `${name}: owner exists`)
      if (owner.observedMainSha256) {
        assert.equal(sha256(fs.readFileSync(filename)), owner.observedMainSha256)
      }
    }
    for (const row of fixture.rows) assertSourceRow(ts, recoveredSourceRoot, row)
  },
)

test(
  'Bedrock rows resolve to the exact transitive Target92 owner package',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  async () => {
    const introduction = fixture.owners.bedrock.transitiveIntroduction
    assert.equal(introduction.case, '2.1.91-to-2.1.92')
    assert.deepEqual(introduction.unchangedTarget113Rows, [11641, 11659, 11668])
    const supplement = fs.readFileSync(path.join(repositoryRoot, introduction.path))
    assert.equal(sha256(supplement), introduction.supplementSha256)
    const source = extractAddedOwnerFromSupplement(
      supplement,
      fixture.owners.bedrock.path,
    )
    assert.equal(sha256(source), introduction.ownerSha256)
    const ts = await loadTypeScript()
    const overrides = new Map([[fixture.owners.bedrock.path, source]])
    for (const row of fixture.rows.filter(item =>
      introduction.unchangedTarget113Rows.includes(item.targetIndex),
    )) {
      assert.equal(row.correctedOwner, fixture.owners.bedrock.path)
      assertSourceRow(ts, recoveredSourceRoot, row, overrides)
    }
  },
)

test(
  'raw and recovered Target113 packages omit transitive Bedrock and pin retained owners',
  {
    skip:
      !selected || comparisonSourceRoot === recoveredSourceRoot
        ? 'a distinct materialized source root is required'
        : false,
  },
  async () => {
    const ts = await loadTypeScript()
    const historicalBedrock = sourceFilename(
      comparisonSourceRoot,
      fixture.owners.bedrock.path,
    )
    assert.equal(historicalBedrock, null)
    assert.ok(
      sourceFilename(comparisonSourceRoot, 'src/components/Spinner.tsx'),
      'the coalesced historical source-map owner remains present',
    )
    for (const name of ['vertex', 'relaunch']) {
      const owner = fixture.owners[name]
      const filename = sourceFilename(comparisonSourceRoot, owner.path)
      assert.ok(filename, `${name}: retained owner exists`)
      assert.ok(
        owner.historicalSha256.includes(sha256(fs.readFileSync(filename))),
        `${name}: exact raw or recovered Target113 owner`,
      )
    }
    for (const row of fixture.rows.filter(
      item => item.correctedOwner !== fixture.owners.bedrock.path,
    )) {
      assertSourceRow(ts, comparisonSourceRoot, row)
    }
  },
)

test(
  'authenticated target113 pins every complete unit and exact residue range',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  () => {
    const target = authenticatedTargetInner(targetPath)
    for (const row of fixture.rows) {
      const fragment = target.slice(row.target.start, row.target.end)
      assert.equal(sha256(fragment), row.target.sourceHash)
      const { ast, occurrences } = targetOccurrences(fragment, row.target.start)
      assert.equal(ast.body.length, 1, `u${row.targetIndex}: one complete unit`)
      assert.equal(ast.body[0].type, row.target.nodeType)
      for (const residue of row.residues) {
        assert.ok(
          occurrences.some(
            occurrence =>
              occurrence.identity === identity(residue.kind, residue.value) &&
              occurrence.start === residue.start &&
              occurrence.end === residue.end,
          ),
          `u${row.targetIndex}: ${identity(residue.kind, residue.value)}`,
        )
      }
    }
  },
)

test(
  'provider discovery and terminal severing execute target113 semantics',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  async () => {
    const ts = await loadTypeScript()
    const target = authenticatedTargetInner(targetPath)
    const byIndex = new Map(fixture.rows.map(row => [row.targetIndex, row]))
    const fragment = index => {
      const row = byIndex.get(index)
      return target.slice(row.target.start, row.target.end)
    }

    class STSClient {
      async send() {
        return { Arn: 'arn:aws:iam::123:user/test' }
      }
    }
    class GetCallerIdentityCommand {}
    let profilePage = 0
    class BedrockClient {
      async send(command) {
        assert.equal(command.input.typeEquals, 'SYSTEM_DEFINED')
        profilePage += 1
        return profilePage === 1
          ? {
              inferenceProfileSummaries: [
                { inferenceProfileId: 'anthropic.claude-sonnet' },
                { inferenceProfileId: 'other.model' },
              ],
              nextToken: 'next',
            }
          : {
              inferenceProfileSummaries: [
                { inferenceProfileId: 'anthropic.claude-opus' },
              ],
            }
      }
    }
    class ListInferenceProfilesCommand {
      constructor(input) {
        this.input = input
      }
    }
    const verifyTarget = compileTarget(
      fragment(11641),
      {
        J0H: async () => ({}),
        Rc9: error => ({ error: String(error) }),
        Sc9: () => ({ status: 'bearer' }),
        T08: () => {},
        eQH: () => {},
        iaK: async () => undefined,
        tQH: { BedrockClient, ListInferenceProfilesCommand },
        v08: { GetCallerIdentityCommand, STSClient },
      },
      byIndex.get(11641).targetName,
    )
    assert.deepEqual(
      await verifyTarget({ authMethod: 'profile', region: 'us-east-1' }),
      {
        identity: 'arn:aws:iam::123:user/test',
        profiles: ['anthropic.claude-sonnet', 'anthropic.claude-opus'],
        status: 'ok',
      },
    )

    const bedrockSource = parseSource(
      ts,
      recoveredSourceRoot,
      fixture.owners.bedrock.path,
    )
    const discoverAws = findDeclaration(
      ts,
      bedrockSource.parsed,
      'discoverAwsProfiles',
    )
    const files = new Map([
      ['/home/test/.aws/config', '[profile zeta]\n[sso-session ignored]\n[default]\n'],
      ['/home/test/.aws/credentials', '[alpha]\n[default]\n'],
    ])
    const sourceAws = compileSource(
      ts,
      bedrockSource.parsed,
      discoverAws,
      {
        homedir: () => '/home/test',
        join: path.join,
        readFile: async filename => files.get(filename) ?? '',
      },
      'discoverAwsProfiles',
    )
    const targetAws = compileTarget(
      fragment(11659),
      {
        W$6: { join: path.join },
        eaK: { homedir: () => '/home/test' },
        taK: { readFile: async filename => files.get(filename) ?? '' },
      },
      byIndex.get(11659).targetName,
    )
    const expectedProfiles = ['alpha', 'default', 'zeta']
    assert.deepEqual(await sourceAws(), expectedProfiles)
    assert.deepEqual(await targetAws(), expectedProfiles)

    const vertexSource = parseSource(
      ts,
      recoveredSourceRoot,
      fixture.owners.vertex.path,
    )
    const discoverProjects = findDeclaration(
      ts,
      vertexSource.parsed,
      'discoverGcloudProjects',
    )
    const gcloudFiles = new Map([
      ['/cfg/configurations/config_default', 'project = alpha\n'],
      ['/cfg/configurations/config_work', 'project= beta\n'],
      [
        '/cfg/application_default_credentials.json',
        JSON.stringify({ quota_project_id: 'quota' }),
      ],
    ])
    const readdir = async () => ['config_default', 'README', 'config_work']
    const readFile = async filename => {
      if (!gcloudFiles.has(filename)) throw new Error('missing')
      return gcloudFiles.get(filename)
    }
    const sourceProjects = compileSource(
      ts,
      vertexSource.parsed,
      discoverProjects,
      {
        getGcloudConfigDir: () => '/unused',
        join: path.join,
        process: { env: { CLOUDSDK_CONFIG: '/cfg' } },
        readFile,
        readdir,
      },
      'discoverGcloudProjects',
    )
    const targetProjects = compileTarget(
      fragment(11710),
      {
        IK$: { readFile, readdir },
        RK$: { join: path.join },
        n$: JSON.parse,
        process: { env: { CLOUDSDK_CONFIG: '/cfg' } },
        sc9: () => '/unused',
      },
      byIndex.get(11710).targetName,
    )
    assert.deepEqual(await sourceProjects(), ['alpha', 'beta', 'quota'])
    assert.deepEqual(await targetProjects(), ['alpha', 'beta', 'quota'])

    const getConfigDir = findDeclaration(
      ts,
      vertexSource.parsed,
      'getGcloudConfigDir',
    )
    const sourceConfigDir = compileSource(
      ts,
      vertexSource.parsed,
      getConfigDir,
      {
        homedir: () => '/home/test',
        join: path.join,
        process: { env: {}, platform: 'linux' },
      },
      'getGcloudConfigDir',
    )
    const targetConfigDir = compileTarget(
      fragment(11711),
      {
        RK$: { join: path.join },
        hsK: { homedir: () => '/home/test' },
      },
      byIndex.get(11711).targetName,
    )
    assert.equal(sourceConfigDir(), '/home/test/.config/gcloud')
    assert.equal(targetConfigDir(), '/home/test/.config/gcloud')

    const expandKey = findDeclaration(
      ts,
      vertexSource.parsed,
      'expandVertexKeyFile',
    )
    const expand = compileSource(
      ts,
      vertexSource.parsed,
      expandKey,
      { homedir: () => '/home/test', join: path.join },
      'expandVertexKeyFile',
    )
    assert.equal(expand('~/key.json'), '/home/test/key.json')
    assert.equal(expand('/tmp/key.json'), '/tmp/key.json')

    const relaunchSource = parseSource(
      ts,
      recoveredSourceRoot,
      fixture.owners.relaunch.path,
    )
    const severDeclaration = findDeclaration(
      ts,
      relaunchSource.parsed,
      'severTtyInputForRelaunch',
    )
    const sourceClosed = []
    const targetClosed = []
    const tty = fd => [0, 1, 2, 3, 7].includes(fd)
    const sourceSever = compileSource(
      ts,
      relaunchSource.parsed,
      severDeclaration,
      { closeSync: fd => sourceClosed.push(fd), isatty: tty },
      'severTtyInputForRelaunch',
    )
    const targetSever = compileTarget(
      fragment(11736),
      {
        isK: { isatty: tty },
        lsK: { closeSync: fd => targetClosed.push(fd) },
      },
      byIndex.get(11736).targetName,
    )
    sourceSever()
    targetSever()
    assert.deepEqual(sourceClosed, [0, 3, 7])
    assert.deepEqual(targetClosed, sourceClosed)
  },
)
