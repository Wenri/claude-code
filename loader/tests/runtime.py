#!/usr/bin/env python3
"""Exercise a loader with PIE/non-PIE programs, dynamic linking, and invalid ELF."""

import argparse
import os
from pathlib import Path
import shlex
import shutil
import struct
import subprocess
import tempfile


LINKED = r"""
static __thread int value = 31;
static int constructed;
__attribute__((constructor)) static void initialize(void) { constructed = 7; }
int linked_value(void) { return value + constructed; }
void linked_set(int next) { value = next; }
"""

HELPER = "int helper_value(void) { return 23; }\n"

PLUGIN = r"""
extern int helper_value(void);
static __thread int value = 71;
static int constructed;
__attribute__((constructor)) static void initialize(void) {
    constructed = helper_value();
}
int plugin_next(void) { return value++ + constructed; }
"""

PROGRAM = r"""
#define _GNU_SOURCE
#include <dlfcn.h>
#include <gnu/libc-version.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/auxv.h>
#include <unistd.h>

extern int linked_value(void);
extern void linked_set(int);
static volatile unsigned char bss[5 * 4096 + 37];
static __thread int local_tls = 23;
static int constructed;
static int (*plugin_next)(void);

__attribute__((constructor)) static void initialize(void) {
    constructed = linked_value() == 38 && local_tls == 23;
}

static void *worker(void *unused) {
    if (local_tls != 23 || linked_value() != 38 || plugin_next() != 94)
        return (void *)1;
    local_tls = 113;
    linked_set(9);
    if (linked_value() != 16 || plugin_next() != 95)
        return (void *)2;
    return NULL;
}

int main(int argc, char **argv) {
    if (!constructed || local_tls != 23 || linked_value() != 38) return 10;
    for (size_t i = 0; i < sizeof(bss); ++i) {
        if (bss[i] != 0) return 11;
        bss[i] = (unsigned char)(i * 7 + 1);
    }
    for (size_t i = 0; i < sizeof(bss); ++i)
        if (bss[i] != (unsigned char)(i * 7 + 1)) return 12;
    void *plugin = dlopen("libprobe-plugin.so", RTLD_NOW | RTLD_LOCAL);
    if (!plugin) { fprintf(stderr, "dlopen: %s\n", dlerror()); return 13; }
    plugin_next = (int (*)(void))dlsym(plugin, "plugin_next");
    if (!plugin_next || plugin_next() != 94) return 14;
    local_tls = 29;
    linked_set(5);
    pthread_t thread;
    void *result;
    if (pthread_create(&thread, NULL, worker, NULL) != 0) return 15;
    if (pthread_join(thread, &result) != 0 || result) return 16;
    if (local_tls != 29 || linked_value() != 12 || plugin_next() != 95) return 17;
    if (dlclose(plugin) != 0) return 18;
    char self[4096];
    ssize_t size = readlink("/proc/self/exe", self, sizeof(self) - 1);
    if (size <= 0 || size >= sizeof(self) - 1) return 19;
    self[size] = '\0';
    if (argc > 1 && strcmp(argv[1], "--self-exec") == 0) {
        char *next[] = {argv[0], "--child", NULL};
        execv(self, next);
        perror("execv");
        return 20;
    }
    printf("glibc=%s\n", gnu_get_libc_version());
    printf("exe=%s\n", self);
    printf("execfn=%s\n", (char *)getauxval(AT_EXECFN));
    printf("env=%s\n", getenv("RTLD_RUNTIME_TEST"));
    for (int i = 0; i < argc; ++i) printf("argv=%s\n", argv[i]);
    if (argc > 2 && strcmp(argv[1], "--exit") == 0) return atoi(argv[2]);
    return 0;
}
"""


def malformed_images(original):
    """Mutate ELF metadata only; do not depend on toolchain-specific offsets."""
    phoff = struct.unpack_from("<Q", original, 32)[0]
    phsize, phnum = struct.unpack_from("<HH", original, 54)
    headers = [phoff + index * phsize for index in range(phnum)]

    def kind(header):
        return struct.unpack_from("<I", original, header)[0]

    loads = [header for header in headers if kind(header) == 1]
    interp = next(header for header in headers if kind(header) == 3)
    phdr = next(header for header in headers if kind(header) == 6)
    stack = next(header for header in headers if kind(header) == 0x6474E551)

    def changed(fmt, offset, value):
        data = bytearray(original)
        struct.pack_into(fmt, data, offset, value)
        return data

    yield "truncated header", original[:32]
    yield "bad magic", b"BAD!" + original[4:]
    for name, fmt, offset, value in (
        ("32-bit class", "B", 4, 1),
        ("big endian", "B", 5, 2),
        ("unknown ident version", "B", 6, 0),
        ("relocatable object", "H", 16, 1),
        ("wrong machine", "H", 18, 183),
        ("unknown ELF version", "I", 20, 0),
        ("entry outside executable segment", "Q", 24, 0),
        ("program headers past EOF", "Q", 32, len(original) + 4096),
        ("program header offset overflow", "Q", 32, 2**64 - 1),
        ("wrong ELF header size", "H", 52, 0),
        ("wrong program header size", "H", 54, 0),
        ("no program headers", "H", 56, 0),
        ("excessive program header count", "H", 56, 65535),
    ):
        yield name, changed("<" + fmt, offset, value)

    first = loads[0]
    filesize = struct.unpack_from("<Q", original, first + 32)[0]
    yield "file size exceeds memory size", changed("<Q", first + 40, filesize - 1)
    yield "segment beyond EOF", changed("<Q", first + 8, (len(original) + 8191) & ~4095)
    yield "unaligned segment offset", changed("<Q", first + 8, 1)
    yield "non-power-of-two alignment", changed("<Q", first + 48, 3)
    yield "segment address overflow", changed("<Q", first + 16, 2**64 - 4096)
    # Expand memsz too, so the high vaddr actually overflows regardless of file size.
    overflow = changed("<Q", first + 16, 2**64 - 4096)
    struct.pack_into("<Q", overflow, first + 40, 8192)
    yield "segment memory end overflow", overflow
    missing_load = bytearray(original)
    for header in loads:
        struct.pack_into("<I", missing_load, header, 0)
    yield "missing load segments", missing_load
    yield "missing interpreter", changed("<I", interp, 0)
    yield "missing PIE program-header descriptor", changed("<I", phdr, 0)
    yield "empty interpreter", changed("<Q", interp + 32, 0)
    yield "duplicate interpreter", changed("<I", stack, 3)
    yield "executable stack", changed("<I", stack + 4, 7)
    offset, length = struct.unpack_from("<Q", original, interp + 8)[0], \
        struct.unpack_from("<Q", original, interp + 32)[0]
    yield "unterminated interpreter", changed("B", offset + length - 1, ord("X"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("loader", type=Path)
    parser.add_argument("--interpreter", type=Path,
                        help="PT_INTERP to embed in test programs")
    parser.add_argument("--library-path", help="matching runtime library directories")
    parser.add_argument("--cc", default=os.environ.get("CC", "cc"),
                        help="C compiler command (use an older sysroot for old glibc)")
    parser.add_argument("--skip-malformed", action="store_true",
                        help="run program behavior checks only")
    args = parser.parse_args()
    loader = args.loader.resolve(strict=True)
    compiler = shlex.split(args.cc)
    linker_flags = ["-Wl,--enable-new-dtags"]
    if args.interpreter:
        linker_flags += ["-Wl,--dynamic-linker=" + str(args.interpreter.resolve(strict=True))]
    env = os.environ.copy()
    for name in list(env):
        if name.startswith("LD_") or name == "GLIBC_TUNABLES":
            del env[name]
    if args.library_path:
        env["LD_LIBRARY_PATH"] = args.library_path
    env["RTLD_RUNTIME_TEST"] = "forwarded"
    failures = []
    passed = 0
    versions = set()

    with tempfile.TemporaryDirectory(prefix="rtld runtime ") as directory:
        root = Path(directory)
        libs = root / "libs"
        private = libs / "private"
        private.mkdir(parents=True)
        unrelated = root / "unrelated working directory"
        unrelated.mkdir()

        def compile_source(name, source, output, flags):
            path = root / (name + ".c")
            path.write_text(source)
            subprocess.run(compiler + ["-O2", "-U_FORTIFY_SOURCE", str(path),
                                       "-o", str(output)] + flags, check=True)

        compile_source("linked", LINKED, libs / "libprobe-linked.so", ["-shared", "-fPIC"])
        compile_source("helper", HELPER, private / "libprobe-helper.so", ["-shared", "-fPIC"])
        compile_source("plugin", PLUGIN, libs / "libprobe-plugin.so", [
            "-shared", "-fPIC", "-L" + str(private), "-lprobe-helper",
            "-Wl,--enable-new-dtags,-rpath,$ORIGIN/private",
        ])

        def install(name):
            destination = root / name
            shutil.copy2(loader, destination)
            destination.chmod(0o755)
            return destination

        def run(name, executable, arguments, target, expected_argv, status=0):
            nonlocal passed
            result = subprocess.run(arguments, executable=str(executable), env=env,
                                    cwd=unrelated, text=True, capture_output=True, timeout=15)
            lines = result.stdout.splitlines()
            if lines and lines[0].startswith("glibc="):
                versions.add(lines.pop(0).partition("=")[2])
            expected = [f"exe={executable}", f"execfn={target}", "env=forwarded"]
            expected += [f"argv={argument}" for argument in expected_argv]
            if result.returncode != status or lines != expected:
                failures.append(f"{name}: exit {result.returncode}, expected {status}\n"
                                f"expected: {expected!r}\nstdout: {result.stdout!r}\n"
                                f"stderr: {result.stderr!r}")
            else:
                passed += 1
                print("ok:", name)

        pie = None
        for kind, flags in (("PIE", ["-fPIE", "-pie"]), ("non-PIE", ["-fno-pie", "-no-pie"])):
            target = root / kind
            compile_source(kind, PROGRAM, target, flags + linker_flags + [
                "-L" + str(libs), "-lprobe-linked", "-pthread", "-ldl",
                "-Wl,-rpath,$ORIGIN/libs",
            ])
            if kind == "PIE":
                pie = target
            launcher = install(kind + ".rtld")
            run(kind + " BSS/TLS/pthreads/constructors/dlopen/$ORIGIN", launcher,
                [str(launcher)], target, [str(target)])
            arguments = ["--help", "--version", "argument with spaces", ""]
            run(kind + " argument forwarding", launcher, [str(launcher)] + arguments,
                target, [str(target)] + arguments)
            run(kind + " alias", launcher, ["ugrep", "pattern"], target, ["ugrep", "pattern"])
            run(kind + " directory alias", launcher, ["/tools/rg"], target, ["/tools/rg"])
            run(kind + " exit status", launcher, [str(launcher), "--exit", "37"],
                target, [str(target), "--exit", "37"], status=37)
            run(kind + " self-exec", launcher, [str(launcher), "--self-exec"],
                target, [str(target), "--child"])
            run(kind + " alias self-exec", launcher, ["bfs", "--self-exec"],
                target, ["bfs", "--child"])
            shim = install(kind + "-shim")
            real = root / (shim.name + ".real")
            shutil.copy2(target, real)
            run(kind + " transparent", shim, [str(shim)], real, [str(shim)])
            run(kind + " transparent alias", shim, ["rg"], real, ["rg"])

        if not args.skip_malformed:
            launcher = install("malformed.rtld")
            target = root / "malformed"
            for name, contents in malformed_images(pie.read_bytes()):
                target.write_bytes(contents)
                target.chmod(0o755)
                try:
                    result = subprocess.run([str(launcher)], env=env, cwd=unrelated,
                                            capture_output=True, timeout=10)
                    if result.returncode != 127 or b"rtld-dispatch:" not in result.stderr:
                        failures.append(f"malformed {name}: expected controlled rejection, "
                                        f"got exit {result.returncode}\n"
                                        f"stderr: {result.stderr!r}")
                    else:
                        passed += 1
                        print("ok: reject", name)
                except subprocess.TimeoutExpired:
                    failures.append(f"malformed {name}: timed out")

    print(f"{passed} checks passed; {len(failures)} failed; glibc: {', '.join(sorted(versions))}")
    if failures:
        raise SystemExit("\n\n".join(failures))


if __name__ == "__main__":
    main()
