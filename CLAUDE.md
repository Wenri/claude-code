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
- `loader/` — the `claude-dispatch` in-process loader (Rust; the only thing actually built in this repo).
- `pixi.toml` / `pixi.lock` — a pixi dev environment used to build it.

## Commands

There is **no build / lint / test for `src/`**. The real tooling is the pixi
workspace:

- `pixi install` — materialize the default env (gcc, gxx, make, nodejs, typescript, rust).
- `pixi run build-loader` — build the loader (`loader/`) in place.
- `pixi run install-loader` — build + install the loader into `~/.local` and print the launcher.
- `pixi run <cmd>` — run a tool in the default env (e.g. `pixi run node`, `pixi run tsc`).
- `pixi run -e bun bun <args>` — bun is isolated in its own `[environments] bun`
  (conda-forge bun pins an older `icu` than nodejs 26, so it can't share the default env).

`.pixi/` (the materialized env) and `loader/target/` are git-ignored.

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

`claude-dispatch` — a small **in-process ELF loader** that fixes grep/find/rg
under the WSL1 `ld-linux` launch workaround (upstream issue
anthropics/claude-code#38788); see the root `README.md` for the rationale. The kernel
execs the loader, so `/proc/self/exe` (hence `CLAUDE_CODE_EXECPATH`) genuinely is
`claude-dispatch`; it `mmap`s the real ld.so and jumps to it **in-process (no
`execve`)**, running claude — or claude-as-`ugrep`/`rg`/`bfs` via `--argv0`. No
preload, no readlink hook; subagents work automatically.

- A Rust crate in `loader/`, derived from **nix-ld** (MIT, `loader/LICENSE.nix-ld`,
  `loader/NOTICE`): the ELF mapper / syscalls / self-relocation / jump are reused
  as-is; `loader/src/main.rs` is the direct-exec loader + dispatcher.
- Build needs `RUSTC_BOOTSTRAP=1` (nix-ld uses a few nightly features on stable);
  `loader/build.rs` bakes in `CLAUDE_BIN` / `CLAUDE_LD_LINUX` (also runtime env
  overrides). Build/install via `pixi run build-loader` / `install-loader` (or
  `make`). Needs glibc ≥ 2.33 (`ld.so --argv0`); `loader/target/` is git-ignored.
