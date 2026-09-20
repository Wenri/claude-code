#!/usr/bin/env python3
"""Test one existing launcher against pinned, prebuilt Ubuntu glibc runtimes.

Requires Python 3, dpkg-deb, and native x86-64 GCC/binutils. Nothing is installed
and no glibc source is built. Only the test programs are compiled, using the
2.31 libc development files as a sysroot so newer hosts can test older runtimes.
"""

import argparse
import hashlib
import os
from pathlib import Path
import platform
import shlex
import shutil
import subprocess
import sys
import tempfile
import urllib.request


HERE = Path(__file__).resolve().parent
CACHE = HERE.parent / ".build" / "glibc-matrix"
ARCHIVE = "https://archive.ubuntu.com/ubuntu/pool/main/g/glibc/"
# SHA256 values verified against Ubuntu's official *-updates/main/binary-amd64/
# Packages.xz indexes (focal, jammy, noble, questing), 2026-09-20.
RUNTIMES = {
    "2.31": ("libc6_2.31-0ubuntu9.18_amd64.deb",
             "1b2281aac4935dfea1f89dfc19e445fdbb45303202af60679ccb8bf035f081a0"),
    "2.35": ("libc6_2.35-0ubuntu3.15_amd64.deb",
             "79e35256227e16a607c154cdeb8d76ff12d20e31de286ea7fd9ad3b96fe0452d"),
    "2.39": ("libc6_2.39-0ubuntu8.9_amd64.deb",
             "ff5557d99b51f761c4b7c92368b9cc45565eda17df9bf9eb4b134d09825008be"),
    "2.42": ("libc6_2.42-0ubuntu3.1_amd64.deb",
             "21cfeebe5d8dfd68acc88cea3118d41e35b5e1430a77b4f1109ac693fea65058"),
}
BASELINE_DEV = (
    "libc6-dev_2.31-0ubuntu9.18_amd64.deb",
    "11029900f2315b93ce487792ae1bf15f0927e5e50880c091e6a440b14d4e164a",
)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def download(package, cache):
    name, expected = package
    downloads = cache / "downloads"
    downloads.mkdir(parents=True, exist_ok=True)
    archive = downloads / name
    if not archive.exists():
        print(f"Download: {ARCHIVE}{name}", flush=True)
        with tempfile.TemporaryDirectory(dir=downloads) as directory:
            temporary = Path(directory) / name
            with urllib.request.urlopen(ARCHIVE + name, timeout=60) as response, \
                    temporary.open("wb") as output:
                shutil.copyfileobj(response, output)
            if sha256(temporary) != expected:
                raise ValueError(f"SHA256 mismatch for downloaded {name}")
            temporary.replace(archive)
    # Check cached downloads too, before passing anything to dpkg-deb.
    if sha256(archive) != expected:
        raise ValueError(f"SHA256 mismatch for {archive}; remove it and retry")
    return archive


def localize_symlinks(root):
    # libc6-dev uses absolute links such as /lib/.../libpthread.so.0. Without
    # rewriting these, the linker follows them into the host despite --sysroot.
    for path in root.rglob("*"):
        if path.is_symlink():
            target = os.readlink(path)
            if target.startswith("/"):
                path.unlink()
                path.symlink_to(os.path.relpath(root / target.lstrip("/"), path.parent))


def extract(name, packages, cache):
    archives = [download(package, cache) for package in packages]
    roots = cache / "roots"
    roots.mkdir(parents=True, exist_ok=True)
    destination = roots / name
    # Re-extract verified archives each run; this is cheap and prevents stale or
    # locally modified libraries in an extracted tree from affecting the result.
    with tempfile.TemporaryDirectory(prefix=name + "-", dir=roots) as directory:
        root = Path(directory) / "root"
        for archive in archives:
            subprocess.run(["dpkg-deb", "--extract", str(archive), str(root)], check=True)
        localize_symlinks(root)
        if destination.exists():
            shutil.rmtree(destination)
        root.rename(destination)
    return destination


def runtime_paths(root):
    # Older Ubuntu packages use /lib; newer ones use /usr/lib.
    for libc in sorted(root.rglob("libc.so.6")):
        interpreter = libc.parent / "ld-linux-x86-64.so.2"
        if interpreter.is_file():
            return interpreter.resolve(), libc.parent
    raise ValueError(f"cannot find libc and its interpreter under {root}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("loader", type=Path, help="already-built launcher; never rebuilt by this test")
    parser.add_argument("--cc", default=os.environ.get("CC", "gcc"), help="native GCC command")
    parser.add_argument("--versions", nargs="+", choices=RUNTIMES, default=list(RUNTIMES))
    parser.add_argument("--cache-dir", type=Path, default=CACHE)
    args = parser.parse_args()
    if platform.system() != "Linux" or platform.machine() != "x86_64":
        parser.error("the matrix requires Linux x86-64")
    if not shutil.which("dpkg-deb"):
        parser.error("dpkg-deb is required (provided by the dpkg package)")
    loader = args.loader.resolve(strict=True)
    cache = args.cache_dir.resolve()
    original = sha256(loader)
    print(f"Launcher: {loader}\nSHA256 before matrix: {original}", flush=True)
    baseline = extract("compiler-glibc-2.31", [RUNTIMES["2.31"], BASELINE_DEV], cache)
    # GCC's -B selects the older crt*.o and link-time libc files; --sysroot
    # selects its headers and interprets absolute paths inside libc.so scripts.
    compiler = shlex.split(args.cc) + [
        f"--sysroot={baseline}",
        f"-B{baseline / 'usr/lib/x86_64-linux-gnu'}/",
        # Non-Debian compilers (including Conda GCC) do not automatically search
        # Debian's multiarch header directory inside a supplied sysroot.
        "-isystem", str(baseline / "usr/include/x86_64-linux-gnu"),
    ]
    print("Test compiler:", shlex.join(compiler), flush=True)
    versions = list(dict.fromkeys(args.versions))
    for version in versions:
        if sha256(loader) != original:
            raise ValueError("launcher changed during the compatibility matrix")
        root = extract("glibc-" + version, [RUNTIMES[version]], cache)
        interpreter, libraries = runtime_paths(root)
        print(f"\nTesting glibc {version}: {RUNTIMES[version][0]}", flush=True)
        subprocess.run([
            sys.executable, str(HERE / "runtime.py"), str(loader),
            "--cc", shlex.join(compiler), "--interpreter", str(interpreter),
            "--library-path", str(libraries), "--expect-glibc", version,
        ], check=True)
        if sha256(loader) != original:
            raise ValueError("launcher changed during the compatibility matrix")
    print(f"\nSHA256 after matrix: {sha256(loader)}\n"
          f"Same launcher passed glibc {', '.join(versions)}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        sys.exit(f"error: {error}")
