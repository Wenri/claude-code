# 🩹 WSL1 `ld-linux` fix — repairing grep / find / rg

A two-piece fix for a secondary bug introduced by the common **WSL1 launch
workaround** for Claude Code.

Related upstream issue: [anthropics/claude-code#38788 — *Claude code 2.1.83 and
above broken on WSL1*](https://github.com/anthropics/claude-code/issues/38788).

---

## The chain of problems

1. **Primary bug (#38788).** On **WSL1**, Claude Code `>= 2.1.83` won't exec:

   ```
   -bash: /home/user/.local/bin/claude: cannot execute binary file: Exec format error
   ```

2. **Common workaround.** Launch the binary through the dynamic linker, which
   sidesteps WSL1's exec-format limitation:

   ```bash
   claude() { /lib64/ld-linux-x86-64.so.2 "$HOME/.local/bin/claude" "$@"; }
   ```

3. **Secondary bug (what this fixes).** Now every `grep`, `find`, and `rg` tool
   call inside Claude fails with:

   ```
   error while loading shared libraries: -G: cannot open shared object file: No such file or directory
   ```

## Root cause of the secondary bug

The claude binary multiplexes three bundled search tools (`ugrep`, `rg`, `bfs`)
off `argv[0]`, and injects shell functions that call them like this:

```bash
ARGV0=ugrep "$CLAUDE_CODE_EXECPATH" -G --ignore-files ... "$@"
```

`CLAUDE_CODE_EXECPATH` is derived from `process.execPath`, which reads
`/proc/self/exe`. When the process was started as
`ld-linux-x86-64.so.2 ~/.local/bin/claude`, `/proc/self/exe` resolves to the
**linker**, not to claude. So:

```
CLAUDE_CODE_EXECPATH = /lib64/ld-linux-x86-64.so.2
```

and the shim effectively runs:

```bash
ARGV0=ugrep /lib64/ld-linux-x86-64.so.2 -G ...
```

The dynamic linker receives `-G` as a *library to load* and dies with
`-G: cannot open shared object file`.

## The fix — two small compiled pieces

| Piece | What it does |
| --- | --- |
| **`claude-preload.c`** → `claude-preload.so` | An `LD_PRELOAD` library that intercepts `readlink()` / `readlinkat()` for `/proc/self/exe` and returns the **dispatcher** path. This makes `CLAUDE_CODE_EXECPATH` point at `claude-dispatch` instead of the linker. |
| **`claude-dispatch.c`** → `claude-dispatch` | The program `CLAUDE_CODE_EXECPATH` now points to. It inspects `argv[0]`; if invoked as `ugrep`/`rg`/`bfs` it re-launches `ld-linux --argv0 <tool> <claude> <args>`, otherwise `ld-linux <claude> <args>`. |

**Why two pieces?** Each solves a different half:

- Only an `LD_PRELOAD` hook can rewrite what `/proc/self/exe` reports.
- Only a **compiled** dispatcher correctly receives `argv[0]` from the shim — a
  shebang shell script would have its `argv[0]` rewritten to the interpreter,
  losing the `ugrep`/`rg`/`bfs` tool name.

---

## Prerequisites

- A C compiler — **`gcc`** or **`clang`** (Debian/Ubuntu:
  `sudo apt install build-essential`; Slackware: install the `gcc` package).
- The dynamic linker for your arch (e.g. `/lib64/ld-linux-x86-64.so.2`),
  which you already have if the workaround in step 2 runs at all.

> Unlike the original gist, **you do not edit the C files** — the install
> script (or `make`) bakes in the right paths at compile time, and the binaries
> also honor `CLAUDE_BIN` / `CLAUDE_LD_LINUX` / `CLAUDE_DISPATCH` at runtime.

## Quick start

```bash
cd wsl1-ld-linux-fix
./install.sh
```

`install.sh` auto-detects the claude binary, the dynamic linker, and a
compiler; builds both pieces; installs them under `~/.local`; and prints the
launcher function to drop into your `~/.bashrc` / `~/.zshrc`:

```bash
claude() {
  LD_PRELOAD="$HOME/.local/lib/claude-preload.so" \
    /lib64/ld-linux-x86-64.so.2 "$HOME/.local/bin/claude" "$@"
}
```

Reload your shell (`exec $SHELL`) and run `claude`.

### Or build with `make`

```bash
make install                 # defaults: PREFIX=$HOME/.local, x86-64 linker
# override anything:
make install CC=gcc CLAUDE_BIN=/opt/claude/bin/claude LD_LINUX=/lib/ld-linux-aarch64.so.1
```

### Or compile by hand

```bash
gcc -O2 -o ~/.local/bin/claude-dispatch claude-dispatch.c \
    -DCLAUDE_BIN="\"$HOME/.local/bin/claude\"" -DLD_LINUX='"/lib64/ld-linux-x86-64.so.2"'
mkdir -p ~/.local/lib
gcc -O2 -shared -fPIC -o ~/.local/lib/claude-preload.so claude-preload.c -ldl \
    -DDISPATCH_PATH="\"$HOME/.local/bin/claude-dispatch\""
```

## Verify

After reloading your shell and starting `claude`:

- `CLAUDE_CODE_EXECPATH` should point at `…/claude-dispatch` (not at `ld-linux`).
- A `grep`/`find`/`rg` tool call should run normally instead of failing with
  `-G: cannot open shared object file`.

## Uninstall

```bash
rm -f ~/.local/bin/claude-dispatch ~/.local/lib/claude-preload.so
```

…and revert your `claude()` shell function to a plain
`ld-linux … claude "$@"` (or remove it).

---

*Credit: fix for the secondary breakage reported under
[anthropics/claude-code#38788](https://github.com/anthropics/claude-code/issues/38788).
For educational/archival use alongside the rest of this repository.*
