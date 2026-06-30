# claude-dispatch — run Claude Code on WSL1 (a custom `ld.so`)

`claude-dispatch` is a **custom glibc dynamic linker** that makes Claude Code work
on **WSL1**, where the CLI otherwise dies with `Exec format error` and — via the
common `ld-linux` workaround — breaks every `grep`/`find`/`rg` tool call.

It lives in [`loader/`](./loader/): a ~2-line patch to glibc's `dl_main` plus a
small `no_std` Rust dispatch object, building a drop-in `ld.so`. It fixes the
upstream issue [anthropics/claude-code#38788](https://github.com/anthropics/claude-code/issues/38788).

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

## The fix — be the linker

A dynamic linker (`ld.so`) is itself a kernel-executable ELF. `claude-dispatch`
**is** a custom glibc `ld.so`: the kernel execs *it*, so `/proc/self/exe` — hence
`CLAUDE_CODE_EXECPATH` — genuinely is `claude-dispatch`, never a separate linker.

A tiny hook in glibc's `dl_main` (the "run as a program" path) calls our Rust
`claude_dispatch`, which:

1. picks the program to load = `$CLAUDE_BIN` (env override → compile-time default);
2. leaves the kernel-provided `argv` **untouched** — so the program receives
   `[<how-we-were-invoked>, <user args…>]` unchanged, and claude dispatches its
   bundled `ugrep`/`rg`/`bfs` off `argv[0]` exactly as it always does.

Because `argv` isn't shifted, glibc's `skip_args` stays 0 and the rest of rtld runs
untouched — it loads claude and transfers control normally. **No `LD_PRELOAD`, no
`readlink` hook, no env var, no `execve`.** grep/find/rg work, and subagents work
automatically (claude self-spawns via `execPath` = `claude-dispatch`).

The final link is **driven by cargo** (nix-ld style): glibc is built only up to
`librtld.os`, then a `no_std` `bin` crate links it — rtld supplies the `_start` entry
**and** the libc (our hook resolves only `memcpy`/`memset`/`memcmp` against rtld) — into
the `-shared` `ld.so`. So the whole glibc change is **`rtld.c`-only**
([`loader/glibc/rtld-dispatch.patch`](./loader/glibc/rtld-dispatch.patch), no `elf/Makefile` hunk);
the logic is [`loader/src/main.rs`](./loader/src/main.rs) and `build.rs` owns the link recipe.

## Install

Needs a Rust toolchain, gcc, and patchelf — all in the bundled [pixi](https://pixi.sh)
env. The glibc source is in Git LFS.

```bash
git lfs pull                 # fetch loader/glibc/glibc-*.tar.xz
pixi run install-loader      # patch + build glibc, install ~/.local/bin/claude-dispatch
```

This compiles glibc once (~10–20 min). Then add the launcher to your `~/.bashrc` /
`~/.zshrc` and reload your shell:

```bash
claude() { "$HOME/.local/bin/claude-dispatch" "$@"; }
```

Verify in a fresh shell: `echo "$CLAUDE_CODE_EXECPATH"` ends in `…/claude-dispatch`,
`echo "$LD_PRELOAD"` is empty, and `grep`/`find`/`rg` work. See
[`loader/`](./loader/) for build internals and overrides.

> **Version note:** `claude-dispatch` is built from the **same glibc version as your
> system** (here 2.42) so the linker it replaces stays in step with the `libc.so.6`
> it loads claude against. Rebuild after a system glibc upgrade.

---

## 🗄 About the mirror

This repo began as — and still contains — an **archival mirror of Claude Code's
leaked source** (the TypeScript/TSX under [`src/`](./src/)), recovered from a
`.map` sourcemap accidentally published to npm in March 2026 (discovered by
[Chaofan Shou](https://x.com/Fried_rice); originally mirrored by
[Yasas Banu](https://www.yasasbanuka.tech)). It is study material, not a buildable
project. A short tour of what's inside is in [`CLAUDE.md`](./CLAUDE.md).

## 📜 License & disclaimer

`claude-dispatch` patches and links against **glibc**, so the *built binary* is
glibc-derived (**LGPL-2.1-or-later**); this repo ships only the patch + Rust source,
not a binary (see [`loader/NOTICE`](./loader/NOTICE)). Everything else original to
this repo — the patch, the Rust dispatch, tooling, docs — is [WTFPL](./LICENSE).
**The mirrored source under `src/` is the proprietary property of Anthropic PBC**,
included for educational/archival purposes only — this is not an official Anthropic
product.
