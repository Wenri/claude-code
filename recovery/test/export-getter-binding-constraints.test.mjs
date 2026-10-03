import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { parse } from 'acorn'
import { analyze } from 'eslint-scope'
import * as constraints from '../lib/binding-name-constraints.mjs'
import * as conflicts from '../lib/constraint-conflicts.mjs'
import { deriveAnchoredExportGetterConstraints } from '../lib/export-getter-constraints.mjs'
import { verifyBindingGraph } from '../lib/binding-graph.mjs'
import { strictAstDigest } from '../lib/strict-ast.mjs'

function index(text) {
  const ast = parse(text, { ecmaVersion: 2026, sourceType: 'module', ranges: true })
  const scope = analyze(ast, { ecmaVersion: 2024, sourceType: 'module', optimistic: true, ignoreEval: true })
  const variables = scope.scopes.flatMap(scope => scope.variables.map(v => ({ v, scope })))
  const bindingAt = constraints.indexBindingIdentifiers(variables), parent = new Map(), functions = []
  const pending = [ast]
  while (pending.length) {
    const node = pending.pop()
    if (node.type === 'FunctionDeclaration') functions.push(node)
    for (const [key, value] of Object.entries(node)) if (!['range', 'loc'].includes(key) && value && typeof value === 'object') {
      for (const child of Array.isArray(value) ? value : [value]) if (child?.type) { parent.set(child, node); pending.push(child) }
    }
  }
  return { text, ast, scope, variables, bindingAt, parent, functions,
    exportGetters: constraints.indexExportGetterStatements({ program: ast, bindingAt }),
    runtimeNames: constraints.collectRuntimeNameIdentifiers(ast) }
}
const row = (data, name) => data.variables.find(row => row.v.name === name && row.scope.type === 'module')
const anchor = (left, right, a = 'a', b = 'b') => ({ old: row(left, a), row: row(right, b), key: `fixture/${a}.js:1:0`, basis: 'unique-source-declaration-position', from: b, to: a })
function derive(left, right, anchors = [anchor(left, right)], source = anchors) {
  return deriveAnchoredExportGetterConstraints({ left, right, anchorSnapshot: anchors,
    sourceAnchors: new Map(source.map(a => [a.row, a.old])), sourceAnchorsReverse: new Map(source.map(a => [a.old, a.row])) })
}
function emit(right, pairs) {
  const edits = new Map()
  for (const pair of pairs) if (pair.left.v.name !== pair.right.v.name) {
    for (const n of [...pair.right.v.identifiers, ...pair.right.v.references.map(r => r.identifier)]) {
      const edit = { start: n.start, end: n.end, text: pair.left.v.name }
      assert(!edits.has(n.start) || edits.get(n.start).text === edit.text); edits.set(n.start, edit)
    }
  }
  const ordered = [...edits.values()].sort((a, b) => a.start - b.start)
  let renamedSource = right.text
  for (const edit of [...ordered].reverse()) renamedSource = renamedSource.slice(0, edit.start) + edit.text + renamedSource.slice(edit.end)
  return { originalSource: right.text, renamedSource, edits: ordered }
}
const leftBase = 'var h,n,a,c;h(n,{First:()=>a,Second:()=>c});'
const rightBase = 'var j,m,b,d;j(m,{First:()=>b,Second:()=>d});'

test('independent unique getter roles derive the ENTIRE statement with provenance', () => {
  const left = index(leftBase), right = index(rightBase), result = derive(left, right)
  assert.equal(result.stats.completeShapeAccepted, 1)
  assert.deepEqual(result.proposed.map(p => [p.left.v.name, p.right.v.name]).sort(), [['h','j'],['n','m'],['a','b'],['c','d']].sort())
  assert(result.proposed.every(p => p.atomicGroup && p.group.semanticEquivalenceEstablished === false))
  const fragment = result.fragments[0]
  assert.deepEqual(fragment.baselineRange, [12, leftBase.length])
  assert.equal(fragment.anchors[0].origin, 'fixture/a.js:1:0')
  assert.equal(fragment.anchors[0].baselineExportedKey, 'First')
  const emitted = emit(right, result.proposed)
  assert.equal(verifyBindingGraph(emitted).status, 'static-binding-graph-preserved')
  assert.equal(strictAstDigest(left.text).sha256, strictAstDigest(emitted.renamedSource).sha256)
  assert.equal(derive(left, right, []).proposed.length, 0)
})

test('count all eligible getter occurrences before any shape filtering on either side', () => {
  for (const [a, b] of [
    [leftBase + 'h(n,{Unrelated:()=>a});', rightBase],
    [leftBase, rightBase + 'j(m,{Unrelated:()=>b});'],
    ['var h,n,a,c;h(n,{First:()=>a,Second:()=>a});', rightBase],
    [leftBase, 'var j,m,b,d;j(m,{First:()=>b,Second:()=>b});'],
  ]) {
    const result = derive(index(a), index(b))
    assert.equal(result.stats.ambiguousGetterAnchors, 1)
    assert.equal(result.stats.completeShapeAccepted, 0)
    assert.equal(result.proposed.length, 0)
    assert.equal(result.selectorRejections[0].outcome, 'ambiguous-getter-role')
  }
})

test('independent anchors must agree on a reciprocal statement pair', () => {
  const left = index('var h,n,a,c;h(n,{First:()=>a});h(n,{Second:()=>c});')
  const right = index(rightBase)
  const result = derive(left, right, [anchor(left,right), anchor(left,right,'c','d')])
  assert.equal(result.stats.statementPairConflicts, 2)
  assert.equal(result.proposed.length, 0)
  assert(result.fragments.every(f => f.outcome === 'nonreciprocal-statement-correspondence'))
})

test('source conflicts, swapped getters and reuse reject the whole expression group', () => {
  const left = index(leftBase), right = index(rightBase)
  for (const anchors of [
    [anchor(left,right),anchor(left,right,'c','b')],
    [anchor(left,right),anchor(left,right,'a','d')],
    [anchor(left,right,'a','d'),anchor(left,right,'c','b')],
    [anchor(left,right),anchor(left,right,'h','m')],
  ]) assert.equal(derive(left,right,anchors).proposed.length, 0)
  const a = anchor(left,right), conflict = anchor(left,right,'h','m')
  assert.throws(() => derive(left,right,[a,conflict],[a]), /Late conflict with a derived naming hypothesis/)
})

test('aggregate conflicts reject all expression pairs without choosing a traversal winner', () => {
  const left = index(leftBase + 'var other;'), right = index(rightBase)
  const result = derive(left,right), group = result.proposed[0].group
  const extra = { left: row(left,'other'), right: row(right,'j'), group: {}, kind: 'function' }
  for (const proposed of [[...result.proposed,extra],[extra,...result.proposed]]) {
    const forwardConstraints = new Map(), reverseConstraints = new Map()
    for (const p of proposed) {
      const f = forwardConstraints.get(p.right) ?? new Set(), r = reverseConstraints.get(p.left) ?? new Set()
      f.add(p.left); r.add(p.right); forwardConstraints.set(p.right,f); reverseConstraints.set(p.left,r)
    }
    const blocked = conflicts.conflictingAtomicConstraintGroups({ proposed,forwardConstraints,reverseConstraints })
    assert(blocked.has(group))
    assert.equal(proposed.filter(p => p.group === group && !blocked.has(p.group)).length,0)
  }
})

test('strict narrow eligibility rejects altered call, getter and property syntax', () => {
  const left = index('var h,n,a;h(n,{First:()=>a});')
  for (const statement of [
    'j(m,{First:()=>b},0);', 'j(m);', 'j(m,{First:()=>b,...extra});',
    'j(m,{First:()=>b,First:()=>b});', 'j(m,{First:()=>b,"First":()=>b});',
    'j(m,{1:()=>b,"1":()=>b});',
    'j(m,{["First"]:()=>b});', 'j(m,{b});', 'j(m,{First(){return b}});',
    'j(m,{get First(){return b}});', 'j(m,{First:async()=>b});',
    'j(m,{First:()=>{return b}});', 'j(m,{First:x=>b});',
    'j(m,{First:()=>b()});', 'j(m,{First:()=>(b,b)});',
    'j?.(m,{First:()=>b});', 'obj.j(m,{First:()=>b});',
    '(j(m,{First:()=>b}),0);', 'j(m,{First:()=>b})();',
    'j(m,{First:()=>missing});', '{j(m,{First:()=>b})}',
    'function wrap(){j(m,{First:()=>b})}',
  ]) {
    const right = index('var j,m,b;' + statement), result = derive(left,right)
    assert.equal(result.proposed.length,0,statement)
    assert.equal(right.exportGetters.statements.length,0,statement)
  }
  const right = index('var j,m,b;j(m,{Other:()=>b});')
  assert.equal(derive(left,right).stats.completeShapeRejected,1)
  const node = right.ast.body[1]
  assert.equal(constraints.inspectExportGetterStatement({program:right.ast,node:{...node},bindingAt:right.bindingAt}),null)
  assert.equal(constraints.deriveExportGetterBindingConstraints({leftProgram:left.ast,rightProgram:right.ast,leftNode:left.ast.body[1],rightNode:{...node},leftBindingAt:left.bindingAt,rightBindingAt:right.bindingAt,leftRuntimeNames:left.runtimeNames,rightRuntimeNames:right.runtimeNames}).accepted,false)
})

test('complete walk preserves free names, resolution roles, observable key kinds and flags', () => {
  for (const [a,b] of [
    ['var n,a;first(n,{Key:()=>a});','var m,b;other(m,{Key:()=>b});'],
    ['var h,n,a;h(n,{Key:()=>a});','var m,b;h(m,{Key:()=>b});'],
    ['var h,n,a;h(n,{Key:()=>a});','var j,m,b;j(m,{"Key":()=>b});'],
    ['var h,n,a;h(n,{Key:()=>a});','var j,m,b;j(m,{Key:()=>b,Extra:()=>b});'],
    ['var h,n,a;h(n,{Key:()=>a});','var j,m,b,c;j(m,{Key:()=>b,Extra:()=>c});'],
  ]) assert.equal(derive(index(a),index(b)).proposed.length,0)
  const left=index(leftBase),right=index(rightBase)
  right.ast.body[1].expression.arguments[1].properties[0].value.extraFlag=true
  assert.equal(derive(left,right).proposed.length,0)
})

// Exercise the actual aggregate round, later propagation and unchanged emission
// gates without invoking the hash-pinned whole-bundle command.
const comparator=fs.readFileSync(new URL('../scripts/compare-baseline-source-functions.mjs',import.meta.url),'utf8')
const start=comparator.indexOf('const sourcePairCount=pairs.length;'),end=comparator.indexOf("fs.mkdirSync(path.dirname(path.resolve(options['--output']))",start)
assert(start>0&&end>start)
const dependency={...constraints,...conflicts,deriveAnchoredExportGetterConstraints,verifyBindingGraph,parse,console:{log(){}}}
const production=new Function('old','rebuilt','pairs','maxConstraintPasses',...Object.keys(dependency),comparator.slice(start,end)+'\nreturn {pairs,named,bindingGraph,allEdits,constraintPasses,exportGetterFragments};')
function run(left,right,anchors,passes=1){return production(left,right,[...anchors],passes,...Object.values(dependency))}

test('production integration adds subsequent hypotheses only after the accepted snapshot',()=>{
  const left=index('var h,n,a;function utility(q){return q}h(n,{First:()=>a,Utility:()=>utility});')
  const right=index('var j,m,b;function helper(k){return k}j(m,{First:()=>b,Utility:()=>helper});')
  const anchors=[anchor(left,right)]
  const one=run(left,right,anchors,1),two=run(left,right,anchors,2)
  assert(!one.pairs.some(p=>p.from==='k'))
  assert(two.pairs.some(p=>p.from==='k'&&p.to==='q'&&p.constraintDepth===2))
  assert.equal(two.bindingGraph.status,'static-binding-graph-preserved')
  assert.equal(strictAstDigest(left.text).sha256,strictAstDigest(two.named).sha256)
  assert.equal(one.exportGetterFragments[0].outcome,'accepted-naming-hypothesis')
})

test('runtime-name guards, capture preservation, extra helpers and order remain final obligations',()=>{
  const left=index('var h,n,a;h(n,{First:()=>a});')
  const right=index('var j,m,b;j(m,{First:()=>b});export {m};')
  const result=run(left,right,[anchor(left,right)],1)
  assert.match(result.named,/j|h/)
  assert.match(result.named,/\(m,\{/)
  assert.match(result.named,/export \{m\}/)
  const captured=index('var j,m,b;j(m,{First:()=>b});function outside(){let n=0;return m}')
  const raw=derive(left,captured)
  assert.throws(()=>verifyBindingGraph(emit(captured,raw.proposed)),/Static reference binding changed/)
  const safe=run(left,captured,[anchor(left,captured)],1)
  assert.equal(safe.bindingGraph.status,'static-binding-graph-preserved')
  assert.match(safe.named,/__audit_capture_/)
  const movedLeft=index('var h,n,a;before();h(n,{First:()=>a});after();')
  const movedRight=index('var j,m,b;after();j(m,{First:()=>b});before();function unmapped(){return 2}')
  const moved=run(movedLeft,movedRight,[anchor(movedLeft,movedRight)],2)
  assert(moved.named.indexOf('after()')<moved.named.indexOf('before()'))
  assert.match(moved.named,/function unmapped\(\)\{return 2\}/)
  assert.notEqual(strictAstDigest(movedLeft.text).sha256,strictAstDigest(moved.named).sha256)
})

test('actual production aggregate rejects both conflicting complete export groups',()=>{
  const left=index('var h,other,n,n2,a,c;h(n,{First:()=>a});other(n2,{Second:()=>c});')
  const right=index('var j,m,m2,b,d;j(m,{First:()=>b});j(m2,{Second:()=>d});')
  for(const anchors of [[anchor(left,right),anchor(left,right,'c','d')],[anchor(left,right,'c','d'),anchor(left,right)]]){
    const result=run(left,right,anchors,2)
    assert.equal(result.pairs.length,2)
    assert(result.exportGetterFragments.every(f=>f.outcome==='aggregate-binding-conflict'))
    assert.equal(result.constraintPasses[0].exportGetterConstraints.aggregateGroupConflicts,2)
    assert.match(result.named,/j\(m,\{/)
    assert.match(result.named,/j\(m2,\{/)
  }
})

test('production complete-fragment report retains original ranges and final strict outcomes',()=>{
  const left=index('var h,n,a;h(n,{First:()=>a});')
  const right=index('var j,m,b;j(m,{First:()=>b});export {m};')
  const result=run(left,right,[anchor(left,right)],1)
  const from=comparator.indexOf('const exportGetterResults='),to=comparator.indexOf('const wholeProgram=',from)
  const reporter=new Function('old','exportGetterFragments','renamedRange','strictAstDigest','sha','parse','firstDifference',comparator.slice(from,to)+'return exportGetterResults;')
  const renamedRange=(start,end)=>{
    let text=right.text.slice(start,end)
    for(const edit of [...result.allEdits].reverse())if(edit.start>=start&&edit.end<=end)text=text.slice(0,edit.start-start)+edit.text+text.slice(edit.end-start)
    return text
  }
  const differenceSource=comparator.slice(comparator.indexOf('function firstDifference('),comparator.indexOf('const sha='))
  const firstDifference=new Function(differenceSource+'return firstDifference;')()
  const reports=reporter(left,result.exportGetterFragments,renamedRange,strictAstDigest,text=>crypto.createHash('sha256').update(text).digest('hex'),parse,firstDifference)
  assert.equal(reports.length,1)
  assert.deepEqual(reports[0].candidateRange,[right.ast.body[1].start,right.ast.body[1].end])
  assert.equal(reports[0].outcome,'accepted-naming-hypothesis')
  assert.equal(reports[0].strictAstEqual,false) // Observable namespace remains m.
  assert(reports[0].firstDifference)
  assert.equal(reports[0].anchors[0].origin,'fixture/a.js:1:0')
  assert.equal(reports[0].semanticEquivalenceEstablished,false)
})

test('bounded original MCP-D statements derive namespaces while repeated Ma8/nc cannot select',()=>{
  const fixture=JSON.parse(fs.readFileSync(new URL('./export-getter-mcp-D-fixture.json',import.meta.url)))
  assert.equal(fixture.sourceEquivalenceEstablished,false)
  assert(fixture.parsedUtf16Units<18000)
  for(const example of fixture.cases)for(const side of ['baseline','candidate']){
    const value=example[side]
    assert.equal(value.range[1]-value.range[0],value.text.length)
    assert.equal(crypto.createHash('sha256').update(value.text).digest('hex'),value.sha256)
    assert.equal(Buffer.byteLength(value.text),value.bytes)
  }
  function materialize(side){
    const names=new Set(),classes=new Set(side==='baseline'?['az6','C86']:['KY6','I86'])
    for(const example of fixture.cases){
      const call=parse(example[side].text,{ecmaVersion:2026}).body[0].expression
      names.add(call.callee.name);names.add(call.arguments[0].name)
      for(const property of call.arguments[1].properties)names.add(property.value.body.name)
    }
    return index('var '+[...names].filter(name=>!classes.has(name)).join(',')+';'+[...classes].map(name=>'class '+name+'{}').join('')+fixture.cases.map(example=>example[side].text).join(''))
  }
  const left=materialize('baseline'),right=materialize('candidate')
  const anchors=fixture.cases.flatMap(example=>example.sourceAnchors.map(source=>({...anchor(left,right,source.to,source.from),key:source.origin,basis:source.basis,referenceEvidence:source.referenceEvidence})))
  assert.equal(anchors.find(a=>a.to==='dq').referenceEvidence.length,33)
  const result=derive(left,right,anchors)
  assert.equal(result.stats.completeShapeAccepted,3)
  assert.equal(result.fragments.find(f=>f.anchors.some(a=>a.baselineName==='az6')).anchors.length,2)
  for(const name of ['xP6','JB','FP7','nf1'])assert(result.proposed.some(p=>p.left.v.name===name))
  for(const [a,b]of [['Ma8','Za8'],['nc','oc']]){
    assert.equal(left.exportGetters.byBinding.get(row(left,a)).length,2)
    assert.equal(right.exportGetters.byBinding.get(row(right,b)).length,2)
    const ambiguous=derive(left,right,[anchor(left,right,a,b)])
    assert.equal(ambiguous.stats.ambiguousGetterAnchors,1)
    assert.equal(ambiguous.proposed.length,0)
  }
  const emitted=emit(right,result.proposed),after=index(emitted.renamedSource)
  assert.equal(verifyBindingGraph(emitted).status,'static-binding-graph-preserved')
  for(let i=0;i<3;i++){
    const node=after.exportGetters.statements[i].node
    assert.equal(strictAstDigest(fixture.cases[i].baseline.text).sha256,strictAstDigest(after.text.slice(node.start,node.end)).sha256)
  }
})
