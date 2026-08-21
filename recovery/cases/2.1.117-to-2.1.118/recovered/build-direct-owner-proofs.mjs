import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { TARGET118_DIRECT_OWNER_OVERRIDES } from './direct-owner-overrides.mjs'

const root = process.cwd()
const packageSourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src')

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(filename) {
  const value = fs.readFileSync(filename)
  return { bytes: value.length, sha256: sha256(value) }
}

const allOwners = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      '.recovery-tmp/generator-inputs/2.1.117-to-2.1.118.all-owners.json',
    ),
  ),
)
const report = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      '.recovery-tmp/residue-audits/2.1.117-to-2.1.118.typed-audit.json',
    ),
  ),
)
const units = new Map(allOwners.rows.map(row => [row.targetIndex, row]))
const output = path.join(
  root,
  'recovery/test/recovery-2.1.118-direct-owner-proofs.json',
)
const existingRows = fs.existsSync(output)
  ? new Map(
      JSON.parse(fs.readFileSync(output, 'utf8')).rows.map(row => [
        row.targetIndex,
        row,
      ]),
    )
  : new Map()
const residuesByUnit = new Map()
for (const residue of report.sourceRuntimeAddedOwnerResidueRows) {
  const targetIndex = residue.structural.index
  if (!TARGET118_DIRECT_OWNER_OVERRIDES.some(row => row.targetIndex === targetIndex)) {
    continue
  }
  const values = residuesByUnit.get(targetIndex) ?? []
  values.push([
    residue.literalKind,
    residue.value,
    residue.target.start,
    residue.target.end,
    residue.baselineOccurrenceCount,
    residue.targetOccurrenceNumber,
  ])
  residuesByUnit.set(targetIndex, values)
}

const markers = new Map([
  [6723, ['export function getUserThemesDir(): string {', "join(getClaudeConfigHomeDir(), 'themes')"]],
  [7466, ['useResolvedTheme', 'useCustomThemes']],
  [7509, ['export const DEFAULT_BINDINGS:', "'ctrl+e': 'theme:editCustom'"]],
  [7522, ['export const KEYBINDING_CONTEXTS = [', 'export const KEYBINDING_ACTIONS = [', "'theme:editCustom'"]],
  [8977, ['export const getSystemContext = memoize(', 'This is a Perforce workspace.', 'truncated because it exceeds 2k characters']],
  [9805, ['export function IdeOnboardingDialog(', 'Claude has context of', "Review Claude Code's changes", 'Cmd+Esc']],
  [10917, ['export async function generateAwaySummary(', "kind: 'no-turn'", "kind: 'api-error'"]],
  [16266, ['export function TagPlugin(', 'dryRun', 'unknownFlag', 'Marketplace entry: plugins[', 'Dry run — would create tag']],
  [16623, ['export function WarmResumeHint(', 'tengu_warm_resume_hint_eligible', 'with_fork_session', 'claude --resume --fork-session']],
  [17033, ['export function FuzzyPicker<T>(', "placeholder = 'Type to search…'", 'onSelectMany', 'previewPosition']],
  [17039, ['export function CustomThemeEditor(', 'customThemes', 'setPreviewOverrides', "'New custom theme'", '[theme] save ']],
  [19473, ['function fromVisualTextObject(', 'TEXT_OBJ_TYPES.has(input)', "exit: 'selectRange'"]],
  [19475, ['export function useVimInput(', 'selectionAnchor', "lastChange?.type === 'visualOp'", "type: 'visualChange'", "mode === 'VISUAL LINE'"]],
  [19477, ['const UNHANDLED_SPECIAL_KEYS = new Set([', "'pageup'", "'pagedown'", "'f12'"]],
])

const files = new Map()
const rows = TARGET118_DIRECT_OWNER_OVERRIDES.map(override => {
  const unit = units.get(override.targetIndex)
  const residues =
    residuesByUnit.get(override.targetIndex) ??
    existingRows.get(override.targetIndex)?.residues ??
    []
  if (!unit || residues.length === 0) {
    throw new Error(`Target118 direct-owner fixture is missing u${override.targetIndex}`)
  }
  const relative = override.paths[0].replace(/^src\//, '')
  if (!files.has(override.paths[0])) {
    files.set(override.paths[0], descriptor(path.join(packageSourceRoot, relative)))
  }
  return {
    targetIndex: override.targetIndex,
    ownerPath: override.paths[0],
    behavior: override.behavior,
    target: {
      start: unit.start,
      end: unit.end,
      bytes: unit.end - unit.start,
      nodeType: unit.nodeType,
      sourceHash: unit.sourceHash,
      structuralClass: unit.structuralClass,
    },
    residues,
    sourceMarkers: markers.get(override.targetIndex),
  }
})

const fixture = {
  schemaVersion: 1,
  case: '2.1.117-to-2.1.118',
  status: 'authenticated-direct-source-owner',
  evidenceIds: [
    'target118-direct-owner-target-fragment',
    'target118-direct-owner-source-ast-test',
  ],
  inputs: {
    targetBundle: descriptor(
      path.join(
        root,
        '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
      ),
    ),
    sourceFiles: [...files].map(([sourcePath, file]) => ({ sourcePath, ...file })),
  },
  summary: {
    units: rows.length,
    residues: rows.reduce((sum, row) => sum + row.residues.length, 0),
    indicesSha256: sha256(JSON.stringify(rows.map(row => row.targetIndex))),
    residueIdentitiesSha256: sha256(
      JSON.stringify(rows.flatMap(row => row.residues)),
    ),
  },
  rows,
}

fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(output, fixture.summary)
