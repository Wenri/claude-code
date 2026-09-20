#!/usr/bin/env python3
"""Check that launcher failures identify the stage, file, and syscall errno."""

import argparse
import errno
import os
from pathlib import Path
import resource
import shlex
import shutil
import struct
import subprocess
import tempfile


# A process-local filter makes readlinkat fail without requiring root, a mount
# namespace, or changes to /proc. Unsupported seccomp environments skip this case.
READLINK_FILTER = r"""
#include <errno.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <stddef.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <unistd.h>

int main(int argc, char **argv) {
    struct sock_filter instructions[] = {
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_readlinkat, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EACCES),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
    };
    struct sock_fprog filter = {sizeof(instructions) / sizeof(instructions[0]), instructions};
    if (argc != 2) return 2;
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)
        || prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &filter)) return 77;
    execv(argv[1], argv + 1);
    return 3;
}
"""


def large_load_span(original):
    """Keep a valid ELF layout but request more virtual memory than the limit."""
    data = bytearray(original)
    phoff = struct.unpack_from("<Q", data, 32)[0]
    phsize, phnum = struct.unpack_from("<HH", data, 54)
    loads = [phoff + index * phsize for index in range(phnum)
             if struct.unpack_from("<I", data, phoff + index * phsize)[0] == 1]
    last = max(loads, key=lambda offset: struct.unpack_from("<Q", data, offset + 16)[0])
    struct.pack_into("<Q", data, last + 40, 2 * 1024**3)
    return data


def limit_address_space():
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024**2, 256 * 1024**2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("loader", type=Path)
    parser.add_argument("--cc", default=os.environ.get("CC", "cc"))
    args = parser.parse_args()
    loader = args.loader.resolve(strict=True)
    compiler = shlex.split(args.cc)
    passed = 0
    skipped = 0

    with tempfile.TemporaryDirectory(prefix="rtld diagnostics ") as directory:
        root = Path(directory)
        target = root / "program"
        interpreter = root / "interpreter"
        launcher = root / "program.rtld"
        shutil.copy2(loader, launcher)
        launcher.chmod(0o755)

        def check(name, stage, path, message, error=None, **options):
            nonlocal passed, skipped
            command = options.pop("command", [str(launcher)])
            allow_skip = options.pop("allow_skip", False)
            result = subprocess.run(command, capture_output=True, text=True,
                                    timeout=15, **options)
            if allow_skip and result.returncode == 77:
                skipped += 1
                print("skip:", name, "(seccomp is unavailable)")
                return
            expected = f"rtld-dispatch: {stage} {path}: {message}"
            if error is not None:
                expected += f" (errno {error})"
            expected += "\n"
            if result.returncode != 127 or result.stdout or result.stderr != expected:
                raise AssertionError(f"{name}: exit {result.returncode}, expected 127\n"
                                     f"expected stderr: {expected!r}\n"
                                     f"stdout: {result.stdout!r}\nstderr: {result.stderr!r}")
            passed += 1
            print("ok:", name)

        check("missing target", "target", target, "open failed", errno.ENOENT)
        check("missing explicit target", "target", target, "open failed", errno.ENOENT,
              command=[str(loader), str(target)])

        source = root / "program.c"
        source.write_text("int main(void) { return 0; }\n")
        subprocess.run(compiler + [str(source), "-fPIE", "-pie",
                                   "-Wl,--dynamic-linker=" + str(interpreter),
                                   "-o", str(target)], check=True)
        original = target.read_bytes()
        check("missing interpreter", "interpreter", interpreter, "open failed", errno.ENOENT)

        target.write_bytes(b"not ELF\n")
        check("malformed target has no errno", "target", target, "not an ELF file")
        target.write_bytes(original)
        interpreter.write_bytes(b"not ELF\n")
        check("malformed interpreter has no errno", "interpreter", interpreter,
              "not an ELF file")

        target.write_bytes(large_load_span(original))
        check("mapping failure", "target", target, "mmap failed", errno.ENOMEM,
              preexec_fn=limit_address_space)
        target.write_bytes(original)

        if os.geteuid() != 0:
            target.chmod(0)
            try:
                check("unreadable target", "target", target, "open failed", errno.EACCES)
            finally:
                target.chmod(0o755)
            interpreter.chmod(0)
            try:
                check("unreadable interpreter", "interpreter", interpreter,
                      "open failed", errno.EACCES)
            finally:
                interpreter.chmod(0o600)
        else:
            skipped += 2
            print("skip: unreadable target/interpreter (running as root)")

        filter_source = root / "readlink-filter.c"
        filter_source.write_text(READLINK_FILTER)
        filtered = root / "readlink-filter"
        subprocess.run(compiler + [str(filter_source), "-o", str(filtered)], check=True)
        check("startup readlink failure", "startup", "/proc/self/exe", "readlinkat failed",
              errno.EACCES, command=[str(filtered), str(launcher)], allow_skip=True)

    print(f"{passed} diagnostic checks passed; {skipped} skipped")


if __name__ == "__main__":
    main()
