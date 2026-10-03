// Exact baseline metadata convention only. No application AST/body/name transform.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const pin=(bytes)=>({bytes:bytes.length,sha256:sha(bytes)});
export function validateFinalizerOutputs(report,captured){
  assert.equal(report.success,true);assert.equal(captured.success,true);
  assert.deepEqual(report.outputs,captured.outputs,'finalizer report outputs disagree with captured child result');
  assert.equal(report.outputs.length,2);
  assert.deepEqual(report.outputs.map(p=>p.path).sort(),['final/cli.js','final/cli.js.map']);
  for(const p of report.outputs){assert.deepEqual(Object.keys(p).sort(),['bytes','path','sha256']);assert(Number.isSafeInteger(p.bytes)&&p.bytes>=0);assert(/^[0-9a-f]{64}$/.test(p.sha256));}
  return report.outputs;
}
export function inspectTerminalDebugComment(bytes,policy,stage){
  assert(Buffer.isBuffer(bytes));
  assert.equal(policy.kind,'exact-baseline-terminal-debug-comment-v1');
  assert.equal(policy.footerBytes,45);
  assert(/^[0-9A-F]{32}$/.test(policy.canonicalDebugId));
  assert(['raw','final'].includes(stage));
  const expected=policy.stages[stage];
  assert.equal(expected.prefixBytes+45,expected.bytes);
  assert.equal(bytes.length,expected.bytes,'unexpected full byte length');
  const prefix=bytes.subarray(0,expected.prefixBytes),footer=bytes.subarray(expected.prefixBytes);
  assert.equal(prefix.at(-1),10,'debug comment must start after LF');
  assert.equal(sha(prefix),expected.prefixSha256,'complete executable prefix differs');
  const decoded=new TextDecoder('utf-8',{fatal:true}).decode(footer);
  const match=/^\/\/# debugId=([0-9A-F]{32})\n$/.exec(decoded);
  assert(match,'unexpected terminal debug-comment form');
  const canonicalFooter=Buffer.from(`//# debugId=${policy.canonicalDebugId}\n`);
  const canonical=Buffer.concat([prefix,canonicalFooter]);
  assert.equal(sha(canonical),expected.canonicalSha256,'canonical full hash differs');
  return {actual:pin(bytes),prefix:pin(prefix),debugId:match[1],footerSha256:sha(footer),canonicalFooterSha256:sha(canonicalFooter),canonical};
}
export function makeCanonicalFinalView({rawBytes,finalBytes,policyBytes,expectedPolicySha256,compileReportBytes,expectedCompileReportSha256,finalizerReportBytes,expectedFinalizerReportSha256}){
  assert.equal(sha(policyBytes),expectedPolicySha256,'debug policy digest differs');
  assert.equal(sha(compileReportBytes),expectedCompileReportSha256,'actual compiler report digest differs');
  assert.equal(sha(finalizerReportBytes),expectedFinalizerReportSha256,'actual finalizer report digest differs');
  const policy=JSON.parse(policyBytes),compile=JSON.parse(compileReportBytes),finalize=JSON.parse(finalizerReportBytes);
  assert(compile.success&&compile.compilerSuccess&&finalize.success);
  assert.equal(compile.profileSha256,policy.sourceProfileSha256);
  assert.equal(finalize.profileSha256,policy.sourceProfileSha256);
  assert.equal(compile.sourceManifestSha256,finalize.sourceManifestSha256);
  assert.equal(compile.inputRoot,finalize.inputRoot);
  const raw=inspectTerminalDebugComment(rawBytes,policy,'raw'),final=inspectTerminalDebugComment(finalBytes,policy,'final');
  assert.equal(raw.debugId,final.debugId,'unchanged finalizer must retain actual debugId');
  const actualRaw=compile.outputs.find(p=>p.path==='raw/cli.js'),actualFinal=finalize.outputs.find(p=>p.path==='final/cli.js');
  assert(actualRaw&&actualFinal);
  for(const [expected,actual]of [[actualRaw,raw.actual],[actualFinal,final.actual]]){assert.equal(expected.bytes,actual.bytes);assert.equal(expected.sha256,actual.sha256);}
  assert.equal(finalize.rawSha256,raw.actual.sha256);
  assert.equal(finalize.finalSha256,final.actual.sha256);
  const prefixUTF16=new TextDecoder('utf-8',{fatal:true}).decode(finalBytes.subarray(0,final.prefix.bytes)).length;
  return {bytes:final.canonical,receipt:{kind:'explicit-terminal-debug-comment-view-v1',sourceProfileSha256:policy.sourceProfileSha256,
    policy:pin(policyBytes),actualCompilerReport:pin(compileReportBytes),actualFinalizerReport:pin(finalizerReportBytes),
    actualRaw:raw.actual,actualFinal:final.actual,rawPrefix:raw.prefix,finalPrefix:final.prefix,canonical:pin(final.canonical),
    edit:{inputByteRange:[final.prefix.bytes,final.actual.bytes],outputByteRange:[final.prefix.bytes,final.actual.bytes],inputUTF16Range:[prefixUTF16,prefixUTF16+45],outputUTF16Range:[prefixUTF16,prefixUTF16+45],fromDebugId:final.debugId,toDebugId:policy.canonicalDebugId,fromFooterSha256:final.footerSha256,toFooterSha256:final.canonicalFooterSha256},
    compilerOutputModified:false,finalizerOutputModified:false,executablePrefixByteEqual:true,sourceMapEmitted:false,
    mapOwnership:'final/cli.js.map remains paired with actual final/cli.js; no canonical-view map is claimed',
    syntaxBasis:'Exact compiler-authenticated, previously validated baseline prefix plus one strict terminal line comment; complete independent AST verification remains required',
    fullTargetASTEqualityEstablished:false}};
}
