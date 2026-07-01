#!/usr/bin/env sh
# prune-glibc.sh — regenerate the vendored rtld-minimal glibc SOURCE TREE from an upstream tarball.
#
#     pixi run --manifest-path ../../pixi.toml loader/glibc/prune-glibc.sh glibc-2.42.tar.xz
#
# Writes the glibc-<ver>-rtld/ directory (checked into the repo, unextracted) containing ONLY
# what this loader's build reads to produce elf/librtld.os + ld.map: the dynamic linker's own
# objects (dl-*) plus the ~120 libc modules ld.so embeds (rtld-libc.a), their header/build-
# machinery closure, the vendored librtld.mk, and PREBUILT/ generated headers. It is NOT a
# general glibc tree — it builds nothing but the pieces of ld.so.
#
# MUST run in the loader's build environment (this repo's pixi env): it ships pre-generated
# headers that encode the toolchain (gcc-macros.h, bits/syscall.h, abi/version headers), so
# re-run on a glibc bump OR a compiler/kernel-header change.
#
# Method — glibc's librtld.os normally trial-links dl-allobjs.os against the FULL libc_pic.a
# to discover which libc modules ld.so needs (elf/Makefile), which forces building all of libc.
# We do one full build to capture that discovery (elf/librtld.mk) + the generated headers, then
# a second, reduced build with librtld.mk vendored in (so the trial link — and thus the full
# libc build — is skipped) under strace, recording exactly which files it reads. The tarball is
# that read-set ∪ build-control files ∪ scripts/, plus the vendored librtld.mk. Generated headers
# are handled by a rule: a header that source #includes is shipped under PREBUILT/ (it must exist
# before a compile — glibc's recursive make won't order-generate a cross-subdir #include during
# elf/subdir_lib); an order-only header (a before-compile prereq that's never #included) is NOT
# shipped — make regenerates it, and because we let it regenerate during the trace, its generator
# inputs (syscall-names.list, posix-conf-vars.list, …) get captured into the keep-set. This is
# why the reduced build in step 3 pre-populates ONLY the #included headers. rtld.c ships with the
# rtld-dispatch hook PRE-APPLIED (patched into the reduced tree up front, so the reduced build
# fails at the ld.so link exactly like build.rs and stops before the elf helper programs → the
# true librtld.os closure); build.rs then builds it in place — no copy, no patch step.
#
# Step 6 then MINIMISES the shipped generated headers to only what reaches librtld.os: an
# instrumented rebuild (gcc -H / -dU) records which headers a compile reads and which of their
# macros it uses (incl. via ## paste and #if defined()); each header is trimmed to (guards +
# non-#define lines + used #defines) or, if unread, stubbed — cutting e.g. first-versions.h from
# 13219 defines to ~4 and PREBUILT from ~2.8 MB to ~17 KB. It is gated on librtld.os being
# byte-identical before/after the trim, so only provably-dead content is ever removed.
set -eu

in=${1:?usage: $0 glibc-<ver>.tar.xz  (run inside the pixi build env)}
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ver=$(basename "$in" .tar.xz)
out="$here/${ver}-rtld"
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
jobs=$(nproc 2>/dev/null || echo 4)

echo "[1/6] full build to discover the rtld module list + generated headers (~15 min)…"
mkdir -p "$work/full/obj" "$work/full/src"
tar xf "$in" -C "$work/full/src" --strip-components=1
sf="$work/full/src"
( cd "$work/full/obj" && "$sf/configure" --prefix=/usr --disable-werror --disable-profile \
    CFLAGS="-g -O2" >configure.log 2>&1 )
( cd "$work/full/obj" && make -j"$jobs" >make.log 2>&1 || true )
[ -f "$work/full/obj/elf/librtld.mk" ] || { echo "  ✗ full build lacks elf/librtld.mk"; exit 1; }
( cd "$work/full/obj" && find . -name '*.h' -type f | sed 's|^\./||' | sort ) > "$work/objh"
( cd "$sf" && find . -name '*.h' -type f | sed 's|^\./||' | sort ) > "$work/srch"
comm -23 "$work/objh" "$work/srch" > "$work/genh"
echo "  captured librtld.mk + $(wc -l < "$work/genh") generated headers"

echo "[2/6] preparing the reduced (elf-only) tree…"
cp -a "$sf" "$work/rs"
cp "$work/full/obj/elf/librtld.mk" "$work/rs/elf/librtld.mk.vendored"
python3 - "$work/rs/elf/Makefile" <<'PY'
import sys
f=sys.argv[1]; s=open(f).read()
a=s.index('$(objpfx)librtld.mk:'); b=s.index('$(objpfx)rtld-libc.a:')
open(f,'w').write(s[:a] + '$(objpfx)librtld.mk: librtld.mk.vendored\n\tcp $< $@\n\n' + s[b:])
PY
# Apply the rtld-dispatch hook now, so the reduced build fails at the ld.so link exactly like
# build.rs does (undefined claude_dispatch) — make then stops before compiling the elf helper
# programs (ldconfig/sotruss/interp/…), giving the true librtld.os closure. It also ships rtld.c
# pre-applied, which is what build.rs's in-place build needs.
patch -p1 -d "$work/rs" < "$here/rtld-dispatch.patch" >/dev/null

echo "[3/6] strace the reduced build (configure AND make) to record the read closure…"
mkdir -p "$work/ro"
# configure reads a lot (sysdeps fragments, Makefile.in, abi-note.c, …) — strace it too, not
# just make, or those files are dropped from the tree and it won't reconfigure.
( cd "$work/ro" && strace -f -qq -e trace=openat -e status=successful -y -o cfg.strace \
    "$work/rs/configure" --prefix=/usr --disable-werror --disable-profile CFLAGS="-g -O2" \
    >configure.log 2>&1 )
# Pre-populate ONLY the generated headers that source #includes (must exist before a compile;
# glibc's recursive make won't order-generate a cross-subdir #include during elf/subdir_lib).
# We deliberately do NOT pre-populate the order-only headers — letting make regenerate them so
# their generator INPUTS (syscall-names.list, posix-conf-vars.list, …) get opened and captured
# by the strace below. (Pre-supplying an output would hide its inputs from the trace.)
inc_basenames() { grep -rhoE 'include[[:space:]]*[<"][^>"]+[>"]' "$work/rs" \
    --include='*.c' --include='*.h' --include='*.S' 2>/dev/null \
    | sed -E 's/.*[<"]([^>"]+)[>"]/\1/' | awk -F/ '{print $NF}' | sort -u; }
inc_basenames > "$work/incbn"
awk -F/ '{print $NF"\t"$0}' "$work/genh" | sort > "$work/genh-bybase"
join -t"$(printf '\t')" -1 1 -2 1 "$work/genh-bybase" "$work/incbn" | cut -f2 | sort -u > "$work/genh-included"
echo "  #included generated headers to pre-populate/ship: $(wc -l < "$work/genh-included") of $(wc -l < "$work/genh")"
while read rel; do mkdir -p "$work/ro/$(dirname "$rel")"; cp "$work/full/obj/$rel" "$work/ro/$rel"; done < "$work/genh-included"
( cd "$work/ro" && strace -f -qq -e trace=openat -e status=successful -y -o mk.strace \
    make -j1 elf/subdir_lib >make.log 2>&1 || true )
[ -f "$work/ro/elf/librtld.os" ] || { echo "  ✗ reduced build lacks elf/librtld.os"; exit 1; }

echo "[4/6] computing the keep-set (opened files ∪ build-control ∪ scripts/)…"
cd "$work/rs"
grep -hoP '= \d+<\K[^>]+' "$work/ro/cfg.strace" "$work/ro/mk.strace" | grep -F "$work/rs/" | sed "s|$work/rs/||" | sort -u > "$work/opened"
{ find . -type f \( -name Makefile -o -name Makerules -o -name Makeconfig -o -name Versions \
    -o -name Implies -o -name Implies-before -o -name Implies-after -o -name preconfigure \
    -o -name preconfigure.ac -o -name configure -o -name configure.ac -o -name '*.mk' \
    -o -name '*.sym' -o -name shlib-versions -o -name libc-abis -o -name config.make.in \
    -o -name config.h.in -o -name version.h -o -name Banner -o -name '*.awk' -o -name install-sh \
    -o -name config.guess -o -name config.sub \) | sed 's|^\./||'
  find scripts -type f | sed 's|^\./||'
  echo elf/librtld.mk.vendored; } > "$work/control"
cat "$work/opened" "$work/control" | sort -u | while read f; do [ -f "$f" ] && echo "$f"; done > "$work/keep"
echo "  keep-set: $(wc -l < "$work/keep") files"

echo "[5/6] assembling the source tree at $out…"
rm -rf "$out"; mkdir -p "$out"
tar -C "$work/rs" -cf - -T "$work/keep" | tar -C "$out" -xf -
# Ship as PREBUILT only the generated headers that source #includes — those must exist before a
# compile and glibc's recursive make can't order-generate a cross-subdir #include here. The
# order-only headers (before-compile prereqs, not #included) are NOT shipped: make regenerates
# them, and step 3's strace already captured their generator inputs (.list/.awk/…) into the
# keep-set because we let those run. This is what drops the ~140 iconvdata/timezone headers.
while read rel; do mkdir -p "$out/PREBUILT/$(dirname "$rel")"; cp "$work/full/obj/$rel" "$out/PREBUILT/$rel"; done < "$work/genh-included"
echo "  $(find "$out" -type f | wc -l) files ($(find "$out/PREBUILT" -type f | wc -l) PREBUILT headers), $(du -sh "$out" | cut -f1)"

echo "[6/6] trim PREBUILT to the macros/headers that actually reach librtld.os…"
# Which of the shipped generated headers does the rtld build actually READ, and which of their
# macros does it USE?  Harvest both from an instrumented rebuild of the assembled tree: gcc -H
# lists every header a compile opens; gcc -dU lists every macro a compile expands or tests
# (including via ## token-paste and #if defined()).  Then:
#   - a header no compile reads  → stub (its bytes cannot reach librtld.os; the file must remain
#                                  so make's before-compile prereq is satisfied);
#   - a header that is read      → keep its include guards, #includes and every non-#define line,
#                                  plus only the #defines whose name is used (the used-set is
#                                  closed under expansion, so a kept macro's dependencies are kept);
#   - config.h                   → drop entirely (it is configure's own output, regenerated each
#                                  build; a frozen copy would only shadow the correct one).
# Then rebuild and require librtld.os byte-identical to the untrimmed build IN THE SAME objdir:
# removing only unread/unused content cannot change the object, so any difference means the
# harvest missed a use and the trim is rejected.  (first-versions.h alone drops 13219→~4 defines.)
h6=$(mktemp -d); ho=$(mktemp -d); realcc=$(command -v gcc)
cat > "$h6/gcc" <<SHIM
#!/usr/bin/env bash
"$realcc" "\$@"; rc=\$?
[ -n "\${HARVEST:-}" ] || exit \$rc
c=0; for a in "\$@"; do case "\$a" in -c|-S) c=1;; -E) c=0; break;; esac; done
[ \$c = 1 ] || exit \$rc
args=(); skip=0
for a in "\$@"; do
  if [ \$skip = 1 ]; then skip=0; continue; fi
  case "\$a" in -c|-S) ;; -o|-MF|-MT|-MQ) skip=1;; -M|-MM|-MD|-MMD|-MP) ;; *) args+=("\$a");; esac
done
"$realcc" "\${args[@]}" -E -dU -H 2>"\$HARVEST/h.\$\$" | grep -E '^#(define|undef) ' >> "\$HARVEST/defs"
grep -E '^\.+ ' "\$HARVEST/h.\$\$" 2>/dev/null | sed -E 's/^\.+ //' >> "\$HARVEST/files"
rm -f "\$HARVEST/h.\$\$"; exit \$rc
SHIM
chmod +x "$h6/gcc"; : > "$h6/defs"; : > "$h6/files"

# build $out in $ho (wiped) — reused for both builds so the baked objdir path (hence md5) matches
build_in_ho() {  # args: extra env assignments for make
  rm -rf "${ho:?}"/*
  ( cd "$ho" && "$out/configure" --prefix=/usr --disable-werror --disable-profile CFLAGS="-g -O2" >/dev/null 2>&1 )
  cp -r "$out/PREBUILT/." "$ho/" 2>/dev/null || true
  ( cd "$ho" && env "$@" make -j1 elf/subdir_lib >/dev/null 2>&1 || true )
  md5sum "$ho/elf/librtld.os" 2>/dev/null | cut -d' ' -f1
}
m0=$(build_in_ho PATH="$h6:$PATH" HARVEST="$h6")     # untrimmed build + harvest
[ -n "$m0" ] || { echo "  ✗ harvest build produced no librtld.os"; exit 1; }
LC_ALL=C awk '/^#define /{print $2}' "$h6/defs" | sed -E 's/\(.*//' | LC_ALL=C sort -u > "$h6/used"
sort -u "$h6/files" | sed "s|$ho/||" > "$h6/readrel"

for hdr in $(cd "$out/PREBUILT" && find . -type f | sed 's|^\./||'); do
  f="$out/PREBUILT/$hdr"
  [ "$hdr" = config.h ] && { rm -f "$f"; continue; }
  if grep -qxF "$hdr" "$h6/readrel"; then
    LC_ALL=C awk -v u="$h6/used" '
      BEGIN { while ((getline n < u) > 0) U[n]=1 }
      /^[[:space:]]*#[[:space:]]*define[[:space:]]/ {
        n=$0; sub(/^[[:space:]]*#[[:space:]]*define[[:space:]]+/,"",n); sub(/[([:space:]].*/,"",n)
        if (n in U || n ~ /^_.*_H$/ || n ~ /_H_$/) { print; next } next }
      { print }' "$f" > "$f.t" && mv "$f.t" "$f"
  else
    printf '/* rtld-minimal: %s not read by the ld.so build; content elided (before-compile stub). */\n' "$hdr" > "$f"
  fi
done
# iconvdata/ (charset gconv tables) and timezone/ are their own subdirs that the rtld build
# never enters, so make never demands their generated headers even as before-compile prereqs —
# they can be dropped outright rather than stubbed. (The ~12 other stubs above ARE demanded by
# built subdirs, e.g. csu/abi-tag.h #included by dl-load.c, so they must remain as files.)
rm -rf "$out/PREBUILT/iconvdata" "$out/PREBUILT/timezone"

m1=$(build_in_ho)                                    # trimmed build, same $ho path
rm -rf "$h6" "$ho"
[ -n "$m1" ] && [ "$m0" = "$m1" ] || { echo "  ✗ trim changed librtld.os ($m0 -> $m1) — harvest missed a use; aborting"; exit 1; }
echo "  ✓ PREBUILT trimmed to $(find "$out/PREBUILT" -type f -printf '%s\n' | awk '{s+=$1} END{printf "%.1fK",s/1024}') across $(find "$out/PREBUILT" -type f | wc -l) files (librtld.os unchanged)"
echo "  final tree: $(find "$out" -type f | wc -l) files, $(du -sh "$out" | cut -f1)"
