import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget118SearchBoxDimRangeCursorSourceRecovery,
  TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_DONOR,
  TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_INHERITED_INPUT,
  TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_OUTPUT,
  TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_OWNER_OVERRIDES,
  TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_RAW_INPUT,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-search-box-dim-range-cursor-source-gap.mjs'

const repositoryRoot = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  repositoryRoot,
  'recovery/test/recovery-2.1.118-search-box-dim-range-cursor-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '57675e052c3737d5e633a5ffc058fbf4b1570736add7c60c9fab199fd53b6e93'
const artifactRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts',
)
const configuredSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.118/src'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
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

function artifactPath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(
    root,
    fixture.inputs.rawSource.file.path.replace(/^src\//, ''),
  )
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  return filename
}

function materializeSource(bytes, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const filename = sourceFilename(sourceRoot)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
  return { temporaryRoot, sourceRoot, filename }
}

function copySelectedSource(prefix) {
  assert.ok(fs.existsSync(configuredSourceRoot), 'configured source root exists')
  return materializeSource(
    fs.readFileSync(sourceFilename(configuredSourceRoot)),
    prefix,
  )
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

function propertyPositions(ast, value) {
  const positions = []
  walk(ast, node => {
    if (node.type === 'Property' && propertyName(node) === value) {
      positions.push({ start: node.key.start, end: node.key.end })
    }
  })
  positions.sort((left, right) => left.start - right.start)
  return positions
}

function replaceOnce(source, input, output, label) {
  const first = source.indexOf(input)
  assert.notEqual(first, -1, label)
  assert.equal(source.indexOf(input, first + input.length), -1, label)
  return `${source.slice(0, first)}${output}${source.slice(first + input.length)}`
}

function deriveTarget118Donor(base) {
  let source = base
  source = replaceOnce(
    source,
    '  highlights?: readonly Highlight[]\n  prefixDim?: boolean',
    '  highlights?: readonly Highlight[]\n  dimRange?: Highlight\n  cursorChar?: string\n  prefixDim?: boolean',
    'SearchBox dimRange/cursorChar prop types',
  )
  source = replaceOnce(
    source,
    '/** Render search-result ranges and the terminal cursor as disjoint text runs. */',
    '/** Render search-result ranges, dimmed ranges, and the terminal cursor as disjoint text runs. */',
    'SearchBox renderer declaration comment',
  )
  source = replaceOnce(
    source,
    '  highlights: readonly Highlight[],\n  cursorOffset: number,\n): React.ReactNode[] {',
    '  highlights: readonly Highlight[],\n  dimRange: Highlight | undefined,\n  cursorOffset: number,\n  cursorChar: string | undefined,\n): React.ReactNode[] {',
    'SearchBox renderer parameters',
  )
  source = replaceOnce(
    source,
    '  const isHighlighted = (offset: number) =>\n    highlights.some(([start, end]) => offset >= start && offset < end)\n  const boundaries = new Set([0, query.length])',
    '  const isHighlighted = (offset: number) =>\n    highlights.some(([start, end]) => offset >= start && offset < end)\n  const isDimmed = (offset: number) =>\n    !!dimRange && offset >= dimRange[0] && offset < dimRange[1]\n  const boundaries = new Set([0, query.length])',
    'SearchBox dim-range predicate',
  )
  source = replaceOnce(
    source,
    '  for (const [start, end] of highlights) {\n    boundaries.add(start)\n    boundaries.add(end)\n  }\n  if (cursorOffset >= 0) {',
    '  for (const [start, end] of highlights) {\n    boundaries.add(start)\n    boundaries.add(end)\n  }\n  if (dimRange) {\n    boundaries.add(dimRange[0])\n    boundaries.add(dimRange[1])\n  }\n  if (cursorOffset >= 0) {',
    'SearchBox dim-range boundaries',
  )
  source = replaceOnce(
    source,
    `    rendered.push(
      <Text
        key={start}
        color={isHighlighted(start) ? 'suggestion' : undefined}
        inverse={start === cursorOffset}
      >
        {text}
      </Text>,
    )`,
    `    rendered.push(
      start === cursorOffset && cursorChar ? (
        <Text key={start}>{cursorChar}</Text>
      ) : (
        <Text
          key={start}
          color={isHighlighted(start) ? 'suggestion' : undefined}
          dimColor={isDimmed(start)}
          inverse={start === cursorOffset}
        >
          {text}
        </Text>
      ),
    )`,
    'SearchBox custom-cursor and dim-range segment render',
  )
  source = replaceOnce(
    source,
    '  highlights = [],\n  prefixDim = false,',
    '  highlights = [],\n  dimRange,\n  cursorChar,\n  prefixDim = false,',
    'SearchBox dimRange/cursorChar bindings',
  )
  source = replaceOnce(
    source,
    '        highlights,\n        isTerminalFocused ? offset : -1,\n      )',
    '        highlights,\n        dimRange,\n        isTerminalFocused ? offset : -1,\n        cursorChar,\n      )',
    'SearchBox renderer call',
  )
  source = replaceOnce(
    source,
    '        <Text inverse>{placeholder.charAt(0)}</Text>\n        <Text dimColor>{placeholder.slice(1)}</Text>',
    '        {cursorChar ?? <Text inverse>{placeholder.charAt(0)}</Text>}\n        <Text dimColor>{cursorChar ? placeholder : placeholder.slice(1)}</Text>',
    'SearchBox empty-query cursor fallback',
  )
  return source
}

let typescriptPromise
async function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        repositoryRoot,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
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
    fixture.inputs.rawSource.file.path,
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
  assert.deepEqual(
    {
      name: declaration.name.text,
      start,
      end,
      ...descriptor(bytes.subarray(start, end)),
    },
    expected,
  )
  return declaration
}

function assertOutputAst(ts, bytes) {
  assert.deepEqual(descriptor(bytes), {
    bytes: fixture.inputs.recoveredSource.file.bytes,
    sha256: fixture.inputs.recoveredSource.file.sha256,
  })
  const sourceFile = parseSource(ts, bytes)
  const declarations = new Map()
  for (const expected of fixture.inputs.recoveredSource.declarations) {
    declarations.set(
      expected.name,
      exactDeclaration(ts, sourceFile, bytes, expected),
    )
  }

  const propsAliases = descendants(
    ts,
    sourceFile,
    node => ts.isTypeAliasDeclaration(node) && node.name.text === 'Props',
  )
  assert.equal(propsAliases.length, 1)
  const propTypes = new Map(
    propsAliases[0].type.members.map(member => [
      member.name?.getText(sourceFile),
      member.type?.getText(sourceFile),
    ]),
  )
  assert.equal(propTypes.get('dimRange'), 'Highlight')
  assert.equal(propTypes.get('cursorChar'), 'string')
  assert.equal(propTypes.get('prefixColor'), "TextProps['color']")

  const renderer = declarations.get('renderSearchBoxQuery')
  assert.deepEqual(
    renderer.parameters.map(parameter => parameter.name.getText(sourceFile)),
    ['query', 'highlights', 'dimRange', 'cursorOffset', 'cursorChar'],
  )
  const rendererText = renderer.getText(sourceFile)
  for (const marker of [
    '!!dimRange && offset >= dimRange[0] && offset < dimRange[1]',
    'boundaries.add(dimRange[0])',
    'boundaries.add(dimRange[1])',
    'start === cursorOffset && cursorChar',
    'dimColor={isDimmed(start)}',
  ]) {
    assert.ok(rendererText.includes(marker), marker)
  }

  const searchBox = declarations.get('SearchBox')
  const bindings = searchBox.parameters[0].name.elements.map(element =>
    element.name.getText(sourceFile),
  )
  for (const binding of ['dimRange', 'cursorChar', 'prefixColor']) {
    assert.ok(bindings.includes(binding), binding)
  }
  const searchText = searchBox.getText(sourceFile)
  for (const marker of [
    'dimRange,\n        isTerminalFocused ? offset : -1,\n        cursorChar',
    'cursorChar ?? <Text inverse>{placeholder.charAt(0)}</Text>',
    'cursorChar ? placeholder : placeholder.slice(1)',
    'color={prefixColor}',
  ]) {
    assert.ok(searchText.includes(marker), marker)
  }
  return { sourceFile, declarations }
}

function compileSearchBox(ts, sourceFile, declarations) {
  const source = [
    declarations.get('renderSearchBoxQuery').getText(sourceFile),
    declarations.get('SearchBox').getText(sourceFile),
  ]
    .join('\n')
    .replace(/^export /gm, '')
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

function compiledObjectKeySets(ast) {
  const values = []
  walk(ast, node => {
    if (node.type !== 'ObjectExpression') return
    values.push(node.properties.map(propertyName).filter(Boolean))
  })
  return values
}

test(
  'Target118 SearchBox fixture freezes one bounded predecessor-derived replay',
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
      targetIndicesSha256:
        'e95e19e6d06ff4d151a7ec781ab562877135d0a18519935a0407fe3864b8cb00',
      residueIdentitiesSha256:
        'f00a6edb5641b4a63d483df09acd596d3ad6886ad301cd330f9c4c9bfc661afd',
    })
    assert.deepEqual(TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_RAW_INPUT, {
      path: fixture.inputs.rawSource.file.path,
      bytes: fixture.inputs.rawSource.file.bytes,
      sha256: fixture.inputs.rawSource.file.sha256,
    })
    assert.deepEqual(TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_INHERITED_INPUT, {
      path: fixture.inputs.inheritedSource.file.path,
      bytes: fixture.inputs.inheritedSource.file.bytes,
      sha256: fixture.inputs.inheritedSource.file.sha256,
    })
    assert.deepEqual(
      TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_OUTPUT,
      fixture.inputs.recoveredSource.file,
    )
    assert.deepEqual(TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_DONOR, {
      path: fixture.inputs.donor.path,
      bytes: fixture.inputs.donor.bytes,
      sha256: fixture.inputs.donor.sha256,
    })
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
      'SearchBox replay helper',
    )
    const donor = readExact(
      path.join(repositoryRoot, fixture.inputs.donor.path),
      fixture.inputs.donor,
      'Target118 SearchBox donor',
    )
    const baseDonor = readExact(
      path.join(repositoryRoot, fixture.inputs.baseDonor.path),
      fixture.inputs.baseDonor,
      'authenticated Target117 SearchBox donor',
    )
    assert.equal(
      deriveTarget118Donor(baseDonor.toString('utf8')),
      donor.toString('utf8'),
      'Target118 donor adds only the authenticated dim-range/custom-cursor transition',
    )
    assert.deepEqual(
      TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      [
        {
          targetIndex: fixture.targetUnit.targetIndex,
          paths: [fixture.targetUnit.ownerPath],
          declarations: fixture.targetUnit.declarations,
          evidenceIds: fixture.evidenceIds,
          behavior: fixture.targetUnit.behavior,
        },
      ],
    )
    assert.notEqual(
      fixture.targetUnit.ownerPath,
      fixture.targetUnit.provisionalOwnerPath,
    )
    assert.equal(
      execFileSync(
        'git',
        [
          'rev-parse',
          `${fixture.inputs.rawSource.commit}:${fixture.inputs.rawSource.file.path}`,
        ],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.inputs.rawSource.file.blob,
    )
  },
)

test(
  'authenticated Target118 bundle binds the complete SearchBox and renderer transition',
  { skip: !selected },
  () => {
    const baseline = readExact(
      artifactPath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'authenticated Target117 bundle',
    ).toString('utf8')
    const target = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'authenticated Target118 bundle',
    ).toString('utf8')
    const structuralBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.targetStructuralLedger.path),
      fixture.inputs.targetStructuralLedger,
      'Target118 structural ledger',
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))

    for (const expected of [fixture.targetUnit, fixture.companionTargetUnit]) {
      const region = structural.regions.find(
        candidate => candidate.target.index === expected.targetIndex,
      )
      assert.ok(region, `u${expected.targetIndex}`)
      assert.deepEqual(
        {
          classification: region.classification,
          start: region.target.start,
          end: region.target.end,
          bytes: region.target.end - region.target.start,
          tokenCount: region.target.tokenCount,
          nodeType: region.target.nodeType,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        {
          classification: expected.classification,
          start: expected.start,
          end: expected.end,
          bytes: expected.bytes,
          tokenCount: expected.tokenCount,
          nodeType: expected.nodeType,
          sourceHash: expected.sourceHash,
          coarseHash: expected.coarseHash,
        },
      )
      assert.deepEqual(
        descriptor(Buffer.from(target.slice(expected.start, expected.end))),
        { bytes: expected.bytes, sha256: expected.sourceHash },
      )
    }

    const baselineAst = parse(baseline, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const targetAst = parse(target, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    assert.deepEqual(propertyPositions(baselineAst, 'dimRange'), [])
    assert.deepEqual(propertyPositions(targetAst, 'dimRange'), [
      {
        start: fixture.targetUnit.residues[0][2],
        end: fixture.targetUnit.residues[0][3],
      },
    ])

    const baselineFunctions = fixture.baselineTargetUnits.map(expected => {
      const text = baseline.slice(expected.start, expected.end)
      assert.deepEqual(descriptor(Buffer.from(text)), {
        bytes: expected.bytes,
        sha256: expected.sourceHash,
      })
      return parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
        .body[0]
    })
    const searchText = target.slice(
      fixture.targetUnit.start,
      fixture.targetUnit.end,
    )
    const rendererText = target.slice(
      fixture.companionTargetUnit.start,
      fixture.companionTargetUnit.end,
    )
    const search = parse(searchText, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    }).body[0]
    const renderer = parse(rendererText, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    }).body[0]

    assert.equal(baselineFunctions[1].params.length, 3)
    assert.equal(renderer.params.length, 5)
    const searchProperties = []
    walk(search, node => {
      if (node.type === 'ObjectPattern') {
        searchProperties.push(...node.properties)
      }
    })
    const bindings = new Map(
      searchProperties.map(property => [propertyName(property), property.value]),
    )
    for (const name of ['dimRange', 'cursorChar', 'prefixColor']) {
      assert.equal(bindings.get(name)?.type, 'Identifier', name)
    }
    const rendererCalls = []
    walk(search, node => {
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === renderer.id.name
      ) {
        rendererCalls.push(node)
      }
    })
    assert.equal(rendererCalls.length, 1)
    assert.equal(rendererCalls[0].arguments.length, 5)
    assert.equal(rendererCalls[0].arguments[2].name, bindings.get('dimRange').name)
    assert.equal(rendererCalls[0].arguments[4].name, bindings.get('cursorChar').name)

    const baselineKeySets = compiledObjectKeySets(baselineFunctions[1])
    const targetKeySets = compiledObjectKeySets(renderer)
    assert.ok(
      baselineKeySets.some(keys => keys.join(',') === 'key,color,inverse'),
    )
    assert.ok(targetKeySets.some(keys => keys.join(',') === 'key'))
    assert.ok(
      targetKeySets.some(
        keys => keys.join(',') === 'key,color,dimColor,inverse',
      ),
    )
    const targetSets = []
    walk(renderer, node => {
      if (node.type === 'NewExpression' && node.callee?.name === 'Set') {
        targetSets.push(node)
      }
    })
    assert.equal(targetSets.length, 1)
  },
)

test(
  'Target118 SearchBox replay is multi-preimage, typed, executable, package-safe, and idempotent',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const rawBytes = execFileSync(
      'git',
      [
        'show',
        `${fixture.inputs.rawSource.commit}:${fixture.inputs.rawSource.file.path}`,
      ],
      { cwd: repositoryRoot },
    )
    assert.deepEqual(descriptor(rawBytes), {
      bytes: fixture.inputs.rawSource.file.bytes,
      sha256: fixture.inputs.rawSource.file.sha256,
    })
    const inheritedBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.baseDonor.path),
      fixture.inputs.baseDonor,
      'Target117 inherited SearchBox source',
    )

    for (const [label, input] of [
      ['raw', rawBytes],
      ['inherited', inheritedBytes],
    ]) {
      const materialized = materializeSource(
        input,
        `target118-search-box-${label}-`,
      )
      try {
        const first = applyTarget118SearchBoxDimRangeCursorSourceRecovery({
          sourceRoot: materialized.sourceRoot,
        })
        assert.equal(first.status, 'recovered')
        const second = applyTarget118SearchBoxDimRangeCursorSourceRecovery({
          sourceRoot: materialized.sourceRoot,
        })
        assert.equal(second.status, 'already-recovered')
        assertOutputAst(ts, fs.readFileSync(materialized.filename))
      } finally {
        fs.rmSync(materialized.temporaryRoot, {
          recursive: true,
          force: true,
        })
      }
    }

    const selectedSource = copySelectedSource(
      'target118-search-box-configured-source-',
    )
    try {
      const result = applyTarget118SearchBoxDimRangeCursorSourceRecovery({
        sourceRoot: selectedSource.sourceRoot,
      })
      assert.ok(['recovered', 'already-recovered'].includes(result.status))
      const outputBytes = fs.readFileSync(selectedSource.filename)
      const { sourceFile, declarations } = assertOutputAst(ts, outputBytes)
      const executable = compileSearchBox(ts, sourceFile, declarations)

      const segments = executable.renderSearchBoxQuery(
        'abcdef',
        [[1, 3]],
        [3, 5],
        4,
        '█',
      )
      assert.deepEqual(
        segments.map(segment => ({
          key: segment.props.key,
          color: segment.props.color,
          dimColor: segment.props.dimColor,
          inverse: segment.props.inverse,
          text: segment.children[0],
        })),
        [
          {
            key: 0,
            color: undefined,
            dimColor: false,
            inverse: false,
            text: 'a',
          },
          {
            key: 1,
            color: 'suggestion',
            dimColor: false,
            inverse: false,
            text: 'bc',
          },
          {
            key: 3,
            color: undefined,
            dimColor: true,
            inverse: false,
            text: 'd',
          },
          {
            key: 4,
            color: undefined,
            dimColor: undefined,
            inverse: undefined,
            text: '█',
          },
          {
            key: 5,
            color: undefined,
            dimColor: false,
            inverse: false,
            text: 'f',
          },
        ],
      )

      const rendered = executable.SearchBox({
        query: '',
        placeholder: 'Search…',
        isFocused: true,
        isTerminalFocused: true,
        prefix: '>',
        prefixDim: true,
        prefixColor: 'warning',
        cursorChar: '█',
      })
      assert.equal(rendered.type, executable.Box)
      const outerText = rendered.children[0]
      assert.equal(outerText.type, executable.Text)
      const prefixText = outerText.children[0]
      assert.equal(prefixText.props.dimColor, true)
      assert.equal(prefixText.props.color, 'warning')
      const content = outerText.children[2]
      assert.equal(content.type, executable.React.Fragment)
      assert.equal(content.children[0], '█')
      assert.equal(content.children[1].props.dimColor, true)
      assert.equal(content.children[1].children[0], 'Search…')
    } finally {
      fs.rmSync(selectedSource.temporaryRoot, {
        recursive: true,
        force: true,
      })
    }
  },
)

test(
  'Target118 SearchBox replay rejects raw and recovered mutations',
  { skip: !selected },
  () => {
    const rawBytes = execFileSync(
      'git',
      [
        'show',
        `${fixture.inputs.rawSource.commit}:${fixture.inputs.rawSource.file.path}`,
      ],
      { cwd: repositoryRoot },
    )
    const raw = materializeSource(rawBytes, 'target118-search-box-mutated-raw-')
    try {
      fs.appendFileSync(raw.filename, '\n// mutation\n')
      const before = fs.readFileSync(raw.filename)
      assert.throws(
        () =>
          applyTarget118SearchBoxDimRangeCursorSourceRecovery({
            sourceRoot: raw.sourceRoot,
          }),
        /requires an exact raw, inherited, or recovered source state/,
      )
      assert.deepEqual(fs.readFileSync(raw.filename), before)
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
    }

    const recovered = materializeSource(
      fs.readFileSync(path.join(repositoryRoot, fixture.inputs.donor.path)),
      'target118-search-box-mutated-output-',
    )
    try {
      fs.appendFileSync(recovered.filename, '\n// mutation\n')
      const before = fs.readFileSync(recovered.filename)
      assert.throws(
        () =>
          applyTarget118SearchBoxDimRangeCursorSourceRecovery({
            sourceRoot: recovered.sourceRoot,
          }),
        /requires an exact raw, inherited, or recovered source state/,
      )
      assert.deepEqual(fs.readFileSync(recovered.filename), before)
    } finally {
      fs.rmSync(recovered.temporaryRoot, { recursive: true, force: true })
    }
  },
)
