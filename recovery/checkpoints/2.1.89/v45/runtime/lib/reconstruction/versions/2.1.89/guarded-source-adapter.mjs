// Tiny candidate source-to-IR prepass. The emitter accepts recovered source + this explicit profile only.
import crypto from 'node:crypto';
export const sha256=x=>crypto.createHash('sha256').update(x).digest('hex');
export function applyGuardedRules(source,ruleSet,profile){
 if(sha256(JSON.stringify(profile))!==ruleSet.profileSha256)throw Error('version/build profile changed');
 if(sha256(source)!==ruleSet.sourceSha256)throw Error('recovered source hash changed');
 const edits=[...ruleSet.edits].sort((a,b)=>a.range[0]-b.range[0]);let end=0,output='',trace=[];
 for(const rule of edits){const [a,b]=rule.range;if(a<end||b<a||b>source.length)throw Error('invalid/overlapping UTF-16 range');const slice=source.slice(a,b);if(sha256(slice)!==rule.sliceSha256)throw Error('source range hash changed');
  if(rule.kind==='erase-profile-inactive-import'){
   if(!rule.bindingEvidence?.length||!rule.bindingEvidence.every(s=>s.refs.every(r=>r.erasedType||r.deadGuard)))throw Error('unproved runtime reference');
   if(rule.runtimeInstantiation!=='none-under-this-explicit-reconstruction-profile')throw Error('unknown module effects');
  }else if(rule.kind==='erase-declaration-only-import'){
   if(rule.declarationBoundary!==true||!rule.resolvedTarget.endsWith('.d.ts'))throw Error('not a declaration boundary');
  }else if(rule.kind==='mark-sdk-export-type-only'){
   if(!/^export \* from /.test(slice)||rule.runtimeExports.length!==0)throw Error('not a proven erased SDK boundary');
  }else throw Error('unknown rule');
  const replacement=rule.kind==='mark-sdk-export-type-only'?slice.replace(/^export \*/,'export type *'):'';
  output+=source.slice(end,a)+replacement;trace.push({...rule,outputRange:[output.length-replacement.length,output.length],replacementSha256:sha256(replacement)});end=b;
 }
 output+=source.slice(end);return {source:output,trace,inputSha256:sha256(source),outputSha256:sha256(output)};
}
