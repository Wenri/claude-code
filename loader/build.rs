// build.rs — folds the whole glibc build + final-link recipe into cargo (nix-ld's
// build.rs shape: where nix-ld cc-builds nolibc, we build glibc → librtld.os).
//
// On `cargo build` this: extracts the vendored glibc tarball, applies
// rtld-dispatch.patch (rtld.c hook), configures, and `make`s glibc up to
// librtld.os + ld.map (the final ld.so link is glibc's; it FAILS here because the
// patched rtld.c references our claude_dispatch — we tolerate that and gate on the
// two artifacts). Then it emits glibc's -shared ld.so link recipe so cargo's own
// link produces the ld.so (rtld = libc + the `_start` entry; our crate = the hook).
//
// The heavy glibc build is cached in loader/.build (survives `cargo clean`) and only
// reruns when the patch / tarball / CLAUDE_BIN change.
//
// NOTE: the conda gcc injects a DT_RPATH that rtld asserts on. build.rs runs BEFORE
// the link, so it cannot strip it — `patchelf --remove-rpath` on the finished binary
// stays a one-line post-step (the Makefile install target).
use std::ffi::OsStr;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

macro_rules! progress {
    ($($a:tt)*) => { println!("cargo:warning={}", format!($($a)*)) };
}

fn main() {
    let manifest = env_path("CARGO_MANIFEST_DIR");
    let out = env_path("OUT_DIR");
    let home = std::env::var("HOME").unwrap_or_default();
    let claude_bin =
        std::env::var("CLAUDE_BIN").unwrap_or_else(|_| format!("{home}/.local/bin/claude"));

    let tarball = find_tarball(&manifest.join("glibc"));
    let patch = manifest.join("glibc/rtld-dispatch.patch");
    let build = manifest.join(".build");
    let src = build.join("glibc-src");
    let obj = build.join("glibc-obj");
    let librtld = obj.join("elf/librtld.os");
    let ldmap = obj.join("ld.map");

    println!("cargo:rerun-if-changed={}", patch.display());
    println!("cargo:rerun-if-changed={}", tarball.display());
    println!("cargo:rerun-if-env-changed=CLAUDE_BIN");

    // Rebuild glibc if librtld.os is missing OR the patch/tarball changed since it was
    // built (the patch is compiled into rtld.os, so a stale librtld.os = wrong rtld.c).
    let stale = !librtld.exists() || !ldmap.exists()
        || newer_than(&patch, &librtld) || newer_than(&tarball, &librtld);
    if stale {
        build_glibc(&tarball, &patch, &src, &obj);
        assert!(
            librtld.exists() && ldmap.exists(),
            "glibc build did not produce librtld.os / ld.map (see {}/make.log)",
            obj.display()
        );
    } else {
        progress!("reusing cached glibc librtld.os");
    }

    // default program path → OUT_DIR/default_bin.rs (main.rs include!s it; src/ stays clean)
    fs::write(
        out.join("default_bin.rs"),
        format!("pub const DEFAULT_CLAUDE_BIN: &[u8] = b\"{claude_bin}\\0\";\n"),
    )
    .unwrap();

    // glibc's own ld.so link recipe (see its elf/Makefile $(objpfx)ld.so), driven by cargo:
    // rtld supplies _start + the libc; -shared + version-script export the GLIBC_PRIVATE
    // interface that the loaded program's libc.so.6 binds to.
    for a in [
        librtld.display().to_string(),
        "-nostartfiles".into(),
        "-nodefaultlibs".into(),
        "-shared".into(),
        "-Wl,-z,relro".into(),
        "-Wl,-z,nomark-plt".into(),
        "-Wl,-z,defs".into(),
        "-Wl,-z,pack-relative-relocs".into(),
        format!("-Wl,--version-script={}", ldmap.display()),
        "-Wl,-soname=ld-linux-x86-64.so.2".into(),
    ] {
        println!("cargo:rustc-link-arg-bins={a}");
    }
}

fn build_glibc(tarball: &Path, patch: &Path, src: &Path, obj: &Path) {
    progress!("building glibc → librtld.os (one-time, ~15 min; logs in {})", obj.display());
    let _ = fs::remove_dir_all(src);
    let _ = fs::remove_dir_all(obj);
    fs::create_dir_all(src).unwrap();
    fs::create_dir_all(obj).unwrap();

    progress!("glibc: extracting");
    must(
        Command::new("tar").args([OsStr::new("xf"), tarball.as_os_str(),
            OsStr::new("-C"), src.as_os_str(), OsStr::new("--strip-components=1")]),
        "tar",
    );

    progress!("glibc: applying rtld-dispatch.patch");
    let pf = File::open(patch).expect("open patch");
    must(
        Command::new("patch").args(["-p1"]).current_dir(src).stdin(Stdio::from(pf)),
        "patch",
    );

    progress!("glibc: configure");
    let log = File::create(obj.join("configure.log")).unwrap();
    must(
        Command::new(src.join("configure"))
            .current_dir(obj)
            .env("CFLAGS", "-g -O2")
            .args(["--prefix=/usr", "--disable-werror", "--disable-profile"])
            .stdout(Stdio::from(log.try_clone().unwrap()))
            .stderr(Stdio::from(log)),
        "configure",
    );

    // Run the full `make` and TOLERATE its one expected failure: the final ld.so
    // link errors on the undefined claude_dispatch (that link is cargo's). We can't
    // target librtld.os / ld.map directly — from a clean tree glibc's recursive make
    // exposes no rule for those subdir/prefixed paths (their rules only materialize
    // mid-build), so `make elf/librtld.os` / `make ld.map` both fail "No rule". So we
    // let the full build run; librtld.os + ld.map are produced before the failing
    // ld.so link, and the caller gates on both existing.
    progress!("glibc: make (the final ld.so link fails by design — that link is cargo's)");
    let jobs = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    let log = File::create(obj.join("make.log")).unwrap();
    let _ = Command::new("make")
        .current_dir(obj)
        .arg(format!("-j{jobs}"))
        .stdout(Stdio::from(log.try_clone().unwrap()))
        .stderr(Stdio::from(log))
        .status();
}

fn must(cmd: &mut Command, what: &str) {
    let ok = cmd.status().unwrap_or_else(|e| panic!("{what}: spawn failed: {e}")).success();
    assert!(ok, "{what} failed");
}

fn env_path(k: &str) -> PathBuf {
    PathBuf::from(std::env::var(k).unwrap_or_else(|_| panic!("{k} unset")))
}

/// true if `a` is newer than `b` (or either is missing) — i.e. the cache is stale.
fn newer_than(a: &Path, b: &Path) -> bool {
    let mtime = |p: &Path| fs::metadata(p).and_then(|m| m.modified()).ok();
    match (mtime(a), mtime(b)) {
        (Some(ta), Some(tb)) => ta > tb,
        _ => true,
    }
}

fn find_tarball(dir: &Path) -> PathBuf {
    fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("read {}: {e}", dir.display()))
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .find(|p| {
            let n = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            n.starts_with("glibc-") && n.ends_with(".tar.xz")
        })
        .expect("glibc-*.tar.xz not found (git lfs pull?)")
}
