import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { regular } from './cli.mjs';
import { inspectSource, alignInventories, VERSION } from './diagnostics.mjs';
import { strictAstInventory, strictAstDigest } from '../v12/validation/lib/strict-ast.mjs';
const ROOT = path.dirname(fileURLToPath(import.meta.url)), sha = data => crypto.createHash('sha256').update(data).digest('hex');
const groups = [], test = (name, fn) => { fn(); groups.push({ name, passed: true }); };
const inspect = (source, options) => inspectSource(source, options), shape = source => inspect(source).diagnosticShape.sha256;
const sameShape = (a, b) => assert.equal(shape(a), shape(b)), differentShape = (a, b) => assert.notEqual(shape(a), shape(b));
const fixtures = [
  '', '#!/usr/bin/env node\nconst a=1;', 'const a=1;export {a};', 'export { a as b } from "dep";', 'export * as api from "dep";',
  '"use strict"; foo(); "later";', '0;"use strict";', 'function f(){"use strict";return 1}',
  'const {foo = source} = input; sink({foo});', 'class A { #x=1; get x(){return this.#x} static #y; check(o){return #x in o} }',
  'import {foo, bar as baz} from "dep" with {type:"json"}; export {foo,baz as alias};',
  'tag`\\u0061`; const x=0x1, y=1n, z=/a+/gi;', 'const a="😀";a?.x;',
  'outer:for(;;){if(a)break outer;continue outer}', 'function f(){return new.target};import.meta.url;'
];
test('strict whole and statement digests match the unchanged strict helper', () => {
  for (const source of fixtures) {
    const expected = strictAstInventory(source), actual = inspect(source);
    assert.deepEqual(actual.strictAst, expected.strictAst);
    assert.equal(actual.statements.length, expected.statements.length);
    for (const [i, row] of actual.statements.entries()) { const e = expected.statements[i]; assert.equal(row.strictSha256, e.sha256); assert.equal(row.nodes + 1, e.nodes); assert.deepEqual(row.range, e.range); assert.equal(row.type, e.type); }
    assert.equal(actual.statements.reduce((sum, row) => sum + row.nodes, 1), actual.strictAst.nodes);
  }
});
test('valid local export keeps complete Program validation; undeclared export refuses', () => {
  const a=inspect('const value=1;export {value};'); assert.equal(a.statements[1].type,'ExportNamedDeclaration');
  assert.throws(()=>strictAstDigest('export {value};')); assert.throws(()=>inspect('export {value};'));
});
test('non-prologue string retains original directive context', () => {
  const a=inspect('0;"use strict";'); assert.notEqual(a.statements[1].strictSha256,strictAstDigest('"use strict";').sha256);
  assert.equal(inspect('"use strict";0;').statements[0].strictSha256,strictAstDigest('"use strict";').sha256);
});
test('ordinary/free/cross-statement names can share diagnostic shape only', () => {
  sameShape('const a=freeA;callA(a);','const b=freeB;callB(b);');
  sameShape('let a=1,b=2;use(a);','let x=1,y=2;use(y);');
  assert.notEqual(inspect('let a=1,b=2;use(a);').strictAst.sha256,inspect('let x=1,y=2;use(y);').strictAst.sha256);
});
test('runtime member/property/method keys and computed fields remain significant', () => {
  differentShape('obj.first','obj.second'); differentShape('({first:value})','({second:value})');
  sameShape('({key:first})','({key:second})'); differentShape('obj.key','obj[key]');
  differentShape('class A{first(){}}','class A{second(){}}'); differentShape('class A{static x=1}','class A{x=1}');
});
test('shorthand shared physical token is protected in both AST positions', () => {
  differentShape('sink({x})','sink({y})'); const r=inspect('sink({x})'); assert.equal(r.diagnosticShape.protectedIdentifierOccurrences,2); assert.equal(r.diagnosticShape.identifierNamesErased,1);
  const d=inspect('const {x=defaultValue}=input;'); assert.equal(d.diagnosticShape.protectedIdentifierOccurrences,2);
});
test('import/export runtime names and shared specifier tokens remain significant', () => {
  differentShape('import {x} from "m"','import {y} from "m"');
  sameShape('import {x as first} from "m"','import {x as second} from "m"');
  differentShape('const x=1;export {x}','const y=1;export {y}');
  sameShape('const x=1;export {x as api}','const y=1;export {y as api}');
  assert.equal(inspect('import {x} from "m"').diagnosticShape.protectedIdentifierOccurrences,2);
  differentShape('export * as api from "m"','export * as other from "m"');
});
test('private names preserve declarations, uses and nested owners', () => {
  differentShape('class A{#x;f(o){return #x in o}}','class B{#y;f(o){return #y in o}}');
  differentShape('class A{#x;f(){return class B{g(o){return o.#x}}}}','class A{#y;f(){return class B{g(o){return o.#y}}}}');
});
test('template raw text is significant while ordinary literal spelling follows strict AST', () => {
  differentShape('tag`\\u0061`','tag`a`'); assert.notEqual(inspect('tag`\\u0061`').strictAst.sha256,inspect('tag`a`').strictAst.sha256);
  assert.equal(inspect('const a=0x1').strictAst.sha256,inspect('const a=1').strictAst.sha256);
  assert.equal(inspect('const a="a"').strictAst.sha256,inspect("const a='a'").strictAst.sha256);
});
test('operators, optional calls, labels, regex, bigint and directive fields remain significant', () => {
  for (const [a,b] of [['a+b','a-b'],['obj?.x','obj.x'],['f?.()','f()'],['one:while(a){break one}','two:while(a){break two}'],['/a/g','/b/g'],['1n','2n'],['"use strict";','"use asm";']]) differentShape(a,b);
});
test('UTF16 ranges preserve astral characters and BOM bytes', () => {
  const source='\uFEFFconst a="😀";\nnext(a);',a=inspect(source);assert.equal(a.source.bytes,Buffer.byteLength(source));assert.equal(a.source.utf16Length,source.length);assert.equal(source.slice(...a.statements[1].range),'next(a);');
});
test('empty/malformed/bounded inputs fail closed appropriately', () => {
  assert.equal(inspect('').strictAst.nodes,1);assert.equal(inspect('').statements.length,0);
  for (const source of ['return 1','await ;','const =','class A{f(){return this.#unknown}}']) assert.throws(()=>inspect(source));
  assert.throws(()=>inspect('let a=1',{maxNodes:2}),/node budget/);assert.throws(()=>inspect('😀',{maxSourceBytes:1}),/byte budget/);
  assert.throws(()=>inspect('const x="'+String.fromCharCode(0xd800)+'"'),/UTF-8/);assert.throws(()=>inspect('0',{max_nodes:1}),/unknown/);
  assert.throws(()=>inspect('0',{maxNodes:0}));assert.throws(()=>inspect('0',{maxSourceBytes:33554433}));
});
test('diagnostic alignment exposes duplicate gaps and moves without accepting semantics', () => {
  const a=inspect('first();second();third();'),b=inspect('second();first();third();');
  const exact=alignInventories(a,b,'strictSha256');assert.equal(exact.semanticAcceptance,false);assert.equal(exact.statementSequenceEqual,false);assert(exact.outOfOrderUniqueMatches.length);assert(exact.gaps.length);
  const erased=alignInventories(a,b);assert.equal(erased.statementSequenceEqual,true);assert.equal(erased.semanticAcceptance,false);assert.equal(erased.anchors.length,0);
  assert.throws(()=>alignInventories(a,b,'invalid'));assert.throws(()=>alignInventories({...a,version:'old'},b));
});
test('regular-file open is nonblocking and closes changed/FIFO/failing descriptors',()=>{
  const stat={dev:1n,ino:2n,size:4n,mtimeNs:5n,ctimeNs:6n,isFile:()=>true};
  for(const mode of ['fifo','changed','fstat-throws','oversized']){
    const closed=[],api={lstatSync:()=>stat,realpathSync:p=>p,openSync:(p,flags)=>{assert(flags&fs.constants.O_NONBLOCK);assert(flags&fs.constants.O_NOFOLLOW);return 77},fstatSync:()=>{if(mode==='fstat-throws')throw new Error('injected fstat failure');return {...stat,...(mode==='fifo'?{isFile:()=>false}:mode==='changed'?{ino:9n}:{size:99n})}},closeSync:fd=>closed.push(fd)};
    assert.throws(()=>regular(path.join(ROOT,'authored-race-fixture'),4,true,api));assert.deepEqual(closed,[77]);
  }
});
const TMP = fs.mkdtempSync(path.join(ROOT,'tiny-test-')), input=path.join(TMP,'input.js'), output=path.join(TMP,'output.json'), pinsPath=path.join(ROOT,'tool-pins.json'), pinBytes=fs.readFileSync(pinsPath), expectedPins=sha(pinBytes);
const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_PATH;delete env.BUN_OPTIONS;
const invoke=(changes={},extra=[])=>{
  const values={'--input':input,'--input-sha256':sha(fs.readFileSync(input)),'--output':output,'--tool-pins':pinsPath,'--tool-pins-sha256':expectedPins,...changes};
  return spawnSync(process.execPath,['--max-old-space-size=128',path.join(ROOT,'cli.mjs'),'inspect',...Object.entries(values).flat(),...extra],{env,encoding:'utf8',maxBuffer:8192});
};
fs.writeFileSync(input,'\uFEFFconst x="😀";process.exit(17);export {x};');
test('CLI pins source before/after, preserves BOM and writes/audits one exclusive artifact',()=>{
  const r=invoke();assert.equal(r.status,0,r.stderr);const receipt=JSON.parse(r.stdout),b=fs.readFileSync(output),j=JSON.parse(b);assert.equal(sha(b),receipt.sha256);assert.equal(j.source.sha256,sha(fs.readFileSync(input)));assert.equal(j.io.sourceBeforeSha256,j.io.sourceAfterSha256);assert.equal(j.io.inputsExecuted,false);assert.equal(j.parser.wholeProgramParses,1);
});
test('CLI refuses existing output and input/output hard aliases',()=>{
  const original=fs.readFileSync(output);assert.notEqual(invoke().status,0);assert.deepEqual(fs.readFileSync(output),original);
  const alias=path.join(TMP,'hard.js');fs.linkSync(input,alias);assert.notEqual(invoke({'--output':alias}).status,0);assert.notEqual(invoke({'--output':input}).status,0);
});
test('CLI refuses wrong or truncated source, invalid UTF8, syntax errors and budgets before output',()=>{
  const bad=path.join(TMP,'bad.js');
  for(const [data,changes]of [[Buffer.from('0'),{'--input-sha256':'0'.repeat(64)}],[Buffer.from([0xff]),{}],[Buffer.from('export {missing}'),{}],[Buffer.from('const x=1'),{'--max-nodes':'2'}],[Buffer.from('const x=1'),{'--max-bytes':'2'}]]){
    fs.writeFileSync(bad,data);const out=path.join(TMP,crypto.randomUUID()+'.json');const r=invoke({'--input':bad,'--input-sha256':sha(data),'--output':out,...changes});assert.notEqual(r.status,0);assert(!fs.existsSync(out));assert(r.stderr.length<1000);
  }
  const hash=sha(fs.readFileSync(input));fs.writeFileSync(bad,'0');assert.notEqual(invoke({'--input':bad,'--input-sha256':hash,'--output':path.join(TMP,'truncated.json')}).status,0);
});
test('CLI refuses missing/tampered/incomplete tool inventories before importing core',()=>{
  const badPins=path.join(TMP,'bad-pins.json'),j=JSON.parse(pinBytes);j.files=j.files.filter(r=>!r.path.endsWith('/diagnostics.mjs'));const b=Buffer.from(JSON.stringify(j));fs.writeFileSync(badPins,b);
  for(const changes of [{'--tool-pins-sha256':'0'.repeat(64)},{'--tool-pins':badPins,'--tool-pins-sha256':sha(b)}]){const out=path.join(TMP,crypto.randomUUID()+'.json');assert.notEqual(invoke({'--output':out,...changes}).status,0);assert(!fs.existsSync(out))}
  const tampered=JSON.parse(pinBytes);tampered.files[0].sha256='0'.repeat(64);const tb=Buffer.from(JSON.stringify(tampered));fs.writeFileSync(badPins,tb);assert.notEqual(invoke({'--output':path.join(TMP,'tamper.json'),'--tool-pins':badPins,'--tool-pins-sha256':sha(tb)}).status,0);
});
test('CLI rejects leaf source symlink and aliased output ancestors',()=>{
  const leaf=path.join(TMP,'source-link.js');fs.symlinkSync(input,leaf);assert.notEqual(invoke({'--input':leaf,'--output':path.join(TMP,'leaf.json')}).status,0);
  const outDir=path.join(TMP,'out');fs.mkdirSync(outDir);const link=path.join(TMP,'out-link');fs.symlinkSync(outDir,link);assert.notEqual(invoke({'--output':path.join(link,'new.json')}).status,0);assert(!fs.existsSync(path.join(outDir,'new.json')));
});
test('CLI refuses imported-code ancestor aliases and pin-file aliases',()=>{
  const alias=path.join(TMP,'tool-alias');fs.symlinkSync(ROOT,alias);
  const forged=JSON.parse(pinBytes),member=forged.files.find(r=>r.path===path.join(ROOT,'diagnostics.mjs'));
  forged.files.push({...member,path:path.join(alias,'diagnostics.mjs')});
  const data=Buffer.from(JSON.stringify(forged)),file=path.join(TMP,'alias-pins.json');fs.writeFileSync(file,data);
  const out=path.join(TMP,'alias-tool.json'),r=invoke({'--output':out,'--tool-pins':file,'--tool-pins-sha256':sha(data)});assert.notEqual(r.status,0);assert(r.stderr.includes('ancestor alias'));assert(!fs.existsSync(out));
  assert.notEqual(invoke({'--output':path.join(TMP,'alias-inventory.json'),'--tool-pins':path.join(alias,'tool-pins.json')}).status,0);
});
test('CLI rejects inherited preload environment and malformed/repeated options',()=>{
  const dirty=spawnSync(process.execPath,['--max-old-space-size=128',path.join(ROOT,'cli.mjs'),'inspect'],{env:{...env,NODE_PATH:'/fixture-untrusted'},encoding:'utf8'});assert.notEqual(dirty.status,0);
  assert.notEqual(invoke({'--output':path.join(TMP,'repeat.json')},['--input',input]).status,0);assert.notEqual(invoke({'--max-nodes':'1.5','--output':path.join(TMP,'fraction.json')}).status,0);
});
const result={version:VERSION,groups,allPassed:true,fullAppIndexed:false,inputsExecuted:false,temporaryFixtureDirectory:TMP};
const serialized=JSON.stringify(result,null,2)+'\n';fs.writeFileSync(path.join(TMP,'test-receipt.json'),serialized,{flag:'wx'});console.log(JSON.stringify({groups:groups.length,passed:true,receipt:path.join(TMP,'test-receipt.json')}));
