# Build & install claude-dispatch — a custom glibc ld.so that loads Claude Code
# (see ../README.md). The whole build (extract + patch + configure + make glibc →
# librtld.os, then the final -shared ld.so link) is folded into build.rs + cargo;
# this Makefile is the build+install front end.
#
#   make            cargo build (build.rs builds glibc on first run, ~15 min, cached)
#   make install    build + patchelf + install ~/.local/bin/claude-dispatch + launcher
#   make clean      remove the build tree (forces a glibc rebuild next time)
#
# Override: make install CLAUDE_BIN=/opt/claude/bin/claude PREFIX=$HOME/.local
# Needs cargo + gcc + patchelf (this repo's pixi env) and the glibc tarball (git lfs pull).

PREFIX     ?= $(HOME)/.local
BINDIR     := $(PREFIX)/bin
# The real claude binary: also baked into the loader by build.rs as the default
# program. Auto-detected if not overridden.
CLAUDE_BIN ?= $(firstword $(wildcard $(HOME)/.local/bin/claude /usr/local/bin/claude /usr/bin/claude))
export CLAUDE_BIN

BIN_OUT := target/release/claude-dispatch

all:
	@test -n "$(CLAUDE_BIN)" || { echo "error: claude binary not found; re-run with CLAUDE_BIN=/path/to/claude" >&2; exit 1; }
	@echo "claude binary  : $(CLAUDE_BIN)"
	cargo build --release

# build.rs runs the glibc build + the ld.so link; here we only do the post-link
# steps that can't live in build.rs (it runs before the link): strip the conda-gcc
# RPATH (rtld asserts DT_RPATH==NULL) and install.
install: all
	@command -v patchelf >/dev/null || { echo "error: patchelf not found (pixi add patchelf)" >&2; exit 1; }
	patchelf --remove-rpath "$(BIN_OUT)"
	install -d "$(BINDIR)"
	install -m 0755 "$(BIN_OUT)" "$(BINDIR)/claude-dispatch"
	@printf '\n✓ installed: %s/claude-dispatch\n\n' "$(BINDIR)"
	@printf 'Add this launcher to your ~/.bashrc or ~/.zshrc (replaces any earlier\n'
	@printf 'ld-linux / --preload claude function):\n\n'
	@printf '  claude() { "%s/claude-dispatch" "$$@"; }\n\n' "$(BINDIR)"
	@printf 'Then reload your shell (exec $$SHELL) and run claude. claude-dispatch is a\n'
	@printf 'custom glibc ld.so; the kernel execs it, so /proc/self/exe (hence\n'
	@printf 'CLAUDE_CODE_EXECPATH) is correct with no LD_PRELOAD and no readlink hook.\n'

clean:
	cargo clean
	rm -rf .build

.PHONY: all install clean
