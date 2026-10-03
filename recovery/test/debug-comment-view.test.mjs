import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {inspectTerminalDebugComment,makeCanonicalFinalView,validateFinalizerOutputs} from '../lib/reconstruction/debug-comment-view.mjs';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {resolvePinnedInput} from '../lib/reconstruction/checked-roots.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),canon='1'.repeat(32),actual='A'.repeat(32),profile='b'.repeat(64);
const footer=id=>Buffer.from(`//# debugId=${id}\n`),encode=j=>Buffer.from(JSON.stringify(j));
function fixture(){
 const rawPrefix=Buffer.from('import "unused";\nexport const a="é";\n\n'),finalPrefix=Buffer.from('export const a="é";\n\n');
 const rawBytes=Buffer.concat([rawPrefix,footer(actual)]),finalBytes=Buffer.concat([finalPrefix,footer(actual)]);
 const stage=p=>({bytes:p.length+45,prefixBytes:p.length,prefixSha256:sha(p),canonicalSha256:sha(Buffer.concat([p,footer(canon)]))});
 const policy={kind:'exact-baseline-terminal-debug-comment-v1',sourceProfileSha256:profile,canonicalDebugId:canon,footerBytes:45,stages:{raw:stage(rawPrefix),final:stage(finalPrefix)}};
 const pin=(path,b)=>({path,bytes:b.length,sha256:sha(b)});
 const compile={success:true,compilerSuccess:true,profileSha256:profile,sourceManifestSha256:'c'.repeat(64),inputRoot:'/tiny/source',outputs:[pin('raw/cli.js',rawBytes)]};
 const finalize={success:true,profileSha256:profile,sourceManifestSha256:compile.sourceManifestSha256,inputRoot:compile.inputRoot,rawSha256:sha(rawBytes),finalSha256:sha(finalBytes),outputs:[pin('final/cli.js',finalBytes)]};
 const policyBytes=encode(policy),compileReportBytes=encode(compile),finalizerReportBytes=encode(finalize);
 return {rawBytes,finalBytes,policy,compile,finalize,policyBytes,expectedPolicySha256:sha(policyBytes),compileReportBytes,expectedCompileReportSha256:sha(compileReportBytes),finalizerReportBytes,expectedFinalizerReportSha256:sha(finalizerReportBytes)};
}
test('one fixed-width terminal metadata substitution preserves every prefix byte and report lineage',()=>{
 const f=fixture(),rawBefore=Buffer.from(f.rawBytes),finalBefore=Buffer.from(f.finalBytes),v=makeCanonicalFinalView(f);
 assert(v.bytes.subarray(0,-45).equals(f.finalBytes.subarray(0,-45)));assert(v.bytes.subarray(-45).equals(footer(canon)));
 assert(f.rawBytes.equals(rawBefore)&&f.finalBytes.equals(finalBefore));assert.equal(v.receipt.canonical.sha256,f.policy.stages.final.canonicalSha256);
 assert.equal(v.receipt.actualCompilerReport.sha256,f.expectedCompileReportSha256);assert.equal(v.receipt.actualFinalizerReport.sha256,f.expectedFinalizerReportSha256);
 assert.equal(v.receipt.sourceMapEmitted,false);assert.equal(v.receipt.edit.inputUTF16Range[0],f.finalBytes.subarray(0,-45).toString().length);
});
test('an already canonical footer is accepted with the exact same bytes',()=>{
 const f=fixture(),b=Buffer.concat([f.finalBytes.subarray(0,-45),footer(canon)]);assert(inspectTerminalDebugComment(b,f.policy,'final').canonical.equals(b));
});
for(const [label,change]of [
 ['same-length executable prefix mutation',b=>{const c=Buffer.from(b);c[0]^=1;return c;}],
 ['lowercase id',b=>Buffer.concat([b.subarray(0,-45),footer('a'.repeat(32))])],
 ['nonhex id',b=>Buffer.concat([b.subarray(0,-45),footer('G'.repeat(32))])],
 ['extra trailing code',b=>Buffer.concat([b,Buffer.from('x();')])],
 ['extra trailing comment',b=>Buffer.concat([b,Buffer.from('//more\n')])],
 ['extra newline',b=>Buffer.concat([b,Buffer.from('\n')])],
 ['missing newline',b=>b.subarray(0,-1)],
 ['CRLF footer',b=>Buffer.concat([b.subarray(0,-1),Buffer.from('\r\n')])],
 ['changed marker',b=>Buffer.from(b.toString().replace('debugId=','debugXX='))],
 ['short id',b=>Buffer.concat([b.subarray(0,-45),footer('A'.repeat(31))])],
 ['missing preceding LF',b=>{const c=Buffer.from(b);c[c.length-46]=32;return c;}]
])test(label,()=>{const f=fixture();assert.throws(()=>inspectTerminalDebugComment(change(f.finalBytes),f.policy,'final'));});
for(const key of ['expectedPolicySha256','expectedCompileReportSha256','expectedFinalizerReportSha256'])test('reject changed '+key,()=>{const f=fixture();f[key]='0'.repeat(64);assert.throws(()=>makeCanonicalFinalView(f));});
for(const [label,mutate]of [
 ['compiler profile',f=>f.compile.profileSha256='0'.repeat(64)],
 ['compiler raw pin',f=>f.compile.outputs[0].sha256='0'.repeat(64)],
 ['finalizer raw pin',f=>f.finalize.rawSha256='0'.repeat(64)],
 ['finalizer final pin',f=>f.finalize.outputs[0].sha256='0'.repeat(64)],
 ['finalizer input root',f=>f.finalize.inputRoot='/other'],
 ['failed finalizer',f=>f.finalize.success=false],
 ['unexpected canonical hash',f=>f.policy.stages.final.canonicalSha256='0'.repeat(64)]
])test('reject '+label+' even with fresh enclosing report digest',()=>{const f=fixture();mutate(f);f.policyBytes=encode(f.policy);f.expectedPolicySha256=sha(f.policyBytes);f.compileReportBytes=encode(f.compile);f.expectedCompileReportSha256=sha(f.compileReportBytes);f.finalizerReportBytes=encode(f.finalize);f.expectedFinalizerReportSha256=sha(f.finalizerReportBytes);assert.throws(()=>makeCanonicalFinalView(f));});
test('finalizer stdout/report pins authenticate both actual files and reject drift before canonical emission',()=>{
 const root=fs.mkdtempSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'.tiny-debug-view-'));fs.mkdirSync(path.join(root,'final'));
 const outputs=[['final/cli.js',Buffer.from('source\n')],['final/cli.js.map',Buffer.from('{"version":3}\n')]].map(([name,b])=>{fs.writeFileSync(path.join(root,name),b);return {path:name,bytes:b.length,sha256:sha(b)};});
 const captured={success:true,outputs};const report=structuredClone(captured);
 for(const p of validateFinalizerOutputs(report,captured))resolvePinnedInput({output:root},{root:'output',...p});
 for(const mutate of [r=>r.outputs[1].sha256='0'.repeat(64),r=>r.outputs[1].bytes++,r=>r.outputs[1].path='../map',r=>r.outputs.pop(),r=>r.success=false]){const r=structuredClone(report);mutate(r);assert.throws(()=>validateFinalizerOutputs(r,captured));}
 const unsafe=structuredClone(report);unsafe.outputs[1].path='../map';assert.throws(()=>validateFinalizerOutputs(unsafe,structuredClone(unsafe)));
 fs.writeFileSync(path.join(root,'final/cli.js.map'),Buffer.from('{"version":4}\n'));
 assert.throws(()=>{for(const p of validateFinalizerOutputs(report,captured))resolvePinnedInput({output:root},{root:'output',...p});});
});
