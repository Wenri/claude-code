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
  applyTarget117SearchBoxPrefixColorSourceRecovery,
  TARGET117_SEARCH_BOX_PREFIX_COLOR_DONOR_FILE,
  TARGET117_SEARCH_BOX_PREFIX_COLOR_INPUT_FILE,
  TARGET117_SEARCH_BOX_PREFIX_COLOR_OUTPUT_FILE,
  TARGET117_SEARCH_BOX_PREFIX_COLOR_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-search-box-prefix-color-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-search-box-prefix-color-source-gap.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '5731c256f76ac440069f4267d78a8530a1278c5d3fd2a20108cca50149f28327'
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

function propertyName(node) {
  if (node.computed) return undefined
  if (node.key?.type === 'Identifier') return node.key.name
  if (node.key?.type === 'Literal') return node.key.value
  return undefined
}

function propertyPositions(source, value) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const positions = []
  walk(ast, node => {
    if (node.type === 'Property' && propertyName(node) === value) {
      positions.push({ start: node.key.start, end: node.key.end })
    }
  })
  positions.sort((left, right) => left.start - right.start)
  return positions
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

function parseSource(ts, bytes) {
  const sourceFile = ts.createSourceFile(
    fixture.inputs.sourceFile.path,
    bytes.toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  return sourceFile
}

function exactDeclaration(ts, sourceFile, bytes, expected) {
  const matches = descendants(
    ts,
    sourceFile,
    node => ts.isFunctionDeclaration(node) && node.name?.text === expected.name,
  )
  assert.equal(matches.length, 1, expected.name)
  const declaration = matches[0]
  const start = declaration.getStart(sourceFile)
  const end = declaration.end
  assert.deepEqual({
    name: declaration.name.text,
    start,
    end,
    ...descriptor(bytes.subarray(start, end)),
  }, expected)
  return declaration
}

function replaceOnce(source, input, output, label) {
  const first = source.indexOf(input)
  assert.notEqual(first, -1, label)
  assert.equal(source.indexOf(input, first + input.length), -1, label)
  return `${source.slice(0, first)}${output}${source.slice(first + input.length)}`
}

function deriveTargetDonor(base) {
  let source = base
  source = replaceOnce(
    source,
    "import { Box, type ClickEvent, Text } from '../ink.js'",
    "import { Box, type ClickEvent, Text, type TextProps } from '../ink.js'",
    'TextProps import',
  )
  source = replaceOnce(
    source,
    '  prefixDim?: boolean\n  onCursorOffsetChange?:',
    "  prefixDim?: boolean\n  prefixColor?: TextProps['color']\n  onCursorOffsetChange?:",
    'prefixColor type',
  )
  source = replaceOnce(
    source,
    '  prefixDim = false,\n  onCursorOffsetChange,',
    '  prefixDim = false,\n  prefixColor,\n  onCursorOffsetChange,',
    'prefixColor binding',
  )
  source = replaceOnce(
    source,
    '<Text dimColor={prefixDim}>{prefix}</Text> {content}',
    '<Text dimColor={prefixDim} color={prefixColor}>{prefix}</Text> {content}',
    'prefixColor render',
  )
  return source
}

function assertOutputAst(ts, bytes) {
  assert.deepEqual(descriptor(bytes), fixture.inputs.sourceFile.output)
  const sourceFile = parseSource(ts, bytes)
  const declarations = new Map()
  for (const expected of fixture.inputs.sourceFile.outputDeclarations) {
    declarations.set(
      expected.name,
      exactDeclaration(ts, sourceFile, bytes, expected),
    )
  }
  const source = bytes.toString('utf8')
  const imports = sourceFile.statements.filter(statement =>
    ts.isImportDeclaration(statement),
  )
  const inkImport = imports.find(
    statement => statement.moduleSpecifier.text === '../ink.js',
  )
  assert.ok(inkImport)
  assert.ok(
    inkImport.importClause.namedBindings.elements.some(
      element => element.name.text === 'TextProps' && element.isTypeOnly,
    ),
  )
  const propsAliases = descendants(
    ts,
    sourceFile,
    node => ts.isTypeAliasDeclaration(node) && node.name.text === 'Props',
  )
  assert.equal(propsAliases.length, 1)
  const prefixColorMembers = propsAliases[0].type.members.filter(
    member => member.name?.getText(sourceFile) === 'prefixColor',
  )
  assert.equal(prefixColorMembers.length, 1)
  assert.deepEqual(
    prefixColorMembers[0].type.getText(sourceFile),
    "TextProps['color']",
  )

  const searchBox = declarations.get('SearchBox')
  const binding = searchBox.parameters[0].name.elements.find(
    element => element.name.getText(sourceFile) === 'prefixColor',
  )
  assert.ok(binding, 'SearchBox destructures prefixColor')
  const colorAttributes = descendants(
    ts,
    searchBox,
    node =>
      ts.isJsxAttribute(node) &&
      node.name.getText(sourceFile) === 'color' &&
      node.initializer?.expression?.getText(sourceFile) === 'prefixColor',
  )
  assert.equal(colorAttributes.length, 1)
  const opening = colorAttributes[0].parent.parent
  assert.equal(opening.tagName.getText(sourceFile), 'Text')
  assert.ok(
    opening.attributes.properties.some(
      property =>
        ts.isJsxAttribute(property) &&
        property.name.getText(sourceFile) === 'dimColor' &&
        property.initializer?.expression?.getText(sourceFile) === 'prefixDim',
    ),
  )
  assert.deepEqual(
    opening.parent.children
      .filter(child => ts.isJsxExpression(child))
      .map(child => child.expression?.getText(sourceFile)),
    ['prefix'],
  )
  return { sourceFile, declarations, source }
}

function compileSearchBox(ts, sourceFile, declarations) {
  const source = [
    declarations.get('renderSearchBoxQuery').getText(sourceFile),
    declarations.get('SearchBox').getText(sourceFile),
  ].join('\n').replace(/^export /gm, '')
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children }
    },
  }
  const Text = Symbol('Text')
  const Box = Symbol('Box')
  const Cursor = {
    fromText() {
      return {
        measuredText: {
          getOffsetFromPosition({ line, column }) {
            return line * 100 + column
          },
        },
      }
    },
  }
  const exports = Function(
    'React',
    'Text',
    'Box',
    'Cursor',
    'stringWidth',
    `${javascript}\nreturn {renderSearchBoxQuery, SearchBox}`,
  )(React, Text, Box, Cursor, value => [...value].length)
  return { ...exports, React, Text, Box }
}

test(
  '2.1.117 SearchBox fixture freezes one bounded donor replay',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 1,
      companionUnits: 1,
      residues: 1,
      recoveredFiles: 1,
      ownerOverrides: 1,
    })
    assert.deepEqual(TARGET117_SEARCH_BOX_PREFIX_COLOR_INPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.input,
    })
    assert.deepEqual(TARGET117_SEARCH_BOX_PREFIX_COLOR_OUTPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.output,
    })
    assert.deepEqual(TARGET117_SEARCH_BOX_PREFIX_COLOR_DONOR_FILE, {
      path: fixture.inputs.donor.path,
      bytes: fixture.inputs.donor.bytes,
      sha256: fixture.inputs.donor.sha256,
    })
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
      'replay helper',
    )
    const donor = readExact(
      path.join(repositoryRoot, fixture.inputs.donor.path),
      fixture.inputs.donor,
      'Target117 donor',
    )
    const baseDonor = execFileSync(
      'git',
      ['cat-file', 'blob', fixture.inputs.baseDonor.blob],
      { cwd: repositoryRoot },
    )
    assert.deepEqual(descriptor(baseDonor), {
      bytes: fixture.inputs.baseDonor.bytes,
      sha256: fixture.inputs.baseDonor.sha256,
    })
    assert.equal(
      deriveTargetDonor(baseDonor.toString('utf8')),
      donor.toString('utf8'),
      'the donor adds only the authenticated prefixColor type, binding, and prop',
    )
    assert.deepEqual(
      TARGET117_SEARCH_BOX_PREFIX_COLOR_OWNER_OVERRIDES.map(override => ({
        key: override.key,
        targetIndex: override.targetIndex,
        paths: [...override.paths],
        declarations: [...override.declarations],
        evidenceIds: [...override.evidenceIds],
      })),
      [{
        key: `${caseName}:${fixture.row.targetIndex}`,
        targetIndex: fixture.row.targetIndex,
        paths: [fixture.row.owner],
        declarations: fixture.row.declarations,
        evidenceIds: fixture.evidenceIds,
      }],
    )
    assert.notEqual(fixture.row.owner, fixture.row.rejectedOwner)
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
  '2.1.117 bundle authenticates SearchBox, prefixColor, and its renderer',
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
    for (const expected of [fixture.row.targetUnit, fixture.companionTargetUnit]) {
      const [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash] =
        expected
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
      assert.deepEqual(descriptor(Buffer.from(target.slice(start, end))), {
        bytes: end - start,
        sha256: sourceHash,
      })
    }

    const [kind, value, residueStart, residueEnd, occurrence, baselineCount] =
      fixture.row.residue
    assert.equal(kind, 'property')
    const baselinePositions = propertyPositions(baseline, value)
    const targetPositions = propertyPositions(target, value)
    assert.equal(baselinePositions.length, baselineCount)
    assert.equal(targetPositions.length, 1)
    assert.deepEqual(targetPositions[occurrence - 1], {
      start: residueStart,
      end: residueEnd,
    })

    const searchStart = fixture.row.targetUnit[3]
    const searchEnd = fixture.row.targetUnit[4]
    const searchAst = parse(target.slice(searchStart, searchEnd), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const prefixProperties = []
    walk(searchAst, node => {
      if (node.type === 'Property' && propertyName(node) === value) {
        prefixProperties.push(node)
      }
    })
    assert.equal(prefixProperties.length, 1)
    const colorBinding = prefixProperties[0].value.name
    const colorProps = []
    walk(searchAst, node => {
      if (node.type !== 'CallExpression' || node.arguments[1]?.type !== 'ObjectExpression') {
        return
      }
      const props = new Map(
        node.arguments[1].properties.map(property => [propertyName(property), property]),
      )
      if (props.has('dimColor') && props.has('color')) colorProps.push(props)
    })
    assert.equal(colorProps.length, 1)
    assert.equal(colorProps[0].get('color').value.type, 'Identifier')
    assert.equal(colorProps[0].get('color').value.name, colorBinding)

    const rendererStart = fixture.companionTargetUnit[3]
    const rendererEnd = fixture.companionTargetUnit[4]
    const rendererAst = parse(target.slice(rendererStart, rendererEnd), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const sets = []
    const segmentProps = []
    walk(rendererAst, node => {
      if (node.type === 'NewExpression' && node.callee?.name === 'Set') sets.push(node)
      if (node.type === 'ObjectExpression') {
        const keys = node.properties.map(propertyName)
        if (keys.join(',') === 'key,color,inverse') segmentProps.push(keys)
      }
    })
    assert.equal(sets.length, 1)
    assert.deepEqual(segmentProps, [['key', 'color', 'inverse']])
  },
)

test(
  '2.1.117 SearchBox replay is dual-state, typed, executable, and bounded',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const raw = materializeRawSource('target117-search-box-prefix-color-raw-')
    try {
      const rawBytes = fs.readFileSync(sourceFilename(raw.sourceRoot))
      const rawAst = parseSource(ts, rawBytes)
      exactDeclaration(
        ts,
        rawAst,
        rawBytes,
        fixture.inputs.sourceFile.inputDeclaration,
      )
      assert.doesNotMatch(rawBytes.toString('utf8'), /prefixColor/)
      const first = applyTarget117SearchBoxPrefixColorSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(first.status, 'recovered')
      const second = applyTarget117SearchBoxPrefixColorSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(second.status, 'already-recovered')
      const outputBytes = fs.readFileSync(sourceFilename(raw.sourceRoot))
      const { sourceFile, declarations } = assertOutputAst(ts, outputBytes)
      const executable = compileSearchBox(ts, sourceFile, declarations)
      const segments = executable.renderSearchBoxQuery('abcdef', [[1, 3]], 4)
      assert.deepEqual(
        segments.map(segment => ({
          key: segment.props.key,
          color: segment.props.color,
          inverse: segment.props.inverse,
          text: segment.children[0],
        })),
        [
          { key: 0, color: undefined, inverse: false, text: 'a' },
          { key: 1, color: 'suggestion', inverse: false, text: 'bc' },
          { key: 3, color: undefined, inverse: false, text: 'd' },
          { key: 4, color: undefined, inverse: true, text: 'e' },
          { key: 5, color: undefined, inverse: false, text: 'f' },
        ],
      )

      let clickedOffset
      const rendered = executable.SearchBox({
        query: 'abcdef',
        isFocused: true,
        isTerminalFocused: true,
        prefix: '>',
        prefixDim: true,
        prefixColor: 'warning',
        highlights: [[1, 3]],
        onCursorOffsetChange(offset) {
          clickedOffset = offset
        },
      })
      assert.equal(rendered.type, executable.Box)
      const outerText = rendered.children[0]
      assert.equal(outerText.type, executable.Text)
      const prefixText = outerText.children[0]
      assert.equal(prefixText.type, executable.Text)
      assert.equal(prefixText.props.dimColor, true)
      assert.equal(prefixText.props.color, 'warning')
      assert.equal(prefixText.children[0], '>')
      rendered.props.onClick({ localRow: 1, localCol: 7 })
      assert.equal(clickedOffset, 3)
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
      'target117-search-box-prefix-color-packaged-',
    )
    try {
      const result = applyTarget117SearchBoxPrefixColorSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.ok(['recovered', 'already-recovered'].includes(result.status))
      assertOutputAst(
        ts,
        fs.readFileSync(sourceFilename(packaged.sourceRoot)),
      )
    } finally {
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.117 SearchBox replay rejects raw and postimage mutation',
  { skip: !selected },
  () => {
    const raw = materializeRawSource('target117-search-box-mutated-')
    try {
      const filename = sourceFilename(raw.sourceRoot)
      fs.appendFileSync(filename, '\n// mutation\n')
      const before = fs.readFileSync(filename)
      assert.throws(
        () => applyTarget117SearchBoxPrefixColorSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }),
        /Refusing non-target SearchBox prefix-color recovery/,
      )
      assert.deepEqual(fs.readFileSync(filename), before)
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
    }

    const recovered = materializeRawSource('target117-search-box-postimage-mutated-')
    try {
      applyTarget117SearchBoxPrefixColorSourceRecovery({
        sourceRoot: recovered.sourceRoot,
      })
      const filename = sourceFilename(recovered.sourceRoot)
      fs.appendFileSync(filename, '\n// mutation\n')
      const before = fs.readFileSync(filename)
      assert.throws(
        () => applyTarget117SearchBoxPrefixColorSourceRecovery({
          sourceRoot: recovered.sourceRoot,
        }),
        /Refusing non-target SearchBox prefix-color recovery/,
      )
      assert.deepEqual(fs.readFileSync(filename), before)
    } finally {
      fs.rmSync(recovered.temporaryRoot, { recursive: true, force: true })
    }
  },
)
