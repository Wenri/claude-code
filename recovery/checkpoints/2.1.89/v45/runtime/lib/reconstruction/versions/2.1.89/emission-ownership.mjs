// Read-only whole-Program model. Never import or evaluate a reviewed application.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
export const require=createRequire(new URL('../../../../package.json',import.meta.url));
export const {parse}=require('acorn'), {analyze}=require('eslint-scope');
export const PARSE={ecmaVersion:2026,sourceType:'module',allowHashBang:true,ranges:true};
export const POLICY={ecmaVersion:2026,sourceType:'module',optimistic:false,ignoreEval:false};
export const H=x=>crypto.createHash('sha256').update(x).digest('hex');
export const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?{$bigint:String(v)}:v);
export const hash=x=>H(json(x));
export function withoutRanges(v){if(Array.isArray(v))return v.map(withoutRanges);if(v&&typeof v==='object'){const o={};for(const [k,x]of Object.entries(v))if(k!=='range')o[k]=withoutRanges(x);return o;}return v;}
export const META=new Set(['start','end','range','loc']);
export function children(n,visit){for(const k of Object.keys(n).sort()){if(META.has(k))continue;const v=n[k];if(Array.isArray(v))v.forEach((x,i)=>{if(x?.type)visit(x,n,k,i)});else if(v?.type)visit(v,n,k,null);}}
export function protectedIdentifier(parent,key){return !!parent&&(!parent.computed&&((parent.type==='Property'&&key==='key')||(parent.type==='MemberExpression'&&key==='property')||(['MethodDefinition','PropertyDefinition'].includes(parent.type)&&key==='key'))||(['ImportSpecifier','ExportSpecifier'].includes(parent?.type)&&['imported','exported'].includes(key))||(['LabeledStatement','BreakStatement','ContinueStatement'].includes(parent?.type)&&key==='label')||parent?.type==='MetaProperty');}
export function build(ast){
 const order=new WeakMap(),rows=new WeakMap(),binding=new WeakMap(),refAt=new WeakMap(),privateAt=new WeakMap(),nameOriginNodes=new WeakMap(),reflectionReceiverNodes=new WeakMap();
 let nodes=0,currentRow=null;const typeCounts={},errors=[],evalSites=[],evalTokens=[],withSites=[],observable=[],reflection=[],exported=[],classes=[];
 const err=x=>{if(errors.length<1000)errors.push(x)};
 function number(n,row){order.set(n,nodes++);rows.set(n,row);typeCounts[n.type]=(typeCounts[n.type]??0)+1;children(n,(v,p,k,i)=>number(v,n.type==='Program'&&k==='body'?i:row));}
 number(ast,null);
 const pos=n=>n?{node:order.get(n),row:rows.get(n),range:[n.start,n.end]}:null;
 const nameEvent=(n,kind,name,extra={},origin=null)=>{const event={...pos(n),kind,name,...extra};observable.push(event);if(origin)nameOriginNodes.set(event,origin);};
 const reflectionEvent=(event,receiver)=>{reflection.push(event);if(receiver)reflectionReceiverNodes.set(event,receiver);};
 function declNames(n,kind){if(!n)return;if(n.type==='Identifier'){exported.push({...pos(n),kind,name:n.name});return;}if(['FunctionDeclaration','ClassDeclaration'].includes(n.type)){declNames(n.id,kind);return;}if(n.type==='VariableDeclaration'){n.declarations.forEach(d=>declNames(d.id,kind));return;}if(n.type==='VariableDeclarator'){declNames(n.id,kind);return;}if(n.type==='Property'){declNames(n.value,kind);return;}if(n.type==='AssignmentPattern'){declNames(n.left,kind);return;}if(n.type==='RestElement'){declNames(n.argument,kind);return;}if(['ObjectPattern','ArrayPattern'].includes(n.type)){children(n,(v)=>declNames(v,kind));return;}err({kind:'unsupported-export-declaration',...pos(n),type:n.type});}
 function keyName(k,computed){if(computed)return {name:null,computed:true,keyNode:order.get(k)};return {name:k?.type==='PrivateIdentifier'?'#'+k.name:k?.type==='Identifier'?k.name:k?.type==='Literal'?String(k.value):null,computed:false,keyNode:order.get(k)};}
 function visit(n,parent=null,key=null,env=null){
  if(n.type==='Identifier'&&n.name==='eval')evalTokens.push({...pos(n),parentType:parent?.type??null,key,parentRange:parent?[parent.start,parent.end]:null,protected:protectedIdentifier(parent,key)});
  if(n.type==='WithStatement')withSites.push(pos(n));
  if(n.type==='CallExpression'&&n.callee?.type==='Identifier'&&n.callee.name==='eval'&&!n.optional)evalSites.push({...pos(n),callee:pos(n.callee),argumentType:n.arguments[0]?.type??null,optional:!!n.optional});
  if(n.type==='MemberExpression'&&(!n.computed&&['name','toString','caller','callee','stack'].includes(n.property?.name)||n.computed&&n.property?.type==='Literal'&&['name','toString','caller','callee','stack'].includes(n.property.value)))reflectionEvent({...pos(n),kind:'explicit-reflection-related-property',property:n.property.name??n.property.value},n.object);
  if(n.type==='Identifier'&&['eval','Function','Reflect','Proxy'].includes(n.name)&&!protectedIdentifier(parent,key))reflection.push({...pos(n),kind:'reflection-related-identifier',name:n.name});
  if(n.type==='ExportNamedDeclaration'&&n.declaration)declNames(n.declaration,'exported-declaration');
  if(['FunctionDeclaration','FunctionExpression','ClassDeclaration','ClassExpression'].includes(n.type)&&n.id)nameEvent(n,'explicit-function-or-class-name',n.id.name,{nameNode:order.get(n.id)},n.id);
  if(parent?.type==='ExportDefaultDeclaration'&&['FunctionDeclaration','ClassDeclaration'].includes(n.type)&&!n.id)nameEvent(n,'default-export-name','default');
  if(['FunctionExpression','ArrowFunctionExpression','ClassExpression'].includes(n.type)&&!n.id){
   if(parent?.type==='VariableDeclarator'&&key==='init'&&parent.id.type==='Identifier')nameEvent(n,'variable-inferred-name',parent.id.name,{nameNode:order.get(parent.id)},parent.id);
   else if(parent?.type==='AssignmentPattern'&&key==='right'&&parent.left.type==='Identifier')nameEvent(n,'default-inferred-name',parent.left.name,{nameNode:order.get(parent.left)},parent.left);
   else if(parent?.type==='AssignmentExpression'&&key==='right'&&['=','&&=','||=','??='].includes(parent.operator)&&parent.left.type==='Identifier')nameEvent(n,'assignment-inferred-name',parent.left.name,{nameNode:order.get(parent.left)},parent.left);
   else if(parent?.type==='MethodDefinition'&&parent.kind==='constructor'&&key==='value')nameEvent(n,'class-constructor-name-covered-by-class-name',null,{classOwner:env?.id??null});
   else if(['MethodDefinition','PropertyDefinition','Property'].includes(parent?.type)&&key==='value')nameEvent(n,'property-function-or-class-name',null,{...keyName(parent.key,parent.computed),methodKind:parent.kind??null,static:!!parent.static},parent.key);
   else if(parent?.type==='ExportDefaultDeclaration')nameEvent(n,'default-export-name','default');
  }
  if(n.type==='ClassDeclaration'||n.type==='ClassExpression'){
   const id=order.get(n),inner={id,outer:env,names:new Map()},c={...pos(n),outer:env?.id??null,bindings:[],occurrences:[]};classes.push(c);
   n.body.body.forEach((el,i)=>{if(el.key?.type!=='PrivateIdentifier')return;let b=inner.names.get(el.key.name);if(!b){b={id:'private:'+id+':'+i,name:el.key.name,owner:id,slot:i,static:!!el.static,declarations:[]};inner.names.set(el.key.name,b);c.bindings.push(b);}const role=el.type==='PropertyDefinition'?'field':el.type==='MethodDefinition'?el.kind:'unsupported';b.declarations.push({node:order.get(el.key),element:order.get(el),slot:i,role,static:!!el.static});privateAt.set(el.key,{binding:b,owner:inner,role:'declaration'});if(role==='unsupported')err({...pos(el),kind:'unsupported-private-declaration'});});
   for(const b of c.bindings)if(b.declarations.length>1&&!(b.declarations.length===2&&new Set(b.declarations.map(d=>d.role)).size===2&&b.declarations.every(d=>['get','set'].includes(d.role)&&d.static===b.static)))err({...pos(n),kind:'ambiguous-private-declaration',name:b.name});
   if(n.id)visit(n.id,n,'id',env);if(n.superClass)visit(n.superClass,n,'superClass',env);visit(n.body,n,'body',inner);return;
  }
  if(n.type==='PrivateIdentifier'){
   let p=privateAt.get(n);if(!p){const role=parent?.type==='MemberExpression'&&key==='property'&&!parent.computed?'member-access':parent?.type==='BinaryExpression'&&parent.operator==='in'&&key==='left'?'private-in':'unsupported';for(let e=env;e;e=e.outer)if(e.names.has(n.name)){p={binding:e.names.get(n.name),owner:e,role};break;}if(role==='unsupported')err({...pos(n),kind:'unsupported-private-context',parent:parent?.type,key});}
   if(!p)err({...pos(n),kind:'unresolved-private',name:n.name});else{privateAt.set(n,p);const c=classes.findLast(x=>x.node===p.owner.id);c.occurrences.push({...pos(n),binding:p.binding.id,name:n.name,lexicalClass:env?.id??null,role:p.role});}return;
  }
  children(n,(v,p,k)=>visit(v,p,k,env));
 }
 visit(ast);
 const sm=analyze(ast,POLICY),sid=new Map(sm.scopes.map((s,i)=>[s,i])),vid=new Map();
 sm.scopes.forEach((s,i)=>s.variables.forEach((v,j)=>vid.set(v,`${i}:${j}`)));
 // A class declaration identifier can declare both outer and class-inner bindings.
 // Keep all declaration roles instead of overwriting either owner.
 const bind=(n,id)=>{let v=binding.get(n);if(!v){v=[];binding.set(n,v);}if(!v.includes(id))v.push(id);};
 for(const s of sm.scopes)for(const v of s.variables){for(const n of v.identifiers)bind(n,vid.get(v));for(const r of v.references){assert.equal(r.resolved,v);bind(r.identifier,vid.get(v));}}
 for(const s of sm.scopes)for(const r of s.references){let rr=refAt.get(r.identifier);if(!rr){rr=[];refAt.set(r.identifier,rr);}rr.push(r);}
 const ref=r=>({node:order.get(r.identifier),from:sid.get(r.from),resolved:r.resolved?vid.get(r.resolved):null,unresolvedName:r.resolved?null:r.identifier.name,read:r.isRead(),write:r.isWrite(),readOnly:r.isReadOnly(),writeOnly:r.isWriteOnly(),readWrite:r.isReadWrite(),init:r.init??null,partial:r.partial??null,writeExpression:order.get(r.writeExpr)??null,tainted:r.tainted??null});
 function recordScope(s,refMapper){return{type:s.type,upper:sid.get(s.upper)??null,block:order.get(s.block),variableScope:sid.get(s.variableScope),strict:s.isStrict,dynamic:s.dynamic,directEval:s.directCallToEvalScope,functionExpressionScope:s.functionExpressionScope,childScopes:s.childScopes.map(x=>sid.get(x)),variables:s.variables.map(v=>({id:vid.get(v),implicitName:v.identifiers.length?v.defs.length?null:v.name:v.name,identifiers:v.identifiers.map(n=>order.get(n)),definitions:v.defs.map(d=>({type:d.type,kind:d.kind??null,node:order.get(d.node),name:order.get(d.name)??null,parent:order.get(d.parent)??null,index:d.index??null,rest:d.rest??null})),references:v.references.map(refMapper),stack:v.stack,tainted:v.tainted})),references:s.references.map(refMapper),through:s.through.map(refMapper)};}
 function scopeRecord(sc){return recordScope(sc,ref);}
 function token(n,parent,key){if(n.type==='PrivateIdentifier'){const p=privateAt.get(n);return p?p.binding.id:'UNRESOLVED-PRIVATE:'+n.name;}if(n.type!=='Identifier')return n.name;if(protectedIdentifier(parent,key))return 'public:'+n.name;const refs=refAt.get(n);if(refs?.some(r=>!r.resolved))return 'unresolved:'+n.name;if(binding.has(n))return 'binding:'+binding.get(n).join(',');return 'unbound:'+n.name;}
 function digest(value,normalized=false,projection=false){const h=crypto.createHash('sha256');let count=0;function w(v,parent,key){if(v===null){h.update('null;');return;}if(Array.isArray(v)){h.update('[');v.forEach(x=>w(x,parent,key));h.update(']');}else if(v instanceof RegExp){w({pattern:v.source,flags:v.flags},null,null);}else if(typeof v==='object'){if(typeof v.type==='string')count++;h.update('{');for(const k of Object.keys(v).sort()){if(META.has(k)||k==='raw'&&v.type==='Literal')continue;h.update(JSON.stringify(k)+':');w(normalized&&k==='name'&&['Identifier','PrivateIdentifier'].includes(v.type)?(projection?lexicalSlotToken(v,parent,key):token(v,parent,key)):v[k],v,k);}h.update('}');}else{const t=typeof v==='bigint'?v.toString():typeof v==='number'&&!Number.isFinite(v)?String(v):JSON.stringify(v);h.update(`${typeof v}:${t};`);}}w(value,null,null);return{nodes:count,sha256:h.digest('hex')};}
 function graphPrivate(c){return{node:c.node,outer:c.outer,bindings:c.bindings.map(({name,...b})=>b),occurrences:c.occurrences.map(({name,range,row,...x})=>x)};}
 function unresolvedRecord(r){const found=nearestCandidate(r);return{...ref(r),...pos(r.identifier),name:r.identifier.name,diagnosticNearestDeclaration:found?{id:vid.get(found),name:found.name,scope:sid.get(found.scope),definitions:found.defs.map(d=>({...pos(d.name??d.node),type:d.type,kind:d.kind??null}))}:null};}

 // ADDITIVE DIAGNOSTIC ONLY. Conservative resolution above is unchanged.
 // A nearest declaration is a tagged lexical candidate, never a resolved binding.
 function nearestCandidate(r){for(let sc=r.from;sc;sc=sc.upper){if(!sc.set.has(r.identifier.name))continue;const variable=sc.set.get(r.identifier.name);assert.equal(typeof sc.__isValidResolution,'function','Pinned scope visibility guard is required');if(sc.__isValidResolution(r,variable))return variable;}return null;}
 function annotatedRef(r){const plain=ref(r),candidate=r.resolved?null:nearestCandidate(r);return {...plain,diagnosticLexicalCandidate:candidate?vid.get(candidate):null};}
 function projectedRef(r){const full=annotatedRef(r);return full.diagnosticLexicalCandidate===null?full:{...full,unresolvedName:'UNACCEPTED-DYNAMIC-NAME@'+full.diagnosticLexicalCandidate};}
 function lexicalSlotToken(n,parent,key){
  if(n.type!=='Identifier'||protectedIdentifier(parent,key))return token(n,parent,key);
  const refs=refAt.get(n),unresolved=refs?.filter(r=>!r.resolved)??[];
  if(!unresolved.length)return token(n,parent,key);
  const slots=unresolved.map(r=>nearestCandidate(r)).map(v=>v?vid.get(v):null);
  if(slots.some(x=>x===null)||new Set(slots).size!==1)return token(n,parent,key);
  return 'UNRESOLVED-LEXICAL-CANDIDATE@'+slots[0];
 }
 function annotatedScopeRecord(sc){return recordScope(sc,annotatedRef);}
 function projectedScopeRecord(sc){return recordScope(sc,projectedRef);}

 // Supplementary provenance for actual name-consumer analysis. These are binding
 // candidates, not value-flow, dominance, reachability or no-reassignment proofs.
 function originAnnotation(n){return{...pos(n),type:n.type,declaredOrResolvedBindingIds:binding.get(n)??[],references:(refAt.get(n)??[]).map(annotatedRef),privateBindingId:privateAt.get(n)?.binding.id??(n.type==='MemberExpression'&&!n.computed&&n.property.type==='PrivateIdentifier'?privateAt.get(n.property)?.binding.id:null)??null};}
 for(const event of observable){const origin=nameOriginNodes.get(event);if(origin)event.nameOrigin=originAnnotation(origin);}
 for(const event of reflection){const receiver=reflectionReceiverNodes.get(event);if(receiver)event.receiverSyntax={...originAnnotation(receiver),memberProperty:receiver.type==='MemberExpression'&&!receiver.computed?receiver.property.name??null:null,qualification:'Syntax and lexical candidate only; function/object value flow remains unproved.'};}
 return{ast,sm,order,rows,binding,refAt,privateAt,sid,vid,nodes,typeCounts,errors,evalSites,evalTokens,withSites,observable,reflection,exported,classes,pos,ref,scopeRecord,digest,graphPrivate,unresolvedRecord,token,nearestCandidate,annotatedRef,projectedRef,lexicalSlotToken,annotatedScopeRecord,projectedScopeRecord};
}
export function tiny(source){const m=build(parse(source,PARSE));return{strict:m.digest(m.ast),binding:m.digest(m.ast,true),graph:hash(m.sm.scopes.map(m.scopeRecord)),private:hash(m.classes.map(m.graphPrivate)),names:hash(m.observable.map(withoutRanges)),exported:hash(m.exported.map(withoutRanges)),dynamic:m.evalSites.length+m.withSites.length,errors:m.errors,model:m};}
