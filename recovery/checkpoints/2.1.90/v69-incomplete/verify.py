#!/usr/bin/env python3
"""Verify or extract saved source bytes. Never import or execute archived code."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import tarfile


def need(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git_object(kind, data):
    return hashlib.sha1(kind.encode() + b' ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def git_tree(rows):
    groups, files = {}, []
    for path, blob, mode in rows:
        if '/' in path:
            first, rest = path.split('/', 1)
            groups.setdefault(first, []).append((rest, blob, mode))
        else:
            files.append((path, blob, mode))
    for name, values in groups.items():
        files.append((name, git_tree(values), '40000'))
    files.sort(key=lambda r: (r[0] + ('/' if r[2] == '40000' else '')).encode())
    content = b''.join(mode.encode() + b' ' + name.encode() + b'\0' + bytes.fromhex(blob) for name, blob, mode in files)
    return git_object('tree', content)


def safe_path(name):
    path = PurePosixPath(name)
    need(bool(name) and not path.is_absolute() and '..' not in path.parts, 'Unsafe path')
    need(path.as_posix() == name and '\\' not in name and '\0' not in name, 'Noncanonical path')
    return path


def verify(base):
    manifest = json.loads((base / 'source-manifest.json').read_text())
    source_pins = json.loads((base / 'git-source-pins.json').read_text())
    rows = manifest['files']
    need(len(rows) == 6114 == manifest['sourceCount'], 'Wrong source count')
    names = [r['path'] for r in rows]
    need(names == sorted(set(names)), 'Source paths are duplicate or unsorted')
    for name in names:
        safe_path(name)
    expected = {r['path']: r for r in rows}
    source_id = digest(''.join(f"{r['path']}\0{r['bytes']}\0{r['sha256']}\n" for r in rows).encode())
    need(source_id == manifest['sourceManifestSha256'] == 'bfa5a6ecf31d5f6c437bca1761627b84bdb3fe7f8fbfb3bf16ffb228aa9a227d', 'Source manifest identity differs')
    need(manifest['archive']['path'] == 'source-inputs.tar.gz', 'Unexpected archive path')
    archive_path = base / 'source-inputs.tar.gz'
    archive_bytes = archive_path.read_bytes()
    need(len(archive_bytes) == manifest['archive']['bytes'], 'Archive byte count differs')
    need(digest(archive_bytes) == manifest['archive']['sha256'], 'Archive hash differs')
    content = {}
    with tarfile.open(archive_path, 'r:gz') as archive:
        for member in archive:
            safe_path(member.name)
            need(member.isfile() and member.type in (tarfile.REGTYPE, tarfile.AREGTYPE), 'Nonregular archive member')
            need(member.name in expected and member.name not in content, 'Unknown or repeated member')
            need(member.mode == 0o644 and member.uid == 0 and member.gid == 0 and member.mtime == 0 and member.uname == member.gname == '', 'Unexpected archive metadata')
            row = expected[member.name]
            need(member.size == row['bytes'], 'Member byte count differs')
            data = archive.extractfile(member).read()
            need(len(data) == row['bytes'] and digest(data) == row['sha256'], 'Source bytes differ')
            content[member.name] = data
    need(set(content) == set(expected), 'Incomplete source membership')
    need(list(content) == names, 'Archive order differs')
    byte_count = sum(map(len, content.values()))
    need(byte_count == manifest['sourceBytes'] == 50692764, 'Source byte total differs')
    pins = source_pins['files']
    need(len(pins) == 1933 and len({r['path'] for r in pins}) == 1933, 'Wrong Git pin membership')
    canonical = digest(json.dumps(pins, separators=(',', ':'), ensure_ascii=False).encode())
    need(canonical == source_pins['pinsCanonicalSha256'] == '7dbac888cd44c6fba4fae883c4ad7a542591d7cb8c30c488e73863be1023e369', 'Canonical Git pins differ')
    for row in pins:
        need(row['path'].startswith('src/') and row['mode'] == '100644', 'Unexpected Git source path or mode')
        data = content[row['path']]
        need(len(data) == row['bytes'] and digest(data) == row['sha256'], 'Git source pin bytes differ')
        need(git_object('blob', data) == row['blob'], 'Git blob differs')
    tree = git_tree([(r['path'][4:], r['blob'], r['mode']) for r in pins])
    need(tree == source_pins['tree'] == manifest['gitSourceTree'] == '38d5b7d1d8caed91eb54bb500d78b924a2a93d53', 'Git src tree differs')
    return content, {'sourceFilesVerified':len(content), 'sourceBytesVerified':byte_count, 'gitSourceBlobsVerified':len(pins), 'derivedSrcTree':tree, 'sourceManifestSha256':source_id, 'wholeVersionAcceptance':False, 'runtimeAcceptance':False, 'compilerExecuted':False, 'applicationExecuted':False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='Optional new, nonexistent directory for verified source inputs')
    args = parser.parse_args()
    base = Path(__file__).resolve().parent
    if args.output is not None:
        need(not os.path.lexists(args.output), 'Output already exists')
    content, result = verify(base)
    if args.output is not None:
        # A quiescent destination parent is required; hostile filesystem races
        # are outside this local data-only extraction contract.
        args.output.mkdir(parents=False, exist_ok=False)
        for name, data in content.items():
            output = args.output / name
            output.parent.mkdir(parents=True, exist_ok=True)
            with output.open('xb') as file:
                file.write(data)
            output.chmod(0o644)
        result['extractedSourceFiles'] = len(content)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
