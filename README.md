# claude-dispatch — run Claude Code on WSL1 (in-process loader)

`claude-dispatch` is a tiny custom ELF loader that makes Claude Code work on
**WSL1**, where the CLI otherwise dies with `Exec format error` and — via the
common `ld-linux` workaround — breaks every `grep`/`find`/`rg` tool call.

It lives in [`loader/`](./loader/), is built on the loader internals of
[nix-ld](https://github.com/nix-community/nix-ld) (MIT), and fixes the upstream
issue [anthropics/claude-code#38788](https://github.com/anthropics/claude-code/issues/38788).

> This repository is also an archival mirror of Claude Code's leaked source under
> [`src/`](./src/) — see [About the mirror](#-about-the-mirror) below.

---

## The problem

1. On **WSL1**, Claude Code `>= 2.1.83` won't exec: `cannot execute binary file:
   Exec format error`.
2. The community workaround launches it through the dynamic linker
   (`ld-linux … claude`). But claude multiplexes its bundled search tools
   (`ugrep`/`rg`/`bfs`) off `argv[0]`, and the shims it injects run
   `"$CLAUDE_CODE_EXECPATH" -G …`. Under the linker launch, `/proc/self/exe` —
   hence `CLAUDE_CODE_EXECPATH` — is the **linker**, so the shim runs
   `ld.so -G …` and dies with `-G: cannot open shared object file`.

## The fix — a loader that *is* `/proc/self/exe`

`claude-dispatch` is a small static-pie binary the kernel can exec on WSL1. The
kernel execs **it**, so `/proc/self/exe` genuinely is `claude-dispatch`. It then:

1. inspects `argv[0]` — tool dispatch (`ugrep`/`rg`/`bfs`) vs. a normal launch;
2. `mmap`s the real `ld.so` and builds a fresh stack whose `argv` is
   `[ld.so, (--argv0 <tool>)?, <claude>, <args…>]`, with the auxv repointed at ld.so;
3. **jumps to ld.so's entry in-process — no `execve`.**

Because there was no `execve`, `/proc/self/exe` stays `claude-dispatch`, so
`CLAUDE_CODE_EXECPATH` is correct with **no `LD_PRELOAD`, no `readlink` hook, no
env var**. grep/find/rg run (as claude-`ugrep`/`rg`/`bfs`), and subagents work
automatically — claude self-spawns via `execPath` = `claude-dispatch`.

It reuses nix-ld's ELF mapper, raw syscalls, self-relocation and jump trampoline;
the direct-exec loader + tool dispatcher is
[`loader/src/main.rs`](./loader/src/main.rs). See [`loader/NOTICE`](./loader/NOTICE).

## Install

Needs a Rust toolchain + a C compiler (the bundled [pixi](https://pixi.sh) env
provides both) and a glibc ≥ 2.33 dynamic linker.

```bash
pixi run install-loader      # detects claude + linker, builds, installs ~/.local/bin/claude-dispatch
```

Then add the launcher to your `~/.bashrc` / `~/.zshrc` and reload your shell:

```bash
claude() { "$HOME/.local/bin/claude-dispatch" "$@"; }
```

Verify in a fresh shell: `echo "$CLAUDE_CODE_EXECPATH"` ends in `…/claude-dispatch`,
`echo "$LD_PRELOAD"` is empty, and `grep`/`find`/`rg` work. See
[`loader/`](./loader/) for `make` / `cargo` builds, overrides, and details.

---

## 🗄 About the mirror

This repo began as — and still contains — an **archival mirror of Claude Code's
leaked source** (the TypeScript/TSX under [`src/`](./src/)), recovered from a
`.map` sourcemap accidentally published to npm in March 2026 (discovered by
[Chaofan Shou](https://x.com/Fried_rice); originally mirrored by
[Yasas Banu](https://www.yasasbanuka.tech)). It is study material, not a buildable
project. A short tour of what's inside is in [`CLAUDE.md`](./CLAUDE.md).

## 📜 License & disclaimer

The loader and tooling in `loader/` are derived from nix-ld (MIT,
[`loader/LICENSE.nix-ld`](./loader/LICENSE.nix-ld)); everything else original to
this repo is [WTFPL](./LICENSE). **The mirrored source under `src/` is the
proprietary property of Anthropic PBC**, included for educational/archival
purposes only — this is not an official Anthropic product.
