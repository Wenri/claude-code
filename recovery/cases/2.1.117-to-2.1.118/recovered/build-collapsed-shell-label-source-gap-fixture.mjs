import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  buildTarget118CollapsedShellLabelOutput,
  TARGET118_COLLAPSED_SHELL_LABEL_INPUT,
  TARGET118_COLLAPSED_SHELL_LABEL_OUTPUT,
  TARGET118_COLLAPSED_SHELL_LABEL_OWNER_OVERRIDES,
} from './replay-collapsed-shell-label-source-gap.mjs'

const root = process.cwd()
const sourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src')
const reportPath =
  process.env.CLAUDE_CODE_SEMANTIC_RESIDUE_REPORT ??
  path.join(
    root,
    '.recovery-tmp/residue-audits/2.1.117-to-2.1.118.typed-audit.json',
  )
const targetBundlePath = path.join(
  root,
  '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const descriptorAt = (value, start, end) => ({
  start,
  end,
  ...descriptor(value.subarray(start, end)),
})

const imported = await import(
  pathToFileURL(
    path.join(
      root,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ).href
)
const ts = imported.default ?? imported

function sourceFunction(input) {
  const sourceFile = ts.createSourceFile(
    TARGET118_COLLAPSED_SHELL_LABEL_INPUT.path,
    input.toString(),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  if (sourceFile.parseDiagnostics.length !== 0) {
    throw new Error('CollapsedReadSearchContent source does not parse')
  }
  const matches = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'CollapsedReadSearchContent',
  )
  if (matches.length !== 1) {
    throw new Error('Expected one CollapsedReadSearchContent declaration')
  }
  return {
    sourceFile,
    declaration: matches[0],
  }
}

const allOwners = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      '.recovery-tmp/generator-inputs/2.1.117-to-2.1.118.all-owners.json',
    ),
  ),
)
const report = JSON.parse(fs.readFileSync(reportPath))
const unit = allOwners.rows.find(row => row.targetIndex === 12587)
const residues = report.sourceRuntimeAddedOwnerResidueRows
  .filter(row => row.structural.index === 12587)
  .map(row => [
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
  ])
if (!unit || residues.length !== 1 || residues[0][1] !== ' shell') {
  throw new Error('Target118 collapsed shell-label unit/residue differs')
}

const sourcePath = path.join(
  sourceRoot,
  TARGET118_COLLAPSED_SHELL_LABEL_INPUT.path.replace(/^src\//, ''),
)
const input = fs.readFileSync(sourcePath)
if (
  input.length !== TARGET118_COLLAPSED_SHELL_LABEL_INPUT.bytes ||
  sha256(input) !== TARGET118_COLLAPSED_SHELL_LABEL_INPUT.sha256
) {
  throw new Error('Target118 collapsed shell-label source preimage differs')
}
const output = Buffer.from(
  buildTarget118CollapsedShellLabelOutput(input.toString('utf8')),
)
if (
  output.length !== TARGET118_COLLAPSED_SHELL_LABEL_OUTPUT.bytes ||
  sha256(output) !== TARGET118_COLLAPSED_SHELL_LABEL_OUTPUT.sha256
) {
  throw new Error('Target118 collapsed shell-label source postimage differs')
}
const beforeFunction = sourceFunction(input)
const afterFunction = sourceFunction(output)
const targetBundle = fs.readFileSync(targetBundlePath)
const override = TARGET118_COLLAPSED_SHELL_LABEL_OWNER_OVERRIDES[0]

const fixture = {
  schemaVersion: 1,
  case: '2.1.117-to-2.1.118',
  status: 'authenticated-collapsed-shell-label-source-replay',
  evidenceIds: [...override.evidenceIds],
  inputs: {
    targetBundle: descriptor(targetBundle),
    sourceInput: TARGET118_COLLAPSED_SHELL_LABEL_INPUT,
    sourceOutput: TARGET118_COLLAPSED_SHELL_LABEL_OUTPUT,
  },
  summary: {
    units: 1,
    residues: 1,
    indicesSha256: sha256(JSON.stringify([12587])),
    residueIdentitiesSha256: sha256(JSON.stringify(residues)),
  },
  row: {
    targetIndex: 12587,
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
    targetMarkers: [
      'powershell_progress',
      'bash_progress',
      ' shell',
      'command',
      'commands',
    ],
    sourceProof: {
      declaration: 'CollapsedReadSearchContent',
      before: descriptorAt(
        input,
        beforeFunction.declaration.getStart(beforeFunction.sourceFile),
        beforeFunction.declaration.end,
      ),
      after: descriptorAt(
        output,
        afterFunction.declaration.getStart(afterFunction.sourceFile),
        afterFunction.declaration.end,
      ),
      invariantMarkers: [
        "data?.type !== 'bash_progress' && data?.type !== 'powershell_progress'",
        "<Text key=\"bash\">",
        "{bashCount === 1 ? 'command' : 'commands'}",
      ],
      beforeMarker: "</Text> bash{' '}",
      afterMarker: "</Text> shell{' '}",
    },
  },
}

const outputPath = path.join(
  root,
  'recovery/test/recovery-2.1.118-collapsed-shell-label-source-gap.json',
)
fs.writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(outputPath, fixture.summary)
