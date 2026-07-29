# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This is an **archival mirror of Claude Code's leaked source** (the TypeScript/TSX
under `src/`), recovered from a `.map` sourcemap accidentally published to npm in
March 2026. It is **study material, not a buildable project**: there is no
`package.json`, `tsconfig.json`, lockfile, or test suite, and `src/` will not
compile or run as-is. Treat `src/` as read-only reference unless explicitly asked
to change it; all of it is Anthropic's proprietary property (see the README
disclaimer).

A few things layered on top of the mirror ARE maintained here:
- `loader/` — `rtld-dispatch`, a **custom glibc `ld.so`** that loads Claude Code (and other WSL1-hostile CLIs) *in place*, preserving `/proc/self/exe`; the main thing built here.
- [`wsl1-exec`](https://github.com/Wenri/wsl1-exec) — **moved out entirely** (2026-07, full history preserved; Apache-2.0): the standalone repo for `wsl1-exec.so`, conventionally a sibling checkout at `../wsl1-exec`. A generic `LD_PRELOAD` `exec*` shim that retries an `ENOEXEC`-failed exec via the target's `PT_INTERP`. All sources live in its `src/`: the WSL1 `execve` **and `posix_spawn`/`posix_spawnp`** (`wsl1-exec.c`) and the `readlink`/`realpath` `/proc/self/exe` hooks (`wsl1-selfexe.c`, via `getauxval(AT_EXECFN)` — no env marker, per-process, so nothing to inherit/clean up) are ours; the `exec*` family (`src/exec-variants.c`) is **[termux-exec](https://github.com/termux-play-store/termux-exec)/bionic-derived** (Apache-2.0 — SPDX tag + attribution + local changes in its header; adapted, no longer synced) — `posix_spawn` retries at the parent (glibc returns the child's exec errno) — plus unrelated **`mmap`/`mmap64` fixes** (`wsl1-mmap.c`): the empty-file-map bogus `ENOEXEC` (rattler/pixi-build) and the `MAP_FIXED_NOREPLACE`-rejected-with-`EOPNOTSUPP` case (retry without the flag) — both libc-`mmap` only, so neither reaches agy's tcmalloc (still `patch_agy_wsl1.py`). Complements `loader/`: universal and one-line to enable, and the hooks keep `/proc/self/exe` correct **for libc readers** (Node/libuv) — but raw-syscall readers (Go `os.Executable()`), `readlinkat`, and static binaries still see the interpreter, so `loader/` remains the fix for those. Supersedes its own old `claude-preload.so`/`claude-dispatch`.
- `pixi.toml` / `pixi.lock` — a pixi dev environment used to build them.

## Commands

There is **no build / lint / test for `src/`**. The real tooling is the pixi
workspace:

- `pixi install` — materialize the default env (gcc, make, rust, bison, patchelf, … + bun/nodejs/typescript).
- `pixi run build-loader` — build the custom `ld.so` (`loader/`); output in `loader/.build/`.
- `pixi run install-loader` — build + install `~/.local/bin/claude.rtld` and print the launcher
  (`make -C loader install PROGS="claude agy"` to install a loader for several programs).
- `pixi run <cmd>` — run a tool in the default env (e.g. `pixi run bun`, `pixi run node`, `pixi run tsc`).
  bun + nodejs share the default env, but only because they share **icu 75**: bun pins it,
  so nodejs is held `<26` (v26 needs icu 78). Bumping nodejs to 26 would break that.

The glibc source is committed as a **plain, unextracted source tree** (no Git LFS, no tarball —
diffable/greppable/auditable against upstream), **rtld-minimal** (~1 MB): only what the loader
build reads to produce `librtld.os` + `ld.map` — the dynamic linker's own code, the ~120 libc
modules `ld.so` embeds, their build machinery, and `PREBUILT/` generated headers. It builds
*nothing but* ld.so's pieces (`make elf/subdir_lib`, ~2 min, no full libc). The `PREBUILT/`
generated headers are further **trimmed to only the macros/headers that reach `librtld.os`**
(harvested via `gcc -H`/`-dU`: e.g. `first-versions.h` 13219 defines → ~4, PREBUILT ~2.8 MB →
~17 KB), gated on `librtld.os` staying byte-identical. Tree `loader/glibc/glibc-2.42-rtld/`;
regenerate from an upstream tarball with `loader/glibc/prune-glibc.sh` (full build → capture the
rtld module list + generated headers → strace a reduced build → assemble the read-closure tree →
harvest-and-trim PREBUILT).
`.pixi/`, `loader/.build/`, and `loader/target/` are git-ignored.

## Architecture of the leaked source (`src/`)

This is Claude Code's own architecture; each area below spans many files, so read
across them rather than any single file:

- **Entry & agent loop** — `src/main.tsx` (CLI entry: Commander + React/Ink) and
  `src/entrypoints/`, driving `src/QueryEngine.ts` + `src/query/` (the core
  LLM request → response → tool-use loop). `src/Task.ts` + `src/tasks/` model
  agent tasks and subagents.
- **Tools** — `src/Tool.ts` is the tool interface; `src/tools/` (~180 files)
  implements the 40+ agent tools (Bash, file read/edit, search, web, MCP, …).
- **Terminal UI** — a custom **Ink** renderer in `src/ink/` (~95 files) drives the
  TUI; `src/components/` (~390) are the React/Ink components and `src/hooks/`
  (~100) the hooks, with `src/screens/`, `src/vim/`, and `src/keybindings/`.
- **Slash commands** — `src/commands/` (~200) implements the `/`-commands.
- **Services / backend** — `src/services/` (~130): MCP, OAuth/auth, analytics,
  the `autoDream` memory-consolidation subagent, etc.
- **IDE bridge** — `src/bridge/` is the editor-integration layer (sessions,
  messaging, transports).
- **Notable subsystems** — `src/buddy/` (a hidden Tamagotchi companion),
  `src/skills/`, `src/plugins/`, `src/hooks/`; `src/utils/` is a ~560-file
  catch-all. `src/utils/undercover.ts` hides internal model codenames.

To trace a behavior, start at `QueryEngine.ts` (the loop) and `Tool.ts` + the
relevant `src/tools/` file, then follow into `services/` or `components/`. The
README's directory diagram is partial/idealized — trust the actual tree.

## `loader/`

`rtld-dispatch` — a **custom glibc `ld.so`** that loads a WSL1-hostile, dynamically
linked program *in place*, fixing the "Exec format error" + grep/find/rg breakage
under the WSL1 launch workaround (upstream issue anthropics/claude-code#38788); see
the root `README.md` for the rationale. The kernel execs it (it *is* a dynamic
linker), so `/proc/self/exe` — hence `CLAUDE_CODE_EXECPATH` — genuinely is the loader,
not a separate linker. No preload, no readlink hook, no `execve`; subagents work
automatically.

It's **generic**: a ~2-line hook in glibc's `dl_main` calls our `claude_dispatch`,
which derives the program to load from the loader's *own* install name (`/proc/self/exe`),
in two shapes: **launcher** — strip a trailing **`.rtld`** (`claude.rtld` → `claude`,
`agy.rtld` → `agy`, installed next to the target); or **transparent** — installed *under*
the target's own name with the real binary moved to **`<name>.real`** (loads `<name>.real`).
`argv[0]` is forwarded to the target unless we were invoked under our own name, so claude's
bundled-tool dispatch (`ugrep`/`rg`/`bfs` via `argv[0]`) still works. (`agy` = Google's
Antigravity CLI, which *also* needs `loader/patch_agy_wsl1.py` — see below.)

The transparent shape is for programs spawned by a **fixed path** (so a `.rtld` launcher
can't be interposed) that *also* read `/proc/self/exe` to locate themselves — the
motivating case is Antigravity's Go `language_server_linux_x64` (the IDE's node server
execs it directly; it uses `os.Executable()` to find `GeminiDir`). Being kernel-exec'd,
`/proc/self/exe` stays `<name>`, so execPath resolves correctly. Install/refresh it with
`loader/transparent_shim.sh <binary>` (idempotent; also runs `patch_agy_wsl1.py`; **re-run
after each Antigravity upgrade**).

The whole build is **driven by cargo** (nix-ld's `build.rs` shape, where they
cc-build nolibc — we build glibc instead). `cargo build` (`build.rs`):
1. configures the vendored glibc source tree **in place** (`loader/glibc/glibc-2.42-rtld/` — the
   rtld-minimal closure from `prune-glibc.sh`, `rtld.c` hook pre-applied; glibc builds out of
   tree so the checked-in tree stays git-clean) and pre-populates its `PREBUILT/` headers;
2. applies `loader/glibc/rtld-dispatch.patch` — ~2 lines in `elf/rtld.c` (the `dl_main`
   hook). **`rtld.c` only — no `elf/Makefile` change**; the final link is ours;
3. `configure` + `make`, **tolerating the one expected failure**: glibc's final `ld.so`
   link errors on the undefined `claude_dispatch` (that link is ours). We can't target
   `librtld.os`/`ld.map` directly — from a clean tree glibc's recursive make exposes no
   rule for those prefixed paths ("No rule to make target"). So we run the full make;
   `librtld.os` + `ld.map` are built before the failing link, and build.rs gates on both;
4. emits glibc's `-shared` ld.so recipe + `librtld.os` as cargo link-args, so cargo's
   own link produces the `ld.so`: rtld supplies `_start` + the libc subset (our
   `no_std` hook resolves only `memcpy`/`memset`/`memcmp` against it), `-shared` +
   `--version-script` export the GLIBC_PRIVATE interface the loaded libc binds to.
   `.cargo/config.toml` selects gcc/bfd (rust-lld rejects the version script +
   `-z nomark-plt`) and sets `RUSTC_BOOTSTRAP=1` to enable, on stable rustc, the
   `lang_items` feature (for nix-ld's `eh_personality` lang item) and `-Z plt=yes`
   (nix-ld parity). We keep `relocation-model=pic` (not nix-ld's `pie` — our output
   is a `-shared` symbol-exporting ld.so, where pie codegen would mis-assume preemption).

The heavy glibc build is cached in `loader/.build/` (only reruns when the patch /
tarball change). The one step that can't fold into `build.rs` (it runs before the
link): the `Makefile` `install` target does `patchelf --remove-rpath` on
`target/release/rtld-dispatch` — the conda gcc injects a `DT_RPATH` that rtld asserts
against — then installs a copy as each `<prog>.rtld` (`make install PROGS="claude agy"`).
**Mandatory.** The built binary is glibc-derived (**LGPL**); only
the patch + Rust source live here. `loader/.build/` & `target/` are git-ignored.

`loader/patch_agy_wsl1.py` is unrelated to the ld.so build — it's a standalone binary
patcher for **Antigravity CLI (`agy`)**, which bundles Google tcmalloc. tcmalloc
reserves arenas with `MAP_FIXED_NOREPLACE` (a Linux 4.17+ flag) that WSL1's 4.4 kernel
*rejects*, so it aborts at startup. The script clears that flag bit from tcmalloc's
`mov r32, 0x100022` mmap-flag instructions (8 sites; the ~100 data-table occurrences
are left alone), degrading them to plain hinted mmaps (which WSL1 honors). Re-run it
after every `agy` upgrade. The loader fixes `agy`'s *launch*; this fixes its *runtime*.
