# 2.1.90 V65: incomplete source-only checkpoint

This checkpoint preserves the reviewed V65 source bytes and qualified diagnostic findings. It is not an accepted 2.1.90 reconstruction, a standalone build package, a security-equivalence result or an original-source-authorship claim. Accepted historical-region closures remain zero.

Read [GAPS.md](GAPS.md) for all 134 historical residual records, the 20 individually scoped other obligations, current provider failures and next obligations. [STATUS.json](STATUS.json) gives the machine-readable summary. The full [gap ledger](gap-ledger.json), [CSV ledger](gap-ledger.csv), [strict diagnostic partition](strict-gaps.json) and [verified .89 carry-forward](verified89-carry-forward.json) preserve their explicit scopes and limits.

## Source delta and provenance

The baseline is published V64 at `d60366929a3539a7806f83a88f51e2c3b26cecfa`. V65 has 6,114 source inputs totaling 50,692,903 bytes, with 1,933 derived Git source pins and 31 other src assets. Exactly `src/tools/BashTool/bashPermissions.ts` changes, by −690 bytes; all other 6,113 files and all source paths remain identical.

The complete `isNormalizedGitCommand` and `isNormalizedCdCommand` functions and their imports are restored from the authenticated accepted .89 donor. The whole resulting permission source is byte-identical to that donor, SHA-256 `93f3ae169eeaf731bdbe913b1e40476126732a7c4bd90ee5f3e39c8261d086a5`. Complete commands-provider and parser-adapter donor bytes are also authenticated and remain unchanged. [source-origin-basis.json](source-origin-basis.json), [restoration.json](restoration.json) and [source-changes.patch](source-changes.patch) record the exact source provenance.

Donor equality is not .90 correctness or safety acceptance. This change materially alters git/cd classifier, error, logging and initialization observations, including quoted/escaped command names, xargs/operator boundaries, parser null/length/empty domains and exceptions. The affected permission/security guard domains are retained as obligations. No end-to-end bypass or safety improvement is claimed.

## Recorded build and launch evidence

The primary recovery author ran the five serial diagnostic stages after the reviewed tuple and final supporting guard. All stages exited zero. The initial ambient NODE_PATH attempt failed at controller startup before outer prelaunch, launcher/bootstrap, preconditions or stages. That failed attempt and original guard are preserved; the revised launch removes the same three variables before controller entry and retains all seven absence assertions.

The final guard was sealed at `2026-10-12T01:13:25.339399+00:00`, before the successful outer run from `2026-10-12T01:13:50.888318967Z` through `2026-10-12T01:16:00.671259747Z`. Eight actual controller-to-shell argv/cwd records were saved before launch, stayed hash-identical, and have separate completion records. Thirty-two closed outer files are authenticated, with seal completion outside its own execution receipt. The initial tool caller, its initial shell and hashing startup remain a trusted-host boundary. No universal hermeticity, OS-enforced target read sandbox, full Python/native dynamic closure or concurrent-writer immunity is claimed.

The independent product audit passed 519,475 checks. All 33 reconstruction receipt events and removal of 11 marker imports / 217 bytes are accounted for. Source-map reconstruction checks all 2,080,173 raw points to 2,080,161 final points and binds 4,788 source contents to physical inputs. This preserves existing producer-coordinate limitations. See [build-result-summary.json](build-result-summary.json).

The original V62 native-precheck timing gap and separately gated replay, V63 later written supplementary-seal chronology, V64 root-attested rather than independently logged outer argv, and earlier V59–V62 corrections remain attached to their historical evidence. V65 evidence does not rewrite them.

## Complete diagnostics and bounded owner result

The renewed census has 18,277 current statements. It explicitly aligns every current statement against 18,280 prior statements, deleting prior shellQuote statements 7615–7617; same-position comparison is not used. There are 16,377 byte-changed aligned statements and 1,900 byte-identical aligned statements. Complete static replay covers all 16,374 shape-stable changed statements: 3,042,717 nodes, 118,200 local scopes and 135,570 free-capture occurrences. The selected set has no capture conflicts; it does not establish a whole-program binding bijection or erase the prior V62-to-V63 reverse collision.

All 25 complete permission-owner statements, totaling 3,695 nodes and 94 scopes, pass their bounded target correspondences. The complete initializer callback has 27 current and target statements after removal of the prior shellQuote call at ordinal 5. The former wrapper's emitted disappearance does not prove that package initialization or all transitive dependencies are gone. The independent owner/provider review retains 25 complete target provider failures. The firstLine helper/wrapper split, all 19 parser groups / 29 sites, historical LRU initializer and other supplier obligations remain; no providers are flattened or inlined to create a pass. See [owner-review-summary.json](owner-review-summary.json).

There are 116 current shape-diagnostic windows, all with exact historical joins; no unjoined current window remains. The newly absent exact R036/R074 windows, earlier R073 absence and disappearance of old V64 unjoined window 66 do not close historical records. R075 retains its full historical scope. All 134 residual records and 20 other individual statuses are preserved. The strict partition has 371 gaps and 403 exact anchors; allocation-sensitive increases or decreases are not a progress metric or acceptance. Fifty-four partitions were independently replayed, without recovering the original generator. See [census-summary.json](census-summary.json), [diagnostic-windows.json](diagnostic-windows.json) and [allocation-effects-summary.json](allocation-effects-summary.json).

The strict whole-program AST remains unequal: V65 has 3,110,586 nodes and SHA-256 `69fe915e2013b1cd983af60ab9b8b008bc8f8a28bce26bfcbfa628f1e2586509`; the saved target has 3,110,206 nodes and SHA-256 `c72be899416d2e84a3fd0e5cb5dcd36de1c7949225eb38059001d1334f16c7e7`. Source maps nominate owners; they do not prove unique semantic identity. The inherited invalid userAgent original coordinate, 45 valid generated UTF-16 surrogate-interior coordinates per map, selected captures, lazy cycles/readiness, snapshot/live-binding, host replacement, R121 lifecycle/common-prefix hot migration and R091 source provenance remain qualified.

## Verify and extract

`source-inputs.tar.gz` is a deterministic gzip/PAX source archive with normalized 0644 modes, zero timestamps/owners and no links. Its SHA-256 is `36b151ea8bbba94a0dc22abe0a05b0c536aead98d3c592f082aec497da78c2ce`. The canonical source-manifest identity is `54255e485ce009991f49310487819e4f4d7947c18772794bc53c9d7a0c474566`; the data-derived src tree is `ea4effd6baf01be6928f4d77d468c5765983581d`. These identifiers do not create or claim a Git commit.

From this directory, run:

```sh
python3 -I -B verify.py
python3 -I -B verify.py --output /path/to/new-source-directory
sha256sum -c SHA256SUMS
```

The verifier checks every archive byte against `source-manifest.json`, rejects unsafe/duplicate/nonregular members, validates all 1,933 source blob pins and the derived tree, and refuses an existing extraction destination. It never imports or executes archived code. Nineteen negative controls and complete byte-for-byte extraction were checked during preparation.

All 541 inherited inline source maps remain historical input metadata, byte-identical to V64; their 8,436,898 decoded bytes were scanned alongside sources and curated metadata. They are not fresh V65 emission attribution. Pattern scanning supports the authenticated source allowlist and does not guarantee universal secret detection.

## Publication boundary

Included: the complete saved source archive, manifests and Git pins, exact source delta/provenance, data-only verifier, qualified summaries, historical backlog and detailed gap inventories. No private earlier archive is needed to read or extract these sources.

Excluded: official target, freshly emitted application JavaScript/maps, target/emitted snippets, recovered target-bearing AST/scope models, full compiler profiles and runtime reconstruction tools, native binaries, authentication material and private execution paths, raw execution receipts, and local matching-context comparison outputs. The local context harness is comparison-only and contributes no source construction, runtime or acceptance claim. Packaging executes no compiler, recovered application, provider or callback.

Whole-program, whole-version, runtime, transitive-provider, global-binding and global-initialization acceptance all remain false.
