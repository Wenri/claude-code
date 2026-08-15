import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from './recovery/node_modules/acorn/dist/acorn.mjs'

const versions = [107, 108, 109, 110, 111, 112, 113, 114, 116]

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function children(node) {
  const result = []
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') result.push(item)
      }
    } else if (value && typeof value === 'object' && value.type) {
      result.push(value)
    }
  }
  return result
}

function stringValue(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map(quasi => quasi.value.cooked).join('')
  }
  return undefined
}

function extract(version) {
  const suffix = version >= 113 ? 'inner' : 'cli'
  const source = fs.readFileSync(
    `/tmp/recovery-semantic-late-b/2.1.${version}.${suffix}.js`,
    'utf8',
  )
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const assignedStrings = new Map()
  const objectCandidates = []
  const stringLiterals = []
  const stack = [ast]
  while (stack.length > 0) {
    const node = stack.pop()
    const literalValue = stringValue(node)
    if (literalValue !== undefined) stringLiterals.push(literalValue)
    if (
      node.type === 'VariableDeclarator' &&
      node.id.type === 'Identifier' &&
      stringValue(node.init) !== undefined
    ) {
      assignedStrings.set(node.id.name, stringValue(node.init))
    }
    if (
      node.type === 'AssignmentExpression' &&
      node.operator === '=' &&
      node.left.type === 'Identifier' &&
      stringValue(node.right) !== undefined
    ) {
      assignedStrings.set(node.left.name, stringValue(node.right))
    }
    if (node.type === 'ObjectExpression') objectCandidates.push(node)
    stack.push(...children(node))
  }

  const skillFilesObject = objectCandidates.find(node => {
    const keys = node.properties
      .filter(property => property.type === 'Property')
      .map(property =>
        property.key.type === 'Literal' ? property.key.value : property.key.name,
      )
    return keys.filter(key => typeof key === 'string' && key.endsWith('.md')).length >= 20
  })
  if (!skillFilesObject) throw new Error(`2.1.${version}: SKILL_FILES object missing`)

  const files = {}
  for (const property of skillFilesObject.properties) {
    if (property.type !== 'Property') continue
    const relative =
      property.key.type === 'Literal' ? property.key.value : property.key.name
    if (typeof relative !== 'string' || !relative.endsWith('.md')) continue
    if (property.value.type !== 'Identifier') {
      throw new Error(`2.1.${version} ${relative}: non-identifier content value`)
    }
    const value = assignedStrings.get(property.value.name)
    if (value === undefined) {
      throw new Error(`2.1.${version} ${relative}: unresolved ${property.value.name}`)
    }
    files[relative] = value
  }
  const skillMatches = stringLiterals.filter(value =>
    value.startsWith('# Building LLM-Powered Applications with Claude'),
  )
  if (skillMatches.length !== 1) {
    throw new Error(`2.1.${version}: expected exactly one SKILL.md literal`)
  }
  files['SKILL.md'] = skillMatches[0]
  const migrationMatches = stringLiterals.filter(value =>
    value.startsWith('# Model Migration Guide'),
  )
  if (migrationMatches.length > 1) {
    throw new Error(`2.1.${version}: multiple model migration literals`)
  }
  if (migrationMatches.length === 1) {
    files['shared/model-migration.md'] = migrationMatches[0]
  }
  return files
}

const extracted = Object.fromEntries(
  versions.map(version => [version, extract(version)]),
)
for (const version of versions) {
  const output = `/tmp/recovery-semantic-late-b/claude-api-map-2.1.${version}`
  for (const [relative, value] of Object.entries(extracted[version])) {
    const filename = path.join(output, relative)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, value)
  }
}

const cases = [
  [107, 108],
  [108, 109],
  [109, 110],
  [110, 111],
  [111, 112],
  [112, 113],
  [113, 114],
  [114, 116],
]
const report = {
  schemaVersion: 1,
  criterion: 'exact-embedded-claude-api-content-v1',
  cases: cases.map(([baseline, target]) => {
    const paths = new Set([
      ...Object.keys(extracted[baseline]),
      ...Object.keys(extracted[target]),
    ])
    const changes = [...paths]
      .filter(relative => extracted[baseline][relative] !== extracted[target][relative])
      .sort()
      .map(relative => ({
        path: relative,
        baseline: extracted[baseline][relative] === undefined
          ? null
          : {
              bytes: Buffer.byteLength(extracted[baseline][relative]),
              sha256: hash(extracted[baseline][relative]),
            },
        target: extracted[target][relative] === undefined
          ? null
          : {
              bytes: Buffer.byteLength(extracted[target][relative]),
              sha256: hash(extracted[target][relative]),
            },
      }))
    return { case: `2.1.${baseline}-to-2.1.${target}`, changes }
  }),
}
fs.writeFileSync(
  '/tmp/recovery-semantic-late-b/late-claude-api-content-changes.json',
  `${JSON.stringify(report, null, 2)}\n`,
)
for (const item of report.cases) {
  process.stdout.write(`${item.case}: ${item.changes.map(change => change.path).join(', ') || '(none)'}\n`)
  const caseName = item.case.replace('2.1.', '2.1.')
  const routingChanges = {
    '2.1.107-to-2.1.108': [
      {
        owner: 'src/skills/bundled/claudeApi.ts',
        behavior: 'Compact Anthropic/Managed Agents trigger and skip routing replaces the earlier verbose description.',
        targetSha256: '574e8fd08e0ffe57735890c21fa19c9f492c8d5be8d54c94e25e539cba84f11a',
      },
      {
        owner: 'src/skills/bundled/claudeApi.ts',
        behavior: 'The __G2__ reading-guide placeholder is removed by HTML-comment processing and is non-runtime.',
        targetSha256: 'a1a7c4f6f6d859598cedb6810ce716dc8aae83fbef83a4f05ca1becd9927acb9',
      },
    ],
    '2.1.110-to-2.1.111': [
      {
        owner: 'src/skills/bundled/claudeApiContent.ts',
        behavior: 'Default OPUS_ID/OPUS_NAME move to Claude Opus 4.7 and model-migration content becomes available.',
      },
      {
        owner: 'src/skills/bundled/claudeApi.ts',
        behavior: 'Prompt construction replaces __G2__ with the model-migration reading-guide entry.',
      },
    ],
    '2.1.114-to-2.1.116': [
      {
        owner: 'src/skills/bundled/claudeApiContent.ts',
        behavior: 'The present model-migration document becomes a direct map member; runtime content is unchanged.',
      },
      {
        owner: 'src/skills/bundled/claudeApi.ts',
        behavior: 'The identical model-migration reading-guide entry is inlined instead of placeholder replacement.',
        targetSha256: '9e9ea7f482145c309295a62875d829a3df083d738b348dc61cf21c2ba25fc35f',
      },
    ],
  }[caseName] ?? []
  const artifact = {
    schemaVersion: 1,
    case: caseName,
    criterion: 'exact-embedded-claude-api-content-v1',
    documentChanges: item.changes.map(change => ({
      ...change,
      owner: `src/skills/bundled/claude-api/${change.path}`,
    })),
    routingChanges,
  }
  const caseOutput = path.join('recovery/cases', caseName, 'semantic')
  fs.mkdirSync(caseOutput, { recursive: true })
  fs.writeFileSync(
    path.join(caseOutput, 'claude-api-content.json'),
    `${JSON.stringify(artifact, null, 2)}\n`,
  )
}

if (process.argv.includes('--install-current')) {
  const currentRoot = 'src/skills/bundled/claude-api'
  for (const [relative, value] of Object.entries(extracted[116])) {
    const filename = path.join(currentRoot, relative)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, value)
  }
}
