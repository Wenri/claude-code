#!/usr/bin/env python3
"""Stdlib-only materializer controls; temporary files stay under the chosen root."""
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('materialize',HERE/'materialize.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
passed=[]
def check(name,fn):
    fn();passed.append(name)
def reject(fn):
    try: fn()
    except (ValueError,OSError,KeyError,TypeError,tarfile.TarError,EOFError): return
    raise RuntimeError('mutation unexpectedly accepted')
def eq(a,b):
    if a!=b: raise RuntimeError('equality failed')
def descriptor(path,body):return dict(path=path,bytes=len(body),sha256=m.sha(body))
def make_tar(items,pax=False):
    out=io.BytesIO()
    with tarfile.open(fileobj=out,mode='w',format=tarfile.PAX_FORMAT if pax else tarfile.USTAR_FORMAT) as t:
        for name,body,typ,mode in items:
            a=tarfile.TarInfo(name);a.size=len(body);a.type=typ;a.mode=mode
            if typ in (tarfile.SYMTYPE,tarfile.LNKTYPE):a.linkname='x'
            t.addfile(a,io.BytesIO(body))
    return gzip.compress(out.getvalue(),mtime=0)
good=[('a',b'hello',tarfile.REGTYPE,0o644)]
wanted={'a':descriptor('a',b'hello')}
check('valid regular archive',lambda:eq(m.archive(make_tar(good),wanted),{'a':b'hello'}))
for name in ['/abs','../escape','a/../b','a//b','./a','a\\b','a\nq','a/']:
    check('path refusal '+repr(name),lambda n=name:reject(lambda:m.safe_rel(n)))
for typ in [tarfile.SYMTYPE,tarfile.LNKTYPE,tarfile.DIRTYPE,tarfile.FIFOTYPE,tarfile.CHRTYPE,tarfile.BLKTYPE]:
    check('archive type '+repr(typ),lambda t=typ:reject(lambda:m.archive(make_tar([('a',b'',t,0o644)]),{'a':descriptor('a',b'')})))
check('duplicate member',lambda:reject(lambda:m.archive(make_tar(good+good),wanted)))
check('unknown member',lambda:reject(lambda:m.archive(make_tar(good+[('b',b'',tarfile.REGTYPE,0o644)]),wanted)))
check('missing member',lambda:reject(lambda:m.archive(make_tar([]),wanted)))
check('wrong size',lambda:reject(lambda:m.archive(make_tar([('a',b'hell',tarfile.REGTYPE,0o644)]),wanted)))
check('wrong bytes',lambda:reject(lambda:m.archive(make_tar([('a',b'jello',tarfile.REGTYPE,0o644)]),wanted)))
check('executable archive mode',lambda:reject(lambda:m.archive(make_tar([('a',b'hello',tarfile.REGTYPE,0o755)]),wanted)))
check('nonzero trailer',lambda:reject(lambda:m.archive(gzip.compress(gzip.decompress(make_tar(good))+b'Q'*512),wanted)))
check('missing zero trailer',lambda:reject(lambda:m.archive(gzip.compress(gzip.decompress(make_tar(good))[:1024]),wanted)))
long='path/'+'x'*150
check('baseline-style PAX path',lambda:eq(m.archive(make_tar([(long,b'q',tarfile.REGTYPE,0o644)],True),{long:descriptor(long,b'q')}),{long:b'q'}))
o=io.BytesIO()
with tarfile.open(fileobj=o,mode='w',format=tarfile.PAX_FORMAT) as t:
    a=tarfile.TarInfo('a');a.size=5;a.mode=0o644;a.pax_headers={'comment':'unknown'};t.addfile(a,io.BytesIO(b'hello'))
check('nonpath PAX metadata',lambda:reject(lambda:m.archive(gzip.compress(o.getvalue()),wanted)))
check('duplicate inventory',lambda:reject(lambda:m.rows(list(wanted.values())*2)))
check('prefix collision',lambda:reject(lambda:m.rows([descriptor('a',b''),descriptor('a/b',b'')])))
check('bool size',lambda:reject(lambda:m.row(dict(path='x',bytes=True,sha256='0'*64))))
check('oversize row',lambda:reject(lambda:m.row(dict(path='x',bytes=m.MAX_FILE+1,sha256='0'*64))))
check('duplicate JSON key',lambda:reject(lambda:m.json_bytes(b'{"x":1,"x":2}')))
check('nonfinite JSON',lambda:reject(lambda:m.json_bytes(b'{"x":NaN}')))
validation={p:descriptor(p,b'x') for p in m.VALIDATION}
check('validation exact allowlist',lambda:eq(m.validation_rows(validation),m.VALIDATION))
check('validation missing member',lambda:reject(lambda:m.validation_rows({next(iter(validation)):next(iter(validation.values()))})))
check('validation unknown member',lambda:reject(lambda:m.validation_rows({**validation,'validation/unknown.mjs':descriptor('validation/unknown.mjs',b'x')})))
check('validation dependency collision',lambda:reject(lambda:m.validation_rows({**validation,'validation/node_modules/acorn/dist/acorn.mjs':descriptor('validation/node_modules/acorn/dist/acorn.mjs',b'x')})))
check('validation file-directory collision',lambda:reject(lambda:m.rows([*validation.values(),descriptor('validation',b'x')])) )
old=m.MAX_TAR;m.MAX_TAR=512
check('decompression bound',lambda:reject(lambda:m.archive(make_tar(good),wanted)))
m.MAX_TAR=old
with tempfile.TemporaryDirectory(dir=os.environ.get('CHECKPOINT_CONTROL_TMPDIR',str(HERE))) as tmp:
    root=Path(tmp);repo=root/'repo';repo.mkdir()
    f=repo/'f';f.write_bytes(b'hello')
    check('regular input read',lambda:eq(m.read_file(f),b'hello'))
    link=repo/'link';link.symlink_to(f)
    check('input symlink',lambda:reject(lambda:m.read_file(link)))
    ancestor=root/'ancestor';ancestor.symlink_to(repo,target_is_directory=True)
    check('symlink ancestor',lambda:reject(lambda:m.read_file(ancestor/'f')))
    check('bounded input read',lambda:reject(lambda:m.read_file(f,4)))
    fifo=repo/'fifo';os.mkfifo(fifo)
    check('special input file',lambda:reject(lambda:m.read_file(fifo)))
    check('relative output',lambda:reject(lambda:m.publish('relative',repo,{})))
    check('existing output',lambda:reject(lambda:m.publish(repo,repo,{})))
    check('output inside repo',lambda:reject(lambda:m.publish(repo/'new',repo,{})))
    check('output ancestor symlink',lambda:reject(lambda:m.publish(ancestor/'out',repo,{})))
    bad=root/'bad'
    check('output traversal before creation',lambda:reject(lambda:m.publish(bad,repo,{'../escape':b'x'})))
    check('no output on invalid publication',lambda:eq(os.path.lexists(bad),False))
    out=root/'out'
    check('valid publication',lambda:m.publish(out,repo,{'inputs/a':b'hello','recovery/b':b'world'}))
    check('complete publication bytes',lambda:eq({str(p.relative_to(out)):p.read_bytes() for p in out.rglob('*') if p.is_file()},{'inputs/a':b'hello','recovery/b':b'world'}))
    check('publication modes',lambda:eq({p.stat().st_mode&0o777 for p in out.rglob('*') if p.is_file()},{0o644}))
    check('refuse output reuse',lambda:reject(lambda:m.publish(out,repo,{})))
check('optimization refusal',lambda:eq(subprocess.run([sys.executable,'-I','-B','-O',str(HERE/'materialize.py'),'--help'],capture_output=True).returncode,1))
print(json.dumps({'groups':len(passed),'passed':passed,'applicationExecuted':False},indent=2))
