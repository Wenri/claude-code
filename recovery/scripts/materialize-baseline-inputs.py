#!/usr/bin/env python3
"""Validate/extract only the supplied pinned source-input archive; never fetch or execute sources."""
import argparse, hashlib, json, os, stat, tarfile
from pathlib import Path, PurePosixPath
if not __debug__:
    raise RuntimeError('Optimized Python disables required validation; run without -O/PYTHONOPTIMIZE')

def digest_file(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    return h.hexdigest()
def safe_relative(value):
    assert isinstance(value,str) and value and not any(c in value for c in ['\\','\0','\r','\n'])
    assert not value.startswith('/') and all(p and p not in ['.','..'] for p in value.split('/'))
    return value
def no_symlinks(path, allow_missing=False):
    path=Path(os.path.abspath(path))
    for p in [path,*path.parents]:
        try: assert not stat.S_ISLNK(p.lstat().st_mode),f'symlink: {p}'
        except FileNotFoundError:
            assert allow_missing
    return path
def assert_archive(archive,pin):
    no_symlinks(archive)
    assert archive.is_file() and archive.stat().st_size==pin['bytes']
    assert digest_file(archive)==pin['sha256'],'archive digest differs'
def scan_archive(archive, spec, destination=None):
    expected={safe_relative(f['path']):f for f in spec['files']}
    assert len(expected)==len(spec['files'])
    total_expected=sum(f['bytes'] for f in expected.values())
    metadata=spec['metadata'];seen=set();total=0
    with tarfile.open(archive,'r|gz') as tar:
        for member in tar:
            name=safe_relative(member.name)
            assert name not in seen,'duplicate member';seen.add(name)
            assert member.isreg() and not member.issparse() and not member.linkname,'non-regular archive member'
            assert not member.pax_headers or member.pax_headers=={'path':member.name},'unexpected extended metadata'
            if name in metadata:
                expected_pin=metadata[name];relative=None
            else:
                assert name.startswith('inputs/'),'unlisted root member'
                relative=safe_relative(name[len('inputs/'):]);assert relative in expected,'unlisted input'
                expected_pin=expected[relative]
            assert member.size==expected_pin['bytes'],'member size differs'
            stream=tar.extractfile(member);assert stream is not None
            h=hashlib.sha256();size=0;fd=None
            if destination is not None and relative is not None:
                target=destination/relative;target.parent.mkdir(parents=True,exist_ok=True);no_symlinks(target.parent)
                fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
            try:
                while True:
                    block=stream.read(65536)
                    if not block:break
                    size+=len(block);assert size<=member.size;h.update(block)
                    if fd is not None:
                        at=0
                        while at<len(block):at+=os.write(fd,block[at:])
            finally:
                if fd is not None:os.close(fd)
            assert size==member.size and h.hexdigest()==expected_pin['sha256'],'member hash differs'
            if relative is not None:total+=size;assert total<=total_expected
    assert seen==set(metadata)|{'inputs/'+p for p in expected},'missing members'
    assert total==total_expected
    return {'files':len(expected),'bytes':total}
def materialize(archive,spec,destination=None):
    archive=no_symlinks(archive);assert_archive(archive,spec['archive'])
    # Complete archive/member authentication before any output directory exists.
    result=scan_archive(archive,spec)
    assert_archive(archive,spec['archive'])
    if destination is not None:
        destination=no_symlinks(destination,True)
        assert not destination.exists(),'destination must be new'
        assert archive!=destination and destination not in archive.parents,'destination would overlap archive'
        destination.mkdir(parents=True,exist_ok=False)
        scan_archive(archive,spec,destination)
        actual=[]
        for path in destination.rglob('*'):
            assert not path.is_symlink()
            if path.is_file():actual.append({'path':str(path.relative_to(destination)),'bytes':path.stat().st_size,'sha256':digest_file(path)})
        assert sorted(actual,key=lambda f:f['path'])==sorted(spec['files'],key=lambda f:f['path'])
    assert_archive(archive,spec['archive'])
    return {**result,'materialized':destination is not None,'applicationCodeExecuted':False}
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--archive',required=True,type=Path);parser.add_argument('--manifest',required=True,type=Path)
    parser.add_argument('--manifest-sha256',required=True);parser.add_argument('--output-root',type=Path)
    args=parser.parse_args();no_symlinks(args.manifest)
    data=args.manifest.read_bytes();assert hashlib.sha256(data).hexdigest()==args.manifest_sha256
    spec=json.loads(data);assert spec['kind']=='pinned-baseline-source-archive-v1' and spec['version']=='2.1.88'
    assert len(spec['files'])==6067 and sum(f['bytes'] for f in spec['files'])==51618606
    assert set(spec['metadata'])=={'README.md','INPUT-MANIFEST.json'}
    if args.output_root:
        out=Path(os.path.abspath(args.output_root));recovery=Path(__file__).resolve().parents[1]
        assert out!=recovery and recovery not in out.parents and out not in recovery.parents,'output overlaps tools'
        assert out!=args.manifest.resolve() and out not in args.manifest.resolve().parents,'output overlaps manifest'
    print(json.dumps(materialize(args.archive,spec,args.output_root)))
if __name__=='__main__':main()
