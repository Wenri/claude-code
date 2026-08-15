import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parse } from './recovery/node_modules/acorn/dist/acorn.mjs'

const bundle = readFileSync(
  '/tmp/claude-middle-audit.DB5eTC/2.1.105/package/cli.js',
  'utf8',
)
const ast = parse(bundle, {
  ecmaVersion: 'latest',
  sourceType: 'module',
  allowHashBang: true,
})

const declarations = new Map()
for (const statement of ast.body) {
  if (statement.type !== 'VariableDeclaration') continue
  for (const declaration of statement.declarations) {
    if (declaration.id.type !== 'Identifier' || !declaration.init) continue
    if (
      declaration.init.type === 'Literal' &&
      typeof declaration.init.value === 'string'
    ) {
      declarations.set(declaration.id.name, declaration.init.value)
    } else if (
      declaration.init.type === 'TemplateLiteral' &&
      declaration.init.expressions.length === 0
    ) {
      declarations.set(
        declaration.id.name,
        declaration.init.quasis[0]?.value.cooked ?? '',
      )
    }
  }
}

const docs = {
  $25: 'SKILL.md',
  gw5: 'curl/managed-agents.md',
  Y25: 'python/managed-agents/README.md',
  D25: 'shared/managed-agents-api-reference.md',
  G25: 'shared/managed-agents-client-patterns.md',
  T25: 'shared/managed-agents-core.md',
  V25: 'shared/managed-agents-environments.md',
  N25: 'shared/managed-agents-events.md',
  y25: 'shared/managed-agents-onboarding.md',
  R25: 'shared/managed-agents-overview.md',
  S25: 'shared/managed-agents-tools.md',
  r25: 'typescript/managed-agents/README.md',
}

const root = 'src/skills/bundled/claude-api'
for (const [symbol, relative] of Object.entries(docs)) {
  const content = declarations.get(symbol)
  if (content === undefined) throw new Error(`missing ${symbol}`)
  const output = join(root, relative)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, content)
  process.stdout.write(`${relative}\t${Buffer.byteLength(content)}\n`)
}
