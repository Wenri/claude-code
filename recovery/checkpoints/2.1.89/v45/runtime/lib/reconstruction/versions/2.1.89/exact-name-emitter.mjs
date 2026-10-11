// Candidate identifier emission only. Never imports/evaluates recovered application code.
// New fixed-profile name-emission component; V44 remains unchanged.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {build,parse,PARSE,children,protectedIdentifier,H,json} from './emission-ownership.mjs';
function validSpelling(name,isPrivate) {
 assert.equal(typeof name,'string');assert(name.length>0&&name.length<=1024);
 const prefix=isPrivate?'class C{#':'let ', suffix=isPrivate?';}':';';
 const ast=parse(prefix+name+suffix,PARSE);
 assert.equal(ast.body.length,1);
 const n=isPrivate?ast.body[0].body.body[0].key:ast.body[0].declarations[0].id;
 if(isPrivate){assert.equal(ast.body[0].body.body.length,1);assert.equal(n.type,'PrivateIdentifier');assert.equal(n.start,prefix.length-1);}
 else {assert.equal(ast.body[0].declarations.length,1);assert.equal(n.type,'Identifier');assert.equal(n.start,prefix.length);}
 assert.equal(n.name,name);assert.equal(n.end,prefix.length+name.length);
 // Exact parser span/name equality rejects whitespace, comments, escapes,
 // multiple tokens and injected statements, not just runtime-active text.
}
export const QUALIFICATION="Frozen candidate-owned identifier metadata for the independently reviewed recovered-source build. Names only; candidate-only emission; complete strict target AST equality required. No original source-authorship or alternate-profile claim.";
function sequenceHash(rows,project=x=>x){const h=crypto.createHash('sha256');h.update('[');let first=true;for(const row of rows){if(!first)h.update(',');first=false;h.update(json(project(row)));}h.update(']');return h.digest('hex');}
export function inspect(code,{collectPhysical=true,physicalRoles=null,traceMemory=false}={}) {
 const mark=phase=>{if(traceMemory)process.stderr.write(json({phase,...process.memoryUsage()})+'\n');};
 let ast=parse(code,PARSE);mark('parsed');let m=build(ast);mark('ownership-built');
 assert.equal(ast.sourceType,'module');assert.equal(m.errors.length,0);assert.equal(m.withSites.length,0);
 for(const scope of m.sm.scopes) if(scope.type!=='global') assert.equal(scope.isStrict,true,'Non-strict scope is unsupported');
 const identities=[],physical=new Map(),exportedNodes=new Set(m.exported.map(e=>e.node));
 function describe(n,parent,key){
  let role=m.token(n,parent,key);
  if(exportedNodes.has(m.order.get(n)))role='public:exported-declaration:'+n.name;
  if(n.type==='Identifier'&&!protectedIdentifier(parent,key)&&!exportedNodes.has(m.order.get(n))){
   const unresolved=(m.refAt.get(n)||[]).filter(r=>!r.resolved);
   if(unresolved.length){const owners=unresolved.map(r=>m.nearestCandidate(r));
    if(owners.every(Boolean)){const ids=owners.map(v=>m.vid.get(v));assert.equal(new Set(ids).size,1,'Ambiguous lexical owner');role='binding:'+ids[0];}
    else assert(owners.every(v=>v===null),'Mixed free and lexical ownership');
   }
  }
  const raw=code.slice(n.start,n.end);assert.equal(raw,(n.type==='PrivateIdentifier'?'#':'')+n.name,'Unsupported escaped identifier spelling');
  return {node:m.order.get(n),type:n.type,role,name:n.name,eligible:role.startsWith('binding:')||role.startsWith('private:')};
 }
 function walk(n,parent=null,key=null){
  if(n.type==='Identifier'||n.type==='PrivateIdentifier'){
   const row=describe(n,parent,key);identities.push(row);
   if(collectPhysical&&(!physicalRoles||physicalRoles.has(row.role))){const k=n.start+':'+n.end;let token=physical.get(k);if(!token){token={start:n.start,end:n.end,raw:code.slice(n.start,n.end),rows:[]};physical.set(k,token);}if(!physicalRoles)token.rows.push(row);}
  }
  children(n,(v,p,k)=>walk(v,p,k));
 }
 walk(ast);mark('identifier-inventory-built');
 // Store only selected physical ranges for emission, then revisit EVERY AST
 // role on those ranges. Unselected shorthand/public/alias roles are retained.
 if(collectPhysical&&physicalRoles){
  function shared(n,parent=null,key=null){if(n.type==='Identifier'||n.type==='PrivateIdentifier'){const token=physical.get(n.start+':'+n.end);if(token)token.rows.push(describe(n,parent,key));}children(n,(v,p,k)=>shared(v,p,k));}
  shared(ast);
 }
 identities.sort((a,b)=>a.node-b.node);const strict=m.digest(ast);m=null;ast=null;if(globalThis.gc)globalThis.gc();mark('model-released');
 const identitySha256=sequenceHash(identities),ownershipSha256=sequenceHash(identities,({name,...r})=>r);mark('inventory-hashed');
 return {m:null,identities,physical,strict,identitySha256,ownershipSha256};
}
export function emit(code,recipe,{traceMemory=false}={}) {
 assert.deepEqual(Object.keys(recipe).sort(),['kind','candidateStrictAst','targetStrictAst','candidateIdentitySha256','targetIdentitySha256','bindings','qualification','formatVersion'].sort());
 assert.equal(recipe.kind,'source-pinned-exact-identifier-emission-recipe-v1');assert.equal(recipe.formatVersion,1);assert.equal(recipe.qualification,QUALIFICATION);
 for(const d of [recipe.candidateStrictAst,recipe.targetStrictAst]){assert.deepEqual(Object.keys(d).sort(),['nodes','sha256']);assert(Number.isSafeInteger(d.nodes)&&d.nodes>0&&d.nodes<=4000000);assert.match(d.sha256,/^[a-f0-9]{64}$/);}
 for(const h of [recipe.candidateIdentitySha256,recipe.targetIdentitySha256])assert.match(h,/^[a-f0-9]{64}$/);assert(Array.isArray(recipe.bindings)&&recipe.bindings.length<=1000000);
 const renames=new Map();for(const r of recipe.bindings){assert.deepEqual(Object.keys(r).sort(),['role','from','to','occurrences'].sort());assert(r.role.startsWith('binding:')||r.role.startsWith('private:'));validSpelling(r.from,r.role.startsWith('private:'));validSpelling(r.to,r.role.startsWith('private:'));assert(r.from!==r.to);assert(Number.isSafeInteger(r.occurrences)&&r.occurrences>0);assert(!renames.has(r.role));renames.set(r.role,{...r,seen:0});}
 const c=inspect(code,{physicalRoles:new Set(renames.keys()),traceMemory});assert.deepEqual(c.strict,recipe.candidateStrictAst);assert.equal(c.identitySha256,recipe.candidateIdentitySha256);
 const edits=[];
 for(const token of c.physical.values()) {
  const outputs=new Set();
  for(const row of token.rows){const r=renames.get(row.role);if(r){assert(row.eligible);assert.equal(row.name,r.from);r.seen++;}outputs.add((row.type==='PrivateIdentifier'?'#':'')+(r?r.to:row.name));}
  assert.equal(outputs.size,1,'Conflicting roles on shared physical token');const replacement=[...outputs][0];
  if(replacement!==token.raw) edits.push({start:token.start,end:token.end,old:token.raw,replacement,roles:token.rows.map(r=>r.role)});
 }
 for(const r of renames.values())assert.equal(r.seen,r.occurrences,'Missing, stale or extra recipe occurrence');
 edits.sort((a,b)=>a.start-b.start);let end=0,out='';for(const e of edits){assert(e.start>=end);assert.equal(code.slice(e.start,e.end),e.old);out+=code.slice(end,e.start)+e.replacement;end=e.end;}out+=code.slice(end);
 // Reparse before returning output. Collisions/captures are rejected by exact
 // role inventory comparison, and every non-name AST field is target-pinned.
 const ownershipBefore=c.ownershipSha256,identifierCount=c.identities.length;c.identities=[];c.physical.clear();if(globalThis.gc)globalThis.gc();
 const after=inspect(out,{collectPhysical:false,traceMemory});assert.deepEqual(after.strict,recipe.targetStrictAst,'Complete target strict AST mismatch');assert.equal(after.identitySha256,recipe.targetIdentitySha256);
 assert.equal(after.identities.length,identifierCount);assert.equal(after.ownershipSha256,ownershipBefore,'Declaration/reference ownership or protected spelling changed');
 return {code:out,edits,before:c.strict,after:after.strict,recipeSha256:H(json(recipe)),applicationExecuted:false,wholeVersionAccepted:false};
}
