import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse, parseExpressionAt } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const semanticSourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(repositoryRoot, 'src')

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function parseScriptBodyFromSource() {
  const filename = path.join(
    semanticSourceRoot,
    'utils/powershell/parser.ts',
  )
  const source = fs.readFileSync(filename, 'utf8')
  const marker = 'export const PARSE_SCRIPT_BODY ='
  const markerOffset = source.indexOf(marker)
  assert.notEqual(markerOffset, -1, `${filename}: ${marker}`)
  const expression = parseExpressionAt(
    source,
    markerOffset + marker.length,
    { ecmaVersion: 'latest', sourceType: 'module' },
  )
  if (expression.type === 'Literal') return expression.value
  assert.equal(expression.type, 'TemplateLiteral')
  assert.equal(expression.expressions.length, 0)
  return expression.quasis[0].value.cooked
}

test(
  '2.1.90 owns the exact authenticated PowerShell parser subprocess body',
  {
    skip:
      (selectedCase !== undefined &&
        selectedCase !== '2.1.89-to-2.1.90') ||
      !process.env.CLAUDE_CODE_2_1_90_BUNDLE,
  },
  () => {
    const targetFilename = process.env.CLAUDE_CODE_2_1_90_BUNDLE
    const targetBuffer = fs.readFileSync(targetFilename)
    assert.equal(
      sha256(targetBuffer),
      '069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9',
    )
    const targetAst = parse(targetBuffer.toString('utf8'), {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const targetUnit = targetAst.body[10832]
    assert.equal(targetUnit.type, 'VariableDeclaration')
    assert.equal(targetUnit.start, 8572091)
    assert.equal(targetUnit.end, 8583054)

    const candidates = []
    function walk(node) {
      if (node === null || typeof node !== 'object') return
      if (node.type === 'Literal' && typeof node.value === 'string') {
        candidates.push(node.value)
      } else if (node.type === 'TemplateElement') {
        candidates.push(node.value?.cooked ?? node.value?.raw)
      }
      for (const [key, value] of Object.entries(node)) {
        if (['end', 'loc', 'raw', 'start'].includes(key)) continue
        if (Array.isArray(value)) value.forEach(walk)
        else if (value && typeof value === 'object') walk(value)
      }
    }
    walk(targetUnit)
    assert.equal(candidates.length, 1)
    const targetBody = candidates[0]
    assert.equal(targetBody.length, 10867)
    assert.equal(
      sha256(targetBody),
      '611e04d351d058f68fe581ec1263902530c1a4bbd2c83fd39fd2148a19a6b3ef',
    )
    assert.equal(parseScriptBodyFromSource(), targetBody)
  },
)
