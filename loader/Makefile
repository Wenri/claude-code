# Build a freestanding launcher which maps the target's installed interpreter.
PREFIX ?= $(HOME)/.local
BINDIR := $(PREFIX)/bin
PROGS ?= claude
PYTHON ?= python3
BIN_OUT := .build/rtld-dispatch
ifeq ($(origin CC),default)
CC := gcc
endif
CFLAGS ?= -O2 -Wall -Wextra
STRIP ?= $(shell $(CC) -print-prog-name=strip)

all: $(BIN_OUT)

$(BIN_OUT): main.c Makefile tests/smoke.py
	mkdir -p "$(@D)"
	$(CC) $(CPPFLAGS) $(CFLAGS) -fno-stack-protector -fno-builtin -fPIE \
	  $(LDFLAGS) -nostdlib -static-pie -Wl,-e,_start -Wl,-z,noexecstack -o "$@.tmp" main.c
	$(STRIP) --strip-all "$@.tmp"
	patchelf --remove-rpath "$@.tmp"
	$(PYTHON) tests/smoke.py --check-only "$@.tmp"
	mv -f "$@.tmp" "$@"

# Hardlink identical loaders where possible; copy across filesystems. The build
# replaces its output atomically, so rebuilding does not modify installed loaders.
install: all
	install -d "$(BINDIR)"
	@set -e; src="$(BIN_OUT)"; for p in $(PROGS); do \
	  dst="$(BINDIR)/$$p.rtld"; \
	  ln -f "$$src" "$$dst" 2>/dev/null \
	    || { install -m 0755 "$$src" "$$dst"; src="$$dst"; }; \
	  echo "installed $$dst (loads $(BINDIR)/$$p)"; \
	done
	@echo "Add launcher(s) to your ~/.bashrc or ~/.zshrc:"; \
	for p in $(PROGS); do printf '  %s() { "%s/%s.rtld" "$$@"; }\n' "$$p" "$(BINDIR)" "$$p"; done

test: all
	CC="$(CC)" $(PYTHON) tests/smoke.py "$(BIN_OUT)"
	$(PYTHON) tests/runtime.py "$(BIN_OUT)" --cc "$(CC)"
	$(PYTHON) tests/diagnostics.py "$(BIN_OUT)" --cc "$(CC)"

# Download binary runtime packages and exercise this exact launcher against each.
test-matrix: all
	$(PYTHON) -m unittest discover -s tests -p 'test_matrix.py'
	$(PYTHON) tests/matrix.py "$(BIN_OUT)" --cc "$(CC)" $(MATRIX_ARGS)

clean:
	rm -rf .build

.PHONY: all install test test-matrix clean
