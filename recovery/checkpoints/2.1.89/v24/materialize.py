#!/usr/bin/env python3
"""Offline fixed-v24 checkpoint materialization. No application code is imported."""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import sys
import tarfile

if sys.flags.optimize:
    raise SystemExit("Python optimization is forbidden")

EXPECTED = {"sourceFiles": 6084, "sourceBytes": 50949448,
            "sourceManifestSha256": "35183b90baf51d35a8aed77ea163f34c7ca08e14af8112b7417ab44bed005567",
            "derivedSrcTree": "5d72e1229ae190ff3d8f77317231ca57d24f10f9"}
MAX_FILE = 32 * 1024 * 1024
MAX_TAR = 128 * 1024 * 1024
MAX_TOTAL = 256 * 1024 * 1024
CHECKPOINT = "recovery/checkpoints/2.1.89/v24"
VALIDATION = {"validation/scripts/strict-ast-digest.mjs", "validation/lib/strict-ast.mjs"}

def require(ok, message):
    if not ok:
        raise ValueError(message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def safe_rel(value):
    require(isinstance(value, str) and 0 < len(value) <= 4096, "invalid relative path")
    require(not value.startswith("/") and "\\" not in value and all(ord(c) >= 32 for c in value), "unsafe relative path")
    require(all(x not in ("", ".", "..") for x in value.split("/")), "unsafe path component")
    return value

def canonical(path, kind):
    p = Path(path)
    require(p.is_absolute() and str(p) == str(path), "absolute normalized path required")
    require(p.resolve(strict=True) == p, "symlink or noncanonical path")
    for q in (p, *p.parents):
        require(not q.is_symlink(), "symlink ancestor")
    mode = p.lstat().st_mode
    require(stat.S_ISDIR(mode) if kind == "dir" else stat.S_ISREG(mode), "wrong filesystem type")
    return p

def read_file(path, limit=MAX_FILE):
    p = canonical(path, "file")
    size = p.stat().st_size
    require(size <= limit, "file exceeds bounded read")
    with p.open("rb") as f:
        data = f.read(limit + 1)
    require(len(data) == size and len(data) <= limit, "file changed or exceeds bound")
    return data

def json_bytes(data):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "duplicate JSON key")
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=pairs,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError("nonfinite JSON")))

def row(value):
    require(isinstance(value, dict), "invalid file row")
    p = safe_rel(value.get("path"))
    n = value.get("bytes")
    h = value.get("sha256")
    require(type(n) is int and 0 <= n <= MAX_FILE, "invalid byte bound")
    require(isinstance(h, str) and re.fullmatch(r"[0-9a-f]{64}", h), "invalid digest")
    return {"path": p, "bytes": n, "sha256": h}

def rows(values):
    require(isinstance(values, list) and len(values) <= 10000, "invalid inventory")
    result = {}
    for value in values:
        r = row(value)
        require(r["path"] not in result, "duplicate inventory path")
        result[r["path"]] = r
    require(sum(r["bytes"] for r in result.values()) <= MAX_TOTAL, "inventory exceeds bound")
    for p in result:
        require(not any(str(parent) in result for parent in Path(p).parents if str(parent) != "."), "file/directory collision")
    return result

def validation_rows(inventory):
    selected = {p for p in inventory if p.startswith("validation/")}
    require(selected == VALIDATION, "validation file census")
    return selected

def checked(data, descriptor):
    require(len(data) == descriptor["bytes"] and sha(data) == descriptor["sha256"], "file identity mismatch: " + descriptor["path"])
    return data

def archive(data, expected):
    # Allow the baseline's POSIX extended path headers, but no other PAX semantics.
    with gzip.GzipFile(fileobj=io.BytesIO(data), mode="rb") as gz:
        raw = gz.read(MAX_TAR + 1)
    require(len(raw) <= MAX_TAR and len(raw) % 512 == 0, "archive decompression bound/alignment")
    found = {}
    end = 0
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:", errorlevel=2) as tar:
        for member in tar:
            name = safe_rel(member.name)
            require(name not in found, "duplicate archive member")
            require(name in expected, "unknown archive member: " + name)
            require(member.type in (tarfile.REGTYPE, tarfile.AREGTYPE) and not member.sparse and not member.linkname,
                    "non-regular archive member")
            require(member.mode == 0o644, "unexpected archive mode")
            require(not tar.pax_headers and set(member.pax_headers) <= {"path"}, "unsupported archive extension")
            require(not member.pax_headers or member.pax_headers["path"] == name, "PAX path mismatch")
            require(member.size == expected[name]["bytes"], "archive size mismatch")
            f = tar.extractfile(member)
            require(f is not None, "missing regular data")
            body = f.read(member.size + 1)
            found[name] = checked(body, expected[name])
            end = member.offset_data + ((member.size + 511) // 512) * 512
    require(set(found) == set(expected), "missing archive members")
    require(len(raw) - end >= 1024 and not any(raw[end:]), "nonzero/truncated archive trailer")
    return found

def source_digest(inventory):
    return sha("".join(f"{p}\0{r['bytes']}\0{r['sha256']}\n" for p, r in sorted(inventory.items())).encode())

def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def git_tree(pins, data):
    root = {}
    require(len(pins) == 1922, "Git row count")
    seen = set()
    for pin in pins:
        r = row(pin)
        p = r["path"]
        require(p.startswith("src/") and p not in seen and pin.get("mode") == "100644", "Git row path/mode")
        require(p in data, "Git source absent")
        checked(data[p], r)
        blob = git_blob(data[p])
        require(blob == pin.get("blob"), "Git blob mismatch")
        seen.add(p)
        cursor = root
        parts = p.split("/")[1:]
        for part in parts[:-1]:
            cursor = cursor.setdefault(part, {})
            require(isinstance(cursor, dict), "Git file/directory collision")
        require(parts[-1] not in cursor, "Git tree collision")
        cursor[parts[-1]] = blob
    def digest(tree):
        payload = b""
        for name, value in sorted(tree.items(), key=lambda x: (x[0] + ("/" if isinstance(x[1], dict) else "")).encode()):
            is_dir = isinstance(value, dict)
            value = digest(value) if is_dir else value
            payload += ("40000" if is_dir else "100644").encode() + b" " + name.encode() + b"\0" + bytes.fromhex(value)
        return hashlib.sha1(b"tree " + str(len(payload)).encode() + b"\0" + payload).hexdigest()
    return digest(root)

def prepare(repo_root, manifest_path, manifest_sha256):
    repo = canonical(repo_root, "dir")
    manifest_path = canonical(manifest_path, "file")
    checkpoint = repo / CHECKPOINT
    require(manifest_path == checkpoint / "manifest.json", "fixed checkpoint manifest location required")
    require(re.fullmatch(r"[0-9a-f]{64}", manifest_sha256) is not None, "external manifest digest required")
    manifest_bytes = read_file(manifest_path)
    require(sha(manifest_bytes) == manifest_sha256, "external manifest authentication failed")
    manifest = json_bytes(manifest_bytes)
    require(manifest.get("expected") == EXPECTED, "wrong fixed-v24 expectations")
    inventory = rows(manifest.get("files"))
    require({"profile.json", "toolchain.json", "source-overlay.tar.gz"} <= set(inventory), "checkpoint core missing")
    validation_rows(inventory)
    # Snapshot all authenticated publication members before making any output.
    selected = {}
    for p, r in inventory.items():
        body = checked(read_file(checkpoint / p), r)
        if p in {"profile.json", "toolchain.json", "source-overlay.tar.gz"} or p.startswith("runtime/") or p in VALIDATION:
            selected[p] = body
    profile = json_bytes(selected["profile.json"])
    toolchain = json_bytes(selected["toolchain.json"])
    require(profile.get("version") == "2.1.89" and profile.get("sourceRevision") == 24, "wrong version/revision")
    current = rows(profile.get("sourceFiles"))
    require(len(current) == EXPECTED["sourceFiles"] and profile.get("sourceCount") == len(current), "source census count")
    require(sum(r["bytes"] for r in current.values()) == EXPECTED["sourceBytes"], "source byte census")
    require(source_digest(current) == EXPECTED["sourceManifestSha256"] == profile.get("sourceManifestSha256"), "source manifest")
    contract = profile["sourceTreeContract"]
    require([contract.get(k) for k in ("expectedStagedFiles", "expectedStagedSourceFiles", "expectedGitSourceFiles", "expectedExtraSourceAssets")] == [6084,1951,1922,29], "source contract counts")
    require(sum(p.startswith("src/") for p in current) == 1951, "staged src census")
    def reference(key):
        r = row(manifest[key])
        return r, checked(read_file(repo / r["path"]), r)
    br, baseline_bytes = reference("baselineManifest")
    ar, baseline_archive = reference("baselineArchive")
    dr, dependency_archive = reference("dependencyArchive")
    require(br["path"] == "recovery/baselines/2.1.88/source-archive.json" and ar["path"] == "recovery/baselines/2.1.88/source-inputs.tar.gz" and dr["path"] == "recovery/tooling/locked-node-dependencies.tar.gz", "unexpected repository archive path")
    baseline = json_bytes(baseline_bytes)
    require(baseline.get("archive") == {"bytes": ar["bytes"], "sha256": ar["sha256"]}, "baseline archive link")
    base = rows(baseline["files"])
    require(len(base) == 6067 and source_digest(base) == baseline.get("sourceManifestSha256"), "baseline census")
    require(set(base) <= set(current), "source removals forbidden")
    overlay = manifest["overlay"]
    overlay_ref = row(overlay)
    require(overlay_ref == inventory["source-overlay.tar.gz"], "overlay archive link")
    overlay_rows = rows(overlay["files"])
    delta = {p:r for p,r in current.items() if base.get(p) != r}
    require(len(delta) == 152 and overlay_rows == delta, "overlay must be the exact 152 changed/new inputs")
    metadata = rows([dict(v, path=k) for k,v in baseline["metadata"].items()])
    require(set(metadata) == {"README.md", "INPUT-MANIFEST.json"}, "baseline metadata census")
    base_archive_rows = {"inputs/" + p:dict(r,path="inputs/" + p) for p,r in base.items()}
    base_archive_rows.update(metadata)
    packed_base = archive(baseline_archive, base_archive_rows)
    source = {p:packed_base["inputs/" + p] for p in base}
    source.update(archive(selected["source-overlay.tar.gz"], overlay_rows))
    require(set(source) == set(current), "merged source census")
    for p,body in source.items():
        checked(body,current[p])
    tree = git_tree(profile["sourceTreePins"], source)
    require(tree == EXPECTED["derivedSrcTree"] == contract.get("currentDerivedSrcTree"), "derived Git tree")
    tools = rows(toolchain["files"])
    require(len(tools) == 69 and all(r.get("root") == "recovery" for r in toolchain["files"]), "runtime root/census")
    deps = {p:r for p,r in tools.items() if p.startswith("node_modules/")}
    require(len(deps) == 46, "dependency member count")
    runtime = archive(dependency_archive, deps)
    nondeps = {p:r for p,r in tools.items() if not p.startswith("node_modules/")}
    require({p[8:] for p in selected if p.startswith("runtime/")} == set(nondeps), "runtime publication census")
    for p,r in nondeps.items():
        runtime[p] = checked(selected["runtime/"+p],r)
    for r in profile["tools"]:
        require(r.get("root") == "recovery" and row(r) == tools.get(r["path"]), "profile/runtime tool link")
    result = {"inputs/"+p:b for p,b in source.items()}
    result.update({"recovery/"+p:b for p,b in runtime.items()})
    result.update({"validation/"+p:runtime[p] for p in deps})
    result.update({p:selected[p] for p in VALIDATION})
    for p in ("profile.json", "toolchain.json"):
        name = "recovery/profiles/2.1.89/"+p
        require(name not in result, "profile collision")
        result[name] = selected[p]
    rows([{"path":p,"bytes":len(b),"sha256":sha(b)} for p,b in result.items()])
    return result, {"manifestSha256":manifest_sha256, **EXPECTED, "runtimeFiles":len(runtime), "validationFiles":len(deps)+len(VALIDATION), "outputFiles":len(result), "applicationExecuted":False}

def publish(output_root, repo_root, contents):
    root = Path(output_root)
    require(root.is_absolute() and str(root) == str(output_root), "new absolute output root required")
    canonical(root.parent, "dir")
    rows([{"path":p,"bytes":len(b),"sha256":sha(b)} for p,b in contents.items()])
    require(not os.path.lexists(root), "output root already exists")
    repo = canonical(repo_root,"dir")
    require(root != repo and repo not in root.parents and root not in repo.parents, "output overlaps repository")
    # All paths and bytes were authenticated before this first write. The caller
    # must keep this new private output and its parent free from concurrent writers.
    root.mkdir(mode=0o700)
    for p,body in sorted(contents.items()):
        destination = root / safe_rel(p)
        destination.parent.mkdir(parents=True, exist_ok=True)
        canonical(destination.parent,"dir")
        with destination.open("xb") as f:
            f.write(body)
        destination.chmod(0o644)
    return root

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--manifest-sha256", required=True)
    parser.add_argument("--output-root", required=True)
    args = parser.parse_args()
    # Check destination before expensive authentication, but never create it yet.
    destination = Path(args.output_root)
    require(destination.is_absolute() and not os.path.lexists(destination), "new absolute output root required")
    canonical(destination.parent,"dir")
    contents, report = prepare(args.repo_root,args.manifest,args.manifest_sha256)
    publish(args.output_root,args.repo_root,contents)
    print(json.dumps(report,sort_keys=True))

if __name__ == "__main__":
    main()
