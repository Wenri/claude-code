#!/usr/bin/env python3
"""Post-build V45 data verification; no recovered application is executed."""
import argparse
import gc
import collections
import gzip
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

CHECKPOINT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('materialize',CHECKPOINT/'materialize.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
NODE={'bytes':125989464,'sha256':'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12'}
PROFILE='4001b061fbbe002c516af835ba9d5c0c97b15666eed9ba0cee99e4ace6e21120'
TOOLCHAIN='8181e007ccb1b0fc379f64ff393196b05f140068a419a9160b839a0dc96fc48a'
SOURCE='b1a948e024d437956a502ea5069376c366c38c21a8586a41ff99d91fd2649996'
TARGET='781cfdd0002f5edde105ee6a04afb024ad388fc7741f3fbd273bd0574a965747'

READ_PINS={}
def read(p,limit=128*1024*1024):
 p=m.canonical(p,'file');b=m.read_file(p,limit)
 identity={'bytes':len(b),'sha256':m.sha(b)}
 key=str(p)
 m.require(key not in READ_PINS or READ_PINS[key]==identity,'verifier input changed: '+key)
 READ_PINS[key]=identity
 return b
def pin(p):
 b=read(p);return {'bytes':len(b),'sha256':m.sha(b)}
def data(p): return m.json_bytes(read(p))
def canon(x): return json.dumps(x,ensure_ascii=False,separators=(',',':'),sort_keys=True).encode()
def checked_output(base,r):
 p=base/m.safe_rel(r['path']);m.checked(read(p),r);return p

def main():
 a=argparse.ArgumentParser(description=__doc__)
 for n in ['repo-root','manifest-sha256','work-root','node','output-root']:a.add_argument('--'+n,required=True)
 args=a.parse_args();repo=m.canonical(args.repo_root,'dir');work=m.canonical(args.work_root,'dir');node=m.canonical(args.node,'file')
 m.require(pin(node)==NODE,'Node identity')
 cp=repo/m.CHECKPOINT;m.require(cp==CHECKPOINT,'checkpoint verifier identity/location')
 output=Path(args.output_root);m.require(output.is_absolute() and str(output)==args.output_root and not os.path.lexists(output),'new normalized output required');m.canonical(output.parent,'dir')
 for protected in [repo,work]: m.require(output!=protected and output not in protected.parents and protected not in output.parents,'verification output overlap')
 contents,prepared=m.prepare(str(repo),str(cp/'manifest.json'),args.manifest_sha256)
 for rel,b in contents.items(): m.require(read(work/rel)==b,'materialized input changed: '+rel)
 del contents;gc.collect()
 build=work/'source-batch-v45-diagnostic';receipts=work/'v45-public-run-receipts';stage=work/'v45-source-batch'
 build_receipt=data(receipts/'build-receipt.json');m.require(build_receipt['kind']=='V45-public-layout-four-phase-build' and build_receipt['stageUnchanged'] is True and build_receipt['applicationExecuted'] is False and build_receipt['comparisonReferenceProvidedToBuild'] is False,'build receipt')
 steps=build_receipt['steps'];m.require([r['phase'] for r in steps]==['compile','finalize','name','index'],'four serial phases')
 for r in steps:
  m.require(r['exitCode']==0 and r['stopped'] is None and r['peakRSSUpperBoundBytes']<3000000000,'successful bounded phase')
  for stream in ['stdout','stderr']:m.require(pin(receipts/(r['phase']+'.'+stream))==r[stream],'phase log changed')
 compiled=data(build/'compile-report.json');late=data(build/'late-link-report.json');named=data(build/'name-emission-report.json')
 for r in [compiled,late,named]:
  m.require(r['success'] is True and r['profileSha256']==PROFILE and r['toolchainSha256']==TOOLCHAIN and r['sourceManifestSha256']==SOURCE,'fresh report lineage')
  m.require(r['inputRoot']==str(stage/'inputs'),'fresh input root')
  for item in r['outputs']:checked_output(build,item)
 m.require(compiled['compilerSuccess'] is True and compiled['generatedApplicationExecuted'] is False,'compiler result')
 checked_output(build,compiled['receiptFile']);checked_output(build,named['editLineage'])
 m.require(named['lateLinkReportSha256']==pin(build/'late-link-report.json')['sha256'],'late-link chain')
 m.require(late['rawSha256']==pin(build/'raw/cli.js')['sha256'] and late['finalSha256']==pin(build/'final/cli.js')['sha256'],'late-link output lineage')
 m.require(named['applicationExecuted'] is False and named['referenceBundleRead'] is False,'candidate-only naming')
 recipe_path=stage/'recovery/profiles/2.1.89/identifier-names-v45.json'
 recipe_sha=pin(recipe_path)['sha256']
 m.require(named['recipeSha256']==recipe_sha=='90b1cd034314862acf09a6f964e593244ac799d79cd0a532a6123aafdfee76ad','fixed identifier recipe')
 recipe=data(recipe_path)
 m.require(set(recipe)=={'kind','candidateStrictAst','targetStrictAst','candidateIdentitySha256','targetIdentitySha256','bindings','qualification','formatVersion'},'identifier recipe schema')
 roles={r['role']:r for r in recipe['bindings']}
 m.require(len(roles)==len(recipe['bindings'])==named['recipeBindingRoles']==57783,'recipe role census')
 for r in recipe['bindings']:
  m.require(set(r)=={'role','from','to','occurrences'} and type(r['occurrences']) is int and r['occurrences']>=1,'binding schema')
  m.require(all(re.fullmatch(r'[$A-Za-z_][$A-Za-z_0-9]*',r[k]) for k in ['from','to']),'identifier-only spelling')
 lineage=data(build/'identifier-edits.json')
 m.require(lineage['inputSha256']==pin(build/'final/cli.js')['sha256'] and lineage['outputSha256']==pin(build/'named/cli.js')['sha256'] and lineage['recipeSha256']==recipe_sha,'edit lineage hashes')
 m.require(len(lineage['edits'])==named['emittedPhysicalIdentifierEdits']==217569,'physical edit count')
 original=read(build/'final/cli.js').decode('utf-8').encode('utf-16-le');wanted=read(build/'named/cli.js');pieces=[];cursor=0;uses=collections.Counter()
 for edit in lineage['edits']:
  m.require(set(edit)=={'start','end','old','replacement','roles'} and type(edit['start']) is int and type(edit['end']) is int and cursor<=2*edit['start']<2*edit['end']<=len(original),'ordered UTF16 edit')
  start,end=2*edit['start'],2*edit['end'];m.require(original[start:end]==edit['old'].encode('utf-16-le'),'old token slice')
  m.require(isinstance(edit['roles'],list) and len(edit['roles'])>0 and len(set(edit['roles']))==len(edit['roles']),'nonempty unique edit roles')
  for role in edit['roles']:
   r=roles[role];prefix='#' if role.startswith('private:') else ''
   m.require(prefix+r['from']==edit['old'] and prefix+r['to']==edit['replacement'],'role replacement identity');uses[role]+=1
  pieces.extend([original[cursor:start],edit['replacement'].encode('utf-16-le')]);cursor=end
 pieces.append(original[cursor:]);m.require(b''.join(pieces).decode('utf-16-le').encode('utf-8')==wanted,'full identifier reconstruction')
 for role,r in roles.items():m.require(uses[role]==(r['occurrences'] if r['from']!=r['to'] else 0),'role occurrence census')
 del original,wanted,pieces,lineage,recipe,roles,uses;gc.collect()

 def argument(argv,key):
  m.require(argv.count(key)==1,'unique argument '+key);return argv[argv.index(key)+1]
 m.require(argument(steps[1]['argv'],'--expected-compile-report-sha256')==pin(build/'compile-report.json')['sha256'],'compile chain')
 m.require(argument(steps[2]['argv'],'--expected-late-link-report-sha256')==pin(build/'late-link-report.json')['sha256'],'naming chain')
 m.require(argument(steps[3]['argv'],'--input-sha256')==pin(build/'named/cli.js')['sha256'],'index source pin')
 # References are first decoded here, after the complete build receipt and report chain.
 compressed=read(cp/'validation/official-target-index.json.gz',16*1024*1024)
 with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as gz: target_bytes=gz.read(16*1024*1024+1)
 m.require(len(target_bytes)==5573628 and m.sha(target_bytes)==TARGET,'official index identity')
 target=m.json_bytes(target_bytes);index=data(receipts/'index.json');expected=data(cp/'expected-output.json')
 m.require(index['strictAst']==target['strictAst']==expected['strictAst'],'complete official strict AST')
 m.require(len(index['statements'])==len(target['statements'])==18181,'ordered statement count')
 for actual,t in zip(index['statements'],target['statements']):
  m.require({k:v for k,v in actual.items() if k!='range'}=={k:v for k,v in t.items() if k!='range'},'ordered statement witness')
  m.require(actual['range']==[x-306 for x in t['range']],'expected banner displacement')
 m.require(index['io']['sourceBeforeSha256']==index['io']['sourceAfterSha256']==pin(build/'named/cli.js')['sha256'],'independent index lineage')
 js=read(build/'named/cli.js');core=expected['namedExecutableCore'];n=core['bytes']
 m.require(len(js)==n+45 and m.sha(js[:n])==core['sha256'] and re.fullmatch(br'//# debugId=[A-F0-9]{32}\n',js[n:]) is not None,'executable core and bounded footer')
 named_map=data(build/'named/cli.js.map');fields={k:v for k,v in named_map.items() if k!='debugId'}
 m.require(m.sha(canon(fields))==expected['mapComparison']['allOtherFieldsCanonicalJSONSha256'],'map commitments beyond debugId')
 for k,r in expected['mapComparison']['fieldCommitments'].items():
  b=canon(named_map[k]);m.require(len(b)==r['canonicalJSONBytes'] and m.sha(b)==r['canonicalJSONSha256'],'map field '+k)
 m.require(named_map['debugId']==js[n:].decode().strip().split('=',1)[1],'map/footer debugId agreement')
 del named_map,fields,js,index,target,target_bytes;gc.collect()
 output.mkdir(mode=0o700)
 required=['final/cli.js','final/cli.js.map','named/cli.js','named/cli.js.map','identifier-edits.json','name-emission-report.json','profile.json','compiler-receipts.json']
 inputs={p:pin(build/p) for p in required};pins={'kind':'fresh-public-map-verification-inputs-v1','inputs':inputs}
 pinpath=output/'map-input-pins.json';pb=(json.dumps(pins,indent=2)+'\n').encode();pinpath.write_bytes(pb)
 env=os.environ.copy()
 for k in ['NODE_OPTIONS','NODE_PATH','BUN_OPTIONS','LD_PRELOAD','LD_LIBRARY_PATH']:env.pop(k,None)
 command=[str(node),'--max-old-space-size=2048',str(work/'validation/map/verify-public-map.mjs'),str(work),str(output/'map'),str(pinpath),m.sha(pb)]
 start=time.monotonic();peak=0;stop=None;stop_at=None
 with (output/'map.stdout').open('xb') as so,(output/'map.stderr').open('xb') as se:
  child=subprocess.Popen(command,stdout=so,stderr=se,env=env,start_new_session=True)
  while child.poll() is None:
   try:
    for line in Path(f'/proc/{child.pid}/status').read_text().splitlines():
     if line.startswith(('VmRSS:','VmHWM:')):peak=max(peak,int(line.split()[1])*1024)
   except FileNotFoundError:pass
   if stop is None and (peak>=3000000000 or time.monotonic()-start>600):
    stop='memory' if peak>=3000000000 else 'time';stop_at=time.monotonic()
    try:os.killpg(child.pid,signal.SIGTERM)
    except ProcessLookupError:pass
   elif stop and time.monotonic()-stop_at>5:
    try:os.killpg(child.pid,signal.SIGKILL)
    except ProcessLookupError:pass
   time.sleep(.1)
  code=child.wait()
 m.require(code==0 and stop is None,'independent map verification failed')
 for p,r in inputs.items():m.require(pin(build/p)==r,'output changed during verification')
 contents,_=m.prepare(str(repo),str(cp/'manifest.json'),args.manifest_sha256)
 for rel,b in contents.items():m.require(read(work/rel)==b,'stage/tool changed during verification')
 result={'kind':'V45-public-layout-fixed-profile-acceptance','materializationManifestSha256':args.manifest_sha256,'acceptedProfileSha256':PROFILE,'acceptedToolchainSha256':TOOLCHAIN,'completeOfficialStrictAST':expected['strictAst'],'orderedStatements':18181,'executableCoreMatches':True,'mapFieldsExceptDebugIdMatch':True,'mapReview':pin(output/'map/actual-map-review.json'),'wholeArtifactByteIdentical':inputs['named/cli.js']==expected['savedNamedJavaScript'] and inputs['named/cli.js.map']==expected['savedNamedMap'],'mapVerificationArgv':command,'mapVerificationPeakObservedRSS':peak,'sourceAndToolInputsUnchanged':True,'recipeBindingRolesVerified':57783,'physicalIdentifierEditsVerified':217569,'outputPins':inputs,'applicationExecuted':False,'technicalFixedProfileAccepted':True,'publicationPerformed':False,'limitations':expected['limits']}
 for p,r in list(READ_PINS.items()):
  b=m.read_file(Path(p),128*1024*1024);m.require(len(b)==r['bytes'] and m.sha(b)==r['sha256'],'final verifier input changed: '+p)
 result['consumedInputPins']=[dict(path=p,**r) for p,r in sorted(READ_PINS.items())]
 with (output/'public-relocated-replay.json').open('x') as f:json.dump(result,f,indent=2);f.write('\n')
 print(json.dumps({'result':str(output/'public-relocated-replay.json'),'fixedProfileAccepted':True}))
if __name__=='__main__':main()
