#!/usr/bin/env sh
# install.sh — build & install the claude-dispatch in-process loader.
#
# Auto-detects the claude binary and the dynamic linker, builds the Rust loader
# (paths baked in), installs it to ~/.local/bin/claude-dispatch, and prints the
# launcher shell function.
#
# Override detection: CLAUDE_BIN=... CLAUDE_LD_LINUX=... PREFIX=$HOME/.local
# Needs cargo (this repo's pixi env provides it) + a C compiler. See ../README.md
# and anthropics/claude-code#38788.
set -eu

here="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PREFIX="${PREFIX:-$HOME/.local}"
BIN="$PREFIX/bin"

# 1. locate the real claude binary (the leaf ELF)
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

# 3. need cargo
if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo not found. Install a Rust toolchain (this repo's pixi env provides it:" >&2
  echo "       'pixi add rust', then run via 'pixi run install-loader')." >&2
  exit 1
fi

echo "claude binary  : $CLAUDE_BIN"
echo "dynamic linker : $CLAUDE_LD_LINUX"
echo "install prefix : $PREFIX"
echo

echo "building claude-dispatch (Rust, static-pie) ..."
export CLAUDE_BIN CLAUDE_LD_LINUX RUSTC_BOOTSTRAP=1
( cd "$here" && cargo build --release )

mkdir -p "$BIN"
install -m 0755 "$here/target/release/claude-dispatch" "$BIN/claude-dispatch"

cat <<EOF

✓ installed: $BIN/claude-dispatch

Add this launcher to your ~/.bashrc or ~/.zshrc (it replaces any earlier
ld-linux / --preload claude function):

claude() {
  "$BIN/claude-dispatch" "\$@"
}

Then reload your shell (exec \$SHELL, or open a new terminal) and run 'claude'.
The loader IS /proc/self/exe, so CLAUDE_CODE_EXECPATH resolves correctly with no
LD_PRELOAD and no readlink hook. Verify with:
  echo "CLAUDE_CODE_EXECPATH=\$CLAUDE_CODE_EXECPATH"   # should end in /claude-dispatch
EOF
