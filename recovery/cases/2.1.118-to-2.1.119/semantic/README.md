# 2.1.118 → 2.1.119 semantic recovery

Status: **VERIFIED — zero unclassified tokens and zero unverified obligations.**

The strict catalog contains 135 obligations: all 51 official release bullets exactly once, 65 hidden/adjacent/inherited obligations, and 19 daemon/Fleet/query obligations. It binds 278 exact target fragments plus one exact target absence, 290 exact frozen-source assertions plus two exact source absences, and all eight hash-pinned 2.1.119 recovery suites.

## Frozen identities

- Baseline inner bundle: 13,234,618 bytes, SHA-256 `84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa`.
- Target inner bundle: 13,720,987 bytes, SHA-256 `9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef`.
- Source overlay: 2,709,667 bytes across 290 paths, SHA-256 `623cfd2740598d7a6f7cc0a7f72bfebd5000eeae13d6ccb3295f594b0abef794`.
- Target source tree: 2,088 files / 32,357,579 bytes, framed SHA-256 `5b91f7f3ddcdf440a8ef22b7e43eec769402aa54c3f1995ee508adb0c9157882`.
- Direct adjacent-evidence catalog: 156,609 bytes, SHA-256 `6f3829ac9fd4da733d9bf960f7a4834df789caa246ecc3f50fda281b33a2d1d7`.
- Obligations: 295,670 bytes, SHA-256 `77af54135f4ada9f4249c6c302b6987f2743f1bdeb6c1e43030cfad9af299a57`.
- Canonical correspondence: 1,093,872 bytes, SHA-256 `41cae97af8435dee9a461d707c2e81fe2bbe675080db646d61d85a1a78c87afb`.
- Summary: 4,793 bytes, SHA-256 `32212d73e7c4ab06364d0888149a6584c6a86b53835ab72810b9987cfb1b053c`.

## Coverage

The whole-bundle report accounts for all 4,312,550 target tokens across 21,893 structural regions. All 4,756 source-ownership records resolve (1,902 application, 2,850 dependency, four vendor), and no application source path is unresolved.

The obligations comprise 88 source-localized adjacent, 46 source-localized inherited, and one dependency-adjacent boundary. There are no external-component, release-note-unobservable, generated-runtime-adjacent, or otherwise unverified claims.

The 133 behavior-test localizations remain fail-closed: each test file is byte/SHA-pinned; the 84-row adjacent catalog is byte/SHA-pinned by its executable suite; every catalog row is consumed exactly once by ID and row hash; decoded target fragments are checked against authenticated baseline/target counts; and source fragments are checked against the immutable source tree by SHA and occurrence count. Two obligations use attribution boundaries instead, including the honest Linux boundary for official bullet 51.

Bullet 51 does not pretend to recover a macOS-native permission implementation from Linux. It uses the unchanged, directly relevant `[voice] startRecording called, platform=` and `[voice] Recording stopped` flow in `voice.ts`/`useVoice.ts`, while the official suite independently proves the Linux `audio-capture.node` artifact is byte-identical across the two releases.

## Replay

Generate the catalog with `recovery/scripts/build-2.1.119-semantic-obligations.mjs`, then build or verify it with `build-semantic-correspondence.mjs` / `verify-semantic-correspondence.mjs` using the case attribution, structural ledger, changelog section, frozen `src/`, and authenticated inner bundles. Deterministic replay reproduces all three semantic hashes above.
