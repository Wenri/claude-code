#!/usr/bin/env sh
# install.sh — build claude-dispatch (a custom glibc ld.so) and install it.
#
# The build itself is folded into build.rs (extract + patch + configure + make
# glibc → librtld.os, then cargo links the ld.so). This script just runs
# `cargo build`, strips the conda-gcc RPATH (which build.rs can't — it runs before
# the link, and rtld asserts DT_RPATH==NULL), and installs the result.
#
# Override: CLAUDE_BIN=... PREFIX=$HOME/.local
# Needs cargo + gcc + patchelf (this repo's pixi env provides them) and the glibc
# source tarball (git lfs pull). See ../README.md and anthropics/claude-code#38788.
set -eu

here="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PREFIX="${PREFIX:-$HOME/.local}"
BIN="$PREFIX/bin"

# locate the real claude binary (also baked in by build.rs as the default program)
if [ -z "${CLAUDE_BIN:-}" ]; then
  for c in "$HOME/.local/bin/claude" "/usr/local/bin/claude" "/usr/bin/claude"; do
    [ -f "$c" ] && CLAUDE_BIN="$c" && break
  done
fi
if [ -z "${CLAUDE_BIN:-}" ] || [ ! -f "$CLAUDE_BIN" ]; then
  echo "error: could not find the claude binary; re-run with CLAUDE_BIN=/path/to/claude" >&2
  exit 1
fi
export CLAUDE_BIN
command -v patchelf >/dev/null 2>&1 || { echo "error: patchelf not found (pixi add patchelf)" >&2; exit 1; }

echo "claude binary  : $CLAUDE_BIN"
echo "install prefix : $PREFIX"
echo

# build.rs does the glibc build (first time ~15 min; cached in .build/) + the ld.so link
( cd "$here" && cargo build --release )

BIN_OUT="$here/target/release/claude-dispatch"
# rtld asserts DT_RPATH==NULL; the conda gcc injects one. Strip it (post-link).
patchelf --remove-rpath "$BIN_OUT"

mkdir -p "$BIN"
install -m 0755 "$BIN_OUT" "$BIN/claude-dispatch"

cat <<EOF

✓ installed: $BIN/claude-dispatch

Add this launcher to your ~/.bashrc or ~/.zshrc (it replaces any earlier
ld-linux / --preload claude function):

claude() {
  "$BIN/claude-dispatch" "\$@"
}

Then reload your shell (exec \$SHELL, or open a new terminal) and run 'claude'.
claude-dispatch is a custom glibc ld.so; the kernel execs it, so /proc/self/exe
(hence CLAUDE_CODE_EXECPATH) is correct with no LD_PRELOAD and no readlink hook.
Verify with:  echo "CLAUDE_CODE_EXECPATH=\$CLAUDE_CODE_EXECPATH"
EOF
