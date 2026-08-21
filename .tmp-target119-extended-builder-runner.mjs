import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const filename = path.join(
  process.cwd(),
  'recovery/cases/2.1.118-to-2.1.119/recovered/build-nondaemon-static-owner-proofs.mjs',
)
let source = fs.readFileSync(filename, 'utf8').replace(/^#!.*\n/, '')
source = source.replace(
  "import { parse } from 'acorn'",
  `import { parse } from ${JSON.stringify(
    pathToFileURL(
      path.join(process.cwd(), 'recovery/node_modules/acorn/dist/acorn.mjs'),
    ).href,
  )}`,
)
source = source.replace(
  "const root = fileURLToPath(new URL('../../../..', import.meta.url))",
  'const root = process.cwd()',
)
if (process.env.TARGET119_PROOF_SOURCE_VERSION) {
  source = source.replace(
    '.recovery-tmp/semantic-trees/2.1.119/src',
    `.recovery-tmp/semantic-trees/${process.env.TARGET119_PROOF_SOURCE_VERSION}/src`,
  )
}
source = source.replace(
  '  return null\n}\n\nfunction canonicalResidue',
  `  if (
    residue.literalKind === 'property' &&
    residue.value === 'constructor' &&
    parent?.type === 'MethodDefinition' &&
    parent.kind === 'constructor' &&
    parent.computed === false &&
    parent.key === occurrence.node
  ) {
    return 'class-constructor-lowering'
  }
  return null
}

function canonicalResidue`,
)
source = source.replace(
  /if \(\n  ownerCandidates\.length !== 105 \|\|[\s\S]*?\n\}\nconst sourceGapRows/,
  `process.stdout.write(JSON.stringify({ ownerCandidateIndices }) + '\\n')
const sourceGapRows`,
)
source = source.replace(
  /if \(\n  rows\.length !== EXPECTED\.units \|\|[\s\S]*?\n\}\nconst selectedSet/,
  `process.stdout.write(JSON.stringify({
  selected: rows.map(row => ({
    targetIndex: row.targetIndex,
    sourceOwner: row.sourceOwner,
    declaration: row.declaration,
    residues: row.residues.length,
    representations: Object.fromEntries(
      [...new Set(row.residues.map(item => item.representation))]
        .sort()
        .map(kind => [kind, row.residues.filter(item => item.representation === kind).length]),
    ),
  })),
}) + '\\n')
const selectedSet`,
)
source = source.replace(
  /if \(\n  selectedReportRows\.length !== EXPECTED\.residues \|\|[\s\S]*?\n\}\n\nconst flattened/,
  `process.stdout.write(JSON.stringify({ selectedReportRows: selectedReportRows.length }) + '\\n')

const flattened`,
)
source = source.replace(
  "else process.stdout.write(serialized)",
  `else process.stdout.write(JSON.stringify({
    finalUnits: rows.length,
    finalResidues: flattened.length,
    indices: selectedIndices,
  }) + '\\n')`,
)

await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
