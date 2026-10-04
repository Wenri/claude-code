// Fixed .89 input contract. The committed .88 validation path is not edited or weakened.
import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import path from 'node:path';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),gitBlob=b=>crypto.createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex');
const compare=(a,b)=>a.path<b.path?-1:a.path>b.path?1:0;
const safe=p=>{assert(typeof p==='string'&&p&&!p.startsWith('/')&&!/[\\\0\r\n]/u.test(p)&&p.split('/').every(s=>s&&s!=='.'&&s!=='..'));return p;};
export const sourceManifest=rows=>sha([...rows].sort(compare).map(f=>`${f.path}\0${f.bytes}\0${f.sha256}\n`).join(''));
export function sourceGitTree(rows){
 const root=new Map();
 for(const row of rows){assert(row.path.startsWith('src/'));const parts=safe(row.path.slice(4)).split('/');let at=root;for(const part of parts.slice(0,-1)){if(!at.has(part))at.set(part,new Map());at=at.get(part);assert(at instanceof Map,'source path collides with directory');}assert(!at.has(parts.at(-1)),'duplicate Git source path');assert.equal(row.mode,'100644');assert(/^[0-9a-f]{40}$/.test(row.blob));at.set(parts.at(-1),row);}
 function hashTree(tree){const entries=[...tree].map(([name,value])=>{const dir=value instanceof Map;return {sort:Buffer.from(name+(dir?'/':'')),bytes:Buffer.concat([Buffer.from(`${dir?'40000':value.mode} ${name}\0`),Buffer.from(dir?hashTree(value):value.blob,'hex')])};}).sort((a,b)=>Buffer.compare(a.sort,b.sort));const bytes=Buffer.concat(entries.map(e=>e.bytes));return crypto.createHash('sha1').update(Buffer.from(`tree ${bytes.length}\0`)).update(bytes).digest('hex');}
 return hashTree(root);
}
export function validateCurrentSourceMetadata(profile,actual){
 assert.equal(profile.kind,'full-stage-incremental-reconstruction-profile-v1');assert.equal(profile.version,'2.1.89');assert(!Object.hasOwn(profile,'genesisSourcePins'),'genesis pins must not be relabelled as current bytes');
 const contract=profile.sourceTreeContract;assert.equal(contract.kind,'fixed-2.1.89-derived-source-contract-v22');assert.equal(profile.sourceRevision,22);assert.deepEqual(contract.reviewedRevisionParent,{sourceRevision:21,profileSha256:'243c285b1c5109cf09f94e251b109cbf7f441ffd7dd28afca65066d07aa84809',sourceManifestSha256:'2a5d06b9908c96a1afb08f26d4263b0ba3baa61cc8498ce75d68161ddbee9df7',derivedSrcTree:'941faa299853c5ffe39d265b102443c1fc366240'});
 assert.deepEqual([contract.expectedStagedFiles,contract.expectedStagedSourceFiles,contract.expectedGitSourceFiles,contract.expectedExtraSourceAssets],[6084,1951,1922,29]);
 assert.equal(profile.sourceCount,6084);assert.equal(actual.length,6084);assert.equal(new Set(actual.map(f=>safe(f.path))).size,6084);
 assert.deepEqual([...actual].sort(compare),[...profile.sourceFiles].sort(compare));assert.equal(sourceManifest(actual),profile.sourceManifestSha256);
 assert.equal(actual.filter(f=>f.path.startsWith('src/')).length,1951);assert.equal(profile.sourceTreePins.length,1922);
 const byPath=new Map(actual.map(f=>[f.path,f])),git=new Map();
 for(const row of profile.sourceTreePins){assert(!git.has(row.path));git.set(row.path,row);const source=byPath.get(row.path);assert(source);assert.equal(source.sha256,row.sha256);assert.equal(source.bytes,row.bytes);}
 assert.equal(actual.filter(f=>f.path.startsWith('src/')&&!git.has(f.path)).length,29);
 const tree=sourceGitTree(profile.sourceTreePins);assert.equal(tree,contract.currentDerivedSrcTree);
 assert.equal(contract.genesisCommit,profile.genesisCommit);assert.equal(contract.genesisSrcTree,profile.genesisSrcTree);
 assert.equal(contract.parentVersion,'2.1.88');assert.equal(contract.parentProfileSha256,'f9dea6b404c176f81d0b638e9a3e7dfe05994763e8ac65b8d75b8ddbca35aa33');
 for(const edge of profile.sourceEdges){assert.equal(byPath.get(edge.originSource)?.sha256,edge.originSourceSha256);const id=edge.originSourceGitBlob??edge.originGenesisGitBlob;assert.equal(git.get(edge.originSource)?.blob,id);}
 return {files:actual.length,manifestSha256:profile.sourceManifestSha256,currentGitSourceFiles:git.size,currentDerivedSrcTree:tree,extraSourceAssets:29,genesisVerifiedAsLineageOnly:true};
}
export function validateCurrentSourceFiles(profile,inputRoot){
 let cursor=path.resolve(inputRoot);while(true){assert(!fs.lstatSync(cursor).isSymbolicLink());const next=path.dirname(cursor);if(next===cursor)break;cursor=next;}
 const actual=[];const gitPins=new Map(profile.sourceTreePins.map(f=>[f.path,f]));
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){assert(!e.isSymbolicLink());const filename=path.join(dir,e.name);if(e.isDirectory())walk(filename);else{assert(e.isFile());const bytes=fs.readFileSync(filename),relative=path.relative(inputRoot,filename).split(path.sep).join('/');for(const policy of profile.runtimeEmptyModules)assert(!bytes.includes(Buffer.from(policy.marker)),'reserved marker in recovered source');const row={path:relative,bytes:bytes.length,sha256:sha(bytes)};actual.push(row);if(gitPins.has(relative))assert.equal(gitBlob(bytes),gitPins.get(relative).blob);}}}
 walk(inputRoot);const result=validateCurrentSourceMetadata(profile,actual);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(inputRoot,'tsconfig.json'),'utf8')),{compilerOptions:{baseUrl:'.',paths:profile.pathAliases}});
 for(const edge of profile.sourceEdges){const source=fs.readFileSync(path.join(inputRoot,safe(edge.originSource)),'utf8');assert.equal(sha(source),edge.originSourceSha256);assert.equal(sha(source.slice(...edge.range)),edge.sliceSha256);assert.equal(sha(source.slice(...edge.specifierRange)),edge.specifierLiteralSha256);}
 for(const e of profile.lateLink.allowedEvalTokens){const source=fs.readFileSync(path.join(inputRoot,safe(e.sourcePath)),'utf8');assert.equal(sha(source),e.sourceSha256);assert.equal(sha(source.slice(...e.sourceRange)),e.sourceSliceSha256);}
 return {...result,sourceEdgeAndEvalRangePinsVerified:true};
}
