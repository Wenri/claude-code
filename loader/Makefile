# Build & install rtld-dispatch — a custom glibc ld.so that loads a WSL1-hostile
# dynamically-linked program in place (see ../README.md). The whole build (extract +
# patch + configure + make glibc -> librtld.os, then the final -shared ld.so link) is
# folded into build.rs + cargo; this Makefile is the build+install front end.
#
#   make                 cargo build (build.rs builds glibc on first run, ~15 min, cached)
#   make install         build + patchelf + install ~/.local/bin/<prog>.rtld (+ launchers)
#   make install PROGS="claude agy"   install a loader for each program
#   make clean           remove the build tree (forces a glibc rebuild next time)
#
# The loader derives its target from its own name: `<prog>.rtld` loads `<prog>` from
# the same dir (via /proc/self/exe). So each `<prog>.rtld` is installed next to the
# real `<prog>` binary. Needs cargo + gcc + patchelf (this repo's pixi env); the rtld-minimal
# glibc source tree is committed unextracted in glibc/glibc-*-rtld/ (see glibc/prune-glibc.sh).

PREFIX ?= $(HOME)/.local
BINDIR := $(PREFIX)/bin
PROGS  ?= claude
BIN_OUT := target/release/rtld-dispatch

all:
	cargo build --release

# build.rs runs the glibc build + the ld.so link; here we only do the post-link
# steps that can't live in build.rs (it runs before the link): strip the conda-gcc
# RPATH (rtld asserts DT_RPATH==NULL) and install the loader.
#
# The per-program loaders are byte-identical, so we hardlink each one from BIN_OUT —
# zero copies when the build tree and BINDIR share a filesystem (the common case). If
# ln fails (cross-device), we fall back to install(1) and redirect the source to the
# new copy so subsequent hardlinks succeed within BINDIR (1 copy + N−1 hardlinks).
# /proc/self/exe is still reported per-name even for a hardlink (so the .rtld→target
# derivation still works; verified on WSL1). Install all loaders in one invocation —
# reinstalling only a subset later would leave the others on the old inode.
install: all
	@command -v patchelf >/dev/null || { echo "error: patchelf not found (pixi add patchelf)" >&2; exit 1; }
	patchelf --remove-rpath "$(BIN_OUT)"
	install -d "$(BINDIR)"
	@src="$(BIN_OUT)"; for p in $(PROGS); do \
	  dst="$(BINDIR)/$$p.rtld"; \
	  ln -f "$$src" "$$dst" 2>/dev/null \
	    || { install -m 0755 "$$src" "$$dst"; src="$$dst"; }; \
	  echo "✓ installed $$dst   (loads $(BINDIR)/$$p)"; \
	done
	@echo; echo "Add launcher(s) to your ~/.bashrc or ~/.zshrc:"; \
	for p in $(PROGS); do printf '  %s() { "%s/%s.rtld" "$$@"; }\n' "$$p" "$(BINDIR)" "$$p"; done; \
	echo; echo "Each loader IS /proc/self/exe, so CLAUDE_CODE_EXECPATH etc. resolve correctly"; \
	echo "with no LD_PRELOAD and no readlink hook."

clean:
	cargo clean
	rm -rf .build

.PHONY: all install clean
