#!/usr/bin/env bun
// Native diagnostic assembly; does not execute application code or establish equivalence.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
import {validateRuntimePackageCandidate} from '../lib/runtime-package-candidates.mjs';
import {createVirtualNativeWrapperRecipe} from '../lib/virtual-native-wrappers.mjs';
import {createVirtualGrpcPathRecipe} from '../lib/virtual-grpc-paths.mjs';
import {createNativeOptionalRequireRecipe} from '../lib/native-optional-requires.mjs';
import {createNativePackageResolutionRecipe} from '../lib/native-package-resolution.mjs';
import {parseFlags,inventoryTree,assertBuildOutputDirectory,validateRecipeOverrides,safeRelative} from '../lib/diagnostic-build-inputs.mjs';
const args=parseFlags(process.argv.slice(2),['base-build','zod-package-metadata','overrides','output']);
const cwd=process.cwd(),basePath=args['base-build'],raw=fs.readFileSync(basePath);
assert.equal(sha(raw),'7c102e676865e20d68707fad56145ecefe746a2dc5d78cd97506dadf34feb594');
assert.equal(Bun.version,'1.3.11');
const prior=JSON.parse(raw),root=args.output,inputs=path.join(root,'inputs');
const relocate=p=>{const rel=path.relative(prior.compiler.cwd,p);safeRelative(rel);return path.resolve(cwd,rel);};
const overrideBytes=fs.readFileSync(args.overrides),override=JSON.parse(overrideBytes);
assert(override.evidence&&typeof override.evidence==='object');assert(Object.keys(override).every(k=>['additionalDefines','sideEffectsFalse','virtualNativeWrappers','virtualGrpcPaths','runtimePackageCandidates','nativeOptionalRequires','nativePackageResolution','evidence'].includes(k)));
const sideEffectsFalse=override.sideEffectsFalse??[];assert(Array.isArray(sideEffectsFalse));for(const p of sideEffectsFalse)if(p!=='.')safeRelative(p);
const {additionalDefines}=validateRecipeOverrides({additionalDefines:override.additionalDefines??{},evidence:override.evidence});
const files=new Map(),copies=[],generated=[];
const treeRoots=Object.entries(prior.inputs.trees).map(([key,value])=>({key,...value,root:relocate(value.root)}));
for(const tree of treeRoots){const actual=inventoryTree(tree.root);assert.deepEqual(actual.files,tree.files,'Pinned input tree differs: '+tree.key);}
const runtimeCandidates=[];const candidatePackages=new Set();
assert(Array.isArray(override.runtimePackageCandidates??[]));
for(const entry of override.runtimePackageCandidates??[]){
 assert.deepEqual(Object.keys(entry).sort(),['report','root','sha256']);
 safeRelative(entry.report);safeRelative(entry.root);assert(/^[a-f0-9]{64}$/.test(entry.sha256));
 const bytes=fs.readFileSync(entry.report);assert.equal(sha(bytes),entry.sha256,'Runtime candidate evidence changed');
 const evidence=JSON.parse(bytes),tree=inventoryTree(entry.root);
 const validated=validateRuntimePackageCandidate(evidence,tree,treeRoots.find(t=>t.key==='inputs').files);
 assert(!candidatePackages.has(validated.package),'Duplicate runtime package candidate');candidatePackages.add(validated.package);
 runtimeCandidates.push({report:entry.report,reportSha256:sha(bytes),...validated,root:tree.root,files:tree.files});
}
assertBuildOutputDirectory(root,[...treeRoots.map(t=>t.root),...runtimeCandidates.map(c=>c.root),path.dirname(args['zod-package-metadata'])]);fs.mkdirSync(inputs,{recursive:true});
const roots=[...treeRoots].sort((a,b)=>b.root.length-a.root.length);
function location(filename){if(!filename.startsWith(cwd+'/'))filename=relocate(filename);const tree=roots.find(t=>filename===t.root||filename.startsWith(t.root+'/'));assert(tree,'Unknown input '+filename);const rel=path.relative(tree.root,filename);assert(!rel.startsWith('..'));return(tree.key==='dependency-candidate'?'node_modules/zod-to-json-schema/':'')+rel;}
function add(relative,bytes,basis){assert(relative&&!path.isAbsolute(relative)&&relative.split('/').every(x=>x&&x!=='.'&&x!=='..'));const existing=files.get(relative);if(existing){assert.equal(existing.sha256,sha(bytes),'Different duplicate '+relative);existing.origins.push(basis);return;}const p=path.join(inputs,relative);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);const row={path:relative,bytes:bytes.length,sha256:sha(bytes),origins:[basis]};files.set(relative,row);copies.push(row);}
for(const tree of treeRoots){for(const file of tree.files){const source=path.join(tree.root,file.path),bytes=fs.readFileSync(source);assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256);if(['text-assets','json-assets'].includes(tree.key)&&!file.path.startsWith('src/')&&!file.path.startsWith('node_modules/'))continue;add(location(source),bytes,{tree:tree.key,path:source});}}
for(const candidate of runtimeCandidates)for(const file of candidate.files){const source=path.join(candidate.root,file.path),bytes=fs.readFileSync(source);assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256);add(file.path,bytes,{authenticatedRuntimePackageCandidate:candidate.report,reportSha256:candidate.reportSha256,source,originalVersionEstablished:false});}
const zodMeta=args['zod-package-metadata'],zodBytes=fs.readFileSync(zodMeta);assert.equal(sha(zodBytes),'70eedbe34fd52385a4ae2f3e5759b19682189f0118ea73a6e7c32c677f61668e');add('node_modules/zod/package.json',zodBytes,{authenticatedPublicCandidate:zodMeta,originalVersionEstablished:false});
const mappings=new Map(),pkgEntries=new Map();
const bare=s=>!s.startsWith('.')&&!s.startsWith('/')&&!s.startsWith('node:')&&!s.startsWith('bun:');
function pkgName(s){const a=s.split('/');return a[0].startsWith('@')?a.slice(0,2).join('/'):a[0];}
function packageRoot(relative,pkg){const marker='node_modules/'+pkg+'/';const i=relative.lastIndexOf(marker);return i>=0?relative.slice(0,i+marker.length-1):null;}
for(const row of prior.resolutions){if(!row.path||!bare(row.specifier))continue;const target=location(row.path);assert(files.has(target));const values=mappings.get(row.specifier)??new Set();values.add(target);mappings.set(row.specifier,values);const pkg=pkgName(row.specifier);if(pkg!==row.specifier)continue;const pkgRoot=packageRoot(target,pkg);if(!pkgRoot)continue;const values2=pkgEntries.get(pkgRoot)??new Set();values2.add(path.posix.relative(pkgRoot,target));pkgEntries.set(pkgRoot,values2);}
// Preserve each nested physical package identity; generated metadata is only a
// diagnostic entry hypothesis. Existing runtime JSON is never overwritten.
for(const [pkgRoot,entries]of pkgEntries){if(entries.size!==1||files.has(pkgRoot+'/package.json'))continue;const object={main:[...entries][0]};const bytes=Buffer.from(JSON.stringify(object,null,2)+'\n');add(pkgRoot+'/package.json',bytes,{candidatePackageEntry:true});generated.push({path:pkgRoot+'/package.json',value:object});}
// One known package-root relative require is represented by the same candidate
// entry as the recorded root-package import, not by a JavaScript shim.
if(!files.has('node_modules/protobufjs/package.json')){const object={main:'src/index.js'};add('node_modules/protobufjs/package.json',Buffer.from(JSON.stringify(object)+'\n'),{candidateRelativePackageEntry:true});generated.push({path:'node_modules/protobufjs/package.json',value:object});}
for(const packageRoot of sideEffectsFalse){
 const relative=packageRoot==='.'?'package.json':packageRoot+'/package.json';
 assert(packageRoot==='.'||[...files.keys()].some(p=>p.startsWith(packageRoot+'/')),'Side-effects candidate root absent');
 const existing=files.get(relative),entry=generated.find(row=>row.path===relative);
 assert(!existing||entry,'Cannot replace mapped or authenticated package metadata: '+relative);
 const value={...(entry?.value??{}),sideEffects:false},bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');
 if(existing){fs.writeFileSync(path.join(inputs,relative),bytes);Object.assign(existing,{bytes:bytes.length,sha256:sha(bytes)});existing.origins.push({candidateSideEffects:false});entry.value=value;}
 else{add(relative,bytes,{candidateSideEffects:false});generated.push({path:relative,value});}
}
let paths={'src/*':['./src/*']};const skipped=[];
for(const [specifier,targets]of mappings){if(specifier==='zod'||specifier.startsWith('zod/'))continue;if(targets.size===1)paths[specifier]=['./'+[...targets][0]];else skipped.push({specifier,targets:[...targets].sort()});}
const nativePackageResolution=Object.hasOwn(override,'nativePackageResolution')?createNativePackageResolutionRecipe({packages:override.nativePackageResolution,inputRoot:inputs,manifestFiles:copies,runtimeCandidates,mappings,priorBytes:raw,pathAliases:paths}):null;
if(nativePackageResolution)paths=nativePackageResolution.pathAliases;
const tsconfig={compilerOptions:{baseUrl:'.',paths}};add('tsconfig.json',Buffer.from(JSON.stringify(tsconfig,null,2)+'\n'),{candidatePathAliases:true});
nativePackageResolution?.verifyInputs();
const external=[],suppliedExternalEdges=[];const suppliedRuntimePaths=new Set(runtimeCandidates.flatMap(c=>c.files.map(f=>f.path)));
for(const row of prior.unresolved){if(row.specifier.startsWith('.')){const target=path.resolve(inputs,path.dirname(location(row.importer)),row.specifier);assert(target.startsWith(inputs+'/'),'External path escaped staged input tree');if(fs.existsSync(target)){const relative=path.relative(inputs,target);assert(suppliedRuntimePaths.has(relative)&&files.has(relative),'External candidate appeared without authenticated runtime evidence');suppliedExternalEdges.push({importer:row.importer,specifier:row.specifier,target:relative});}else external.push(target);}else if(path.isAbsolute(row.specifier))throw Error('Unexpected absolute unresolved request');else external.push(row.specifier);}
const options={...prior.options,entrypoints:[path.join(inputs,'src/entrypoints/cli.tsx')],define:{...prior.options.define,...additionalDefines},external:[...new Set(external)].sort()};
const optionalRequires=Object.hasOwn(override,'nativeOptionalRequires')?createNativeOptionalRequireRecipe({mode:override.nativeOptionalRequires,inputRoot:inputs,manifestFiles:copies,priorBytes:raw,pathAliases:paths,external:options.external}):null;
if(optionalRequires)options.external=optionalRequires.external;
const virtual=override.virtualNativeWrappers?createVirtualNativeWrapperRecipe({inputRoot:inputs,manifestFiles:copies,rules:override.virtualNativeWrappers}):null;
const virtualGrpc=override.virtualGrpcPaths?createVirtualGrpcPathRecipe({inputRoot:inputs,manifestFiles:copies,rules:override.virtualGrpcPaths}):null;
const virtualRecipes=[virtual,virtualGrpc].filter(Boolean),virtualFiles={};
for(const recipe of virtualRecipes)for(const [filename,contents]of Object.entries(recipe.files)){assert(!(filename in virtualFiles),'Duplicate virtual input path');virtualFiles[filename]=contents;}
const preflight={kind:virtual?'native-with-two-virtual-wrappers-diagnostic':'native-no-resolver-hook-diagnostic',sourceEquivalenceEstablished:false,baseReport:{path:basePath,sha256:sha(raw)},compiler:{version:Bun.version,path:process.execPath,sha256:sha(fs.readFileSync(process.execPath))},tools:[import.meta.path,new URL('../lib/diagnostic-build-inputs.mjs',import.meta.url).pathname,new URL('../lib/virtual-native-wrappers.mjs',import.meta.url).pathname,new URL('../lib/runtime-package-candidates.mjs',import.meta.url).pathname,new URL('../lib/virtual-grpc-paths.mjs',import.meta.url).pathname,new URL('../lib/native-optional-requires.mjs',import.meta.url).pathname,new URL('../lib/native-package-resolution.mjs',import.meta.url).pathname].map(p=>({path:p,sha256:sha(fs.readFileSync(p))})),overrides:{path:args.overrides,sha256:sha(overrideBytes),value:override},files:copies,runtimePackageCandidates:runtimeCandidates,suppliedExternalEdges,nativeOptionalRequireRecipe:optionalRequires?.recipe??null,nativePackageResolutionRecipe:nativePackageResolution?.recipe??null,generatedPackageEntries:generated,ambiguousAliasesSkipped:skipped,virtualNativeWrapperRecipe:virtual?.recipe??null,virtualNativeWrapperRequests:virtual?.records??[],virtualGrpcPathRecipe:virtualGrpc?.recipe??null,virtualGrpcRequests:virtualGrpc?.records??[],options,limitations:['Source content unchanged; generated metadata and resolution choices are hypotheses.','Absolute external paths are derived from individual unresolved requests, never a blanket relative-specifier external list.','Native runtime modules, original package metadata and full AST equivalence remain unverified.']};
fs.writeFileSync(path.join(root,'preflight.json'),JSON.stringify(preflight,null,2)+'\n');
let result=null,diagnosticFailure=null,validationStage='pre-build-input-validation';
try {
 nativePackageResolution?.verifyInputs();
 optionalRequires?.verifyInputs();
 validationStage='native-compilation';
 result=await Bun.build({...options,...(virtualRecipes.length?{files:virtualFiles,plugins:virtualRecipes.map(recipe=>recipe.plugin)}:{}),throw:false});
 validationStage='post-build-input-validation';
 nativePackageResolution?.verifyInputs();
 optionalRequires?.verifyInputs();
 for(const file of files.values()){const bytes=fs.readFileSync(path.join(inputs,file.path));assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256,'Staged file changed during build');}
} catch(error) {
 diagnosticFailure={stage:validationStage,name:error.name,message:error.message};
}
const outputs=[],outputNames=new Set(['preflight.json','report.json','inputs']);
for(const artifact of result?.outputs??[]){const name=path.basename(artifact.path);assert(name&&name!=='.'&&name!=='..'&&!outputNames.has(name),'Duplicate or reserved output name');outputNames.add(name);const p=path.join(root,name),bytes=Buffer.from(await artifact.arrayBuffer());fs.writeFileSync(p,bytes);outputs.push({path:p,bytes:bytes.length,sha256:sha(bytes),kind:artifact.kind});}
const report={...preflight,success:!diagnosticFailure&&result?.success===true,compilerSuccess:result?.success??null,diagnosticFailure,outputs,logs:(result?.logs??[]).map(l=>({level:l.level,message:l.message,position:l.position}))};fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:report.success,diagnosticFailure,inputs:files.size,generatedPackageEntries:generated.length,pathAliases:Object.keys(paths).length,ambiguousAliasesSkipped:skipped.length,external:options.external.length,suppliedExternalEdges:suppliedExternalEdges.length,outputs,logs:report.logs}));

if(diagnosticFailure)throw Error(`Native diagnostic failed at ${diagnosticFailure.stage}: ${diagnosticFailure.message}`);
if(!report.success)process.exitCode=1;
