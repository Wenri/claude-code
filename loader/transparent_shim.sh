#!/bin/sh
# transparent_shim.sh — install the rtld-dispatch loader "transparently" over a binary
# that is spawned by a FIXED path (so a "<prog>.rtld" launcher can't be interposed) and
# that also reads /proc/self/exe to locate itself. Antigravity's Go
# language_server_linux_x64 is the motivating case: the IDE's node server execs it by a
# fixed path (which fails on WSL1, #38788), and it uses os.Executable() to find GeminiDir.
#
# The loader takes the binary's own name; the real binary moves to "<name>.real". Because
# the loader is kernel-exec'd (it IS a dynamic linker), /proc/self/exe stays "<name>", so
# the program's execPath resolves exactly as if it had been exec'd directly. See the
# loader's src/main.rs (transparent-shim mode) and ../README.md.
#
# Also applies the tcmalloc/WSL1 patch (patch_agy_wsl1.py) when the binary carries it.
# Idempotent, and safe to re-run after every Antigravity upgrade (which redownloads the
# real binary back to <name>).
#
# Usage: transparent_shim.sh <binary> [loader]
#        loader defaults to ~/.local/bin/claude.rtld (build via: make -C loader install)
set -eu

BIN=${1:?usage: transparent_shim.sh <binary> [loader]}
LOADER=${2:-$HOME/.local/bin/claude.rtld}
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

[ -f "$LOADER" ] || { echo "loader not found: $LOADER  (build it: make -C loader install)" >&2; exit 1; }
[ -f "$BIN" ]    || { echo "binary not found: $BIN" >&2; exit 1; }

# Is <name> already the loader? Loaders are a tiny ld.so (~250 KB); the real binaries that
# need this bundle whole runtimes (100+ MB). So "small AND a .real sibling exists" ⇒ already
# shimmed — just refresh the loader copy (it may have been rebuilt). This survives loader
# upgrades without ever mv'ing a loader onto the real binary.
if [ -e "$BIN.real" ] && [ "$(wc -c < "$BIN")" -lt 1048576 ]; then
    rm -f "$BIN" && cp -l "$LOADER" "$BIN" && chmod 0755 "$BIN"
    echo "already shimmed — refreshed loader at $BIN  (real binary: $BIN.real)"
    exit 0
fi

# <name> is the real program (fresh install or post-upgrade). Fix its runtime (tcmalloc)
# first, then interpose the loader. patch_agy_wsl1.py exits non-zero when there's nothing
# to patch (no sites / already patched) — that's fine, the launch fix applies regardless.
if [ -f "$HERE/patch_agy_wsl1.py" ]; then
    python3 "$HERE/patch_agy_wsl1.py" "$BIN" && echo "(tcmalloc/WSL1 patch applied)" \
        || echo "(tcmalloc patch: nothing to do)"
fi

mv -f "$BIN" "$BIN.real"
cp -l "$LOADER" "$BIN"
chmod 0755 "$BIN"
echo "shimmed: $BIN"
echo "  loader → $BIN   (/proc/self/exe stays here, so execPath resolves correctly)"
echo "  real   → $BIN.real"
