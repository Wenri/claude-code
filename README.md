# rtld-dispatch — run Claude Code (and friends) on WSL1 (a custom `ld.so`)

`rtld-dispatch` is a **custom glibc dynamic linker** that makes Claude Code work
on **WSL1**, where the CLI otherwise dies with `Exec format error` and — via the
common `ld-linux` workaround — breaks every `grep`/`find`/`rg` tool call.

It lives in [`loader/`](./loader/): a ~2-line patch to glibc's `dl_main` plus a
small `no_std` Rust dispatch object, building a drop-in `ld.so`. It fixes the
upstream issue [anthropics/claude-code#38788](https://github.com/anthropics/claude-code/issues/38788).
It's **generic** — install it as `claude.rtld` to run `claude`, `agy.rtld` to run
Google's Antigravity CLI, etc. (`agy` also needs a one-off binary patch, see
[`loader/patch_agy_wsl1.py`](./loader/patch_agy_wsl1.py)).

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

A dynamic linker (`ld.so`) is itself a kernel-executable ELF. `rtld-dispatch`
**is** a custom glibc `ld.so`: the kernel execs *it*, so `/proc/self/exe` — hence
`CLAUDE_CODE_EXECPATH` — genuinely is the loader, never a separate linker.

A tiny hook in glibc's `dl_main` (the "run as a program" path) calls our Rust
`claude_dispatch`, which:

1. derives the program to load from its **own** install name (`/proc/self/exe`), in one
   of two shapes: **launcher** — strip a trailing `.rtld` (`claude.rtld` → `claude`,
   installed beside it); or **transparent** — installed *under* the program's own name
   with the real binary moved to `<name>.real` (loads `<name>.real`). The transparent
   shape is for programs spawned by a *fixed* path that a `.rtld` launcher can't wrap and
   that also read `/proc/self/exe` to find themselves — e.g. Antigravity's Go
   `language_server_linux_x64` (`os.Executable()`); being kernel-exec'd, `/proc/self/exe`
   stays `<name>`, so its execPath resolves correctly;
2. forwards `argv[0]` to that program **unless** we were invoked under our own name —
   so a normal launch sees the program's own name, while a bundled-tool invocation
   (claude re-execs itself with `argv[0]` = `ugrep`/`rg`/`bfs`) passes the tool name
   straight through for claude's own multiplexer to dispatch.

The rest of rtld runs untouched — it loads the program and transfers control normally.
**No `LD_PRELOAD`, no `readlink` hook, no env var, no `execve`.** grep/find/rg work, and
subagents work automatically (claude self-spawns via `execPath` = `…/claude.rtld`).

The final link is **driven by cargo** (nix-ld style): glibc is built only up to
`librtld.os`, then a `no_std` `bin` crate links it — rtld supplies the `_start` entry
**and** the libc (our hook resolves only `memcpy`/`memset`/`memcmp` against rtld) — into
the `-shared` `ld.so`. So the whole glibc change is **`rtld.c`-only**
([`loader/glibc/rtld-dispatch.patch`](./loader/glibc/rtld-dispatch.patch), no `elf/Makefile` hunk);
the logic is [`loader/src/main.rs`](./loader/src/main.rs) and `build.rs` owns the link recipe.

## Install

Needs a Rust toolchain, gcc, and patchelf — all in the bundled [pixi](https://pixi.sh)
env. The glibc source is committed in-repo as a plain unextracted tree (no Git LFS), pruned to
an rtld-minimal ~1 MB closure — only what the build reads to produce `ld.so`
([`loader/glibc/prune-glibc.sh`](./loader/glibc/prune-glibc.sh)).

```bash
pixi run install-loader      # patch + build glibc, install ~/.local/bin/claude.rtld
# for several programs at once:  make -C loader install PROGS="claude agy"
```

This compiles glibc once (~10–20 min), then installs a `<prog>.rtld` next to each
real `<prog>`. Add the launcher(s) to your `~/.bashrc` / `~/.zshrc` and reload:

```bash
claude() { "$HOME/.local/bin/claude.rtld" "$@"; }
agy()    { "$HOME/.local/bin/agy.rtld"    "$@"; }   # if you installed it for agy
```

Verify in a fresh shell: `echo "$CLAUDE_CODE_EXECPATH"` ends in `…/claude.rtld`,
`echo "$LD_PRELOAD"` is empty, and `grep`/`find`/`rg` work. See
[`loader/`](./loader/) for build internals.

### Fixed-path binaries (transparent shim)

Some programs are launched by a *fixed* path you don't control — e.g. the Antigravity
IDE's node server spawns `…/extensions/antigravity/bin/language_server_linux_x64`
directly (a Go binary that also `os.Executable()`s to find its data dir). A `.rtld`
launcher can't wrap that, so install the loader **transparently** with
[`loader/transparent_shim.sh`](./loader/transparent_shim.sh):

```bash
loader/transparent_shim.sh "$HOME/.antigravity-ide-server/bin/<ver>/extensions/antigravity/bin/language_server_linux_x64"
```

It moves the real binary to `<name>.real`, drops the loader in its place (and applies
[`patch_agy_wsl1.py`](./loader/patch_agy_wsl1.py) if the binary carries the tcmalloc
issue). `execve` of the fixed path then succeeds and `/proc/self/exe` stays `<name>`.
It's idempotent — **re-run after each Antigravity upgrade** (the installer redownloads
the real binary).

> **Version note:** `rtld-dispatch` is built from the **same glibc version as your
> system** (here 2.42) so the linker it replaces stays in step with the `libc.so.6`
> it loads the program against. Rebuild after a system glibc upgrade.

---

## 🗄 About the mirror

This repo began as — and still contains — an **archival mirror of Claude Code's
leaked source** (the TypeScript/TSX under [`src/`](./src/)), recovered from a
`.map` sourcemap accidentally published to npm in March 2026 (discovered by
[Chaofan Shou](https://x.com/Fried_rice); originally mirrored by
[Yasas Banu](https://www.yasasbanuka.tech)). It is study material, not a buildable
project. A short tour of what's inside is in [`CLAUDE.md`](./CLAUDE.md).

## 📜 License & disclaimer

`rtld-dispatch` patches and links against **glibc**, so the *built binary* is
glibc-derived (**LGPL-2.1-or-later**); this repo ships only the patch + Rust source,
not a binary (see [`loader/NOTICE`](./loader/NOTICE)). Everything else original to
this repo — the patch, the Rust dispatch, tooling, docs — is [WTFPL](./LICENSE).
**The mirrored source under `src/` is the proprietary property of Anthropic PBC**,
included for educational/archival purposes only — this is not an official Anthropic
product.
