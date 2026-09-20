# rtld-dispatch — run Claude Code (and friends) on WSL1

`rtld-dispatch` is a small Linux x86-64 **ELF launcher** designed to run Claude
Code on **WSL1** while keeping its bundled search tools and self-launches working.
It maps the program and its installed dynamic linker into the current process.
The linker handles dependencies, relocations, TLS, and program startup.

The implementation lives in [`loader/main.c`](./loader/main.c). It uses Linux
syscalls and standard ELF headers, with no glibc source, bundled libc, private
linker offsets, or glibc version detection. Install it as `claude.rtld` to run
`claude`, or `agy.rtld` to run Google's Antigravity CLI (`agy` also needs
[`loader/patch_agy_wsl1.py`](./loader/patch_agy_wsl1.py)).

> This repository is also an archival mirror of Claude Code's leaked source under
> [`src/`](./src/) — see [About the mirror](#-about-the-mirror) below.

---

## The problem

1. On **WSL1**, Claude Code `>= 2.1.83` won't exec: `cannot execute binary file:
   Exec format error` ([upstream issue](https://github.com/anthropics/claude-code/issues/38788)).
2. Launching it through `ld-linux … claude` gets past that error, but Claude
   multiplexes its bundled search tools (`ugrep`/`rg`/`bfs`) using `argv[0]`.
   Its tool shims use `CLAUDE_CODE_EXECPATH`, derived from `/proc/self/exe`, which
   now identifies the linker. A shim then runs `ld.so -G …` and fails with
   `-G: cannot open shared object file`.

## How it works

The kernel executes `rtld-dispatch`, so `/proc/self/exe` identifies the launcher.
It selects the real program using its own installed filename:

- **Launcher:** `claude.rtld` loads the sibling `claude`.
- **Transparent shim:** `claude` loads the sibling `claude.real`.

A normal `.rtld` launch gives the program its own name in `argv[0]`. Tool aliases
such as `ugrep`, `rg`, and `bfs` pass through unchanged. Transparent shims preserve
`argv[0]` as supplied.

The launcher reads the target's `PT_INTERP` to find its installed dynamic linker,
maps both ELF files' loadable segments, and updates the startup stack's auxiliary
vector to describe them. It then jumps to the linker's entry point in the same
process; it never executes `ld.so` through `execve`. The installed linker performs
its normal startup work, while
`/proc/self/exe` remains the launcher. This lets named launchers handle subsequent
tool calls and self-execution without `LD_PRELOAD` or an extra `execve`.

Because the launcher uses the program's installed linker, the same launcher
binary can work with different glibc releases. The selected linker still needs
its matching runtime libraries, and the program must support that runtime.

## Build and install

Needs gcc/binutils, make, patchelf, and Python 3 for ELF checks and tests. The
bundled [pixi](https://pixi.sh) environment provides them.

```bash
pixi run build-loader                    # builds loader/.build/rtld-dispatch
pixi run make -C loader test              # smoke, runtime, and diagnostic tests
pixi run install-loader                  # installs ~/.local/bin/claude.rtld
# Install for several programs:
pixi run make -C loader install PROGS="claude agy"
```

With the tools already installed, use `make -C loader`, `make -C loader test`,
and `make -C loader install` directly.

The build compiles one C file as a freestanding static PIE (about 17 KiB with the
bundled toolchain), strips it, and checks that it has no interpreter,
shared-library dependencies, RPATH, or runtime relocations. No glibc build or
download is involved. `CC`, `CFLAGS`, and `LDFLAGS` can select the compiler and
additional build flags; use `make -B` to rebuild when changing them.

Each `<prog>.rtld` must sit beside the real `<prog>`. Installation defaults to
`~/.local/bin`; use `PREFIX` to change the prefix. Add launchers to your
`~/.bashrc` or `~/.zshrc` and reload:

```bash
claude() { "$HOME/.local/bin/claude.rtld" "$@"; }
agy()    { "$HOME/.local/bin/agy.rtld"    "$@"; }
```

Verify with `claude --version`, then exercise its bundled search tools and
subagents.

After upgrading the launcher, run the install command again for each program.
Builds replace their output atomically, so rebuilding alone leaves installed
launchers unchanged. Installation uses hardlinks when possible and copies across
filesystems.

For a one-off invocation, the unrenamed loader also accepts:

```bash
loader/.build/rtld-dispatch /path/to/program arg1 arg2
loader/.build/rtld-dispatch --verify /path/to/program
```

In this mode it maps the interpreter and lets that interpreter load the explicit
program, preserving library lookup relative to the program's directory
(`$ORIGIN`). It does not implement the full `ld.so` command line. Use a named
launcher for programs that execute themselves through `/proc/self/exe`.

### Fixed-path binaries (transparent shim)

Some programs are launched by a fixed path, such as Antigravity's
`language_server_linux_x64`. Install the launcher at that path with
[`loader/transparent_shim.sh`](./loader/transparent_shim.sh):

```bash
loader/transparent_shim.sh "$HOME/.antigravity-ide-server/bin/<ver>/extensions/antigravity/bin/language_server_linux_x64"
```

The script moves the original to `<name>.real`, installs the launcher in its
place, and applies [`patch_agy_wsl1.py`](./loader/patch_agy_wsl1.py) when needed.
`/proc/self/exe` retains the fixed path, including for raw-syscall readers such as
Go's `os.Executable()`. Re-run after an Antigravity upgrade replaces the binary.
The script also refreshes an existing shim and copies when a hardlink cannot be
created across filesystems.

### Compatibility and testing

The launcher supports dynamically linked Linux x86-64 ELF programs, both PIE and
non-PIE. It rejects executable stacks and privileged launcher startup; it does
not reproduce setuid execution semantics. Static binaries and other
architectures are unsupported.

`make -C loader test` checks executable identity, argument forwarding,
self-execution, dynamic linking, TLS, threads, constructors, `$ORIGIN`, and
rejection of malformed ELF files. It also covers explicit invocation with the
launcher and program in different directories, 2 MiB segment alignment, and
diagnostics for failed target or interpreter loading.

Run the packaged glibc compatibility matrix with:

```bash
make -C loader test-matrix
# Run selected versions, reusing the package cache:
make -C loader test-matrix MATRIX_ARGS="--versions 2.31 2.42"
```

This builds the launcher once and tests that exact binary against glibc 2.31,
2.35, 2.39, and 2.42. Binary packages are downloaded from official Ubuntu
archives, verified against pinned SHA256 checksums, and cached under
`loader/.build/glibc-matrix/`. This optional suite also needs `dpkg-deb` (from
the `dpkg` package) to extract packages. No glibc source build or system library
replacement is involved.
The matrix uses an older development sysroot for its test programs so that they
can run on every selected runtime. The launcher itself remains independent of
that sysroot.

The [loader workflow](./.github/workflows/loader.yml) runs the host suites and
packaged runtime matrix for loader changes. To test an existing alternate
runtime manually with the same launcher binary:

```bash
python3 loader/tests/runtime.py loader/.build/rtld-dispatch \
  --interpreter /path/to/runtime/ld-linux-x86-64.so.2 \
  --library-path /path/to/runtime/lib
```

When testing an older runtime, use `--cc` with a compiler/sysroot targeting that
release or older. A program compiled against newer libc symbols cannot run on an
older libc. Linux tests do not establish WSL1 application compatibility; the new
mapping implementation still needs validation on WSL1.

The same launcher binary passed all 48 runtime checks with each packaged runtime:

| glibc | Runtime used |
| --- | --- |
| 2.31 | Prebuilt Ubuntu package `2.31-0ubuntu9.18` |
| 2.35 | Prebuilt Ubuntu package `2.35-0ubuntu3.15` |
| 2.39 | Prebuilt Ubuntu package `2.39-0ubuntu8.9` |
| 2.42 | Prebuilt Ubuntu package `2.42-0ubuntu3.1` |

Bun 1.3.11 startup and self-execution also passed through both named launchers
and transparent shims. Installation, shim refresh, and copying across
filesystems were checked separately.

Loader errors identify the loading stage, file, and failing operation. Syscall
failures include the Linux errno number, for example:

```text
rtld-dispatch: interpreter /path/to/ld-linux-x86-64.so.2: open failed (errno 2)
```

Here errno 2 means the interpreter was not found. ELF validation errors identify
the invalid structure, such as a truncated file or unsupported executable stack.

---

## 🗄 About the mirror

This repo began as — and still contains — an **archival mirror of Claude Code's
leaked source** (the TypeScript/TSX under [`src/`](./src/)), recovered from a
`.map` sourcemap accidentally published to npm in March 2026 (discovered by
[Chaofan Shou](https://x.com/Fried_rice); originally mirrored by
[Yasas Banu](https://www.yasasbanuka.tech)). It is study material, not a buildable
project. The untouched files remain the exact 2.1.88 outer source-map inputs;
the shared tree now carries cumulative, verified source-facing recovery content for
2.1.89, 2.1.90, 2.1.91, 2.1.92, 2.1.94, 2.1.96, 2.1.97, 2.1.98, 2.1.100,
2.1.101, 2.1.104, 2.1.105, 2.1.107, 2.1.108, 2.1.109, 2.1.110, 2.1.111,
2.1.112, 2.1.113, 2.1.114, 2.1.116, 2.1.117, 2.1.118, 2.1.119, 2.1.120,
2.1.121, 2.1.122, 2.1.123, 2.1.124, and 2.1.126; upstream did not publish
2.1.93, 2.1.95, 2.1.99, 2.1.102, 2.1.103, 2.1.106, 2.1.115, or 2.1.125.
This does not claim that any complete original authored TypeScript tree is
observable. A short tour of what's inside is in [`CLAUDE.md`](./CLAUDE.md).
The evidence-first adjacent-published-release recoveries live in
[`recovery/`](./recovery/): they reconstruct the complete published wrapper
and every plain JavaScript entry in the authenticated Linux x64 Bun graph
exactly through 2.1.126, while keeping the necessarily partial authored-source
reconstruction labeled separately. The signed native executable
itself is authenticated and container-verified; it is not claimed as
baseline-derived source or as an ELF reconstructed from the prior release.
The current frozen release case is 2.1.124→2.1.126. Its release-local source
target contains 2,166 files and 32,823,496 bytes at Git tree
`9c7c4f699cd0cc740dcb5e5341aeb026d4bc2263`; its focused tests pass 10/10,
all five changed non-deleted source paths syntax-build, and its structural
ledger closes 4,405,944 tokens across 22,358 units with zero residue. Shared
main is a selective cumulative merge guarded by
`recovery/test/cumulative-2.1.126-merged-source-retention.test.mjs`; it is
intentionally not byte-identical to that frozen release-local source tree.
See the current [2.1.126 report](./recovery/cases/2.1.124-to-2.1.126/REPORT.md),
[manifest](./recovery/cases/2.1.124-to-2.1.126/manifest.json), and
[complete recovery runbook](./recovery/cases/2.1.124-to-2.1.126/RECOVERY_RUNBOOK.md).

## 📜 License & disclaimer

The launcher, build scripts, recovery tooling, and documentation are original
work released under the [WTFPL](./LICENSE). The launcher does not bundle or link
against glibc; the installed dynamic linker and runtime libraries retain their
own licenses (see [`loader/NOTICE`](./loader/NOTICE)).

**The mirrored source under `src/` and Anthropic-derived recovery artifacts under
`recovery/cases/` are the proprietary property of Anthropic PBC**, included for
educational/archival purposes only — this is not an official Anthropic product.
