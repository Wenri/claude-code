import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const units = new Map([
  [15421, [9775615, 9775751, 'eaf9fff447cae36b75dc696735978f368b52cd8083e5f245f3cea0c3e8768b10']],
  [15422, [9775751, 9776240, '4ab4992af462a1af5d1202abce4d47d7ce40e60a6e545ff155c5f3e2d7daa6cb']],
  [15423, [9776240, 9777135, 'd86c1432b171b3e763069aec037a29a8a6c349cb2d307093a25797e3190720ab']],
  [15424, [9777135, 9777279, '1dd68c10ee471ca3d8eac91e6ef6c14540ecaf4b359338a7d26f701b788eaa47']],
  [15425, [9777279, 9777308, 'bc72368dc93a14ebbf2f86d2ced48343b186a2862d8cd6007574f2326d5d1a22']],
  [15426, [9777308, 9777556, '6a23780c5e1d789efb370f4a5bdbc271888bce63764eaed38bc75ed902704dc5']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function functionSource(contents, name) {
  const start = contents.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name}: declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    else if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated`)
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

test(
  'target113 pins the Tree.Group last-child propagation boundary',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
    )
    assert.equal(
      sha256(targetBytes),
      '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const [index, identity] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        identity,
        `${index}: identity`,
      )
      const statement = target.slice(identity[0], identity[1])
      assert.equal(sha256(statement), identity[2], `${index}: target bytes`)
      assert.equal(
        parse(statement, { ecmaVersion: 'latest', sourceType: 'module' }).body
          .length,
        1,
        `${index}: one statement`,
      )
    }

    const baselineTreeAnchor = baseline.indexOf('ancestors:[]')
    assert.notEqual(baselineTreeAnchor, -1, 'target112 Tree context')
    const baselineTree = baseline.slice(
      baselineTreeAnchor - 2_500,
      baselineTreeAnchor + 500,
    )
    const targetTree = target.slice(9775615, 9777556)
    assert.equal(baselineTree.includes('Group:'), false)
    assert.equal(targetTree.includes('Group:'), true)
    assert.match(target.slice(9777135, 9777279), /useContext\(.+\).+\(.+,.+\)/)
  },
)

test(
  'source preserves an enclosing group last-child status for every child',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const tree = source('components/design-system/Tree.tsx')
    assert.equal(
      sha256(tree),
      '2ee9e3f4c8687b245ff6b02568c4d5bf157b199973e200397f355f3a6268e1ba',
    )
    for (const fragment of [
      'function wrapChildren(children: ReactNode, respectLast = true)',
      'value={respectLast && index === items.length - 1}',
      'function TreeGroup({ children }: TreeGroupProps)',
      'const isLast = useContext(IsLastChildContext)',
      'return wrapChildren(children, isLast)',
      'Group: TreeGroup',
    ]) {
      assert.ok(tree.includes(fragment), fragment)
    }

    const ts = await loadTypeScript()
    const wrap = functionSource(tree, 'wrapChildren')
    const javascript = ts.transpileModule(
      `type ReactNode = any;\n` +
        `const Children = { toArray: (value: any) => Array.from(value) };\n` +
        `const IsLastChildContext = { Provider: 'last-provider' };\n` +
        `const React = { createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }) };\n` +
        `${wrap}\nexport { wrapChildren };`,
      {
        compilerOptions: {
          jsx: ts.JsxEmit.React,
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const module = { exports: {} }
    new Function('exports', 'module', javascript)(module.exports, module)
    const wrapChildren = module.exports.wrapChildren

    assert.deepEqual(
      wrapChildren(['first', 'last'], true).map(item => item.props.value),
      [false, true],
    )
    assert.deepEqual(
      wrapChildren(['first', 'last'], false).map(item => item.props.value),
      [false, false],
    )
  },
)
