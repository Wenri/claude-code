#!/usr/bin/env python3
"""Run four serial, candidate-only V45 build/inspection phases. Never run the application."""
import argparse
import gc
import hashlib
import json
import os
from pathlib import Path
import resource
import shutil
import signal
import subprocess
import sys
import time
import materialize as m

if sys.flags.optimize:
    raise SystemExit('Python optimization is forbidden')
NODE = {'bytes': 125989464, 'sha256': 'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12'}
BUN = {'bytes': 99295408, 'sha256': '6d5bb405b1d037a2a466b92757de7e47e4369930fa94bd42f8ff44ba49de6c57'}
PROFILE = '4001b061fbbe002c516af835ba9d5c0c97b15666eed9ba0cee99e4ace6e21120'
TOOLCHAIN = '8181e007ccb1b0fc379f64ff393196b05f140068a419a9160b839a0dc96fc48a'
MEMORY = 3000000000

def identity(path, expected=None):
    p = m.canonical(path, 'file')
    data = m.read_file(p, 256 * 1024 * 1024)
    result = {'bytes': len(data), 'sha256': m.sha(data)}
    if expected is not None:
        m.require(result == expected, 'external runtime identity mismatch: '+str(p))
    return result

def verify_stage(stage, expected):
    stage = m.canonical(stage, 'dir')
    actual = {}
    for selected in [stage, m.canonical(stage.parent/'validation', 'dir')]:
        for directory, dirs, files in os.walk(selected, followlinks=False):
            for name in dirs:
                m.canonical(Path(directory)/name, 'dir')
            for name in files:
                p = Path(directory)/name
                rel = p.relative_to(stage.parent).as_posix()
                m.require(rel in expected, 'unexpected stage/validation file: '+rel)
                m.require(p.lstat().st_mode & 0o7777 == 0o644, 'stage mode mismatch')
                m.require(m.read_file(p) == expected[rel], 'stage bytes mismatch: '+rel)
                actual[rel] = True
    m.require(set(actual) == set(expected), 'missing stage/validation file')

def new_root(path, protected):
    p = Path(path)
    m.require(p.is_absolute() and str(p) == str(path), 'absolute normalized output required')
    m.canonical(p.parent, 'dir')
    m.require(not os.path.lexists(p), 'refusing existing output')
    for q in protected:
        m.require(p != q and p not in q.parents and q not in p.parents, 'output overlap')
    return p

def write_json(path, obj):
    data = (json.dumps(obj, indent=2)+'\n').encode()
    with path.open('xb') as f: f.write(data)
    return m.sha(data)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['repo-root','manifest-sha256','stage-root','output-root','node','bun']:
        parser.add_argument('--'+name, required=True)
    args = parser.parse_args()
    repo = m.canonical(args.repo_root,'dir'); stage = m.canonical(args.stage_root,'dir')
    node = m.canonical(args.node,'file'); bun = m.canonical(args.bun,'file')
    artifacts = new_root(args.output_root, [repo,stage,node,bun])
    m.require(stage.name == 'v45-source-batch' and artifacts.name == 'source-batch-v45-diagnostic' and stage.parent == artifacts.parent, 'fixed sibling stage/output layout required')
    validation = m.canonical(stage.parent/'validation','dir')
    output = new_root(str(stage.parent/'v45-public-run-receipts'), [repo,stage,validation,node,bun])
    m.require(Path('/proc/self/status').is_file(), 'Linux /proc memory accounting required')
    identity(node,NODE); identity(bun,BUN)
    contents, preparation = m.prepare(str(repo),str(repo/m.CHECKPOINT/'manifest.json'),args.manifest_sha256)
    verify_stage(stage,contents)
    del contents; gc.collect()
    profile=stage/'recovery/profiles/2.1.89/profile.json'
    toolchain=stage/'recovery/profiles/2.1.89/toolchain.json'
    m.require(identity(profile)['sha256']==PROFILE and identity(toolchain)['sha256']==TOOLCHAIN,'accepted profile/toolchain changed')
    closure=m.json_bytes(m.read_file(validation/'tool-closure.json'))
    m.require(closure['kind']=='V45-relative-independent-inspector-closure-v1' and closure['node']==NODE, 'wrong inspector closure')
    rows=m.rows(closure['files']); m.require(len(rows)==15,'inspector file count')
    pins=[dict(path=str(node),**NODE)]
    for rel,row in sorted(rows.items()):
        p=stage.parent/m.safe_rel(rel)
        m.checked(m.read_file(p),row)
        pins.append(dict(row,path=str(p)))
    m.require(shutil.disk_usage(output.parent).free > 600*1024*1024, '600MiB free disk required')
    output.mkdir(mode=0o700)
    pinpath=output/'tool-pins.json'
    pinhash=write_json(pinpath,{'version':'statement-diagnostics-tool-closure-v1','files':pins})
    env=os.environ.copy()
    for key in ['NODE_PATH','NODE_OPTIONS','BUN_OPTIONS','LD_PRELOAD','LD_LIBRARY_PATH']: env.pop(key,None)
    common=['--profile',str(profile),'--expected-profile-sha256',PROFILE,'--toolchain',str(toolchain),'--expected-toolchain-sha256',TOOLCHAIN,'--input-root',str(stage/'inputs'),'--output-root',str(artifacts)]
    steps=[]
    def run(name,command):
        started=time.monotonic(); peak=0; stopped=None; stop_at=None
        with (output/(name+'.stdout')).open('xb') as stdout,(output/(name+'.stderr')).open('xb') as stderr:
            process=subprocess.Popen(list(map(str,command)),stdout=stdout,stderr=stderr,env=env,start_new_session=True,cwd=output)
            while process.poll() is None:
                try:
                    for line in Path(f'/proc/{process.pid}/status').read_text().splitlines():
                        if line.startswith(('VmRSS:','VmHWM:')): peak=max(peak,int(line.split()[1])*1024)
                except FileNotFoundError: pass
                elapsed=time.monotonic()-started
                if stopped is None and (peak >= MEMORY or elapsed > 600):
                    stopped='memory' if peak >= MEMORY else 'time'; stop_at=time.monotonic()
                    try: os.killpg(process.pid,signal.SIGTERM)
                    except ProcessLookupError: pass
                elif stopped is not None and time.monotonic()-stop_at>5:
                    try: os.killpg(process.pid,signal.SIGKILL)
                    except ProcessLookupError: pass
                time.sleep(.1)
            code=process.wait()
        peak=max(peak,resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss*1024)
        row={'phase':name,'argv':list(map(str,command)),'exitCode':code,'seconds':time.monotonic()-started,'peakRSSUpperBoundBytes':peak,'measurementIncludesPriorChildHighWater':True,'stopped':stopped,'stdout':identity(output/(name+'.stdout')),'stderr':identity(output/(name+'.stderr'))}
        write_json(output/(name+'-receipt.json'),row); steps.append(row)
        m.require(code==0 and stopped is None and peak<MEMORY,'phase failed: '+name)
    run('compile',[bun,'--no-env-file','--no-install',stage/'recovery/scripts/build-2.1.89-candidate.mjs','--compile',*common])
    run('finalize',[node,'--max-old-space-size=1024',stage/'recovery/scripts/finalize-2.1.89-candidate.mjs','--finalize',*common,'--expected-compile-report-sha256',identity(artifacts/'compile-report.json')['sha256']])
    run('name',[node,'--max-old-space-size=2048','--expose-gc',stage/'recovery/scripts/name-2.1.89-candidate.mjs','--name',*common,'--expected-late-link-report-sha256',identity(artifacts/'late-link-report.json')['sha256']])
    run('index',[node,'--max-old-space-size=2048',validation/'restore-20261004/statement-diagnostics-tool/cli.mjs','inspect','--input',artifacts/'named/cli.js','--input-sha256',identity(artifacts/'named/cli.js')['sha256'],'--output',output/'index.json','--tool-pins',pinpath,'--tool-pins-sha256',pinhash])
    contents,_=m.prepare(str(repo),str(repo/m.CHECKPOINT/'manifest.json'),args.manifest_sha256)
    verify_stage(stage,contents); del contents; gc.collect()
    identity(node,NODE);identity(bun,BUN)
    report={'kind':'V45-public-layout-four-phase-build','preparation':preparation,'steps':steps,'stageUnchanged':True,'node':NODE,'bun':BUN,'applicationExecuted':False,'comparisonReferenceProvidedToBuild':False,'wholeAccepted':False,'limits':['Fixed Linux runtime and profile only. RSS monitoring is sampled, not OS isolation. No application execution. Target comparison is a separate post-build step.']}
    write_json(output/'build-receipt.json',report)
    print(json.dumps({'output':str(artifacts),'receipts':str(output),'phases':len(steps),'applicationExecuted':False}))
if __name__=='__main__': main()
