/* Linux x86-64 launcher: map the target and its installed ELF interpreter in
   this process. ld.so performs relocation, dependency loading, TLS and startup;
   the kernel's /proc/self/exe remains this launcher for tool aliases/re-exec. */
#define _GNU_SOURCE
#include <elf.h>
#include <errno.h>
#include <fcntl.h>
#include <stddef.h>
#include <stdint.h>
#include <sys/mman.h>
#include <sys/syscall.h>

#if !defined(__linux__) || !defined(__x86_64__) || defined(__ILP32__)
# error "rtld-dispatch currently supports Linux x86-64 only"
#endif

/* No libc, TLS, or runtime relocations are needed before entering ld.so. */
static long
syscall6(long number, long a, long b, long c, long d, long e, long f)
{
    register long r10 __asm__("r10") = d;
    register long r8 __asm__("r8") = e;
    register long r9 __asm__("r9") = f;
    long result;
    __asm__ volatile("syscall" : "=a"(result)
                     : "a"(number), "D"(a), "S"(b), "d"(c),
                       "r"(r10), "r"(r8), "r"(r9)
                     : "rcx", "r11", "cc", "memory");
    return result;
}

static size_t
length(const char *s)
{
    size_t n = 0;
    while (s[n]) ++n;
    return n;
}

static void
print(const char *s)
{
    syscall6(SYS_write, 2, (long)s, length(s), 0, 0, 0);
}

__attribute__((noreturn)) static void
finish(int code)
{
    syscall6(SYS_exit_group, code, 0, 0, 0, 0, 0);
    __builtin_unreachable();
}

static const char *current_stage, *current_file;

__attribute__((noreturn)) static void
fail_errno(const char *message, unsigned int error)
{
    print("rtld-dispatch: ");
    print(current_stage);
    if (current_file) { print(" "); print(current_file); }
    print(": ");
    print(message);
    if (error) {
        /* Linux syscall errors are at most 4095; no libc or pointer tables. */
        char number[5];
        char *digit = number + sizeof(number) - 1;
        *digit = 0;
        do { *--digit = '0' + error % 10; error /= 10; } while (error);
        print(" (errno ");
        print(digit);
        print(")");
    }
    print("\n");
    finish(127);
}

__attribute__((noreturn)) static void
fail(const char *message)
{
    fail_errno(message, 0);
}

static uintptr_t
checked(long value, const char *operation)
{
    if ((unsigned long)value >= (unsigned long)-4095)
        fail_errno(operation, (unsigned int)-value);
    return value;
}

static int
equal(const char *a, const char *b)
{
    while (*a && *a == *b) { ++a; ++b; }
    return *a == *b;
}

static const char *
basename(const char *s)
{
    const char *base = s;
    for (; *s; ++s) if (*s == '/') base = s + 1;
    return base;
}

static uintptr_t
add(uintptr_t a, uintptr_t b)
{
    if (a > UINTPTR_MAX - b) fail("ELF address overflow");
    return a + b;
}

static size_t page_size;
static uintptr_t page_down(uintptr_t n) { return n & ~(page_size - 1); }
static uintptr_t page_up(uintptr_t n) { return page_down(add(n, page_size - 1)); }

static void
file_range(uintptr_t offset, uintptr_t size, uintptr_t file_size)
{
    if (offset > file_size || size > file_size - offset)
        fail("ELF file is truncated");
}

static uintptr_t
map(uintptr_t address, size_t size, int prot, int flags, int fd, uintptr_t offset)
{
    return checked(syscall6(SYS_mmap, address, size, prot, flags, fd, offset), "mmap failed");
}

struct image {
    uintptr_t bias, entry, phdr;
    size_t phnum;
};

enum image_kind { PROGRAM, INTERPRETER, INSPECT };
static char interpreter[4096];

/* The same mapper handles the target and ld.so. Only standard ELF headers are
   read: no symbol lookup, disassembly, glibc offsets, or glibc version checks. */
static struct image
load_image(const char *path, enum image_kind kind)
{
    current_stage = kind == INTERPRETER ? "interpreter" : "target";
    current_file = path;
    int fd = checked(syscall6(SYS_openat, AT_FDCWD, (long)path,
                             O_RDONLY | O_CLOEXEC, 0, 0, 0), "open failed");
    size_t size = checked(syscall6(SYS_lseek, fd, 0, 2, 0, 0, 0), "file size unavailable");
    if (size < sizeof(Elf64_Ehdr)) fail("not an ELF file");
    uintptr_t file = map(0, size, PROT_READ, MAP_PRIVATE, fd, 0);
    const Elf64_Ehdr *h = (const void *)file;
    if (h->e_ident[0] != 0x7f || h->e_ident[1] != 'E'
        || h->e_ident[2] != 'L' || h->e_ident[3] != 'F'
        || h->e_ident[EI_CLASS] != ELFCLASS64 || h->e_ident[EI_DATA] != ELFDATA2LSB
        || h->e_ident[EI_VERSION] != EV_CURRENT || h->e_version != EV_CURRENT
        || h->e_machine != EM_X86_64 || h->e_ehsize != sizeof(*h)
        || (h->e_type != ET_DYN && h->e_type != ET_EXEC)
        || (kind == INTERPRETER && h->e_type != ET_DYN)
        || h->e_phentsize != sizeof(Elf64_Phdr)
        || !h->e_phnum || h->e_phnum == PN_XNUM)
        fail("expected an x86-64 ELF executable with ordinary program headers");

    size_t phsize = h->e_phnum * sizeof(Elf64_Phdr);
    file_range(h->e_phoff, phsize, size);
    const Elf64_Phdr *ph = (const void *)(file + h->e_phoff);
    uintptr_t low = UINTPTR_MAX, high = 0, alignment = page_size;
    uintptr_t phdr_address = 0, declared_phdr = 0;
    int entry_ok = 0, has_interpreter = 0, has_phdr = 0;
    for (size_t i = 0; i < h->e_phnum; ++i) {
        const Elf64_Phdr *p = ph + i;
        if (p->p_type == PT_INTERP && kind != INTERPRETER) {
            file_range(p->p_offset, p->p_filesz, size);
            if (has_interpreter++ || p->p_filesz < 2 || p->p_filesz > sizeof(interpreter)
                || *(const char *)(file + p->p_offset + p->p_filesz - 1))
                fail("invalid ELF interpreter");
            for (size_t j = 0; j < p->p_filesz; ++j)
                interpreter[j] = *(const char *)(file + p->p_offset + j);
            if (!interpreter[0]) fail("empty ELF interpreter");
        }
        if (p->p_type == PT_PHDR) {
            if (has_phdr++) fail("duplicate PT_PHDR");
            declared_phdr = p->p_vaddr;
        }
        if (p->p_type == PT_GNU_STACK && (p->p_flags & PF_X))
            fail("executable stacks are not supported");
        if (p->p_type != PT_LOAD) continue;
        if (p->p_filesz > p->p_memsz
            || p->p_vaddr % page_size != p->p_offset % page_size
            || (p->p_align > 1 && ((p->p_align & (p->p_align - 1))
                || p->p_vaddr % p->p_align != p->p_offset % p->p_align)))
            fail("invalid ELF segment");
        file_range(p->p_offset, p->p_filesz, size);
        if (!p->p_memsz) continue;
        uintptr_t end = add(p->p_vaddr, p->p_memsz);
        if (page_down(p->p_vaddr) < low) low = page_down(p->p_vaddr);
        if (page_up(end) > high) high = page_up(end);
        if (p->p_align > alignment) alignment = p->p_align;
        if ((p->p_flags & PF_X) && h->e_entry >= p->p_vaddr && h->e_entry < end)
            entry_ok = 1;
        if (h->e_phoff >= p->p_offset && h->e_phoff - p->p_offset <= p->p_filesz
            && phsize <= p->p_filesz - (h->e_phoff - p->p_offset))
            phdr_address = add(p->p_vaddr, h->e_phoff - p->p_offset);
    }
    if (low >= high || !entry_ok || !phdr_address)
        fail("ELF needs mapped program headers and an executable entry point");
    if (kind != INTERPRETER && !has_interpreter)
        fail("target must be dynamically linked (PT_INTERP is missing)");
    if (kind == PROGRAM && h->e_type == ET_DYN
        && (!has_phdr || declared_phdr != phdr_address))
        fail("PIE target needs a valid PT_PHDR");

    struct image result = {0};
    if (kind != INSPECT) {
        uintptr_t span = high - low, bias;
        if (h->e_type == ET_EXEC) {
            /* A hint plus an exact-address check works on WSL1 too. Never use
               MAP_FIXED_NOREPLACE, and never overwrite an unreserved mapping. */
            uintptr_t reserved = map(low, span, PROT_NONE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
            if (reserved != low) fail("fixed ELF address is occupied");
            bias = 0;
        } else {
            uintptr_t reserved = map(0, add(span, alignment), PROT_NONE,
                                     MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
            if (reserved < low) fail("ELF load bias is out of range");
            bias = add(reserved - low, alignment - 1) & ~(alignment - 1);
        }
        result.bias = bias;
        result.entry = add(bias, h->e_entry);
        result.phdr = add(bias, phdr_address);
        result.phnum = h->e_phnum;
        for (size_t i = 0; i < h->e_phnum; ++i) {
            const Elf64_Phdr *p = ph + i;
            if (p->p_type != PT_LOAD || !p->p_memsz) continue;
            uintptr_t start = add(bias, page_down(p->p_vaddr));
            uintptr_t end = add(bias, page_up(add(p->p_vaddr, p->p_memsz)));
            map(start, end - start, PROT_READ | PROT_WRITE,
                MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED, -1, 0);
            if (p->p_filesz)
                map(start, page_up(add(p->p_vaddr, p->p_filesz)) - page_down(p->p_vaddr),
                    PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_FIXED, fd, page_down(p->p_offset));
            /* Clear the whole file-tail page, even beyond p_memsz: ld.so's
               early allocator uses that zero-filled slack, just as on exec. */
            uintptr_t zero = add(bias, add(p->p_vaddr, p->p_filesz));
            uintptr_t zero_end = p->p_memsz > p->p_filesz ? page_up(zero) : zero;
            for (; zero < zero_end; ++zero) *(unsigned char *)zero = 0;
            int prot = ((p->p_flags & PF_R) ? PROT_READ : 0)
                     | ((p->p_flags & PF_W) ? PROT_WRITE : 0)
                     | ((p->p_flags & PF_X) ? PROT_EXEC : 0);
            checked(syscall6(SYS_mprotect, start, end - start, prot, 0, 0, 0), "mprotect failed");
        }
    }
    checked(syscall6(SYS_munmap, file, size, 0, 0, 0, 0), "munmap failed");
    checked(syscall6(SYS_close, fd, 0, 0, 0, 0, 0), "close failed");
    current_file = NULL;
    return result;
}

__attribute__((noreturn)) void enter(uintptr_t entry, uintptr_t *stack);
__asm__(".text\n.global _start\n_start:\n"
        "mov %rsp,%rdi\nand $-16,%rsp\ncall start\nud2\n"
        ".global enter\nenter:\nmov %rsi,%rsp\nxor %ebp,%ebp\nxor %edx,%edx\njmp *%rdi\n");

__attribute__((noreturn)) void
start(uintptr_t *stack)
{
    current_stage = "startup";
    if (!stack[0]) fail("missing argv[0]");
    char **argv = (void *)(stack + 1);
    char **env = argv + stack[0] + 1;
    while (*env) ++env;
    Elf64_auxv_t *aux = (void *)(env + 1);
    for (Elf64_auxv_t *a = aux; a->a_type != AT_NULL; ++a) {
        if (a->a_type == AT_PAGESZ) page_size = a->a_un.a_val;
        if (a->a_type == AT_SECURE && a->a_un.a_val) fail("privileged launches are not supported");
    }
    if (!page_size || (page_size & (page_size - 1))) fail("invalid page size");

    static char target[4096];
    current_file = "/proc/self/exe";
    long size = checked(syscall6(SYS_readlinkat, AT_FDCWD, (long)current_file,
                                (long)target, sizeof(target), 0, 0), "readlinkat failed");
    if (size <= 0 || (size_t)size >= sizeof(target)) fail("cannot resolve /proc/self/exe");
    target[size] = 0;
    current_file = NULL;
    int implicit = 1;
    if (size > 5 && equal(target + size - 5, ".rtld")) {
        int own_name = equal(basename(argv[0]), basename(target));
        target[size - 5] = 0;
        if (own_name) argv[0] = target;
    } else {
        if ((size_t)size + 6 > sizeof(target)) fail("target path is too long");
        const char suffix[] = ".real";
        for (size_t i = 0; i < sizeof(suffix); ++i) target[size + i] = suffix[i];
        current_stage = "target";
        current_file = target;
        long found = syscall6(SYS_faccessat, AT_FDCWD, (long)target, F_OK, 0, 0, 0);
        if (found != -ENOENT && found != -ENOTDIR) checked(found, "access failed");
        implicit = found == 0;
        current_stage = "startup";
        current_file = NULL;
    }

    struct image program, linker;
    const char *execfn;
    if (implicit) {
        program = load_image(target, PROGRAM);
        linker = load_image(interpreter, INTERPRETER);
        execfn = target;
    } else {
        /* An explicit PROGRAM invocation can let ld.so map the target itself.
           This also gives it the right $ORIGIN when PROGRAM lives elsewhere.
           Named launchers use interpreter startup to preserve aliases on old
           glibc releases without depending on the newer --argv0 option. */
        if (stack[0] < 2 || equal(argv[1], "--help")) {
            print("Usage: rtld-dispatch PROGRAM [ARGS...]\n"
                  "       rtld-dispatch --verify PROGRAM\n"
                  "Or install as PROGRAM.rtld, or as PROGRAM beside PROGRAM.real.\n");
            finish(stack[0] < 2 ? 1 : 0);
        }
        size_t index = equal(argv[1], "--verify") ? 2 : 1;
        if (index >= stack[0] || argv[index][0] == '-') fail("expected an ELF program path");
        load_image(argv[index], INSPECT);
        linker = load_image(interpreter, INTERPRETER);
        program = linker;
        execfn = interpreter;
    }
    for (Elf64_auxv_t *a = aux; a->a_type != AT_NULL; ++a) {
        switch (a->a_type) {
        case AT_PHDR: a->a_un.a_val = program.phdr; break;
        case AT_PHENT: a->a_un.a_val = sizeof(Elf64_Phdr); break;
        case AT_PHNUM: a->a_un.a_val = program.phnum; break;
        case AT_ENTRY: a->a_un.a_val = program.entry; break;
        case AT_BASE: a->a_un.a_val = implicit ? linker.bias : 0; break;
        case AT_EXECFN: a->a_un.a_val = (uintptr_t)execfn; break;
        }
    }
    /* Preserve the original stack and all other auxv entries (randomness,
       vDSO, hardware capabilities, etc.). No exec: executable identity stays. */
    enter(linker.entry, stack);
}
