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
  applyTarget117PermissionConfirmationPanelSourceRecovery,
  TARGET117_PERMISSION_CONFIRMATION_CONTEXT_FILES,
  TARGET117_PERMISSION_CONFIRMATION_FILES,
  TARGET117_PERMISSION_CONFIRMATION_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-permission-confirmation-panel-source-gaps.mjs'
import { applyTarget117ConfirmationSourceRecovery } from '../cases/2.1.116-to-2.1.117/recovered/replay-confirmation-source-gaps.mjs'
import { applyTarget117HookEmptyStateSourceRecovery } from '../cases/2.1.116-to-2.1.117/recovered/replay-hook-empty-state-source-gaps.mjs'
import { applyTarget117PluginEmptyStateSourceRecovery } from '../cases/2.1.116-to-2.1.117/recovered/replay-plugin-empty-state-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-permission-confirmation-panel-source-gaps.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '18bd9c9decd899136570077e6c5fcf1f9ef52521b00605b1872b311843a0277c'
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
  assert.deepEqual(descriptor(bytes), expected, label)
  return bytes
}

function sourceFilename(sourceRoot, sourcePath) {
  assert.match(sourcePath, /^src\//)
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  return filename
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const archive = path.join(temporaryRoot, 'source.tar')
  execFileSync(
    'git',
    [
      'archive',
      '--format=tar',
      `--output=${archive}`,
      fixture.inputs.rawSource.commit,
      'src',
    ],
    { cwd: repositoryRoot, stdio: 'ignore' },
  )
  execFileSync('tar', ['-xf', archive, '-C', temporaryRoot], {
    stdio: 'ignore',
  })
  fs.unlinkSync(archive)
  return { temporaryRoot, sourceRoot: path.join(temporaryRoot, 'src') }
}

function installPrerequisites(sourceRoot) {
  applyTarget117ConfirmationSourceRecovery({ sourceRoot })
  applyTarget117PluginEmptyStateSourceRecovery({ sourceRoot })
  applyTarget117HookEmptyStateSourceRecovery({ sourceRoot })
}

function copySelectedSource(inputRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const paths = [
    ...fixture.sourceFiles.map(file => file.path),
    ...fixture.contexts.map(file => file.path),
  ]
  for (const sourcePath of paths) {
    const input = sourceFilename(inputRoot, sourcePath)
    if (!fs.existsSync(input)) continue
    const output = sourceFilename(sourceRoot, sourcePath)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.copyFileSync(input, output)
  }
  return { temporaryRoot, sourceRoot }
}

function targetDescriptor(node) {
  return {
    index: node.index,
    nodeType: node.nodeType,
    start: node.start,
    end: node.end,
    bytes: node.end - node.start,
    tokenCount: node.tokenCount,
    sha256: node.sourceHash,
    coarseHash: node.coarseHash,
  }
}

function expectedUnitDescriptor(unit) {
  return {
    index: unit.index,
    nodeType: unit.nodeType,
    start: unit.start,
    end: unit.end,
    bytes: unit.bytes,
    tokenCount: unit.tokenCount,
    sha256: unit.sha256,
    coarseHash: unit.coarseHash,
  }
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

function propertyOccurrences(source, propertyName) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const positions = []
  walk(ast, node => {
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : null
    if (property?.name === propertyName) {
      positions.push({ start: property.start, end: property.end })
    }
  })
  return positions.sort((left, right) => left.start - right.start)
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

function parseSource(ts, filename, source) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${filename}: parses`)
  return sourceFile
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

function namedFunction(ts, sourceFile, name) {
  const matches = descendants(
    ts,
    sourceFile,
    node => ts.isFunctionDeclaration(node) && node.name?.text === name,
  )
  assert.equal(matches.length, 1, `${name}: one function declaration`)
  return matches[0]
}

function jsxTag(ts, node) {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText()
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText()
  return null
}

function jsxAttributes(ts, node) {
  const properties = ts.isJsxElement(node)
    ? node.openingElement.attributes.properties
    : node.attributes.properties
  return new Map(
    properties
      .filter(ts.isJsxAttribute)
      .map(attribute => [attribute.name.getText(), attribute.initializer]),
  )
}

function exactDeclaration(ts, sourceFile, source, file, name) {
  const declaration = namedFunction(ts, sourceFile, name)
  assert.deepEqual(
    [declaration.getStart(sourceFile), declaration.end],
    [file.postDeclaration.start, file.postDeclaration.end],
  )
  assert.deepEqual(
    descriptor(
      Buffer.from(
        source.slice(file.postDeclaration.start, file.postDeclaration.end),
      ),
    ),
    {
      bytes: file.postDeclaration.bytes,
      sha256: file.postDeclaration.sha256,
    },
  )
  return declaration
}

async function verifyPostimage(sourceRoot) {
  const ts = await loadTypeScript()
  const parsed = new Map()
  for (const file of fixture.sourceFiles) {
    const bytes = readExact(sourceFilename(sourceRoot, file.path), file.postimage)
    const source = bytes.toString('utf8')
    const sourceFile = parseSource(ts, file.path, source)
    const declaration = exactDeclaration(
      ts,
      sourceFile,
      source,
      file,
      file.path.endsWith('RemoveWorkspaceDirectory.tsx')
        ? 'RemoveWorkspaceDirectory'
        : file.path.endsWith('PermissionRuleList.tsx')
          ? 'RuleDetails'
          : 'Panel',
    )
    parsed.set(file.path, { source, sourceFile, declaration })
  }

  for (const context of fixture.contexts) {
    readExact(sourceFilename(sourceRoot, context.path), {
      bytes: context.bytes,
      sha256: context.sha256,
    })
  }

  const removePath = fixture.sourceFiles[0].path
  const remove = parsed.get(removePath)
  assert.match(remove.declaration.getText(remove.sourceFile), /_c\(15\)/)
  const removeConfirmations = descendants(
    ts,
    remove.declaration,
    node => jsxTag(ts, node) === 'ConfirmationButtons',
  )
  assert.equal(removeConfirmations.length, 1)
  assert.deepEqual(
    [...jsxAttributes(ts, removeConfirmations[0]).keys()],
    ['onConfirm', 'onCancel'],
  )
  assert.match(removeConfirmations[0].getText(remove.sourceFile), /onConfirm=\{handleRemove\}/)
  assert.equal(
    descendants(ts, remove.declaration, node => jsxTag(ts, node) === 'Select')
      .length,
    0,
  )
  assert.doesNotMatch(remove.declaration.getText(remove.sourceFile), /"yes"|"no"/)

  const rulesPath = fixture.sourceFiles[1].path
  const rules = parsed.get(rulesPath)
  const rulesText = rules.declaration.getText(rules.sourceFile)
  assert.match(rulesText, /_c\(37\)/)
  const confirmations = descendants(
    ts,
    rules.declaration,
    node => jsxTag(ts, node) === 'ConfirmationButtons',
  )
  assert.equal(confirmations.length, 1)
  assert.match(confirmations[0].getText(rules.sourceFile), /onConfirm=\{onDelete\}/)
  const panels = descendants(
    ts,
    rules.declaration,
    node => jsxTag(ts, node) === 'Panel',
  )
  assert.equal(panels.length, 1)
  assert.equal(
    jsxAttributes(ts, panels[0]).get('color').getText(rules.sourceFile),
    '"permission"',
  )
  assert.equal(
    jsxAttributes(ts, panels[0]).get('title').getText(rules.sourceFile),
    '"Rule details"',
  )
  assert.equal(panels[0].children.length, 2)
  assert.deepEqual(
    panels[0].children.map(child => child.getText(rules.sourceFile)),
    ['{ruleDescription}', '{t8}'],
  )
  const keyboard = descendants(
    ts,
    rules.declaration,
    node => jsxTag(ts, node) === 'KeyboardShortcutHint',
  )
  assert.equal(keyboard.length, 1)
  assert.match(
    keyboard[0].getText(rules.sourceFile),
    /chord="escape" action="cancel"/,
  )
  assert.doesNotMatch(rulesText, /_ === "yes"|label: "Yes"|label: "No"/)
  assert.doesNotMatch(
    rulesText,
    /<Text bold=\{true\} color="permission">Rule details<\/Text>/,
  )

  const imports = rules.sourceFile.statements.filter(ts.isImportDeclaration)
  const modules = imports.map(node => node.moduleSpecifier.text)
  for (const required of [
    '../../../components/CustomSelect/select.js',
    '../../ConfirmationButtons.js',
    '../../design-system/KeyboardShortcutHint.js',
    '../../design-system/Pane.js',
    '../../design-system/Panel.js',
  ]) {
    assert.equal(modules.filter(module => module === required).length, 1)
  }

  const panelPath = fixture.sourceFiles[2].path
  const panel = parsed.get(panelPath)
  const boxes = descendants(
    ts,
    panel.declaration,
    node => jsxTag(ts, node) === 'Box',
  )
  assert.equal(boxes.length, 1)
  const panelAttributes = jsxAttributes(ts, boxes[0])
  assert.deepEqual([...panelAttributes.keys()], [
    'borderStyle',
    'borderColor',
    'flexDirection',
    'paddingX',
    'gap',
  ])
  assert.equal(
    panelAttributes.get('gap').getText(panel.sourceFile),
    '{title ? 1 : 0}',
  )
  assert.match(panel.declaration.getText(panel.sourceFile), /title && \(/)
  assert.match(panel.declaration.getText(panel.sourceFile), /<Text bold color=\{color\}>/)

  const confirmation = fs.readFileSync(
    sourceFilename(sourceRoot, fixture.contexts[0].path),
    'utf8',
  )
  assert.match(confirmation, /confirmLabel = 'Yes'/)
  assert.match(confirmation, /cancelLabel = 'No'/)
  assert.match(confirmation, /focus = 'confirm'/)
  assert.match(confirmation, /value === 'confirm' \? onConfirm\(\) : onCancel\(\)/)
}

test(
  'Target117 authenticates both permission migrations and the complete Panel dependency',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-replay-ready')
    assert.deepEqual(fixture.summary, {
      strictUnits: 2,
      strictResidues: 2,
      recoveredFiles: 3,
      contextFiles: 2,
      authenticatedTargetUnits: 7,
      authenticatedBaselineUnits: 4,
      authenticatedTargetCalls: 4,
      ownerOverrides: 2,
    })
    readExact(path.join(repositoryRoot, fixture.inputs.helper.path), {
      bytes: fixture.inputs.helper.bytes,
      sha256: fixture.inputs.helper.sha256,
    })
    const baseline = readExact(
      path.join(artifactRoot, fixture.inputs.baselineBundle.artifact),
      {
        bytes: fixture.inputs.baselineBundle.bytes,
        sha256: fixture.inputs.baselineBundle.sha256,
      },
    )
    const target = readExact(
      path.join(artifactRoot, fixture.inputs.targetBundle.artifact),
      {
        bytes: fixture.inputs.targetBundle.bytes,
        sha256: fixture.inputs.targetBundle.sha256,
      },
    )
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          {
            bytes: fixture.inputs.structuralLedger.bytes,
            sha256: fixture.inputs.structuralLedger.sha256,
          },
        ),
      ),
    )

    assert.equal(fixture.targetUnits.length, fixture.summary.authenticatedTargetUnits)
    for (const expected of fixture.targetUnits) {
      const row = ledger.unresolvedTarget.find(
        candidate => candidate.target.index === expected.index,
      )
      assert.ok(row, `target structural u${expected.index}`)
      assert.deepEqual(
        targetDescriptor(row.target),
        expectedUnitDescriptor(expected),
      )
      assert.equal(
        sha256(target.subarray(expected.start, expected.end)),
        expected.sha256,
      )
    }
    assert.equal(
      fixture.baselineUnits.length,
      fixture.summary.authenticatedBaselineUnits,
    )
    for (const expected of fixture.baselineUnits) {
      const row = ledger.unmatchedBaseline.find(
        candidate => candidate.index === expected.index,
      )
      assert.ok(row, `baseline structural u${expected.index}`)
      assert.deepEqual(targetDescriptor(row), expectedUnitDescriptor(expected))
      assert.equal(
        sha256(baseline.subarray(expected.start, expected.end)),
        expected.sha256,
      )
    }

    for (const call of fixture.targetCalls) {
      const bytes = target.subarray(call.start, call.end)
      assert.deepEqual(descriptor(bytes), {
        bytes: call.bytes,
        sha256: call.sha256,
      })
      assert.equal(bytes.toString('utf8'), call.text)
    }
    const retained = fixture.retainedBaselineCall
    const retainedBytes = baseline.subarray(retained.start, retained.end)
    assert.deepEqual(descriptor(retainedBytes), {
      bytes: retained.bytes,
      sha256: retained.sha256,
    })
    assert.equal(retainedBytes.toString('utf8'), retained.text)

    const occurrences = propertyOccurrences(target.toString('utf8'), 'onConfirm')
    assert.equal(
      occurrences.length,
      fixture.literalOccurrenceCounts['property:onConfirm'].target,
    )
    for (const row of fixture.rows) {
      assert.deepEqual(occurrences[row.targetOccurrenceNumber - 1], {
        start: row.start,
        end: row.end,
      })
      assert.equal(target.subarray(row.start, row.end).toString(), row.value)
    }
    assert.equal(
      propertyOccurrences(baseline.toString('utf8'), 'onConfirm').length,
      fixture.literalOccurrenceCounts['property:onConfirm'].baseline,
    )

    const confirmationUnit = target
      .subarray(fixture.targetUnits[0].start, fixture.targetUnits[0].end)
      .toString()
    assert.match(confirmationUnit, /\.c\(16\)/)
    assert.match(confirmationUnit, /_===void 0\?"Yes":_/)
    assert.match(confirmationUnit, /A===void 0\?"No":A/)
    assert.match(confirmationUnit, /z===void 0\?"confirm":z/)
    assert.match(confirmationUnit, /W==="confirm"\?q\(\):K\(\)/)
    const panelUnit = target
      .subarray(fixture.targetUnits[1].start, fixture.targetUnits[1].end)
      .toString()
    assert.match(panelUnit, /\.c\(8\)/)
    assert.match(panelUnit, /A=_\?1:0/)
    assert.match(panelUnit, /borderStyle:"round"/)
    assert.match(panelUnit, /paddingX:1,gap:A/)
    assert.match(panelUnit, /\{bold:!0,color:K\}/)

    assert.equal(fixture.sourceFiles[2].authoredIdentity, 'inferred')
    assert.equal(fixture.sourceFiles[2].runtimeIdentity, 'authenticated')
    assert.match(fixture.sourceFiles[2].inferenceBoundary, /no source map/i)
  },
)

test(
  'raw Target117 source replays atomically to the exact three-file postimage',
  { skip: !selected },
  async () => {
    assert.equal(
      execFileSync(
        'git',
        ['rev-parse', `${fixture.inputs.rawSource.commit}^{tree}`],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.inputs.rawSource.tree,
    )
    const raw = materializeRawSource('target117-permission-confirmation-raw-')
    try {
      for (const file of fixture.sourceFiles.slice(0, 2)) {
        assert.equal(
          execFileSync(
            'git',
            [
              'rev-parse',
              `${fixture.inputs.rawSource.commit}:${file.path}`,
            ],
            { cwd: repositoryRoot, encoding: 'utf8' },
          ).trim(),
          file.blob,
        )
        readExact(sourceFilename(raw.sourceRoot, file.path), file.raw)
      }
      assert.equal(
        fs.existsSync(
          sourceFilename(raw.sourceRoot, fixture.sourceFiles[2].path),
        ),
        false,
      )
      installPrerequisites(raw.sourceRoot)
      const result =
        applyTarget117PermissionConfirmationPanelSourceRecovery({
          sourceRoot: raw.sourceRoot,
        })
      assert.deepEqual(result, {
        changed: 3,
        files: fixture.sourceFiles.map(file => file.path),
      })
      await verifyPostimage(raw.sourceRoot)
      assert.deepEqual(
        applyTarget117PermissionConfirmationPanelSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }),
        { changed: 0, files: [] },
      )
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  'permission replay accepts both pre-integration and packaged Target117 states',
  { skip: !selected },
  async () => {
    let seed
    const selectedRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
      ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
      : (() => {
          seed = materializeRawSource(
            'target117-permission-confirmation-package-seed-',
          )
          installPrerequisites(seed.sourceRoot)
          return seed.sourceRoot
        })()
    const packaged = copySelectedSource(
      selectedRoot,
      'target117-permission-confirmation-package-',
    )
    try {
      const result =
        applyTarget117PermissionConfirmationPanelSourceRecovery({
          sourceRoot: packaged.sourceRoot,
        })
      assert.ok(result.changed === 0 || result.changed === 3)
      await verifyPostimage(packaged.sourceRoot)
      assert.equal(
        applyTarget117PermissionConfirmationPanelSourceRecovery({
          sourceRoot: packaged.sourceRoot,
        }).changed,
        0,
      )
    } finally {
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
      if (seed) fs.rmSync(seed.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  'permission replay rejects drift, mixed state, missing context, and symlinks before writes',
  { skip: !selected },
  () => {
    const mixed = materializeRawSource('target117-permission-mixed-')
    try {
      installPrerequisites(mixed.sourceRoot)
      applyTarget117PermissionConfirmationPanelSourceRecovery({
        sourceRoot: mixed.sourceRoot,
      })
      const rawRemove = execFileSync(
        'git',
        [
          'show',
          `${fixture.inputs.rawSource.commit}:${fixture.sourceFiles[0].path}`,
        ],
        { cwd: repositoryRoot },
      )
      fs.writeFileSync(
        sourceFilename(mixed.sourceRoot, fixture.sourceFiles[0].path),
        rawRemove,
      )
      const permissionBefore = fs.readFileSync(
        sourceFilename(mixed.sourceRoot, fixture.sourceFiles[1].path),
      )
      assert.throws(
        () =>
          applyTarget117PermissionConfirmationPanelSourceRecovery({
            sourceRoot: mixed.sourceRoot,
          }),
        /refuses mixed source state/,
      )
      assert.deepEqual(
        fs.readFileSync(
          sourceFilename(mixed.sourceRoot, fixture.sourceFiles[1].path),
        ),
        permissionBefore,
      )
    } finally {
      fs.rmSync(mixed.temporaryRoot, { recursive: true, force: true })
    }

    const drift = materializeRawSource('target117-permission-drift-')
    try {
      installPrerequisites(drift.sourceRoot)
      fs.appendFileSync(
        sourceFilename(drift.sourceRoot, fixture.sourceFiles[1].path),
        '\n// drift\n',
      )
      assert.throws(
        () =>
          applyTarget117PermissionConfirmationPanelSourceRecovery({
            sourceRoot: drift.sourceRoot,
          }),
        /refusing mixed or non-Target117 state/,
      )
    } finally {
      fs.rmSync(drift.temporaryRoot, { recursive: true, force: true })
    }

    const missing = materializeRawSource('target117-permission-context-')
    try {
      installPrerequisites(missing.sourceRoot)
      fs.unlinkSync(sourceFilename(missing.sourceRoot, fixture.contexts[0].path))
      assert.throws(
        () =>
          applyTarget117PermissionConfirmationPanelSourceRecovery({
            sourceRoot: missing.sourceRoot,
          }),
        /required Target117 context is absent/,
      )
    } finally {
      fs.rmSync(missing.temporaryRoot, { recursive: true, force: true })
    }

    const linked = materializeRawSource('target117-permission-symlink-')
    try {
      installPrerequisites(linked.sourceRoot)
      const filename = sourceFilename(linked.sourceRoot, fixture.sourceFiles[0].path)
      const target = `${filename}.real`
      fs.renameSync(filename, target)
      fs.symlinkSync(target, filename)
      assert.throws(
        () =>
          applyTarget117PermissionConfirmationPanelSourceRecovery({
            sourceRoot: linked.sourceRoot,
          }),
        /expected a real source file/,
      )
    } finally {
      fs.rmSync(linked.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  'permission owner overrides stay exact and expose the required generator wiring',
  { skip: !selected },
  () => {
    assert.deepEqual(
      TARGET117_PERMISSION_CONFIRMATION_CONTEXT_FILES,
      fixture.contexts.map(context => ({
        path: context.path,
        bytes: context.bytes,
        sha256: context.sha256,
      })),
    )
    assert.deepEqual(
      TARGET117_PERMISSION_CONFIRMATION_FILES,
      fixture.sourceFiles.map(file => ({
        path: file.path,
        declaration: file.path.endsWith('RemoveWorkspaceDirectory.tsx')
          ? 'RemoveWorkspaceDirectory'
          : file.path.endsWith('PermissionRuleList.tsx')
            ? 'RuleDetails'
            : 'Panel',
        raw: file.raw,
        postimage: file.postimage,
        ...(file.path.endsWith('/Panel.tsx')
          ? { provenance: 'target-runtime-authenticated-authored-path-inferred' }
          : {}),
      })),
    )
    assert.equal(
      TARGET117_PERMISSION_CONFIRMATION_OWNER_OVERRIDES.length,
      fixture.summary.ownerOverrides,
    )
    assert.deepEqual(
      TARGET117_PERMISSION_CONFIRMATION_OWNER_OVERRIDES.map(row => row.key),
      fixture.rows.map(row => `${caseName}:${row.targetIndex}`),
    )
    assert.deepEqual(fixture.wiring, {
      requiredOrder: [
        'applyTarget117ConfirmationSourceRecovery({ sourceRoot })',
        'applyTarget117PluginEmptyStateSourceRecovery({ sourceRoot })',
        'applyTarget117HookEmptyStateSourceRecovery({ sourceRoot })',
        'applyTarget117PermissionConfirmationPanelSourceRecovery({ sourceRoot })',
      ],
      ownerOverrideExport: 'TARGET117_PERMISSION_CONFIRMATION_OWNER_OVERRIDES',
      replayExport:
        'applyTarget117PermissionConfirmationPanelSourceRecovery',
    })
    assert.match(
      TARGET117_PERMISSION_CONFIRMATION_OWNER_OVERRIDES[1].behavior,
      /runtime is authenticated.*authored path.*bounded source reconstruction/i,
    )
  },
)
