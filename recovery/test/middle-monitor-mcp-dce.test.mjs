import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { parse } from 'acorn'

const cases = [
  {
    version: '2.1.98',
    environment: 'CLAUDE_CODE_2_1_98_BUNDLE',
    bundleSha256:
      '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556',
    structural: {
      targetIndex: 15092,
      start: 11173997,
      end: 11174056,
      sourceHash:
        'f02414a68e9f005569238a43c9e6aedd50e987478b1e37c267471b1286c01820',
    },
    declaration:
      'var _4,XgK=null,AO7=null,Nn8,MgK,PgK,gmY=null,En8,WgK=null;',
    moduleHandle: 'WgK',
    killHandle: 'En8',
    branch: 'case"monitor_mcp":if(!WgK)return null;',
  },
  {
    version: '2.1.105',
    environment: 'CLAUDE_CODE_2_1_105_BUNDLE',
    bundleSha256:
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    structural: {
      targetIndex: 15316,
      start: 11282877,
      end: 11282936,
      sourceHash:
        '7f6b0068d38d3b98a178f72b5a5ca74a57d743a38de7f678e4b4e59b0a89c99f',
    },
    declaration:
      'var H4,ecK=null,w$7=null,Ko8,qlK,KlK,IdY=null,_o8,_lK=null;',
    moduleHandle: '_lK',
    killHandle: '_o8',
    branch: 'case"monitor_mcp":if(!_lK)return null;',
  },
]

for (const target of cases) {
  const filename = process.env[target.environment]
  test(
    `${target.version} MonitorMcp is statically null and dominated by a null-return gate`,
    { skip: filename ? false : `${target.environment} not provided` },
    () => {
      const bytes = fs.readFileSync(filename)
      assert.equal(
        crypto.createHash('sha256').update(bytes).digest('hex'),
        target.bundleSha256,
      )
      const bundle = bytes.toString('utf8')
      const declarationAt = bundle.indexOf(target.declaration)
      assert.notEqual(declarationAt, -1, 'exact static declaration is missing')
      assert.equal(
        declarationAt,
        target.structural.start,
        'static declaration must start at the pinned structural-unit boundary',
      )
      assert.equal(
        declarationAt + target.declaration.length,
        target.structural.end,
        'static declaration must end at the pinned structural-unit boundary',
      )
      assert.equal(
        crypto
          .createHash('sha256')
          .update(target.declaration)
          .digest('hex'),
        target.structural.sourceHash,
      )

      const ast = parse(target.declaration, {
        ecmaVersion: 'latest',
        sourceType: 'module',
      })
      const statement = ast.body[0]
      assert.equal(statement.type, 'VariableDeclaration')
      const declarations = new Map(
        statement.declarations.map(item => [item.id.name, item.init]),
      )
      const moduleInitializer = declarations.get(target.moduleHandle)
      assert.equal(moduleInitializer.type, 'Literal')
      assert.equal(moduleInitializer.value, null)
      assert.equal(
        declarations.get(target.killHandle),
        null,
        'kill callback stays statically uninitialized',
      )

      const branchAt = bundle.indexOf(target.branch)
      assert.notEqual(branchAt, -1, 'monitor_mcp null-return branch is missing')
      const renderAt = bundle.indexOf(
        `createElement(${target.moduleHandle},`,
        branchAt,
      )
      assert.ok(renderAt > branchAt, 'render must follow the null-return gate')
      assert.ok(
        renderAt - branchAt < 180,
        'render is not dominated by the adjacent null-return gate',
      )
    },
  )
}
