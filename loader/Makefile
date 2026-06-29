# Build & install claude-dispatch — a custom glibc ld.so that loads Claude Code
# (see ../README.md). The heavy lifting is in build.sh / install.sh; this is a
# thin convenience wrapper.
#
#   make            build the custom ld.so (loader/.build/glibc-obj/elf/ld.so)
#   make install    build + install ~/.local/bin/claude-dispatch + print launcher
#   make clean      remove the build tree
#
# Override paths: make install CLAUDE_BIN=/opt/claude/bin/claude PREFIX=$HOME/.local

PREFIX     ?= $(HOME)/.local
CLAUDE_BIN ?= $(PREFIX)/bin/claude
export CLAUDE_BIN
export PREFIX

all:
	sh build.sh

install:
	sh install.sh

clean:
	rm -rf .build target

.PHONY: all install clean
