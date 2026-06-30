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

Two things layered on top of the mirror ARE maintained here:
- `loader/` — `claude-dispatch`, a **custom glibc `ld.so`** that loads Claude Code (the only thing actually built here).
- `pixi.toml` / `pixi.lock` — a pixi dev environment used to build it.

## Commands

There is **no build / lint / test for `src/`**. The real tooling is the pixi
workspace:

- `pixi install` — materialize the default env (gcc, make, rust, bison, patchelf, … + nodejs/typescript).
- `pixi run build-loader` — build the custom `ld.so` (`loader/`); output in `loader/.build/`.
- `pixi run install-loader` — build + install `~/.local/bin/claude-dispatch` and print the launcher.
- `pixi run <cmd>` — run a tool in the default env (e.g. `pixi run node`, `pixi run tsc`).
- `pixi run -e bun bun <args>` — bun is isolated in its own `[environments] bun`
  (conda-forge bun pins an older `icu` than nodejs 26, so it can't share the default env).

The glibc source tarball is in **Git LFS** (`git lfs pull` to fetch it before building).
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

`claude-dispatch` — a **custom glibc `ld.so`** that fixes grep/find/rg under the
WSL1 launch workaround (upstream issue anthropics/claude-code#38788); see the root
`README.md` for the rationale. The kernel execs it (it *is* a dynamic linker), so
`/proc/self/exe` — hence `CLAUDE_CODE_EXECPATH` — genuinely is `claude-dispatch`.
A tiny hook in glibc's `dl_main` selects `CLAUDE_BIN` as the program (and presents
the bundled-tool `argv0` for `ugrep`/`rg`/`bfs`), then rtld loads claude normally.
No preload, no readlink hook, no `execve`; subagents work automatically.

The whole build is **driven by cargo** (nix-ld's `build.rs` shape, where they
cc-build nolibc — we build glibc instead). `cargo build` (`build.rs`):
1. extracts the vendored glibc source (`loader/glibc/glibc-2.42.tar.xz`, Git LFS);
2. applies `loader/rtld-dispatch.patch` — ~2 lines in `elf/rtld.c` (the `dl_main`
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
   `-z nomark-plt`). No nightly needed — all stable (vs nix-ld's `-Z plt`).

The heavy glibc build is cached in `loader/.build/` (only reruns when the patch /
tarball / `CLAUDE_BIN` change). The one step that can't fold into `build.rs` (it runs
before the link): `install.sh` does `patchelf --remove-rpath` on
`target/release/claude-dispatch` — the conda gcc injects a `DT_RPATH` that rtld
asserts against. **Mandatory.** The built binary is glibc-derived (**LGPL**); only
the patch + Rust source live here. `loader/.build/` & `target/` are git-ignored.
