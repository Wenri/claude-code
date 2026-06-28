# Build & install the WSL1 ld-linux grep/find/rg fix.
# See README.md and anthropics/claude-code#38788.
#
# Override any of these on the command line, e.g.:
#   make CC=gcc CLAUDE_BIN=/opt/claude/bin/claude
#   make install PREFIX=$HOME/.local

PREFIX     ?= $(HOME)/.local
CLAUDE_BIN ?= $(PREFIX)/bin/claude
LD_LINUX   ?= /lib64/ld-linux-x86-64.so.2
DISPATCH   ?= $(PREFIX)/bin/claude-dispatch
PRELOAD    ?= $(PREFIX)/lib/claude-preload.so
CC         ?= cc
CFLAGS     ?= -O2 -Wall

all: claude-dispatch claude-preload.so

claude-dispatch: claude-dispatch.c
	$(CC) $(CFLAGS) -DCLAUDE_BIN='"$(CLAUDE_BIN)"' -DLD_LINUX='"$(LD_LINUX)"' -DPRELOAD_PATH='"$(PRELOAD)"' -o $@ $<

claude-preload.so: claude-preload.c
	$(CC) $(CFLAGS) -shared -fPIC -DDISPATCH_PATH='"$(DISPATCH)"' -o $@ $< -ldl

install: all
	install -d "$(PREFIX)/bin" "$(PREFIX)/lib"
	install -m 0755 claude-dispatch "$(PREFIX)/bin/claude-dispatch"
	install -m 0755 claude-preload.so "$(PREFIX)/lib/claude-preload.so"
	@echo
	@echo "Installed claude-dispatch and claude-preload.so under $(PREFIX)."
	@echo "Now add the launcher shell function from README.md to your ~/.bashrc or ~/.zshrc."

clean:
	rm -f claude-dispatch claude-preload.so

.PHONY: all install clean
