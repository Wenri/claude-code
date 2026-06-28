#!/usr/bin/env sh
# install.sh — compile & install the WSL1 ld-linux grep/find/rg fix.
#
# Auto-detects the claude binary, the dynamic linker, and a C compiler, builds
# both pieces with the right paths baked in, installs them under ~/.local, and
# prints the launcher shell function to add to your shell rc.
#
# Override detection with env vars:
#   CLAUDE_BIN=/path/to/claude  CLAUDE_LD_LINUX=/path/to/ld-linux  CC=gcc  PREFIX=$HOME/.local
#
# See README.md and anthropics/claude-code#38788.
set -eu

PREFIX="${PREFIX:-$HOME/.local}"
BIN="$PREFIX/bin"
LIB="$PREFIX/lib"

here="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

# 1. locate the real claude binary (the leaf ELF, not a shell function/alias)
if [ -z "${CLAUDE_BIN:-}" ]; then
  for c in "$HOME/.local/bin/claude" "/usr/local/bin/claude" "/usr/bin/claude"; do
    [ -f "$c" ] && CLAUDE_BIN="$c" && break
  done
fi
if [ -z "${CLAUDE_BIN:-}" ] || [ ! -f "$CLAUDE_BIN" ]; then
  echo "error: could not find the claude binary; re-run with CLAUDE_BIN=/path/to/claude" >&2
  exit 1
fi

# 2. locate the dynamic linker (override with CLAUDE_LD_LINUX=...)
if [ -z "${CLAUDE_LD_LINUX:-}" ]; then
  case "$(uname -m)" in
    x86_64)  CLAUDE_LD_LINUX=/lib64/ld-linux-x86-64.so.2 ;;
    aarch64) CLAUDE_LD_LINUX=/lib/ld-linux-aarch64.so.1 ;;
    *) echo "error: unknown arch $(uname -m); re-run with CLAUDE_LD_LINUX=..." >&2; exit 1 ;;
  esac
fi
if [ ! -e "$CLAUDE_LD_LINUX" ]; then
  echo "error: dynamic linker not found at $CLAUDE_LD_LINUX; re-run with CLAUDE_LD_LINUX=..." >&2
  exit 1
fi

# 3. pick a C compiler
if [ -z "${CC:-}" ]; then
  for c in cc gcc clang; do
    if command -v "$c" >/dev/null 2>&1; then CC="$c"; break; fi
  done
fi
if [ -z "${CC:-}" ] || ! command -v "$CC" >/dev/null 2>&1; then
  echo "error: no C compiler found. Install gcc or clang (Debian/Ubuntu: 'sudo apt install build-essential'," >&2
  echo "       Slackware: install the 'gcc' package), or re-run with CC=/path/to/compiler." >&2
  exit 1
fi

DISPATCH="$BIN/claude-dispatch"
PRELOAD="$LIB/claude-preload.so"

echo "claude binary  : $CLAUDE_BIN"
echo "dynamic linker : $CLAUDE_LD_LINUX"
echo "C compiler     : $CC"
echo "install prefix : $PREFIX"
echo

mkdir -p "$BIN" "$LIB"

echo "compiling claude-dispatch ..."
"$CC" -O2 -Wall \
  -DCLAUDE_BIN="\"$CLAUDE_BIN\"" -DLD_LINUX="\"$CLAUDE_LD_LINUX\"" -DPRELOAD_PATH="\"$PRELOAD\"" \
  -o "$DISPATCH" "$here/claude-dispatch.c"

echo "compiling claude-preload.so ..."
"$CC" -O2 -Wall -shared -fPIC \
  -DDISPATCH_PATH="\"$DISPATCH\"" \
  -o "$PRELOAD" "$here/claude-preload.c" -ldl

chmod 0755 "$DISPATCH" "$PRELOAD"

cat <<EOF

✓ installed:
    $DISPATCH
    $PRELOAD

Add this launcher to your ~/.bashrc or ~/.zshrc (replace any plain
'ld-linux ... claude' alias you were using before). It uses the linker's own
--preload, so no LD_PRELOAD env var leaks into unrelated child processes:

claude() {
  "$CLAUDE_LD_LINUX" --preload "$PRELOAD" "$CLAUDE_BIN" "\$@"
}

Then reload your shell (exec \$SHELL, or open a new terminal) and run 'claude'.
Verify the fix with:  echo 'CLAUDE_CODE_EXECPATH='"\$CLAUDE_CODE_EXECPATH"
(it should point at claude-dispatch, not at ld-linux), and confirm a grep tool
call no longer errors with "-G: cannot open shared object file".
EOF
