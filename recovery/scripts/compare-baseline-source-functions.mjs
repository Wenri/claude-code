#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import zlib from 'node:zlib';import {fileURLToPath} from 'node:url';
import {canonicalSourcePath,indexSourceContents,identicalSourcePaths} from '../lib/source-identity.mjs';
import {verifyBindingGraph} from '../lib/binding-graph.mjs';
import {hasConstraintAnchorConflict,conflictingSharedClassGroups,conflictingAtomicConstraintGroups} from '../lib/constraint-conflicts.mjs';
import {deriveBindingConstraints,deriveDeclarationBindingConstraints,deriveClassBindingConstraints,collectRuntimeNameIdentifiers,indexBindingIdentifiers,indexExportGetterStatements} from '../lib/binding-name-constraints.mjs';
import {parse} from 'acorn';import {analyze} from 'eslint-scope';
import {loadSelectedMappings,originalPositionFor} from '../lib/source-map.mjs';import {strictAstDigest} from '../lib/strict-ast.mjs';
import {namingSummaryPath,assertDistinctDiagnosticPaths,auditWrittenArtifact,declarationPairCoverage,diagnosticDependencyFiles} from '../lib/naming-diagnostic-artifacts.mjs';
import {createUtf16PositionLookup} from '../lib/utf16-source-positions.mjs';
import {deriveSourceBindingSeeds} from '../lib/source-binding-seeds.mjs';
import {deriveAnchoredExportGetterConstraints} from '../lib/export-getter-constraints.mjs';
// Diagnostic only: the independent strict digest remains the equality gate.
function firstDifference(left,right,at='$'){
 if(left===null||right===null||typeof left!=='object'||typeof right!=='object')return Object.is(left,right)?null:{path:at,left,right};
 if(left instanceof RegExp||right instanceof RegExp)return left instanceof RegExp&&right instanceof RegExp&&left.source===right.source&&left.flags===right.flags?null:{path:at,left:String(left),right:String(right)};
 if(Array.isArray(left)||Array.isArray(right)){if(!Array.isArray(left)||!Array.isArray(right)||left.length!==right.length)return{path:at,leftCount:left.length,rightCount:right.length};for(let i=0;i<left.length;i++){const d=firstDifference(left[i],right[i],at+'['+i+']');if(d)return d;}return null;}
 const keys=o=>Object.keys(o).filter(k=>!['start','end','loc','range'].includes(k)&&!(k==='raw'&&o.type==='Literal')).sort(),a=keys(left),b=keys(right);
 if(JSON.stringify(a)!==JSON.stringify(b))return{path:at,leftType:left.type,rightType:right.type,leftFields:a,rightFields:b};
 for(const k of a){const d=firstDifference(left[k],right[k],at+'.'+k);if(d)return d;}return null;
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const toolFiles=[fileURLToPath(import.meta.url),...['source-identity.mjs','source-binding-seeds.mjs','binding-graph.mjs','binding-name-constraints.mjs','export-getter-constraints.mjs','constraint-conflicts.mjs','source-map.mjs','strict-ast.mjs','naming-diagnostic-artifacts.mjs','utf16-source-positions.mjs'].map(n=>fileURLToPath(new URL('../lib/'+n,import.meta.url))),...['package.json','package-lock.json'].map(n=>fileURLToPath(new URL('../'+n,import.meta.url))),...diagnosticDependencyFiles(fileURLToPath(new URL('../node_modules',import.meta.url)))];
const toolPins=Object.fromEntries(toolFiles.map(p=>[path.relative(process.cwd(),p),sha(fs.readFileSync(p))]));
// This emits an actual naming candidate. It is deliberately not an alpha-
// normalized equivalence checker, and it never opens the source-recovery gate.
const options={},baselinePrefixes=['../'],prefixes=[];
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];if(!value||!['--baseline-bundle','--baseline-map','--candidate-bundle','--candidate-map','--output','--report','--source-prefix','--constraint-passes'].includes(key))throw Error('Expected --baseline-bundle, --baseline-map, --candidate-bundle, --candidate-map, --output, --report and optional repeated --source-prefix');if(key==='--source-prefix')prefixes.push(value);else{if(options[key])throw Error('Duplicate option '+key);options[key]=value;}}
for(const key of ['--baseline-bundle','--baseline-map','--candidate-bundle','--candidate-map','--output','--report'])if(!options[key])throw Error('Missing '+key);
const inputFiles=['--baseline-bundle','--baseline-map','--candidate-bundle','--candidate-map'].map(k=>path.resolve(options[k]));
const summaryPath=namingSummaryPath(options['--report']);
assertDistinctDiagnosticPaths([...inputFiles,...toolFiles],[options['--output'],options['--report'],summaryPath]);
const maxConstraintPasses=Number(options['--constraint-passes']??1);if(!Number.isInteger(maxConstraintPasses)||maxConstraintPasses<1||maxConstraintPasses>16)throw Error('--constraint-passes must be an integer from 1 to 16');
const oldMapPath=options['--baseline-map'],newMapPath=options['--candidate-map'];
const {matchingSources,baselineSourceCount,rebuiltSourceCount}=(()=>{
 const oldSources=indexSourceContents(JSON.parse(fs.readFileSync(oldMapPath,'utf8')),baselinePrefixes),newSources=indexSourceContents(JSON.parse(fs.readFileSync(newMapPath,'utf8')),prefixes);
 // Keep the exact hash-and-content identity check, then release source contents.
 return {matchingSources:identicalSourcePaths(oldSources,newSources),baselineSourceCount:oldSources.size,rebuiltSourceCount:newSources.size};
})();
if(sha(fs.readFileSync(oldMapPath))!=='7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657')throw Error('Baseline map mismatch');

function index(jsPath,mapPath,sourcePrefixes){
 const canon=s=>canonicalSourcePath(s,sourcePrefixes);
 const text=fs.readFileSync(jsPath,'utf8'),ast=parse(text,{ecmaVersion:2026,sourceType:'module',allowHashBang:true,ranges:true}),locate=createUtf16PositionLookup(text);
 const scope=analyze(ast,{ecmaVersion:2024,sourceType:'module',optimistic:true,ignoreEval:true});
 const variables=scope.scopes.flatMap(s=>s.variables.map(v=>({v,scope:s}))),lines=new Set(variables.flatMap(({v})=>[...v.identifiers,...v.references.map(r=>r.identifier)].map(n=>locate(n.start).line-1)));
 const mappings=loadSelectedMappings(mapPath,lines),byKey=new Map(),records=[],byReference=new Map();
 const position=n=>{const {line,column}=locate(n.start),rows=mappings.selected.get(line-1);if(!rows)return null;let l=0,h=rows.length;while(l<h){const m=(l+h)>>1;if(rows[m].generatedColumn<=column)l=m+1;else h=m;}const p=rows[l-1];return p?.source===undefined||!matchingSources.has(canon(p.source))?null:p;};
 for(const row of variables){
  const origins=row.v.identifiers.map(n=>{const p=position(n);return p?`${canon(p.source)}:${p.originalLine}:${p.originalColumn}`:null;});
  const key=origins.length&&origins.every(Boolean)?[...new Set(origins)].sort().join('|'):null;
  const refs=[...new Set(row.v.references.map(r=>{const p=position(r.identifier);return p?`${canon(p.source)}:${p.originalLine}:${p.originalColumn}`:null;}).filter(Boolean))];
  const record={...row,key,refs};records.push(record);for(const ref of refs){const group=byReference.get(ref)??[];group.push(record);byReference.set(ref,group);}if(key){const group=byKey.get(key)??[];group.push(record);byKey.set(key,group);}
 }
 // Parent lookups only inspect declarators and their containing declarations.
 const functions=[],parent=new Map();const stack=[ast];while(stack.length){const n=stack.pop();if(n.type==='FunctionDeclaration')functions.push(n);for(const [k,v]of Object.entries(n))if(v&&typeof v==='object'&&!['loc','range'].includes(k)){for(const c of Array.isArray(v)?v:[v])if(c?.type){if(c.type==='VariableDeclarator'||c.type==='VariableDeclaration')parent.set(c,n);stack.push(c);}}}
 const bindingAt=indexBindingIdentifiers(records);
 return {text,ast,scope,variables:records,byKey,byReference,functions,parent,bindingAt,runtimeNames:collectRuntimeNameIdentifiers(ast)};
}
if(sha(fs.readFileSync(options['--baseline-bundle']))!=='75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f')throw Error('Baseline bundle mismatch');
const old=index(options['--baseline-bundle'],options['--baseline-map'],baselinePrefixes);console.log('old indexed',old.variables.length);
const rebuilt=index(options['--candidate-bundle'],options['--candidate-map'],prefixes);console.log('rebuilt indexed',rebuilt.variables.length);
old.exportGetters=indexExportGetterStatements({program:old.ast,bindingAt:old.bindingAt});
rebuilt.exportGetters=indexExportGetterStatements({program:rebuilt.ast,bindingAt:rebuilt.bindingAt});
const {pairs,ambiguous,missing}=deriveSourceBindingSeeds(old,rebuilt);
const sourcePairCount=pairs.length;
const oldFunctionsById=new Map(old.functions.filter(n=>n.id).map(n=>[n.id,n]));
const newFunctionsById=new Map(rebuilt.functions.filter(n=>n.id).map(n=>[n.id,n]));
const sourceAnchors=new Map(pairs.map(p=>[p.row,p.old])),sourceAnchorsReverse=new Map(pairs.map(p=>[p.old,p.row]));
const constraintPasses=[],exportGetterFragments=[],exportGetterSelectorRejections=[];let constraintConverged=false;
for(let pass=0;pass<maxConstraintPasses;pass++){
const beforeCount=pairs.length;const anchorSnapshot=[...pairs];
const established=new Map(anchorSnapshot.map(p=>[p.row,p.old])),establishedReverse=new Map(anchorSnapshot.map(p=>[p.old,p.row]));
function anchorConflicts(result){return hasConstraintAnchorConflict({pairs:result.pairs,established,establishedReverse,sourceAnchors,sourceAnchorsReverse});}

const proposed=[],constraintStats={sourcePairedFunctions:0,derivedPairedFunctions:0,completeShapeAccepted:0,anchorConflicts:0,reciprocalConflicts:0,sharedClassGroupConflicts:0,added:0};
const classConstraintStats={sourcePairedClasses:0,derivedPairedClasses:0,completeShapeAccepted:0,anchorConflicts:0,reciprocalConflicts:0,sharedClassGroupConflicts:0,added:0};
const declarationConstraintStats={sourcePairedTopLevelDeclarators:0,derivedPairedTopLevelDeclarators:0,completeShapeAccepted:0,anchorConflicts:0,reciprocalConflicts:0,sharedClassGroupConflicts:0,added:0};
for(const anchor of anchorSnapshot){
 const left=oldFunctionsById.get(anchor.old.v.identifiers[0]),right=newFunctionsById.get(anchor.row.v.identifiers[0]);if(!left||!right)continue;
 if(sourceAnchors.has(anchor.row))constraintStats.sourcePairedFunctions++;else constraintStats.derivedPairedFunctions++;
 const result=deriveBindingConstraints({leftNode:left,rightNode:right,leftBindingAt:old.bindingAt,rightBindingAt:rebuilt.bindingAt,leftRuntimeNames:old.runtimeNames,rightRuntimeNames:rebuilt.runtimeNames});
 if(!result.accepted)continue;
 if(anchorConflicts(result)){constraintStats.anchorConflicts++;continue;}
 constraintStats.completeShapeAccepted++;
 for(const pair of result.pairs)proposed.push({...pair,group:result,anchor:anchor.key,anchorIdentity:{baselineName:anchor.old.v.name,candidateName:anchor.row.v.name,baselineDeclarationRanges:anchor.old.v.identifiers.map(n=>n.range),candidateDeclarationRanges:anchor.row.v.identifiers.map(n=>n.range)},kind:'function'});
}
const seenConstraintDeclarations=new Set();
for(const anchor of anchorSnapshot){
 const left=anchor.old.v.defs[0]?.node,right=anchor.row.v.defs[0]?.node;
 if(left?.type!=='VariableDeclarator'||right?.type!=='VariableDeclarator')continue;
 const leftDeclaration=old.parent.get(left),rightDeclaration=rebuilt.parent.get(right);
 if(old.parent.get(leftDeclaration)!==old.ast||rebuilt.parent.get(rightDeclaration)!==rebuilt.ast)continue;
 const key=left.start+':'+right.start;if(seenConstraintDeclarations.has(key))continue;seenConstraintDeclarations.add(key);
 if(sourceAnchors.has(anchor.row))declarationConstraintStats.sourcePairedTopLevelDeclarators++;else declarationConstraintStats.derivedPairedTopLevelDeclarators++;
 const result=deriveDeclarationBindingConstraints({leftNode:left,rightNode:right,leftDeclaration,rightDeclaration,leftBindingAt:old.bindingAt,rightBindingAt:rebuilt.bindingAt,leftRuntimeNames:old.runtimeNames,rightRuntimeNames:rebuilt.runtimeNames});
 if(!result.accepted)continue;
 if(anchorConflicts(result)){declarationConstraintStats.anchorConflicts++;continue;}
 declarationConstraintStats.completeShapeAccepted++;
 for(const pair of result.pairs)proposed.push({...pair,group:result,anchor:anchor.key,anchorIdentity:{baselineName:anchor.old.v.name,candidateName:anchor.row.v.name,baselineDeclarationRanges:anchor.old.v.identifiers.map(n=>n.range),candidateDeclarationRanges:anchor.row.v.identifiers.map(n=>n.range)},kind:'declarator'});
}
// Export statements have no declaration anchor of their own. Their selectors
// are unique getter-reference roles from this EXISTING reciprocal snapshot.
const exportGetterRound=deriveAnchoredExportGetterConstraints({left:old,right:rebuilt,anchorSnapshot,sourceAnchors,sourceAnchorsReverse});
const exportGetterConstraintStats=exportGetterRound.stats;
for(const proposal of exportGetterRound.proposed)proposed.push(proposal);
for(const rejection of exportGetterRound.selectorRejections)exportGetterSelectorRejections.push({...rejection,pass:pass+1});
// Keep the diagnostic objects so aggregate rejection updates their outcomes.
for(const fragment of exportGetterRound.fragments)exportGetterFragments.push(Object.assign(fragment,{pass:pass+1}));
// Class seeds come only from existing source/derived binding anchors, never
// statement order or a gap's shape. Both owners can anchor one declaration.
const seenConstraintClasses=new Set();
for(const anchor of anchorSnapshot){
 const left=anchor.old.v.defs[0]?.node,right=anchor.row.v.defs[0]?.node;
 if(left?.type!=='ClassDeclaration'||right?.type!=='ClassDeclaration'||
    !anchor.old.v.identifiers.includes(left.id)||!anchor.row.v.identifiers.includes(right.id))continue;
 const key=left.start+':'+right.start;if(seenConstraintClasses.has(key))continue;seenConstraintClasses.add(key);
 if(sourceAnchors.has(anchor.row))classConstraintStats.sourcePairedClasses++;else classConstraintStats.derivedPairedClasses++;
 const result=deriveClassBindingConstraints({leftNode:left,rightNode:right,leftBindingAt:old.bindingAt,rightBindingAt:rebuilt.bindingAt,leftRuntimeNames:old.runtimeNames,rightRuntimeNames:rebuilt.runtimeNames});
 if(!result.accepted)continue;
 if(anchorConflicts(result)){classConstraintStats.anchorConflicts++;continue;}
 classConstraintStats.completeShapeAccepted++;
 for(const pair of result.pairs)proposed.push({...pair,group:result,anchor:anchor.key,anchorIdentity:{baselineName:anchor.old.v.name,candidateName:anchor.row.v.name,baselineDeclarationRanges:anchor.old.v.identifiers.map(n=>n.range),candidateDeclarationRanges:anchor.row.v.identifiers.map(n=>n.range)},kind:'class'});
}
const statsForKind=kind=>kind==='function'?constraintStats:kind==='class'?classConstraintStats:kind==='export-getter'?exportGetterConstraintStats:declarationConstraintStats;
const forwardConstraints=new Map(),reverseConstraints=new Map();
for(const p of proposed){const l=forwardConstraints.get(p.right)??new Set(),r=reverseConstraints.get(p.left)??new Set();l.add(p.left);r.add(p.right);forwardConstraints.set(p.right,l);reverseConstraints.set(p.left,r);}
const blockedClassGroups=conflictingSharedClassGroups({proposed,forwardConstraints,reverseConstraints});
const blockedAtomicGroups=conflictingAtomicConstraintGroups({proposed,forwardConstraints,reverseConstraints});
for(const group of new Set(exportGetterRound.proposed.map(p=>p.group))){group.fragment.outcome=blockedAtomicGroups.has(group)?'aggregate-binding-conflict':'accepted-naming-hypothesis';if(blockedAtomicGroups.has(group))exportGetterConstraintStats.aggregateGroupConflicts++;}
const seenProposals=new Set(),seenBlockedGroups=new Set();
for(const p of proposed){if(blockedAtomicGroups.has(p.group))continue;if(blockedClassGroups.has(p.group)){if(!seenBlockedGroups.has(p.group)){statsForKind(p.kind).sharedClassGroupConflicts++;seenBlockedGroups.add(p.group);}continue;}if(seenProposals.has(p.right)||established.has(p.right))continue;seenProposals.add(p.right);
 const stats=statsForKind(p.kind);
 if(forwardConstraints.get(p.right).size!==1||reverseConstraints.get(p.left).size!==1){stats.reciprocalConflicts++;continue;}
 pairs.push({row:p.right,old:p.left,from:p.right.v.name,to:p.left.v.name,key:p.right.key,basis:`complete-${p.kind}-ast-binding-constraint-hypothesis`,constraintAnchor:p.anchor,constraintAnchorIdentity:p.anchorIdentity,constraintDepth:pass+1});stats.added++;
}
constraintPasses.push({pass:pass+1,anchorCount:beforeCount,functionConstraints:constraintStats,declarationConstraints:declarationConstraintStats,classConstraints:classConstraintStats,exportGetterConstraints:exportGetterConstraintStats,added:pairs.length-beforeCount});
if(pairs.length===beforeCount){constraintConverged=true;break;}
}
const constraintStats=constraintPasses[0].functionConstraints,declarationConstraintStats=constraintPasses[0].declarationConstraints,classConstraintStats=constraintPasses[0].classConstraints,exportGetterConstraintStats=constraintPasses[0].exportGetterConstraints;
const constraintIteration={maxPasses:maxConstraintPasses,converged:constraintConverged,truncated:!constraintConverged&&constraintPasses.length===maxConstraintPasses,passes:constraintPasses};
const removed=[],captureRepairEvidence=[];
const isUnsafe=row=>[...row.v.identifiers,...row.v.references.map(r=>r.identifier)].some(n=>rebuilt.runtimeNames.has(n));
const unsafe=new Set(rebuilt.variables.filter(r=>!r.v.identifiers.length||isUnsafe(r)).map(r=>r.v));
const byVariable=new Map(pairs.filter(p=>!unsafe.has(p.row.v)).map(p=>[p.row.v,p]));
for(const p of pairs)if(unsafe.has(p.row.v))removed.push({key:p.key,reason:'shorthand-or-shared-token'});
const owners=new Map();for(const row of rebuilt.variables)for(const n of row.v.identifiers){const list=owners.get(n.start)??[];list.push(row);owners.set(n.start,list);}
const rowsByVariable=new Map(rebuilt.variables.map(row=>[row.v,row]));
let changed=true,tempId=0,conflictCount=0,captureRepairs=0;
// All exclusions happen before final collision checks. A skipped import rename
// must never leave its old name colliding with another selected binding.
while(changed){changed=false;
 for(const rows of owners.values())if(rows.length>1){const selected=rows.map(r=>byVariable.get(r.v)).filter(Boolean),targets=new Set(selected.map(p=>p.to));if(targets.size===1&&!rows.some(r=>unsafe.has(r.v))){for(const row of rows)if(!byVariable.has(row.v)){byVariable.set(row.v,{row,from:row.v.name,to:[...targets][0],key:row.key,basis:'shared-declaration-token'});changed=true;}}else if(targets.size>1||selected.length&&rows.some(r=>unsafe.has(r.v))){conflictCount++;for(const row of rows){if(byVariable.delete(row.v))changed=true;unsafe.add(row.v);}}}
 for(const scope of rebuilt.scope.scopes){const names=new Map();for(const v of scope.variables){const name=byVariable.get(v)?.to??v.name;const list=names.get(name)??[];list.push(v);names.set(name,list);}for(const vars of names.values())if(vars.length>1){const matched=vars.filter(v=>byVariable.has(v));if(matched.length===1&&vars.every(v=>!unsafe.has(v))){for(const v of vars)if(!byVariable.has(v)){const row=rowsByVariable.get(v);byVariable.set(v,{row,from:v.name,to:`__audit_unmapped_${tempId++}`,key:row.key,basis:'collision-avoidance-only'});changed=true;}}else for(const v of matched){removed.push({key:byVariable.get(v).key,reason:'scope-name-collision'});byVariable.delete(v);unsafe.add(v);changed=true;}}}
 // A valid parse does not prevent lexical capture. Check every static reference
 // against the complete simultaneous name plan before emitting it.
 const planned=new Map(rebuilt.scope.scopes.map(scope=>[scope,new Map(scope.variables.map(v=>[byVariable.get(v)?.to??v.name,v]))]));
 captureLoop:for(const scope of rebuilt.scope.scopes)for(const ref of scope.references){
  const expected=ref.resolved,name=expected?(byVariable.get(expected)?.to??expected.name):ref.identifier.name;
  let found=null;for(let s=ref.from;s&&!found;s=s.upper)found=planned.get(s)?.get(name)??null;
  if(found===expected)continue;
  captureRepairEvidence.push({referenceRange:ref.identifier.range,referenceName:ref.identifier.name,expectedBinding:expected?.name??null,capturingBinding:found?.name??null,plannedName:name,scopeType:ref.from.type});
  if(found&&!unsafe.has(found)){
   const row=rowsByVariable.get(found);let fresh;do{fresh=`__audit_capture_${tempId++}`;}while(rebuilt.text.includes(fresh));
   byVariable.set(found,{row,from:found.name,to:fresh,key:row.key,basis:'static-capture-avoidance-only'});captureRepairs++;changed=true;
  }else if(expected&&byVariable.has(expected)){
   removed.push({key:byVariable.get(expected).key,reason:'unrepairable-static-capture'});byVariable.delete(expected);unsafe.add(expected);captureRepairs++;changed=true;
  }else throw Error('Cannot preserve original static reference at '+ref.identifier.start);
  break captureLoop;
 }
}
const edits=new Map();for(const p of byVariable.values()){
 if(p.from===p.to)continue;const nodes=[...p.row.v.identifiers,...p.row.v.references.map(r=>r.identifier)];
 for(const n of nodes){if(rebuilt.text.slice(n.start,n.end)!==p.from)throw Error('Identifier mismatch');const prior=edits.get(n.start);if(prior&&prior.text!==p.to)throw Error('Conflicting edits at '+n.start+' '+prior.text+' '+p.to);edits.set(n.start,{start:n.start,end:n.end,text:p.to});}
}
console.log('shared-token conflicts excluded',conflictCount);
const allEdits=[...edits.values()].sort((a,b)=>a.start-b.start);let named='',cursor=0;for(const e of allEdits){if(e.start<cursor)throw Error('Overlap');named+=rebuilt.text.slice(cursor,e.start)+e.text;cursor=e.end;}named+=rebuilt.text.slice(cursor);
try{parse(named,{ecmaVersion:2026,sourceType:'module',allowHashBang:true});}catch(e){throw Error('Naming candidate does not parse: '+e);}
const bindingGraph=verifyBindingGraph({originalSource:rebuilt.text,renamedSource:named,edits:allEdits});
fs.mkdirSync(path.dirname(path.resolve(options['--output'])),{recursive:true});fs.writeFileSync(options['--output'],named);
const emittedOutput=auditWrittenArtifact(options['--output'],named);
const oldById=new Map(old.functions.filter(n=>n.id).map(n=>[n.id,n]));const rebuiltById=new Map(rebuilt.functions.filter(n=>n.id).map(n=>[n.id,n]));
function renamedRange(start,end){let renamed='',last=start;let low=0,high=allEdits.length;while(low<high){const middle=(low+high)>>1;if(allEdits[middle].start<start)low=middle+1;else high=middle;}for(let ei=low;ei<allEdits.length;ei++){const e=allEdits[ei];if(e.end>end)break;renamed+=rebuilt.text.slice(last,e.start)+e.text;last=e.end;}renamed+=rebuilt.text.slice(last,end);
return renamed;}
const results=[];for(const p of pairs){const left=oldById.get(p.old.v.identifiers[0]),right=rebuiltById.get(p.row.v.identifiers[0]);if(!left||!right)continue;
 const renamed=renamedRange(right.start,right.end);
 const official=old.text.slice(left.start,left.end),a=strictAstDigest(official),b=strictAstDigest(renamed);
 results.push({origin:p.key,basis:p.basis,constraintAnchor:p.constraintAnchor,baselineName:p.to,rebuiltName:p.from,baselineRange:[left.start,left.end],rebuiltRange:[right.start,right.end],baselineSourceSha256:sha(official),renamedSourceSha256:sha(renamed),strictAstEqual:a.sha256===b.sha256,firstDifference:a.sha256===b.sha256?null:firstDifference(parse(official,{ecmaVersion:2026,sourceType:'module'}),parse(renamed,{ecmaVersion:2026,sourceType:'module'})),baselineAst:a,rebuiltAst:b});
}
let declarationResults=[];const seenDeclarations=new Set();
for(const p of pairs){
 const left=p.old.v.defs[0]?.node,right=p.row.v.defs[0]?.node;
 if(left?.type!=='VariableDeclarator'||right?.type!=='VariableDeclarator')continue;
 const leftParent=old.parent.get(left),rightParent=rebuilt.parent.get(right);
 if(old.parent.get(leftParent)!==old.ast||rebuilt.parent.get(rightParent)!==rebuilt.ast)continue;
 const identity=left.start+':'+right.start;if(seenDeclarations.has(identity))continue;seenDeclarations.add(identity);
 const baseline=`${leftParent.kind} ${old.text.slice(left.start,left.end)};`,candidate=`${rightParent.kind} ${renamedRange(right.start,right.end)};`,a=strictAstDigest(baseline),b=strictAstDigest(candidate);
 declarationResults.push({origin:p.key,basis:p.basis,baselineRange:[left.start,left.end],candidateRange:[right.start,right.end],strictAstEqual:a.sha256===b.sha256,baselineAst:a,candidateAst:b,firstDifference:a.sha256===b.sha256?null:firstDifference(parse(baseline,{ecmaVersion:2026,sourceType:'module'}),parse(candidate,{ecmaVersion:2026,sourceType:'module'}))});
}
const declarationCoverage=declarationPairCoverage(declarationResults);declarationResults=declarationCoverage.rows;
const topLevelDeclarations={baseline:old.ast.body.filter(n=>n.type==='VariableDeclaration').reduce((sum,n)=>sum+n.declarations.length,0),candidate:rebuilt.ast.body.filter(n=>n.type==='VariableDeclaration').reduce((sum,n)=>sum+n.declarations.length,0),...declarationCoverage.counts,comparison:'Actual declarator fragments with their declaration kind. Headline strict matches count only bijective range pairs; nonbijective rows remain diagnostic candidates. Source pairing, parent statement grouping and program order remain whole-program obligations.'};
const exportGetterResults=exportGetterFragments.map(fragment=>{
 const baseline=old.text.slice(...fragment.baselineRange),candidate=renamedRange(...fragment.candidateRange),a=strictAstDigest(baseline),b=strictAstDigest(candidate);
 return {...fragment,coordinateConvention:'Original Program UTF-16 ranges; candidate ranges precede naming edits and are never applied to named-output source maps.',baselineSourceSha256:sha(baseline),renamedSourceSha256:sha(candidate),strictAstEqual:a.sha256===b.sha256,baselineAst:a,candidateAst:b,firstDifference:a.sha256===b.sha256?null:firstDifference(parse(baseline,{ecmaVersion:2026,sourceType:'module'}),parse(candidate,{ecmaVersion:2026,sourceType:'module'}))};
});
const wholeProgram={baseline:strictAstDigest(old.text),candidate:strictAstDigest(named)};wholeProgram.strictAstEqual=wholeProgram.baseline.sha256===wholeProgram.candidate.sha256;
for(const file of toolFiles)if(sha(fs.readFileSync(file))!==toolPins[path.relative(process.cwd(),file)])throw Error('Tool changed during comparison: '+file);
const report={schemaVersion:1,sourceEquivalenceEstablished:false,wholeProgram,inputs:Object.fromEntries(inputFiles.map(p=>[path.relative(process.cwd(),p),{bytes:fs.statSync(p).size,sha256:sha(fs.readFileSync(p))}])),toolPins,runtime:process.version,sourcePrefixes:prefixes,baselineSourcePrefixes:baselinePrefixes,bindingGraph,constraintStats,declarationConstraintStats,classConstraintStats,exportGetterConstraintStats,constraintIteration,sourcePairCount,captureRepairEvidence,topLevelDeclarations,declarationResults,exportGetterResults,exportGetterSelectorRejections,kind:'partial-source-derived-function-ast-experiment',sourceIdentity:{criterion:'known-prefix-full-relative-path-and-source-content-sha256',generatedLocationCorrectnessEstablished:false,originLabelsEstablishOwnership:false,baselineSources:baselineSourceCount,rebuiltSources:rebuiltSourceCount,identicalSharedSources:matchingSources.size,baselineMapSha256:sha(fs.readFileSync(oldMapPath)),rebuiltMapSha256:sha(fs.readFileSync(newMapPath))},baselineSha256:sha(old.text),rebuiltSha256:sha(rebuilt.text),renamedSha256:sha(named),bindingRecipe:[...byVariable.values()].map(p=>({from:p.from,to:p.to,origin:p.key,basis:p.basis,referenceEvidence:p.referenceEvidence,constraintAnchor:p.constraintAnchor,constraintAnchorIdentity:p.constraintAnchorIdentity,constraintDepth:p.constraintDepth,identifierRanges:p.row.v.identifiers.map(n=>n.range)})),variables:{baseline:old.variables.length,rebuilt:rebuilt.variables.length,paired:pairs.length,missing,ambiguous,excluded:removed.length,captureRepairs,editedTokens:allEdits.length},functions:{baseline:old.functions.length,rebuilt:rebuilt.functions.length,paired:results.length,strictMatches:results.filter(x=>x.strictAstEqual).length},results,excluded:removed,limitations:['Source-content identity does not establish generated-location correctness. Source-map origin labels are correspondence hints, not ownership evidence; the pinned baseline has known displaced mapping regions. Use independently audited token or owner evidence rather than nearest mapping labels.','Exact AST results apply only to listed function fragments after the explicit source-position and complete-function/declarator/class/export-getter naming-constraint recipe. Source-position correspondence remains a hypothesis where the baseline map is inaccurate.','External package/source edges, module initialization, compiler helpers, cross-fragment binding integrity and full program equivalence remain unverified.','The independent binding-graph check verifies static capture preservation within the naming transform. Direct eval, reflection, Function.prototype.toString and cross-program callee values remain unverified; strict fragment equality alone is not a program semantics claim.','Function declaration matches may be nested/overlapping and are not a percentage of program coverage.','Name choices come from the baseline artifact and mapping; this is an emitted naming transform, not a semantic alpha-equivalence claim.']};
const reportBytes=Buffer.from(JSON.stringify(report,null,2)+'\n');fs.mkdirSync(path.dirname(path.resolve(options['--report'])),{recursive:true});fs.writeFileSync(options['--report'],options['--report'].endsWith('.gz')?zlib.gzipSync(reportBytes,{level:9,mtime:0}):reportBytes);
const summary={kind:report.kind,sourceEquivalenceEstablished:false,wholeProgram,sourceIdentity:report.sourceIdentity,constraintStats,declarationConstraintStats,classConstraintStats,exportGetterConstraintStats,constraintIteration,sourcePairCount,variables:report.variables,functions:report.functions,topLevelDeclarations,bindingGraph,inputs:report.inputs,toolPins:report.toolPins,report:{path:options['--report'],bytes:fs.statSync(options['--report']).size,sha256:sha(fs.readFileSync(options['--report']))},output:emittedOutput,limitations:report.limitations};fs.writeFileSync(summaryPath,JSON.stringify(summary,null,2)+'\n');auditWrittenArtifact(options['--output'],named);console.log(JSON.stringify({wholeProgram,variables:report.variables,functions:report.functions,topLevelDeclarations,constraintStats,declarationConstraintStats,classConstraintStats,exportGetterConstraintStats,constraintIteration}));
