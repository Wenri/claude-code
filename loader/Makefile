# Build & install claude-dispatch — a custom glibc ld.so that loads Claude Code
# (see ../README.md). The whole build (glibc → librtld.os, then the final ld.so
# link) is folded into build.rs + cargo; this is a thin convenience wrapper.
#
#   make            cargo build (build.rs builds glibc on first run, ~15 min, cached)
#   make install    build + patchelf + install ~/.local/bin/claude-dispatch
#   make clean      remove the build tree (forces a glibc rebuild next time)
#
# Override: make install CLAUDE_BIN=/opt/claude/bin/claude PREFIX=$HOME/.local
export CLAUDE_BIN ?= $(HOME)/.local/bin/claude

all:
	cargo build --release

install:
	sh install.sh

clean:
	cargo clean
	rm -rf .build

.PHONY: all install clean
