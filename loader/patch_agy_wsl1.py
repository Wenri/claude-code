#!/usr/bin/env python3
"""
patch_agy_wsl1.py — make Google's Antigravity CLI (`agy`, x86-64) run on WSL1.

Problem: agy bundles Google tcmalloc, which reserves its arenas with
MAP_PRIVATE|MAP_ANONYMOUS|MAP_FIXED_NOREPLACE (flags = 0x100022). MAP_FIXED_NOREPLACE
is a Linux 4.17+ flag; WSL1's 4.4 kernel emulation *rejects* it (instead of ignoring
it like a real old kernel), so tcmalloc's MmapAligned() fails at startup and the
process aborts (SIGABRT) before main — every subcommand, incl. `install`.

Fix: clear the MAP_FIXED_NOREPLACE bit (0x100000) from each `mov r32, 0x100022`
instruction, degrading the call to a plain hinted mmap (0x22). WSL1 *does* honor
high mmap hints, so tcmalloc gets its tagged region and proceeds.

This is the x86-64 analogue of the ARM64/Termux patch_agy_va39.py — different
mechanism (WSL1 rejects the flag; ARM64/Termux genuinely has 39-bit VA).

Re-run after every agy upgrade (the installer redownloads the binary).
Usage:  python3 patch_agy_wsl1.py [~/.local/bin/agy]
Then launch via the system ld.so (WSL1 #38788):
        agy() { /lib64/ld-linux-x86-64.so.2 "$HOME/.local/bin/agy" "$@"; }
"""
import os, sys, struct, shutil

FLAGS = 0x100022          # MAP_PRIVATE|MAP_ANONYMOUS|MAP_FIXED_NOREPLACE
FIXED_NOREPLACE = 0x100000
MOV_R32_IMM32 = set(range(0xB8, 0xC0))   # b8..bf: mov eXX/r8d-r15d, imm32
REX = {0x41, 0x48, 0x49}

def main():
    path = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/.local/bin/agy")
    data = bytearray(open(path, "rb").read())
    imm = struct.pack("<I", FLAGS)        # 22 00 10 00

    # Only patch real `mov r32, 0x100022` instructions (preceded by a b8..bf opcode,
    # optionally a REX prefix). This excludes the ~100 data-table occurrences of the
    # same byte pattern, which must NOT be touched.
    sites, i = [], data.find(imm)
    while i != -1:
        if data[i-1] in MOV_R32_IMM32:
            sites.append(i + 2)           # the 0x10 byte (bit 0x100000) in the LE imm
        i = data.find(imm, i+1)

    bad = [s for s in sites if data[s] != 0x10]
    if bad:
        sys.exit(f"abort: {len(bad)} candidate(s) not 0x10 at the expected byte; binary layout changed")
    if not sites:
        sys.exit("no `mov r32, 0x100022` sites found — already patched, or binary changed")

    bak = path + ".orig"
    if not os.path.exists(bak):
        shutil.copy2(path, bak); print(f"backed up original -> {bak}")
    for s in sites:
        data[s] = 0x00                    # 0x100022 -> 0x000022 (drop MAP_FIXED_NOREPLACE)
    open(path, "wb").write(bytes(data))
    os.chmod(path, 0o755)
    print(f"patched {len(sites)} mmap-flag site(s) in {path} (cleared MAP_FIXED_NOREPLACE)")

if __name__ == "__main__":
    main()
