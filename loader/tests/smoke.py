#!/usr/bin/env python3
"""Exercise the built loader with a real dynamically linked test program."""

import argparse
import os
from pathlib import Path
import shlex
import shutil
import struct
import subprocess
import tempfile


PROBE = r"""
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
    char self[4096];
    ssize_t size = readlink("/proc/self/exe", self, sizeof(self) - 1);
    if (size < 0 || size == sizeof(self) - 1) return 2;
    self[size] = '\0';
    if (argc > 1 && strcmp(argv[1], "--self-exec") == 0) {
        char *next[] = {argv[0], "--child", NULL};
        execv(self, next);
        perror("execv");
        return 3;
    }
    printf("exe=%s\n", self);
    printf("env=%s\n", getenv("RTLD_DISPATCH_SMOKE"));
    for (int i = 0; i < argc; ++i) printf("argv=%s\n", argv[i]);
    return 0;
}
"""


def inspect_elf(loader):
    """Check startup constraints without requiring a particular readelf tool."""
    data = loader.read_bytes()
    if data[:6] != b"\x7fELF\x02\x01":
        raise AssertionError("expected a little-endian ELF64 loader")
    if struct.unpack_from("<H", data, 16)[0] != 3:
        raise AssertionError("loader is not an ELF shared object (ET_DYN)")
    if struct.unpack_from("<Q", data, 24)[0] == 0:
        raise AssertionError("loader has no entry point")
    phoff = struct.unpack_from("<Q", data, 32)[0]
    phentsize, phnum = struct.unpack_from("<HH", data, 54)
    dynamic = None
    for index in range(phnum):
        header = phoff + index * phentsize
        kind = struct.unpack_from("<I", data, header)[0]
        if kind == 3:  # PT_INTERP
            raise AssertionError("loader must not need another ELF interpreter")
        if kind == 2:  # PT_DYNAMIC
            dynamic = (
                struct.unpack_from("<Q", data, header + 8)[0],
                struct.unpack_from("<Q", data, header + 32)[0],
            )
    if dynamic is None:
        raise AssertionError("loader has no dynamic section")
    offset, size = dynamic
    prohibited = {1: "DT_NEEDED", 15: "DT_RPATH", 29: "DT_RUNPATH"}
    for entry in range(offset, offset + size, 16):
        tag, value = struct.unpack_from("<qQ", data, entry)
        if tag == 0:
            break
        if tag in prohibited:
            raise AssertionError(f"loader contains {prohibited[tag]}")
        if tag in (8, 18, 35) and value:  # DT_RELASZ / DT_RELSZ / DT_RELRSZ
            raise AssertionError("freestanding launcher must not need runtime relocations")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("loader", type=Path)
    parser.add_argument("--check-only", action="store_true",
                        help="verify the built launcher's ELF startup constraints")
    parser.add_argument(
        "--library-path",
        help="colon-separated library directories matching the test program's interpreter",
    )
    args = parser.parse_args()
    loader = args.loader.resolve(strict=True)
    inspect_elf(loader)
    if args.check_only:
        print("ok: freestanding ELF has no interpreter, dependencies, RPATH, or relocations")
        return

    env = os.environ.copy()
    for name in list(env):
        if name.startswith("LD_") or name == "GLIBC_TUNABLES":
            del env[name]
    env["RTLD_DISPATCH_SMOKE"] = "forwarded"
    if args.library_path:
        env["LD_LIBRARY_PATH"] = args.library_path

    with tempfile.TemporaryDirectory(prefix="rtld smoke ") as directory:
        root = Path(directory)
        source = root / "probe.c"
        source.write_text(PROBE)
        probe = root / "probe"
        compiler = shlex.split(os.environ.get("CC", "cc"))
        subprocess.run(compiler + [str(source), "-o", str(probe)], check=True)

        def install(name):
            destination = root / name
            shutil.copy2(loader, destination)
            destination.chmod(0o755)
            return destination

        def check(name, executable, argv, expected_argv):
            result = subprocess.run(
                argv, executable=str(executable), env=env, text=True,
                capture_output=True, timeout=15,
            )
            expected = [f"exe={executable}", "env=forwarded"]
            expected.extend(f"argv={value}" for value in expected_argv)
            if result.returncode != 0 or result.stdout.splitlines() != expected:
                raise AssertionError(
                    f"{name}: exit {result.returncode}\n"
                    f"expected: {expected!r}\n"
                    f"stdout: {result.stdout!r}\nstderr: {result.stderr!r}"
                )
            print(f"ok: {name}")

        launcher = install("probe.rtld")
        check("launcher", launcher, [str(launcher)], [str(probe)])
        arguments = ["--help", "--version", "argument with spaces", ""]
        check("argument forwarding", launcher, [str(launcher)] + arguments,
              [str(probe)] + arguments)
        check("bundled tool alias", launcher, ["ugrep", "pattern"],
              ["ugrep", "pattern"])
        check("alias with a directory", launcher, ["/tools/rg", "pattern"],
              ["/tools/rg", "pattern"])
        check("self-exec", launcher, [str(launcher), "--self-exec"],
              [str(probe), "--child"])
        check("alias self-exec", launcher, ["bfs", "--self-exec"],
              ["bfs", "--child"])

        hardlink = root / "hardlink-probe.rtld"
        os.link(launcher, hardlink)
        hardlink_target = root / "hardlink-probe"
        shutil.copy2(probe, hardlink_target)
        check("hardlinked launcher selects its own sibling", hardlink,
              [str(hardlink)], [str(hardlink_target)])

        transparent = install("transparent")
        shutil.copy2(probe, root / "transparent.real")
        check("transparent shim", transparent, [str(transparent), "argument"],
              [str(transparent), "argument"])
        check("transparent alias", transparent, ["rg", "pattern"],
              ["rg", "pattern"])
        check("transparent self-exec", transparent,
              [str(transparent), "--self-exec"], [str(transparent), "--child"])

        fallback = install("ld-test.so")
        check("explicit program invocation", fallback,
              [str(fallback), str(probe), "argument"], [str(probe), "argument"])
        subprocess.run([str(fallback), "--verify", str(probe)], env=env,
                       capture_output=True, timeout=15, check=True)
        print("ok: explicit verification option")

        missing = install("missing.rtld")
        result = subprocess.run([str(missing)], env=env, capture_output=True,
                                timeout=15)
        if result.returncode <= 0:
            raise AssertionError("missing target should produce a launcher error")
        print("ok: missing target fails cleanly")

    print("ok: ELF startup constraints and all dispatch modes")


if __name__ == "__main__":
    main()
