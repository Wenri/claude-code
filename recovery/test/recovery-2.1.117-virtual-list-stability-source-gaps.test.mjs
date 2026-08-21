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
  applyTarget117VirtualListStabilitySourceRecovery,
  TARGET117_VIRTUAL_LIST_STABILITY_INPUT_FILES,
  TARGET117_VIRTUAL_LIST_STABILITY_OUTPUT_FILES,
  TARGET117_VIRTUAL_LIST_STABILITY_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-virtual-list-stability-source-gaps.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-virtual-list-stability-source-gaps.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '00fa141c432056e6256526d0b147df30907d53af1fd3a95656dc53aa70e6f039'
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
  assert.equal(bytes.length, expected.bytes, `${label}: bytes`)
  assert.equal(sha256(bytes), expected.sha256, `${label}: SHA-256`)
  return bytes
}

function bundlePath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
}

function sourceFilename(root, sourcePath) {
  assert.match(sourcePath, /^src\//, `${sourcePath}: normalized source path`)
  const filename = path.resolve(root, sourcePath.slice(4))
  assert.ok(
    filename.startsWith(`${path.resolve(root)}${path.sep}`),
    `${sourcePath}: remains below source root`,
  )
  return filename
}

function materializeRawTargetSource(commit, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const archive = path.join(temporaryRoot, 'source.tar')
  execFileSync(
    'git',
    [
      'archive',
      '--format=tar',
      `--output=${archive}`,
      commit,
      ...fixture.inputs.sourceFiles.map(file => file.path),
    ],
    { cwd: repositoryRoot, stdio: 'ignore' },
  )
  execFileSync('tar', ['-xf', archive, '-C', temporaryRoot], {
    stdio: 'ignore',
  })
  fs.unlinkSync(archive)
  return { temporaryRoot, sourceRoot: path.join(temporaryRoot, 'src') }
}

function copySelectedSource(sourceRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const outputRoot = path.join(temporaryRoot, 'src')
  for (const sourceFile of fixture.inputs.sourceFiles) {
    const destination = sourceFilename(outputRoot, sourceFile.path)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(sourceFilename(sourceRoot, sourceFile.path), destination)
  }
  return { temporaryRoot, sourceRoot: outputRoot }
}

function identity(kind, value) {
  return `${kind}:${JSON.stringify(value)}`
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

function collectBundleOccurrences(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const grouped = new Map()
  function add(kind, value, node) {
    const key = identity(kind, value)
    const occurrences = grouped.get(key) ?? []
    occurrences.push({ start: node.start, end: node.end })
    grouped.set(key, occurrences)
  }
  walk(ast, node => {
    if (node.type === 'Literal') {
      if (typeof node.value === 'string') add('string', node.value, node)
      else if (typeof node.value === 'number') add('number', String(node.value), node)
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add('string', value, node)
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (property) add('property', property.name, property)
  })
  for (const occurrences of grouped.values()) {
    occurrences.sort((left, right) => left.start - right.start)
  }
  return grouped
}

async function loadTypeScript() {
  const filename = path.join(
    repositoryRoot,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  assert.ok(fs.existsSync(filename), 'repo-pinned TypeScript is available')
  const module = await import(pathToFileURL(filename).href)
  return module.default ?? module
}

function parseSource(ts, filename, source) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${filename}: parses`)
  return sourceFile
}

function namedDeclaration(ts, sourceFile, expectedName) {
  const matches = []
  function visit(node) {
    if (node.name && ts.isIdentifier(node.name) && node.name.text === expectedName) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, `${expectedName}: one named declaration`)
  return matches[0]
}

function assertDeclaration(ts, sourceFile, source, expected) {
  const declaration = namedDeclaration(ts, sourceFile, expected.name)
  assert.equal(ts.SyntaxKind[declaration.kind], expected.nodeType)
  assert.equal(declaration.getStart(sourceFile), expected.start)
  assert.equal(declaration.end, expected.end)
  const slice = Buffer.from(
    source.slice(declaration.getStart(sourceFile), declaration.end),
  )
  assert.deepEqual(descriptor(slice), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
  return declaration
}

function collectSourceProperties(ts, declarations) {
  const properties = new Map()
  function add(name) {
    properties.set(name, (properties.get(name) ?? 0) + 1)
  }
  function visit(node) {
    if (
      ts.isIdentifier(node) &&
      ((ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
        (ts.isPropertyAssignment(node.parent) && node.parent.name === node) ||
        (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) ||
        (ts.isBindingElement(node.parent) && node.parent.name === node) ||
        (ts.isPropertySignature(node.parent) && node.parent.name === node))
    ) {
      add(node.text)
    }
    ts.forEachChild(node, visit)
  }
  for (const declaration of declarations) visit(declaration)
  return properties
}

function verifyExactPostimages(sourceRoot) {
  for (const outputFile of TARGET117_VIRTUAL_LIST_STABILITY_OUTPUT_FILES) {
    readExact(sourceFilename(sourceRoot, outputFile.path), outputFile)
  }
}

test(
  '2.1.117 virtual-list fixture pins three overrides and two exact postimages',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256, 'fixture SHA-256')
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-replay-ready')
    assert.deepEqual(fixture.summary, {
      units: 3,
      residues: 19,
      recoveredFiles: 2,
      ownerCorrections: 1,
      incrementalKeyCacheUnits: 2,
      appendIdentityGuardUnits: 1,
      ownerOverrides: 3,
    })
    assert.deepEqual(
      fixture.rows.map(row => row.targetIndex),
      [16560, 16608, 16610],
    )
    assert.deepEqual(
      TARGET117_VIRTUAL_LIST_STABILITY_INPUT_FILES,
      fixture.inputs.sourceFiles.map(file => ({
        path: file.path,
        ...file.input,
      })),
    )
    assert.deepEqual(
      TARGET117_VIRTUAL_LIST_STABILITY_OUTPUT_FILES,
      fixture.inputs.sourceFiles.map(file => ({
        path: file.path,
        ...file.output,
      })),
    )
    assert.deepEqual(
      TARGET117_VIRTUAL_LIST_STABILITY_OWNER_OVERRIDES.map(override => [
        override.targetIndex,
        override.paths,
        override.declarations,
        override.evidenceIds,
      ]),
      fixture.rows.map(row => [
        row.targetIndex,
        [row.owner],
        row.declarations,
        fixture.evidenceIds,
      ]),
    )
    for (const override of TARGET117_VIRTUAL_LIST_STABILITY_OWNER_OVERRIDES) {
      assert.ok(override.behavior.length > 0, `${override.key}: behavior`)
    }
    readExact(path.join(repositoryRoot, fixture.inputs.helper.path), fixture.inputs.helper)
  },
)

test(
  '2.1.117 bundles authenticate all three full units and nineteen residues',
  { skip: !selected },
  () => {
    const baseline = readExact(
      bundlePath('CLAUDE_CODE_2_1_116_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'baseline bundle',
    ).toString('utf8')
    const target = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'target bundle',
    ).toString('utf8')
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
        ),
      ),
    )
    const regions = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    const baselineOccurrences = collectBundleOccurrences(baseline)
    const targetOccurrences = collectBundleOccurrences(target)

    for (const row of fixture.rows) {
      const [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash] =
        row.targetUnit
      const region = regions.get(index)
      assert.ok(region, `u${index}: structural region`)
      assert.deepEqual(
        {
          classification: region.classification,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          tokenCount: region.target.tokenCount,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        { classification, nodeType, start, end, tokenCount, sourceHash, coarseHash },
      )
      const unit = target.slice(start, end)
      assert.equal(Buffer.byteLength(unit), end - start, `u${index}: full bytes`)
      assert.equal(sha256(unit), sourceHash, `u${index}: full SHA-256`)
      const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
      assert.equal(ast.body.length, 1, `u${index}: exactly one unit`)
      assert.equal(ast.body[0].type, nodeType, `u${index}: node type`)

      for (const [kind, value, residueStart, residueEnd, ordinal, baselineCount] of row.residues) {
        const key = identity(kind, value)
        assert.equal(
          (baselineOccurrences.get(key) ?? []).length,
          baselineCount,
          `u${index}: ${key} baseline count`,
        )
        const occurrence = (targetOccurrences.get(key) ?? [])[ordinal - 1]
        assert.ok(occurrence, `u${index}: ${key} target ordinal`)
        assert.deepEqual(
          [occurrence.start, occurrence.end],
          [residueStart, residueEnd],
          `u${index}: ${key} target range`,
        )
        assert.ok(
          residueStart >= start && residueEnd <= end,
          `u${index}: ${key} remains inside full unit`,
        )
      }
    }

    const virtualScroll = target.slice(
      fixture.rows[0].targetUnit[3],
      fixture.rows[0].targetUnit[4],
    )
    assert.match(virtualScroll, /useRef\(\{len:0,first:void 0,last:void 0\}\)/)
    assert.match(
      virtualScroll,
      /\.length>=\$H\.len&&MH===\$H\.first&&\$\[\$H\.len-1\]===\$H\.last/,
    )
    assert.match(
      virtualScroll,
      /\$H\.len=\$\.length,\$H\.first=MH,\$H\.last=\$\.at\(-1\),OH\)return/,
    )

    const virtualList = target.slice(
      fixture.rows[1].targetUnit[3],
      fixture.rows[1].targetUnit[4],
    )
    assert.match(
      virtualList,
      /useRef\(\{keys:\[\],uuids:\[\],seen:new Map,itemKey:K\}\)/,
    )
    assert.match(virtualList, /useMemo\(\(\)=>eh1\(H,K,P\.current\),\[H,K\]\)/)

    const keyReconciler = target.slice(
      fixture.rows[2].targetUnit[3],
      fixture.rows[2].targetUnit[4],
    )
    assert.match(keyReconciler, /H\[K\]\.uuid===q\.uuids\[K\]/)
    assert.match(
      keyReconciler,
      /q\.keys=\[\],q\.uuids=\[\],q\.seen=new Map,K=0/,
    )
    assert.match(keyReconciler, /q\.keys\.push\(`\$\{f\}#\$\{z\}`\)/)
    assert.match(keyReconciler, /\[\.\.\._\]\.slice\(0,3\)\.map/)
    assert.match(keyReconciler, /duplicate sibling keys/)
  },
)

test(
  '2.1.117 replay is dual-state and source declarations preserve target semantics',
  { skip: !selected },
  async () => {
    const raw = materializeRawTargetSource(
      fixture.inputs.rawTargetSourceCommit,
      'target117-virtual-list-raw-',
    )
    try {
      const first = applyTarget117VirtualListStabilitySourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(first.status, 'recovered')
      const second = applyTarget117VirtualListStabilitySourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(second.status, 'already-recovered')
      verifyExactPostimages(raw.sourceRoot)

      const ts = await loadTypeScript()
      const parsed = new Map()
      for (const sourceFile of fixture.inputs.sourceFiles) {
        const bytes = readExact(
          sourceFilename(raw.sourceRoot, sourceFile.path),
          sourceFile.output,
        )
        const source = bytes.toString('utf8')
        const sourceAst = parseSource(ts, sourceFile.path, source)
        const declarations = sourceFile.declarations.map(expected =>
          assertDeclaration(ts, sourceAst, source, expected),
        )
        parsed.set(sourceFile.path, { declarations, source })
      }

      for (const row of fixture.rows) {
        const sourceProperties = collectSourceProperties(
          ts,
          parsed.get(row.owner).declarations.filter(declaration =>
            row.declarations.includes(declaration.name.text),
          ),
        )
        for (const [, value] of row.residues) {
          assert.ok(
            (sourceProperties.get(value) ?? 0) > 0,
            `u${row.targetIndex}: exact owner declaration contains ${value}`,
          )
        }
      }

      const virtualScroll = parsed.get('src/hooks/useVirtualScroll.ts').source
      assert.match(virtualScroll, /const itemKeysIdentityRef = useRef</)
      assert.match(virtualScroll, /itemKeys\.length >= previous\.len/)
      assert.match(virtualScroll, /first === previous\.first/)
      assert.match(virtualScroll, /itemKeys\[previous\.len - 1\] === previous\.last/)
      assert.match(virtualScroll, /previous\.last = itemKeys\.at\(-1\)/)
      assert.match(virtualScroll, /if \(unchanged\) return/)

      const virtualList = parsed.get(
        'src/components/VirtualMessageList.tsx',
      ).source
      assert.match(virtualList, /import \{ logError \} from '\.\.\/utils\/log\.js'/)
      assert.match(virtualList, /messages\[unchanged\]!\.uuid === cache\.uuids\[unchanged\]/)
      assert.match(virtualList, /cache\.keys = \[\][\s\S]*cache\.uuids = \[\][\s\S]*cache\.seen = new Map\(\)/)
      assert.match(virtualList, /cache\.keys\.push\(`\$\{key\}#\$\{seen\}`\)/)
      assert.match(virtualList, /\.slice\(0, 3\)[\s\S]*duplicate sibling keys/)
      assert.match(
        virtualList,
        /buildStableMessageKeys\(messages, itemKey, keyCacheRef\.current\)/,
      )

      const rejectedOwner = execFileSync(
        'git',
        [
          'show',
          `${fixture.inputs.rawTargetSourceCommit}:${fixture.rows[0].rejectedSourceMapOwner}`,
        ],
        { cwd: repositoryRoot, encoding: 'utf8' },
      )
      assert.doesNotMatch(rejectedOwner, /itemKeysIdentityRef/)
      assert.doesNotMatch(rejectedOwner, /previous\.(?:len|first|last)/)
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
      'target117-virtual-list-packaged-',
    )
    try {
      const result = applyTarget117VirtualListStabilitySourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.ok(
        ['recovered', 'already-recovered'].includes(result.status),
        `package state ${result.status}`,
      )
      verifyExactPostimages(packaged.sourceRoot)
    } finally {
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.117 replay rejects mutation and mixed raw/postimage state before writing',
  { skip: !selected },
  () => {
    const mutated = materializeRawTargetSource(
      fixture.inputs.rawTargetSourceCommit,
      'target117-virtual-list-mutated-',
    )
    try {
      const filename = sourceFilename(
        mutated.sourceRoot,
        fixture.inputs.sourceFiles[0].path,
      )
      fs.appendFileSync(filename, '\n// mutation\n')
      assert.throws(
        () =>
          applyTarget117VirtualListStabilitySourceRecovery({
            sourceRoot: mutated.sourceRoot,
          }),
        /Refusing mixed or non-target virtual-list recovery/,
      )
      readExact(
        sourceFilename(mutated.sourceRoot, fixture.inputs.sourceFiles[1].path),
        fixture.inputs.sourceFiles[1].input,
        'unmodified peer remains raw',
      )
    } finally {
      fs.rmSync(mutated.temporaryRoot, { recursive: true, force: true })
    }

    const mixed = materializeRawTargetSource(
      fixture.inputs.rawTargetSourceCommit,
      'target117-virtual-list-mixed-',
    )
    try {
      applyTarget117VirtualListStabilitySourceRecovery({
        sourceRoot: mixed.sourceRoot,
      })
      const rawFile = fixture.inputs.sourceFiles[0]
      const rawBytes = execFileSync(
        'git',
        ['show', `${fixture.inputs.rawTargetSourceCommit}:${rawFile.path}`],
        { cwd: repositoryRoot },
      )
      fs.writeFileSync(sourceFilename(mixed.sourceRoot, rawFile.path), rawBytes)
      assert.throws(
        () =>
          applyTarget117VirtualListStabilitySourceRecovery({
            sourceRoot: mixed.sourceRoot,
          }),
        /Refusing mixed or non-target virtual-list recovery/,
      )
      readExact(
        sourceFilename(mixed.sourceRoot, fixture.inputs.sourceFiles[1].path),
        fixture.inputs.sourceFiles[1].output,
        'postimage peer remains unchanged',
      )
    } finally {
      fs.rmSync(mixed.temporaryRoot, { recursive: true, force: true })
    }
  },
)
