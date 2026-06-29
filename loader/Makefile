# Build & install the claude-dispatch in-process loader (Rust; see ../README.md).
# Derived from nix-ld (MIT — LICENSE.nix-ld). Needs a Rust toolchain (the repo's
# pixi env provides it) plus a C compiler for the freestanding nolibc.
#
# Override paths if your install differs:
#   make install PREFIX=$HOME/.local CLAUDE_BIN=/opt/claude/bin/claude

PREFIX     ?= $(HOME)/.local
CLAUDE_BIN ?= $(PREFIX)/bin/claude
LD_LINUX   ?= /lib64/ld-linux-x86-64.so.2
CARGO      ?= cargo

# Paths are baked into the binary at build time (build.rs forwards these);
# nix-ld's freestanding build needs nightly features enabled on stable.
export CLAUDE_BIN
export CLAUDE_LD_LINUX = $(LD_LINUX)
export RUSTC_BOOTSTRAP = 1

BIN = target/release/claude-dispatch

all:
	$(CARGO) build --release

install: all
	install -d "$(PREFIX)/bin"
	install -m 0755 "$(BIN)" "$(PREFIX)/bin/claude-dispatch"
	@echo
	@echo "Installed claude-dispatch to $(PREFIX)/bin/."
	@echo 'Add to your shell rc:  claude() { "$$HOME/.local/bin/claude-dispatch" "$$@"; }'

clean:
	$(CARGO) clean

.PHONY: all install clean
