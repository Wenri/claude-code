// claude-dispatch — an in-process loader for Claude Code on WSL1.
//
// Derived from nix-ld (https://github.com/nix-community/nix-ld, MIT — see
// LICENSE.nix-ld). The ELF mapper (elf.rs), syscalls (sys.rs / nolibc), auxv
// (auxv.rs), self-relocation (fixup.rs) and the jump trampoline (arch.rs) are
// reused as-is; this file replaces nix-ld's interpreter logic with a direct-exec
// loader+dispatcher for the WSL1 ld-linux workaround (anthropics/claude-code#38788):
//
// The kernel execs THIS binary, so /proc/self/exe — hence CLAUDE_CODE_EXECPATH —
// genuinely is claude-dispatch. We then map the real ld.so, build a fresh stack
// whose argv runs claude (optionally as a bundled tool via --argv0) with the
// auxv repointed at ld.so, and jump to ld.so's entry IN-PROCESS (no execve).
// No LD_PRELOAD, no readlink hook.
#![feature(lang_items)]
#![no_std]
#![no_main]
#![allow(internal_features)]
#![allow(static_mut_refs)]

mod arch;
mod args;
mod auxv;
mod const_concat;
mod elf;
mod fixup;
mod support;
mod sys;

use core::ffi::{CStr, c_void};
use core::mem::MaybeUninit;

use args::Args;
use const_concat::concat_slices;
use support::StackSpace;

static mut ARGS: MaybeUninit<Args> = MaybeUninit::uninit();
static mut STACK: MaybeUninit<StackSpace> = MaybeUninit::uninit();

/// The bundled search tools claude answers to when run under that argv[0].
const TOOLS: [&[u8]; 3] = [b"ugrep", b"rg", b"bfs"];

/// Default claude binary path. `CLAUDE_BIN` (build-time) overrides the fallback;
/// the `CLAUDE_BIN` env var overrides everything at runtime.
const DEFAULT_CLAUDE_BIN: &CStr = unsafe {
    CStr::from_bytes_with_nul_unchecked(concat_slices!([u8]:
        match option_env!("CLAUDE_BIN") {
            Some(p) => p,
            None => "/home/wenri/.local/bin/claude",
        }.as_bytes(),
        b"\0"
    ))
};

/// Default dynamic linker. `CLAUDE_LD_LINUX` overrides at build or run time.
const DEFAULT_LD_SO: &CStr = unsafe {
    CStr::from_bytes_with_nul_unchecked(concat_slices!([u8]:
        match option_env!("CLAUDE_LD_LINUX") {
            Some(p) => p,
            None => "/lib64/ld-linux-x86-64.so.2",
        }.as_bytes(),
        b"\0"
    ))
};

#[unsafe(no_mangle)]
unsafe extern "C" fn main(argc: usize, argv: *const *const u8, envp: *const *const u8) -> ! {
    unsafe {
        fixup::fixup_relocs(envp);
        ARGS.write(Args::new(argc, argv, envp));
        let stack = STACK.assume_init_mut().bottom();
        arch::main_relocate_stack!(stack, real_main);
    }
}

#[unsafe(no_mangle)]
extern "C" fn real_main() -> ! {
    let args = unsafe { ARGS.assume_init_ref() };
    let envp = args.envp();

    log::set_logger(&support::LOGGER)
        .map(|_| log::set_max_level(log::LevelFilter::Warn))
        .ok();
    if let Some(v) = unsafe { getenv(envp, b"CLAUDE_LD_LOG") } {
        if let Ok(level) = v.to_str().unwrap_or("").parse::<log::LevelFilter>() {
            log::set_max_level(level);
        }
    }

    let ld_so = unsafe { getenv(envp, b"CLAUDE_LD_LINUX") }.unwrap_or(DEFAULT_LD_SO);
    let claude = unsafe { getenv(envp, b"CLAUDE_BIN") }.unwrap_or(DEFAULT_CLAUDE_BIN);
    let argv0 = if args.argc() > 0 {
        unsafe { *args.argv() }
    } else {
        core::ptr::null()
    };
    let tool = unsafe { tool_from_argv0(argv0) };
    let tool_name = match tool {
        Some(t) => core::str::from_utf8(t.to_bytes()).unwrap_or("?"),
        None => "-",
    };
    log::info!("ld.so={ld_so:?} claude={claude:?} tool={tool_name}");

    let pagesz = args
        .auxv()
        .at_pagesz
        .as_ref()
        .expect("AT_PAGESZ must exist")
        .value();

    let loader = elf::ElfHandle::open(ld_so, pagesz).expect("open ld.so");
    let map = loader.map().expect("map ld.so");

    let sp = unsafe { build_target_stack(args, &map, ld_so, claude, tool) };

    log::info!("ld.so entry={:?} sp={sp:?} — jumping", map.entry_point());
    unsafe { map.jump_with_sp(sp) };
}

/// Returns the value of `name` from `envp` as a C string, or None.
unsafe fn getenv<'a>(envp: *const *const u8, name: &[u8]) -> Option<&'a CStr> {
    unsafe {
        let mut p = envp;
        while !(*p).is_null() {
            let s = *p;
            let mut i = 0;
            let matched = loop {
                if i == name.len() {
                    break *s.add(i) == b'=';
                }
                if *s.add(i) != name[i] {
                    break false;
                }
                i += 1;
            };
            if matched {
                return Some(CStr::from_ptr(s.add(name.len() + 1).cast()));
            }
            p = p.add(1);
        }
    }
    None
}

/// If basename(argv0) is a bundled tool, return it as a C string (a tail of argv0).
unsafe fn tool_from_argv0<'a>(argv0: *const u8) -> Option<&'a CStr> {
    if argv0.is_null() {
        return None;
    }
    let cs = unsafe { CStr::from_ptr(argv0.cast()) };
    let bytes = cs.to_bytes();
    let start = match bytes.iter().rposition(|&b| b == b'/') {
        Some(i) => i + 1,
        None => 0,
    };
    let base = &bytes[start..];
    for t in TOOLS {
        if base == t {
            return Some(unsafe { CStr::from_ptr(argv0.add(start).cast()) });
        }
    }
    None
}

/// Builds a fresh initial process stack for ld.so on a private mmap'd region and
/// returns the stack pointer to jump with. Layout (SysV):
///
///   [argc][argv..][NULL][envp..][NULL][auxv pairs..][AT_NULL]
///
/// argv becomes `[ld.so, (--argv0 <tool>)?, <claude>, <orig argv[1..]>]`; the
/// auxv is copied from the kernel's with AT_PHDR/PHENT/PHNUM/ENTRY repointed at
/// the mapped ld.so and AT_BASE forced to 0 (ld.so-run-as-program).
unsafe fn build_target_stack(
    args: &Args,
    map: &elf::ElfMapping,
    ld_so: &CStr,
    claude: &CStr,
    tool: Option<&CStr>,
) -> *const c_void {
    let orig_argc = args.argc();
    let orig_argv = args.argv();
    let envc = args.envc();
    let envp = args.envp();

    // ld.so [+ --argv0 + tool] + claude + orig argv[1..]
    let new_argc = orig_argc + 1 + if tool.is_some() { 2 } else { 0 };

    let orig_auxv = args.auxv().as_ptr().expect("auxv ptr");
    let mut auxc = 0usize;
    unsafe {
        let mut p = orig_auxv;
        while *p != 0 {
            auxc += 1;
            p = p.add(2);
        }
    }
    let has_base = args.auxv().at_base.is_some();
    let extra_aux = if has_base { 0 } else { 1 };

    let words = 1                       // argc
        + (new_argc + 1)                // argv + NULL
        + (envc + 1)                    // envp + NULL
        + (auxc + extra_aux) * 2 + 2;   // auxv pairs (+ maybe AT_BASE) + AT_NULL pair

    const STACK_SIZE: usize = 8 * 1024 * 1024;
    let region = sys::new_slice_leak(STACK_SIZE).expect("target stack mmap");
    let top = region.as_ptr() as usize + STACK_SIZE;
    let block_bytes = words * core::mem::size_of::<usize>();
    let sp = (top - block_bytes) & !(arch::STACK_ALIGNMENT - 1);
    let buf = sp as *mut usize;

    let mut i = 0usize;
    unsafe {
        let mut put = |v: usize| {
            unsafe { *buf.add(i) = v };
            i += 1;
        };

        put(new_argc);
        put(ld_so.as_ptr() as usize);
        if let Some(t) = tool {
            put(c"--argv0".as_ptr() as usize);
            put(t.as_ptr() as usize);
        }
        put(claude.as_ptr() as usize);
        let mut k = 1;
        while k < orig_argc {
            put(*orig_argv.add(k) as usize);
            k += 1;
        }
        put(0); // argv NULL

        let mut k = 0;
        while k < envc {
            put(*envp.add(k) as usize);
            k += 1;
        }
        put(0); // envp NULL

        let mut p = orig_auxv;
        while *p != 0 {
            let key = *p;
            let val = *p.add(1);
            let nv = match key {
                auxv::AT_PHDR => map.phdr(),
                auxv::AT_PHENT => map.phent(),
                auxv::AT_PHNUM => map.phnum(),
                auxv::AT_ENTRY => map.entry_point() as usize,
                auxv::AT_BASE => 0,
                _ => val,
            };
            put(key);
            put(nv);
            p = p.add(2);
        }
        if !has_base {
            put(auxv::AT_BASE);
            put(0);
        }
        put(0); // AT_NULL key
        put(0); // AT_NULL val
    }

    sp as *const c_void
}
