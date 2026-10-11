// New post-compile phase. Candidate + frozen name metadata only; no reference input.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {RECOVERY_ROOT,sha256,checked,validateInputTree,noSymlinkAncestors,validateToolchain,safeRelative} from './full-stage-support.mjs';
import {emit} from './exact-name-emitter.mjs';
import {composeIdentifierMap} from './compose-identifier-map.mjs';
import {strictAstDigest} from './strict-ast.mjs';
const argv=process.argv.slice(2);assert.equal(argv.shift(),'--name');const args={};
const paths=['--profile','--toolchain','--input-root','--output-root'];
const hashes=['--expected-profile-sha256','--expected-toolchain-sha256','--expected-late-link-report-sha256'];
while(argv.length){const key=argv.shift(),value=argv.shift();assert([...paths,...hashes].includes(key)&&value&&!Object.hasOwn(args,key));if(hashes.includes(key)){assert.match(value,/^[a-f0-9]{64}$/);args[key]=value;}else{args[key]=path.resolve(value);noSymlinkAncestors(args[key]);}}
for(const key of [...paths,...hashes])assert(args[key]);
const profileBytes=checked(args['--profile'],args['--expected-profile-sha256']),profile=JSON.parse(profileBytes);
assert.equal(profile.version,'2.1.89');assert.equal(profile.sourceRevision,45);assert.equal(profile.strictAcceptance.completeTargetASTEqualityRequired,true);
const policy=profile.exactNameEmission;
assert.deepEqual(Object.keys(policy).sort(),['kind','recipe','sourceManifestSha256','candidateStrictAst','targetStrictAst','candidateIdentitySha256','targetIdentitySha256','preparationReviewManifestSha256'].sort());
assert.equal(policy.kind,'fixed-source-pinned-exact-identifier-emission-v1');assert.equal(policy.sourceManifestSha256,profile.sourceManifestSha256);
assert.equal(policy.targetStrictAst.sha256,'1bf84c8d2685868f68f2d050847b463aa79386f1ffe2dde5cd0cc62cf9c0bb9c');assert.equal(policy.targetStrictAst.nodes,3098331);
assert.match(policy.preparationReviewManifestSha256,/^[a-f0-9]{64}$/);
assert.deepEqual(Object.keys(policy.recipe).sort(),['bytes','path','sha256']);safeRelative(policy.recipe.path);
const recipePath=path.join(RECOVERY_ROOT,policy.recipe.path),recipeBytes=checked(recipePath,policy.recipe.sha256,policy.recipe.bytes),recipe=JSON.parse(recipeBytes);
assert.deepEqual(recipe.candidateStrictAst,policy.candidateStrictAst);assert.deepEqual(recipe.targetStrictAst,policy.targetStrictAst);assert.equal(recipe.candidateIdentitySha256,policy.candidateIdentitySha256);assert.equal(recipe.targetIdentitySha256,policy.targetIdentitySha256);
const tools=validateToolchain(args['--toolchain'],args['--expected-toolchain-sha256']);
assert(tools.files.some(r=>r.path===policy.recipe.path&&r.sha256===policy.recipe.sha256&&r.bytes===policy.recipe.bytes),'Recipe absent from complete tool/data closure');
const inputRoot=args['--input-root'],out=args['--output-root'];assert(fs.readFileSync(path.join(out,'profile.json')).equals(profileBytes));
const latePath=path.join(out,'late-link-report.json'),lateBytes=checked(latePath,args['--expected-late-link-report-sha256']),late=JSON.parse(lateBytes);
assert(late.success);assert.equal(late.profileSha256,sha256(profileBytes));assert.equal(late.toolchainSha256,tools.sha256);assert.equal(late.sourceManifestSha256,profile.sourceManifestSha256);assert.equal(late.inputRoot,inputRoot);
assert.equal(late.outputs.length,2);assert.deepEqual(late.outputs.map(x=>x.path).sort(),['final/cli.js','final/cli.js.map']);
for(const p of late.outputs)safeRelative(p.path);
const jsPin=late.outputs.find(x=>x.path==='final/cli.js'),mapPin=late.outputs.find(x=>x.path==='final/cli.js.map');
const dest=path.join(out,'named'),reportPath=path.join(out,'name-emission-report.json');noSymlinkAncestors(dest);assert(!fs.existsSync(dest)&&!fs.existsSync(reportPath));
const before=validateInputTree(profile,inputRoot);let error;let report={kind:'fixed-source-candidate-only-exact-identifier-emission',success:false,profileSha256:sha256(profileBytes),toolchainSha256:tools.sha256,sourceManifestSha256:profile.sourceManifestSha256,inputRoot,recipeSha256:sha256(recipeBytes),lateLinkReportSha256:sha256(lateBytes),before,applicationExecuted:false,referenceBundleRead:false,wholeVersionAccepted:false,originalSourceAuthorshipClaim:false};
try{
 const code=checked(path.join(out,jsPin.path),jsPin.sha256,jsPin.bytes).toString('utf8'),mapBytes=checked(path.join(out,mapPin.path),mapPin.sha256,mapPin.bytes),map=JSON.parse(mapBytes);
 const named=emit(code,recipe,{traceMemory:true});assert.deepEqual(named.after,policy.targetStrictAst);
 if(globalThis.gc)globalThis.gc();const independent=strictAstDigest(named.code);assert.equal(independent.sha256,policy.targetStrictAst.sha256);assert.equal(independent.nodes,policy.targetStrictAst.nodes);assert.equal(independent.criterion,'strict-whole-program-ast-v2');
 if(globalThis.gc)globalThis.gc();const composed=composeIdentifierMap({map,code,renamedCode:named.code,edits:named.edits});
 const outputMap=Buffer.from(JSON.stringify(composed.map)+'\n'),editBytes=Buffer.from(JSON.stringify({kind:'identifier-only-emission-token-lineage',coordinateConvention:'UTF-16 offsets into authenticated pre-naming code',inputSha256:jsPin.sha256,outputSha256:sha256(named.code),recipeSha256:sha256(recipeBytes),edits:named.edits})+'\n');
 fs.mkdirSync(dest);fs.writeFileSync(path.join(dest,'cli.js'),named.code,{flag:'wx'});fs.writeFileSync(path.join(dest,'cli.js.map'),outputMap,{flag:'wx'});fs.writeFileSync(path.join(out,'identifier-edits.json'),editBytes,{flag:'wx'});
 report={...report,success:true,beforeStrictAst:named.before,afterStrictAst:named.after,independentStrictAst:independent,completeTargetASTEqualityEstablished:true,emittedPhysicalIdentifierEdits:named.edits.length,recipeBindingRoles:recipe.bindings.length,mappingComposition:composed.summary,sourceMapDisplacementRepaired:false,outputs:[{path:'named/cli.js',bytes:Buffer.byteLength(named.code),sha256:sha256(named.code)},{path:'named/cli.js.map',bytes:outputMap.length,sha256:sha256(outputMap)}],editLineage:{path:'identifier-edits.json',bytes:editBytes.length,sha256:sha256(editBytes)}};
}catch(e){error=e;report.error={message:e.message,stack:e.stack};}
finally{try{validateToolchain(args['--toolchain'],args['--expected-toolchain-sha256']);report.after=validateInputTree(profile,inputRoot);assert(fs.readFileSync(args['--profile']).equals(profileBytes));checked(recipePath,policy.recipe.sha256,policy.recipe.bytes);assert(fs.readFileSync(latePath).equals(lateBytes));for(const p of late.outputs)checked(path.join(out,p.path),p.sha256,p.bytes);for(const p of report.outputs||[])checked(path.join(out,p.path),p.sha256,p.bytes);}catch(e){error=e;report.success=false;report.postValidationError={message:e.message,stack:e.stack};}fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({success:report.success,completeTargetASTEqualityEstablished:report.success&&report.completeTargetASTEqualityEstablished===true,outputs:report.outputs,applicationExecuted:false,wholeVersionAccepted:false}));if(error)throw error;
