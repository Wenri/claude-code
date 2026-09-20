# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git history layout (rewritten 2026-08-22)

`main` is a **linear, per-version history**: for each published release there is a
`Claude Code 2.1.V` commit whose `src/` tree is byte-identical to that version's
recovered source, immediately followed by a `recovery: authenticate <case>` commit
carrying that release's evidence, ending with a `recovery: finalize tooling…` tip
(62 commits: 31 source + 30 evidence + tip). Each evidence commit is a
**period-accurate snapshot** — era source, era tooling, era manifests — which is what
makes its frozen tests meaningful: they were authored against that era's source, so
they only verify against it. The five carrier releases (2.1.121–2.1.126) instead pair
their *finalized* evidence with era source, reproducing the sealed-head configuration
their release wrappers expect.

The tip keeps the selective cumulative `src` merge (not 2.1.126's era tree)
deliberately: it is the 2.1.126 tree **plus 18 semantic-supplement-recovered files**
(`utils/sandbox/seccomp.ts`, `buddy/*`, `commands/loops/*`, `skills/bundled/verify/*`, …)
that exist in no single era tree, and are guarded by
`recovery/test/cumulative-2.1.126-merged-source-retention.test.mjs`.

Evidence was **re-pinned, not regenerated**: commit references were remapped to the new
lineage and the dependent hash chain re-sealed (freeze `*.sha256` test/evidence manifests
→ `identity.verification.*` → `SHA256SUMS` → manifest `fileAssertions`/`identitySha256`
→ `releaseAdjacency.predecessorManifest` chain → carrier pins). All content-addressed
evidence — bundles, exact deltas, structural ledgers, attribution, readable diffs,
overlay/supplement patches, and every `*SrcGitTree` — is byte-unchanged. Note the era
schema stores the **src** tree in `baseGitTree` (the whole-tree/src-tree split came
later), so re-pinning is schema-aware. Pre-rewrite history is preserved at tags
`backup/pre-rewrite` and `backup/pre-cleanup-2026-08-22`; keep them, because some frozen
byte-pinned catalogs still reference the old commits.

Verification status on this history: cross-case pin sweep green (30 cases, 28 tree-summary
+ 21 semantic-lineage links, 5 carrier heads, plus the sanctioned 2.1.118→119 legacy-tree
anomaly); all 90 repo-local evidence gates green; 24 of 30 cases green under the full
`verify-complete-recovery` gate; genesis (2.1.88→89) partial because the withheld 2.1.88
npm tarball is unavailable. The five carrier releases cannot complete their release
wrappers here for two reasons independent of the source: the local pixi env has drifted
from the pinned toolchain (`libcrypto.so.3` differs, which blocks them on the pre-rewrite
history too), and those wrappers assert a frozen `git diff --check` over the *original*
commit pair's full trees, which splitting source from evidence necessarily changes.

## What this repository is

This is an **archival mirror of Claude Code's leaked source** (the TypeScript/TSX
under `src/`), recovered from a `.map` sourcemap accidentally published to npm in
March 2026. It is **study material, not a buildable project**: there is no
standalone `package.json`, `tsconfig.json`, lockfile, or full test suite for
`src/`, and it will not compile or run as-is. Recovery tooling has its own
locked dependencies and focused tests. The current tree is the exact 2.1.88
outer source-map baseline for every untouched file plus a selective cumulative
merge of verified source-facing recovery content for 2.1.89, 2.1.90, 2.1.91,
2.1.92, 2.1.94, 2.1.96,
2.1.97, 2.1.98, 2.1.100, 2.1.101, 2.1.104, 2.1.105, 2.1.107, 2.1.108,
2.1.109, 2.1.110, 2.1.111, 2.1.112, 2.1.113, 2.1.114, 2.1.116, 2.1.117,
2.1.118, 2.1.119, 2.1.120, 2.1.121, 2.1.122, 2.1.123, 2.1.124, and
2.1.126 (upstream did not publish 2.1.93, 2.1.95, 2.1.99, 2.1.102,
2.1.103, 2.1.106, 2.1.115, or 2.1.125). The following numbered prose is a
historical summary of the earlier overlay series, not the current case index. The first
changes four Bash/parser files; the second changes nine session, transport,
query, safety/cache, rate-limit, and help files; the third changes 21 existing
MCP, policy, input, plugin, transcript, feedback, installer, and prompt files
and adds 27 exact `/claude-api` guidance files; the fourth has 17 source-path
transitions for remote settings, Remote Control naming, hooks, streamed input,
Homebrew, tmux, cursor movement, and commands; the fifth has 44 transitions
for Mantle/model routing, effort/retry behavior, plugins and hooks, keychain
and SDK diagnostics, stream-json, resume, Slack, and terminal/transcript
repairs; the sixth changes the main API client for correct Bedrock API-key
handling; the seventh changes 19 existing paths and adds two Cedar modules for
status-line worktree/refresh data, retry/OAuth and permission hardening,
edit-history/tool statistics, terminal behavior, syntax highlighting, and W3C
trace propagation; the eighth changes 13 existing paths for Perforce
read-only enforcement, Bash permission hardening, LSP identity,
compact-disabled behavior, and shifted uppercase input; the ninth changes
three existing paths for long-thinking progress notices, stalled-animation
timing, and removal of an obsolete output-efficiency prompt owner; the tenth
changes 16 paths for trust-store, API/refusal, permission, resume, terminal,
focus, and runtime hardening; the eleventh changes the API client and
streaming query path for byte-level idle detection and partial-yield replay
prevention; the twelfth changes 28 worktree, compaction, streaming,
network, FileWrite, keybinding, scheduler, MCP, skill, WebFetch, and permission
paths; the thirteenth changes three paths for earlier long-thinking milestones
and gated Opus 4.6 thinking guidance; and the fourteenth changes 24 paths for
prompt-cache policy, built-in commands, model and API diagnostics, lazy syntax
grammars, transcript integrity, terminal input, Remote Control titles, plugin
updates, and related UI fixes; and the fifteenth changes three paths for the
rotating extended-thinking hint schedule, renderer, message placement, and
response-state reset; and the sixteenth modifies or adds 88 paths for TUI and
focus controls, fullscreen/editor behavior, plugins, MCP/API reliability,
scheduled resume, Remote Control, permissions/hooks, session durability, and
runtime hardening. Its provider-wizard relaunch fix remains exact only in the
generated bundle because that pre-existing scaffold is absent from the source
mirror; and the seventeenth recovers Opus 4.7 and `xhigh` effort, effort/theme/
skills interactions, the `/ultrareview` command, the exact target-literal
less-permission-prompts body, PowerShell and read-only permissions, plan
naming, raw-body telemetry, session/UI fixes, and adjacent reliability repairs.
Its `/setup-vertex` and `/setup-bedrock` wizard changes remain generated-only
because that scaffold is absent from the mirror; and the eighteenth adds a
shared model-temperature capability and guards the main and side-query request
builders so Opus 4.7 requests omit unsupported explicit temperatures. The
original helper spelling remains unobservable, and a structured-output mirror
gap inherited from 2.1.111 is not attributed to the 2.1.112 delta. These
overlays are not a claim that any complete authored TypeScript tree is
recoverable. Treat `src/` as read-only reference unless explicitly asked to
change it; all of it is Anthropic's proprietary property (see the README
disclaimer).

The historical 2026-08-10 semantic recovery audit supersedes the older “generated-only”
behavioral omissions in that historical overlay summary. Case-local semantic
supplements now recover observable first-party compiled AST/function behavior
for the 21 audited cases through 2.1.116 while ignoring erased identifier spelling, independent
declaration/function order, comments, formatting, and types. This is not a
whole-bundle source-build claim: the historical trees still lack the root
application manifest, dependency lock and source archive, and hermetic build
configuration, and original authored text remains unobservable.

A few things layered on top of the mirror ARE maintained here:

- `loader/` — `rtld-dispatch`, a freestanding **Linux x86-64 ELF launcher** that maps Claude Code and its installed dynamic linker in place, preserving `/proc/self/exe`; the main thing built here.
- `recovery/` — hash-pinned tooling for comparing later published bundles
  with authenticated adjacent releases and a matching source-map oracle. The
  2.1.89, 2.1.90, 2.1.91, 2.1.92, 2.1.94, 2.1.96, 2.1.97, 2.1.98,
  2.1.100, 2.1.101, 2.1.104, 2.1.105, 2.1.107, 2.1.108, 2.1.109, 2.1.110,
  2.1.111, 2.1.112, 2.1.113, 2.1.114, 2.1.116, 2.1.117, 2.1.118,
  2.1.119, 2.1.120, 2.1.121, 2.1.122, 2.1.123, 2.1.124, and 2.1.126 cases
  have exact generated bundle/package recoveries, exhaustive accounting ledgers, readable bundle
  diffs, and separately labeled partial source-like TypeScript patches. Their
  release-local overlays are frozen by the manifests; shared `src/` is the
  separately guarded selective cumulative merge. Each case manifest and its
  verifiers are the evidence contract; each case runbook records the complete
  reproducible procedure.
- [`wsl1-exec`](https://github.com/Wenri/wsl1-exec) — **moved out entirely** (2026-07, full history preserved; Apache-2.0): the standalone repo for `wsl1-exec.so`, conventionally a sibling checkout at `../wsl1-exec`. A generic `LD_PRELOAD` `exec*` shim that retries an `ENOEXEC`-failed exec via the target's `PT_INTERP`. All sources live in its `src/`: the WSL1 `execve` **and `posix_spawn`/`posix_spawnp`** (`wsl1-exec.c`) and the `readlink`/`realpath` `/proc/self/exe` hooks (`wsl1-selfexe.c`, via `getauxval(AT_EXECFN)` — no env marker, per-process, so nothing to inherit/clean up) are ours; the `exec*` family (`src/exec-variants.c`) is **[termux-exec](https://github.com/termux-play-store/termux-exec)/bionic-derived** (Apache-2.0 — SPDX tag + attribution + local changes in its header; adapted, no longer synced) — `posix_spawn` retries at the parent (glibc returns the child's exec errno) — plus unrelated **`mmap`/`mmap64` fixes** (`wsl1-mmap.c`): the empty-file-map bogus `ENOEXEC` (rattler/pixi-build) and the `MAP_FIXED_NOREPLACE`-rejected-with-`EOPNOTSUPP` case (retry without the flag) — both libc-`mmap` only, so neither reaches agy's tcmalloc (still `patch_agy_wsl1.py`). Complements `loader/`: universal and one-line to enable, and the hooks keep `/proc/self/exe` correct **for libc readers** (Node/libuv) — but raw-syscall readers (Go `os.Executable()`) and `readlinkat` still see the interpreter, so `loader/` remains the fix for dynamically linked programs using those paths. The loader does not support static binaries. Supersedes its own old `claude-preload.so`/`claude-dispatch`.
- `pixi.toml` / `pixi.lock` — a pixi dev environment used to build them.

## Commands

There is **no full-tree build / lint / test for `src/`**. The recovery gate
syntax-builds changed files and runs focused semantic tests. The real tooling
is the pixi workspace:

- `pixi install` — materialize the default env (Python 3, gcc/binutils, make, patchelf, … + bun/nodejs/typescript).
- `pixi run build-loader` — build the ELF launcher (`loader/`); output is `loader/.build/rtld-dispatch`.
- `make -C loader test` — run loader smoke, runtime, and diagnostic tests.
- `make -C loader test-matrix` — test one launcher binary against packaged glibc runtimes.
- `pixi run install-loader` — build + install `~/.local/bin/claude.rtld` and print the launcher
  (`make -C loader install PROGS="claude agy"` to install a loader for several programs).
- `pixi run <cmd>` — run a tool in the default env (e.g. `pixi run bun`, `pixi run node`, `pixi run tsc`).
  bun + nodejs share the default env, but only because they share **icu 75**: bun pins it,
  so nodejs is held `<26` (v26 needs icu 78). Bumping nodejs to 26 would break that.
- `pixi run npm --prefix recovery ci --ignore-scripts` — install the recovery
  tooling's pinned deps (acorn + eslint-scope, exact per
  `recovery/package-lock.json`; lifecycle scripts stay disabled). Needed once
  before the recovery tests/scripts.
- `pixi run npm --prefix recovery test` — the full focused suite
  (`node --test test/*.test.mjs`, ~1,235 files). Single test:
  `pixi run node --test recovery/test/<file>.test.mjs`. Tests that need the
  published bundles read env vars like `CLAUDE_CODE_2_1_126_BUNDLE` (paths to
  authenticated local artifacts, conventionally under git-ignored
  `.recovery-tmp/`) and skip those assertions when unset. Note: the frozen
  per-case semantic tests assert against each release's era source tree, so they
  are green at that release's recovery commit — not against the selective
  cumulative `main` tip; run them via the case verifiers/worktrees, not as a
  flat sweep of the shared checkout.
- `pixi run npm --prefix recovery run audit:source` — rebuild the cross-case
  source-reproduction gap audit (`recovery/source-reproduction-gaps.json`, the
  data behind `recovery/SOURCE_REPRODUCTION_AUDIT.md`).
- Run the version-specific top-level verifier named by each case runbook
  (`recovery/scripts/verify-<version>-recovery.mjs`) in a
  disposable release-local carrier. For 2.1.121–2.1.126, that wrapper pins the
  proof-carrier commit and manifest, creates a private clone, and materializes
  the exact manifest target `src` before invoking nested gates. It invokes
  `verify-complete-recovery.mjs` as a nested gate; the generic gate alone is
  not the complete later-release proof. Shared main uses
  `recovery/test/cumulative-2.1.126-merged-source-retention.test.mjs` instead of
  pretending to be the frozen 2.1.126 source tree.

The loader build compiles `loader/main.c` into a freestanding static PIE and
checks its ELF startup requirements. It does not download or build glibc.
Maintained recovery tooling lives only in `recovery/scripts/` + `recovery/test/`;
`recovery/scripts/verify-all-source-pins.mjs` sweeps every case's git source-pins
and the cross-case source chain (git-only, no artifacts). `.pixi/`, `loader/.build/`,
`recovery/node_modules/`, and `.recovery-tmp/` (local authenticated bundles/artifacts)
are git-ignored. See the loader section below for
the runtime mapping design and tests.

## Architecture of the leaked source (`src/`)

This is Claude Code's own architecture; each area below spans many files, so read
across them rather than any single file:

- **Entry & agent loop** — `src/main.tsx` (CLI entry: Commander + React/Ink) and
  `src/entrypoints/`, driving `src/QueryEngine.ts` + `src/query/` (the core
  LLM request → response → tool-use loop). `src/Task.ts` + `src/tasks/` model
  agent tasks and subagents.
- **Tools** — `src/Tool.ts` is the tool interface; `src/tools/` (~180 files)
  implements the 40+ agent tools (Bash, file read/edit, search, web, MCP, …).
- **Terminal UI** — a custom **Ink** renderer in `src/ink/` (~95 files) drives the
  TUI; `src/components/` (~390) are the React/Ink components and `src/hooks/`
  (~100) the hooks, with `src/screens/`, `src/vim/`, and `src/keybindings/`.
- **Slash commands** — `src/commands/` (~200) implements the `/`-commands.
- **Services / backend** — `src/services/` (~130): MCP, OAuth/auth, analytics,
  the `autoDream` memory-consolidation subagent, etc.
- **IDE bridge** — `src/bridge/` is the editor-integration layer (sessions,
  messaging, transports).
- **Notable subsystems** — `src/buddy/` (a hidden Tamagotchi companion),
  `src/skills/`, `src/plugins/`, `src/hooks/`; `src/utils/` is a ~560-file
  catch-all. `src/utils/undercover.ts` hides internal model codenames.

To trace a behavior, start at `QueryEngine.ts` (the loop) and `Tool.ts` + the
relevant `src/tools/` file, then follow into `services/` or `components/`. The
README's directory diagram is partial/idealized — trust the actual tree.

## `loader/`

`rtld-dispatch` is a freestanding Linux x86-64 ELF launcher intended to address
WSL1's "Exec format error" and the broken tool dispatch caused by launching
Claude Code directly through `ld.so` (anthropics/claude-code#38788). The kernel
executes the launcher, so `/proc/self/exe` remains its installed path throughout
program execution. The implementation is `loader/main.c`; there is no glibc
source, Rust crate, or custom glibc build.

The installed name selects the target:

- `<name>.rtld` loads the sibling `<name>`, replacing `argv[0]` with the target
  name only when the supplied name matches the launcher's own basename.
- `<name>` beside `<name>.real` loads that real program and preserves `argv[0]`.

Aliases such as `ugrep`, `rg`, and `bfs` pass through unchanged. Self-execution
through `/proc/self/exe` re-enters the named launcher and finds the same target.
`loader/transparent_shim.sh <binary>` installs the second form for fixed-path
programs such as Antigravity's Go `language_server_linux_x64`; it also applies
`patch_agy_wsl1.py` when needed. Re-run after an application upgrade replaces the
binary.

For named launchers, `main.c` performs the kernel-style startup mapping:

1. Read the target ELF's `PT_INTERP` to locate its installed dynamic linker.
2. Validate and map the target's and linker's `PT_LOAD` segments, including BSS,
   alignment, and memory permissions.
3. Update `AT_PHDR`, `AT_PHENT`, `AT_PHNUM`, `AT_ENTRY`, `AT_BASE`, and `AT_EXECFN`
   in the original startup stack; retain the environment and remaining auxiliary
   vector entries, including randomness, vDSO, and hardware capabilities.
4. Jump to the installed linker's entry point, without executing it through
   `execve`. It performs relocation, dependency loading, TLS setup, and startup in
   the same process.

The launcher uses raw syscalls and public ELF structures. It does not rely on
symbol offsets, `GLIBC_PRIVATE`, or a glibc version check. The selected linker
must still match its runtime libraries, and the target must support those
libraries. A glibc update does not require rebuilding the launcher just to embed
that glibc release.

The unrenamed launcher also supports `rtld-dispatch PROGRAM [ARGS...]` and
`rtld-dispatch --verify PROGRAM`. This mode inspects the target's interpreter,
maps only that interpreter, and enters its direct-invocation path. The interpreter
loads the explicit target with the correct `$ORIGIN`. Other `ld.so` command-line
options are not exposed. Named launchers are required for transparent self-exec.

`make -C loader` compiles `main.c` with `-nostdlib -static-pie`, strips the result,
removes compiler-injected RPATH with patchelf, and checks the result's ELF startup
requirements. The output is `loader/.build/rtld-dispatch`. Requirements are
gcc/binutils, make, patchelf, and Python 3. `CC`, `CFLAGS`, and `LDFLAGS` provide
build overrides; use `make -B` when changing them.
`make -C loader install PROGS="claude agy"` installs named copies;
`make -C loader clean` removes build outputs. Prefix commands with `pixi run` to
use the bundled toolchain. Builds replace the output atomically, leaving already
installed launchers unchanged; rerun installation to update them. Installation
and transparent shim refresh use copies when hardlinks cannot cross filesystems.

`make -C loader test` runs the smoke, runtime, and diagnostic suites. They exercise PIE and
non-PIE programs, executable identity, argument aliases, self-exec, BSS, TLS,
pthreads, constructors, `dlopen`, `$ORIGIN`, and malformed ELF rejection. Regression
cases cover explicit invocation across directories, 2 MiB segment alignment,
and failed target/interpreter loading. Loader errors name the loading stage and
file; syscall failures also report the Linux errno number.

`make -C loader test-matrix` uses checksum-pinned Ubuntu binary runtime packages
and an older development sysroot to test one launcher binary against glibc 2.31,
2.35, 2.39, and 2.42. It requires `dpkg-deb` and downloads and caches packages
under `loader/.build/glibc-matrix/` without building glibc or replacing system
libraries. `MATRIX_ARGS="--versions 2.31 2.42"` selects a subset. The loader workflow at
`.github/workflows/loader.yml` runs the host suites and packaged runtime matrix.
Test an alternate installed runtime manually without rebuilding the launcher using:

```bash
python3 loader/tests/runtime.py loader/.build/rtld-dispatch \
  --interpreter /path/to/runtime/ld-linux-x86-64.so.2 \
  --library-path /path/to/runtime/lib
```

Use `--cc` with a compiler/sysroot targeting that runtime or older when necessary.
The same launcher binary passed all 48 runtime checks with packaged glibc 2.31,
2.35, 2.39, and 2.42. The matrix checks the reported runtime version for each
program and verifies that the launcher SHA256 stays unchanged. Bun 1.3.11 startup and self-exec
passed with named launchers and transparent shims; install and refresh were
checked across filesystems too.
The launcher supports dynamic Linux x86-64 ELF only, rejects executable stacks
and privileged launcher startup, and does not provide setuid execution semantics.
The mapping implementation still needs WSL1 application validation. The launcher
is original WTFPL code and does not bundle or link against glibc; the installed
linker and runtime keep their own licenses (see `loader/NOTICE`).

`loader/patch_agy_wsl1.py` is unrelated to the launcher build — it's a standalone binary
patcher for **Antigravity CLI (`agy`)**, which bundles Google tcmalloc. tcmalloc
reserves arenas with `MAP_FIXED_NOREPLACE` (a Linux 4.17+ flag) that WSL1's 4.4 kernel
*rejects*, so it aborts at startup. The script clears that flag bit from tcmalloc's
`mov r32, 0x100022` mmap-flag instructions (8 sites; the ~100 data-table occurrences
are left alone), degrading them to plain hinted mmaps (which WSL1 honors). Re-run it
after every `agy` upgrade. The loader fixes `agy`'s *launch*; this fixes its *runtime*.
