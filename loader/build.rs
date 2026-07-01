// build.rs — folds the whole glibc build + final-link recipe into cargo (nix-ld's
// build.rs shape: where nix-ld cc-builds nolibc, we build glibc → librtld.os).
//
// On `cargo build` this: configures the vendored glibc source TREE IN PLACE (rtld-minimal,
// checked in unextracted with the rtld.c hook pre-applied — only the dynamic linker's own code
// + the ~120 libc modules ld.so embeds + their build machinery; see glibc/prune-glibc.sh),
// copies the PREBUILT/ generated headers into the obj tree, and `make elf/subdir_lib`s up to
// librtld.os + ld.map. glibc builds out of tree (objdir in loader/.build, srcdir = the checked-
// in tree), so the tree is read-only during the build and stays git-clean — no copy, no patch
// step. A vendored elf/librtld.mk (baked into the pruned elf/Makefile) supplies the rtld-libc
// module list, so the full libc_pic.a build is skipped — this is why the tree can be tiny and
// the build is ~2 min not ~15. The final ld.so link is glibc's; it FAILS here because the
// pre-applied rtld.c hook references our claude_dispatch — we tolerate that and gate on the two
// artifacts. Then it emits glibc's -shared ld.so link recipe so cargo's own link produces the
// ld.so (rtld = libc + the `_start` entry; our crate = the hook).
//
// The heavy glibc build is cached in loader/.build/glibc-obj (survives `cargo clean`) and only
// reruns when a file in the source tree changes.
//
// NOTE: the conda gcc injects a DT_RPATH that rtld asserts on. build.rs runs BEFORE
// the link, so it cannot strip it — `patchelf --remove-rpath` on the finished binary
// stays a one-line post-step (the Makefile install target).
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

macro_rules! progress {
    ($($a:tt)*) => { println!("cargo:warning={}", format!($($a)*)) };
}

fn main() {
    let manifest = env_path("CARGO_MANIFEST_DIR");

    let glibc_src = find_src_tree(&manifest.join("glibc"));
    let obj = manifest.join(".build/glibc-obj");
    let librtld = obj.join("elf/librtld.os");
    let ldmap = obj.join("ld.map");

    // The checked-in tree IS the srcdir — cargo re-runs build.rs whenever anything in it changes
    // (including the pre-applied rtld.c hook).
    println!("cargo:rerun-if-changed={}", glibc_src.display());

    // Rebuild glibc if librtld.os / ld.map is missing OR any source file changed since it was
    // built (the rtld.c hook is compiled into librtld.os, so a stale one = wrong rtld.c).
    let stale = !librtld.exists() || !ldmap.exists() || dir_has_newer(&glibc_src, &librtld);
    if stale {
        build_glibc(&glibc_src, &obj);
        assert!(
            librtld.exists() && ldmap.exists(),
            "glibc build did not produce librtld.os / ld.map (see {}/make.log)",
            obj.display()
        );
    } else {
        progress!("reusing cached glibc librtld.os");
    }

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

fn build_glibc(glibc_src: &Path, obj: &Path) {
    progress!("building glibc → librtld.os (rtld-only, one-time ~2 min; logs in {})", obj.display());
    // Fresh obj each time. glibc builds OUT OF TREE, so the checked-in glibc_src (our srcdir,
    // with the rtld.c hook pre-applied) is read only during the build and stays git-clean — no
    // copy needed.
    let _ = fs::remove_dir_all(obj);
    fs::create_dir_all(obj).unwrap();

    progress!("glibc: configure (srcdir = the checked-in tree, built in place)");
    let log = File::create(obj.join("configure.log")).unwrap();
    must(
        Command::new(glibc_src.join("configure"))
            .current_dir(obj)
            .env("CFLAGS", "-g -O2")
            .args(["--prefix=/usr", "--disable-werror", "--disable-profile"])
            .stdout(Stdio::from(log.try_clone().unwrap()))
            .stderr(Stdio::from(log)),
        "configure",
    );

    // The vendored tarball is pruned to the rtld closure (see glibc/prune-glibc.sh) and can't
    // build all of libc. glibc normally generates ~33 headers across many subdirs we dropped,
    // during its before-compile phase; the tree ships them under PREBUILT/, and we copy them
    // into the obj tree (fresh mtime → make treats them up-to-date) so the elf-only build finds
    // them without regenerating.
    let prebuilt = glibc_src.join("PREBUILT");
    if prebuilt.is_dir() {
        progress!("glibc: pre-populating generated headers (PREBUILT/)");
        must(
            Command::new("cp").arg("-r").arg(format!("{}/.", prebuilt.display())).arg(obj),
            "cp PREBUILT",
        );
    }

    // Build ONLY the dynamic linker's own objects (elf/subdir_lib → dl-allobjs.os + rtld-libc.a
    // → librtld.os, plus ld.map), not all of libc. The vendored librtld.mk (baked into the
    // pruned elf/Makefile) supplies the rtld-libc object list, so the full libc_pic.a trial
    // link is skipped. TOLERATE the one expected failure — the final ld.so link errors on the
    // undefined claude_dispatch (that link is cargo's) — and gate on librtld.os + ld.map. Serial
    // (-j1): the reduced build is small, and it sidesteps a parallel race where a stray branch
    // speculatively pulls libc_pic.a (whose subdirs we pruned).
    progress!("glibc: make elf/subdir_lib (rtld only; the ld.so link fails by design — cargo's)");
    let log = File::create(obj.join("make.log")).unwrap();
    let _ = Command::new("make")
        .current_dir(obj)
        .args(["-j1", "elf/subdir_lib"])
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

// The checked-in rtld-minimal glibc source tree (glibc/glibc-<ver>-rtld/); see prune-glibc.sh.
fn find_src_tree(dir: &Path) -> PathBuf {
    fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("read {}: {e}", dir.display()))
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .find(|p| p.is_dir()
            && p.file_name().map(|n| n.to_string_lossy().starts_with("glibc-")).unwrap_or(false))
        .expect("glibc-*/ source tree not found in loader/glibc/")
}

// true if any file under `dir` is newer than `reference` (or `reference` is missing) — the
// cached librtld.os is then stale w.r.t. the (rarely-changing) vendored source.
fn dir_has_newer(dir: &Path, reference: &Path) -> bool {
    let refm = match fs::metadata(reference).and_then(|m| m.modified()) {
        Ok(t) => t,
        Err(_) => return true,
    };
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = fs::read_dir(&d) else { continue };
        for e in rd.filter_map(|e| e.ok()) {
            match e.file_type() {
                Ok(ft) if ft.is_dir() => stack.push(e.path()),
                Ok(_) => {
                    if fs::metadata(e.path()).and_then(|m| m.modified()).map_or(true, |t| t > refm) {
                        return true;
                    }
                }
                Err(_) => return true,
            }
        }
    }
    false
}
