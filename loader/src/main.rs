//! rtld-dispatch — a custom glibc `ld.so` that loads a WSL1-hostile, dynamically
//! linked program *in place*. The kernel execs us (we ARE a dynamic linker), so
//! `/proc/self/exe` is the program's own execPath, not a separate linker — which is
//! what fixes the bundled grep/find/rg breakage on WSL1 (anthropics/claude-code#38788).
//!
//! Generic by design: the program to load is derived from our OWN name (`/proc/self/exe`),
//! in one of two install shapes:
//!   • launcher    `<prog>.rtld`  → loads `<prog>`  (claude.rtld→claude, agy.rtld→agy),
//!     each installed next to its target;
//!   • transparent `<prog>` with the real binary moved to `<prog>.real` → loads
//!     `<prog>.real`, for programs spawned by a FIXED path (so a `.rtld` launcher can't
//!     be interposed) that ALSO read `/proc/self/exe` to locate themselves — e.g.
//!     Antigravity's Go `language_server_linux_x64` (`os.Executable()`). Being
//!     kernel-exec'd, `/proc/self/exe` stays `<prog>`, so its execPath resolves correctly.
//! `argv[0]` is forwarded to the target unless invoked under our own name, so a host's
//! `argv[0]`-based multiplexing (e.g. claude's bundled ugrep/rg/bfs) still works.
//!
//! Called from a ~2-line hook in glibc's `dl_main` (rtld-dispatch.patch). `no_std`;
//! links against rtld, which supplies the `_start` entry + the libc. See ../README.md.
#![feature(lang_items)]
#![no_std]
#![no_main]

use core::ffi::{c_char, c_int, CStr};
use core::ptr::addr_of_mut;
use core::slice;

unsafe extern "C" {
    fn _exit(code: c_int) -> !;
}

// Unreachable in practice (no unwrap/index/checked-arith); terminate via rtld's _exit
// (rtld exports no `abort`). nix-ld registers eh_personality the same way (lang item).
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    unsafe { _exit(127) }
}

#[cfg(not(test))]
#[lang = "eh_personality"]
pub extern "C" fn rust_eh_personality() {}

const RTLD_SUFFIX: &[u8] = b".rtld"; // launcher:    "<prog>.rtld" → loads "<prog>"
const REAL_SUFFIX: &[u8] = b".real"; // transparent: "<name>"      → loads "<name>.real"

/// Last path component of a byte path (everything after the final '/').
fn basename(p: &[u8]) -> &[u8] {
    p.rsplit(|&b| b == b'/').next().unwrap_or(p)
}

/// dl_main hook. `argv0` = `&_dl_argv[0]` (only argv[0] is read/rewritten); `argv0_out`
/// = `&argv0`, dl_main's tool-name-override local. Both come from C as `char **`, which
/// is ABI-identical to `&mut *const c_char`. Returns true if we selected the program
/// (caller skips ld.so's option parsing).
#[no_mangle]
pub unsafe extern "C" fn claude_dispatch(
    argv0: &mut *const c_char,
    argv0_out: &mut *const c_char,
) -> bool {
    let orig0 = *argv0; // how we were invoked: "…/claude.rtld", "ugrep", …

    // Our own absolute path, e.g. "/home/u/.local/bin/claude.rtld". Process-lifetime
    // storage: rtld dereferences *argv0 (the program path) AFTER we return, so the
    // string must not live on our stack.
    static mut PATH: [u8; 4096] = [0; 4096];
    let buf = addr_of_mut!(PATH) as *mut u8;
    // readlink(2) via sc (rtld exports no readlink, so a raw syscall — same idiom rtld
    // itself uses in dl-origin.c). sc::syscall! is an inline-asm macro: no runtime symbol.
    let n = sc::syscall!(READLINK, c"/proc/self/exe".as_ptr(), buf, 4095) as isize;
    if n <= 0 {
        return false; // can't resolve self → let rtld proceed (and error clearly)
    }
    let n = n as usize;
    let path = slice::from_raw_parts(buf, n);

    // Launcher mode — "<prog>.rtld" loads "<prog>" (installed beside it). Forward argv[0]
    // to the target UNLESS invoked under our own name: a bundled-tool alias (ugrep/rg/bfs)
    // is not our name, so it passes through and the target's multiplexer dispatches it.
    if let Some(stem) = path.strip_suffix(RTLD_SUFFIX) {
        if !orig0.is_null() && basename(CStr::from_ptr(orig0).to_bytes()) != basename(path) {
            *argv0_out = orig0; // restored at dl_main's `if (argv0) _dl_argv[0]=argv0`
        }
        *buf.add(stem.len()) = 0; // NUL-terminate the stem → target program path
        *argv0 = buf as *const c_char; // _dl_argv[0] = rtld_progname = the target
        return true;
    }

    // Transparent-shim mode — we're installed *under the program's own name*, with the
    // real binary moved aside to "<name>.real". Load that; /proc/self/exe stays "<name>"
    // (we're kernel-exec'd, no execve), which programs that find themselves via
    // /proc/self/exe need (Antigravity's Go language_server_linux_x64, os.Executable()).
    // Engage only when that sibling actually exists; otherwise act as a stock ld.so.
    if n + REAL_SUFFIX.len() >= 4096 {
        return false; // no room to append ".real\0" in PATH
    }
    core::ptr::copy_nonoverlapping(REAL_SUFFIX.as_ptr(), buf.add(n), REAL_SUFFIX.len());
    *buf.add(n + REAL_SUFFIX.len()) = 0; // "<name>.real\0"
    if sc::syscall!(ACCESS, buf, 0 /* F_OK */) as isize != 0 {
        return false; // no "<name>.real" → not our transparent install
    }
    // Preserve the caller's argv[0] (the program's own name) — the target sees exactly
    // what a direct exec would have passed.
    if !orig0.is_null() {
        *argv0_out = orig0;
    }
    *argv0 = buf as *const c_char; // _dl_argv[0] = "<name>.real" (the real binary)
    true
}
