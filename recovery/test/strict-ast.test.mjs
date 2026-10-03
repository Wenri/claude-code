import assert from 'node:assert/strict'
import { test } from 'node:test'
import { strictAstDigest, strictAstInventory } from '../lib/strict-ast.mjs'
const digest = source => strictAstDigest(source).sha256
test('strict AST ignores positions, comments and equivalent literal spellings', () => {
  assert.equal(digest('const x = 0x10; // comment\n'), digest('const x=16;'))
})
test('strict AST preserves behavior-bearing syntax and names', () => {
  for (const [left, right] of [
    ['parseInt("1.2");', 'parseFloat("1.2");'],
    ['function f(){return\n1}', 'function f(){return 1}'],
    ['const a=1; JSON.stringify({a});', 'const b=1; JSON.stringify({b});'],
    ['let a=1; eval("a")', 'let b=1; eval("a")'],
    ['f();g();', 'g();f();'],
    ['const r=/a/g;', 'const r=/a/i;'],
    ['const n=1n;', 'const n=2n;'],
    ['const x=a+b;', 'const x=a-b;'],
    ['function f(){using x=acquire();return x}', 'function f(){const x=acquire();return x}'],
    ['String.raw`\\n`', 'String.raw`\n`'],
  ]) assert.notEqual(digest(left), digest(right), `${left} must differ from ${right}`)
})

test('whole-program digests retain pre-refactor fingerprints and metadata exactly', () => {
  // Captured from unchanged strict-ast.mjs at cloud v1 HEAD 78038b20e4c0.
  for (const [source, nodes, sha256] of [
    ['', 1, 'd0396159643965898857f5ec2cd61413f701d06350830915075105a72cc8d11c'],
    ['const x = 0x10; // comment\n', 5, '71e91ef1b886234440706bc1078b634f7f4fe3655dea40b89fa3706864e586b2'],
    ['const f=()=>1;export {f};', 10, 'd479fa4149335224d7248e11abb80622e2d016eaf3e6cef7c9089942f363afbf'],
    ['import {x as y} from "dep";export {y as z};', 10, '36f31b18f9129ace29e6d71b214917e8cbc55962ba55dfb42e5a7ee8cee20d96'],
    ['export {x as y} from "dep";', 6, '66da5b7dc983ab75d9ec5fa517f357a4c0266c1834f6150be80c9e492cbfcd2b'],
    ['"use strict"; const r=/a/g; const n=1n;', 11, '0b7e404287c58946c5f253acc22d5407cf4a69b20760a2341fb746ae11ec5053'],
    ['String.raw`\\n`', 8, '7b62200df3cf304eb0628502fd1be28aee2cef75b651a76d9e1a36ebc6234c4b'],
    ['function f(){using x=acquire();return x}', 11, '54be12bed3c5194f8e973fccb82925e1572e21980a0a3a8043801774edcd7244'],
  ]) {
    const expected = { criterion: 'strict-whole-program-ast-v2', parser: 'acorn@8.15.0', ecmaVersion: 2026, nodes, sha256 }
    assert.deepEqual(strictAstDigest(source), expected)
    assert.deepEqual(strictAstInventory(source).strictAst, expected)
  }
})

test('contextual inventory hashes valid local exports after complete-program validation', () => {
  const declared = strictAstInventory('const f=()=>1;export {f};')
  const imported = strictAstInventory('import {f} from "dep";export {f};')
  const forward = strictAstInventory('export {f};const f=()=>1;')
  assert.equal(declared.statements.length, 2)
  assert.equal(declared.statements[1].type, 'ExportNamedDeclaration')
  assert.equal(declared.statements[1].sha256, imported.statements[1].sha256)
  assert.equal(declared.statements[1].sha256, forward.statements[0].sha256)
  assert.equal(declared.statements[1].nodes, 5)
  assert.notEqual(declared.statements[1].sha256, strictAstInventory('const f=1;export {f as renamed};').statements[1].sha256)
  assert.throws(() => strictAstDigest('export {f};'), /Export 'f' is not defined/)
})

test('contextual inventory supports imports, direct export declarations and reexports', () => {
  for (const source of [
    'import {x as y} from "dep";export {y as z};',
    'export const x=1;export default x;',
    'export {x as y} from "dep";export * from "other";export * as ns from "third";',
  ]) {
    const inventory = strictAstInventory(source)
    assert.deepEqual(inventory.strictAst, strictAstDigest(source))
    for (const [index, node] of inventory.ast.body.entries()) {
      assert.deepEqual(inventory.statements[index].range, [node.start, node.end])
      if (node.type !== 'ExportNamedDeclaration' || node.source || node.declaration) {
        assert.equal(inventory.statements[index].sha256, strictAstDigest(source.slice(node.start, node.end)).sha256)
      }
    }
  }
})

test('both strict APIs still reject genuinely invalid modules and undeclared exports', () => {
  for (const source of [
    'export {missing};',
    'const f=1;export {missing};',
    'import {x as y} from "dep";export {x};',
    'const f=1;export {f};export {f};',
    'const f=;',
  ]) for (const inspect of [strictAstDigest, strictAstInventory]) assert.throws(() => inspect(source), SyntaxError)
})

test('contextual statement hashes preserve actual directive context rather than reparsing snippets', () => {
  const inventory = strictAstInventory('f();"not a directive";')
  assert.equal(Object.hasOwn(inventory.ast.body[1], 'directive'), false)
  assert.notEqual(inventory.statements[1].sha256, strictAstDigest('"not a directive";').sha256)
  const directive = strictAstInventory('"use strict";f();')
  assert.equal(directive.statements[0].sha256, strictAstDigest('"use strict";').sha256)
})
