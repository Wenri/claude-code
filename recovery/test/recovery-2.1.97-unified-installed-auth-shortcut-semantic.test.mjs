import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const caseRoot = path.join(repositoryRoot, 'recovery/cases', caseName)
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const baselineSha256 =
  '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e'
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
const historicalOwnerSha256 =
  'e8840afc81d60fada74194885e66464db72c8f2bbd51bba15337f94df05fe571'

const baselineUnit = {
  index: 14_269,
  nodeType: 'FunctionDeclaration',
  start: 10_703_768,
  end: 10_710_774,
  sourceHash:
    '8c39283ea47ab1b5113f6d7e339a8a0d4f2e23b22b8798e386c662bb7099f621',
}
const targetUnit = {
  index: 14_316,
  nodeType: 'FunctionDeclaration',
  start: 10_726_639,
  end: 10_733_812,
  sourceHash:
    '3b4e123e662c65396b9e69744445a4e0905b21e19e96e06b1ba70aee76155b07',
}

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(path.join(caseRoot, 'structural/generated-delta.json.gz')),
  ),
)

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_96_BUNDLE and CLAUDE_CODE_2_1_97_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expectedSha256, `${label} hash drifted`)
  return bytes.toString('utf8')
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

async function instantiateCell(owner) {
  const ts = await loadTypeScript()
  const ast = ts.createSourceFile(
    'UnifiedInstalledCell.tsx',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const declaration = ast.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'UnifiedInstalledCell',
  )
  assert.ok(declaration, 'UnifiedInstalledCell must be reachable')

  const harness = `
    namespace React { export type ReactNode = unknown }
    type Props = any
    const Box = Symbol('Box')
    const ListItem = Symbol('ListItem')
    const Text = Symbol('Text')
    const ConfigurableShortcutHint = Symbol('ConfigurableShortcutHint')
    const figures = {
      pointer: '>',
      arrowRight: 'arrow-right',
      cross: 'cross',
      radioOff: 'radio-off',
      tick: 'tick',
      warning: 'warning',
      triangleUpOutline: 'triangle-up-outline',
    }
    const useTheme = () => ['test-theme']
    const color = (kind: string, _theme: unknown) =>
      (icon: string) => kind + ':' + icon
    const plural = (count: number, word: string) =>
      count === 1 ? word : word + 's'
    const createElement = (type: unknown, props: object | null, ...children: unknown[]) => ({
      type,
      props: { ...(props ?? {}), children },
    })
    ${declaration.getText(ast)}
    module.exports = {
      UnifiedInstalledCell,
      Box,
      ListItem,
      Text,
      ConfigurableShortcutHint,
    }
  `
  const result = ts.transpileModule(harness, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      jsxFactory: 'createElement',
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'unifiedInstalledCellHarness.tsx',
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [], 'isolated UnifiedInstalledCell must transpile')
  const module = { exports: {} }
  new Function('exports', 'module', result.outputText)(module.exports, module)
  return module.exports
}

function elementsWithType(value, type, found = []) {
  if (Array.isArray(value)) {
    for (const child of value) elementsWithType(child, type, found)
    return found
  }
  if (!value || typeof value !== 'object') return found
  if (value.type === type) found.push(value)
  elementsWithType(value.props?.children, type, found)
  return found
}

function renderedText(value) {
  if (Array.isArray(value)) return value.map(renderedText).join('')
  if (typeof value === 'string' || typeof value === 'number') return `${value}`
  if (!value || typeof value !== 'object') return ''
  return renderedText(value.props?.children)
}

test(
  '2.1.97 replaces the fixed MCP auth copy with the configurable select shortcut',
  bundleOptions,
  () => {
    if (!selected || !baselinePath || !targetPath) return
    const baseline = requiredBundle(
      baselinePath,
      'CLAUDE_CODE_2_1_96_BUNDLE',
      baselineSha256,
    )
    const target = requiredBundle(
      targetPath,
      'CLAUDE_CODE_2_1_97_BUNDLE',
      targetSha256,
    )
    const baselineOwner = baseline.slice(baselineUnit.start, baselineUnit.end)
    const targetOwner = target.slice(targetUnit.start, targetUnit.end)

    assert.equal(sha256(baselineOwner), baselineUnit.sourceHash)
    assert.equal(sha256(targetOwner), targetUnit.sourceHash)
    assert.equal(baselineOwner.split('Enter to auth').length - 1, 1)
    assert.doesNotMatch(baselineOwner, /description:"auth"/)
    assert.match(
      baselineOwner,
      /status==="needs-auth"[\s\S]*A="Enter to auth"/,
    )
    assert.doesNotMatch(targetOwner, /Enter to auth/)
    assert.equal(targetOwner.split('description:"auth"').length - 1, 1)
    assert.match(
      targetOwner,
      /status==="needs-auth"[\s\S]*createElement\([^,]+,\{action:"select:accept",context:"Select",fallback:"Enter",description:"auth"\}\)/,
    )

    const targetRow = structural.regions[targetUnit.index]
    assert.equal(targetRow.classification, 'unresolved')
    assert.deepEqual(
      [
        targetRow.target.index,
        targetRow.target.nodeType,
        targetRow.target.start,
        targetRow.target.end,
        targetRow.target.sourceHash,
      ],
      [
        targetUnit.index,
        targetUnit.nodeType,
        targetUnit.start,
        targetUnit.end,
        targetUnit.sourceHash,
      ],
    )
    const baselineRow = structural.unmatchedBaseline.find(
      row => row.index === baselineUnit.index,
    )
    assert.ok(baselineRow, `baseline u${baselineUnit.index} must be unmatched`)
    assert.deepEqual(
      [
        baselineRow.nodeType,
        baselineRow.start,
        baselineRow.end,
        baselineRow.sourceHash,
      ],
      [
        baselineUnit.nodeType,
        baselineUnit.start,
        baselineUnit.end,
        baselineUnit.sourceHash,
      ],
    )
  },
)

test(
  'the case97 owner keeps Box layout while owning the exact auth shortcut descriptor',
  sourceOptions,
  () => {
    if (!selected) return
    const owner = source('commands/plugin/UnifiedInstalledCell.tsx')
    const branchStart = owner.indexOf("item.status === 'needs-auth'")
    const branchEnd = owner.indexOf('\n  } else {', branchStart)
    assert.ok(branchStart >= 0 && branchEnd > branchStart, 'needs-auth branch')
    const branch = owner.slice(branchStart, branchEnd)

    assert.match(
      owner,
      /import \{ ConfigurableShortcutHint \} from '\.\.\/\.\.\/components\/ConfigurableShortcutHint\.js'/,
    )
    assert.match(owner, /let statusText: React\.ReactNode/)
    assert.doesNotMatch(owner, /Enter to auth/)
    assert.match(
      branch,
      /<ConfigurableShortcutHint\s+action="select:accept"\s+context="Select"\s+fallback="Enter"\s+description="auth"\s+\/>/,
    )

    if (
      semanticCase === caseName &&
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
    ) {
      assert.equal(sha256(owner), historicalOwnerSha256)
      assert.match(owner, /import \{ Box, color, Text, useTheme \}/)
      assert.doesNotMatch(owner, /\bListItem\b/)
    }
  },
)

test(
  'the historical supplement decompiles only the Box-era owner for this behavior',
  sourceOptions,
  () => {
    if (!selected) return
    const supplement = fs.readFileSync(
      path.join(caseRoot, 'semantic-supplement.patch'),
      'utf8',
    )
    const heading =
      'diff --git a/src/commands/plugin/UnifiedInstalledCell.tsx b/src/commands/plugin/UnifiedInstalledCell.tsx'
    assert.equal(supplement.split(heading).length - 1, 1)
    const start = supplement.indexOf(heading)
    const next = supplement.indexOf('\ndiff --git ', start + heading.length)
    const hunk = supplement.slice(start, next === -1 ? undefined : next)
    assert.match(
      hunk,
      /\+import \{ ConfigurableShortcutHint \} from '\.\.\/\.\.\/components\/ConfigurableShortcutHint\.js'/,
    )
    assert.match(hunk, /\+  let statusText: React\.ReactNode/)
    assert.match(hunk, /\+      <ConfigurableShortcutHint/)
    assert.match(hunk, /\+      <Box>/)
    assert.doesNotMatch(hunk, /^\+.*\bListItem\b/m)
  },
)

test(
  'the canonical case97 row selects owner-072 and the focused evidence pair',
  sourceOptions,
  () => {
    if (!selected) return
    const ledger = JSON.parse(
      gunzipSync(
        fs.readFileSync(path.join(caseRoot, 'semantic/source-coverage.json.gz')),
      ),
    )
    const rows = ledger.rows.filter(
      row =>
        row.targetIndex === targetUnit.index &&
        row.sourceHash === targetUnit.sourceHash,
    )
    assert.equal(rows.length, 1)
    const [row] = rows
    assert.equal(row.disposition, 'source-runtime-covered')
    assert.equal(row.structuralClass, 'unresolved')
    const ownerId = row.ownerIds[0]
    assert.equal(
      ledger.owners.find(owner => owner.id === ownerId)?.path,
      'src/commands/plugin/UnifiedInstalledCell.tsx',
    )
    assert.ok(row.evidenceIds.includes('unified-installed-auth-shortcut-target'))
    assert.ok(
      row.evidenceIds.includes('unified-installed-auth-shortcut-semantic-test'),
    )
    assert.match(row.behavior, /ConfigurableShortcutHint/)

    assert.deepEqual(ledger.owners.find(owner => owner.id === ownerId), {
      id: ownerId,
      path: 'src/commands/plugin/UnifiedInstalledCell.tsx',
    })
    const evidence = new Map(ledger.evidence.map(item => [item.id, item]))
    assert.equal(
      evidence.get('unified-installed-auth-shortcut-target')?.kind,
      'target-fragment',
    )
    assert.equal(
      evidence.get('unified-installed-auth-shortcut-semantic-test')?.kind,
      'semantic-test',
    )
  },
)

test(
  'needs-auth renders the configurable shortcut in top-level and indented MCP rows',
  sourceOptions,
  async () => {
    if (!selected) return
    const owner = source('commands/plugin/UnifiedInstalledCell.tsx')
    const runtime = await instantiateCell(owner)
    const expectedRoot = owner.includes('<ListItem')
      ? runtime.ListItem
      : runtime.Box

    for (const [indented, isSelected] of [
      [false, true],
      [true, false],
    ]) {
      const rendered = runtime.UnifiedInstalledCell({
        item: {
          type: 'mcp',
          name: indented ? 'nested-server' : 'top-level-server',
          status: 'needs-auth',
          indented,
        },
        isSelected,
      })
      assert.equal(rendered.type, expectedRoot)
      const hints = elementsWithType(
        rendered,
        runtime.ConfigurableShortcutHint,
      )
      assert.equal(hints.length, 1, `${indented ? 'indented' : 'top-level'} hint`)
      const { action, context, fallback, description } = hints[0].props
      assert.deepEqual(
        { action, context, fallback, description },
        {
          action: 'select:accept',
          context: 'Select',
          fallback: 'Enter',
          description: 'auth',
        },
      )
      assert.equal(renderedText(rendered).includes('Enter to auth'), false)
      assert.equal(renderedText(rendered).includes('└ '), indented)
    }
  },
)
