/*
 * claude-preload.so — LD_PRELOAD shim that makes /proc/self/exe resolve to the
 * claude-dispatch binary instead of the dynamic linker.
 *
 * Why: under the WSL1 `ld-linux ~/.local/bin/claude` launch workaround
 * (anthropics/claude-code#38788), the running process's /proc/self/exe points
 * at the linker, so claude sets CLAUDE_CODE_EXECPATH to the linker path. The
 * grep/find/rg shims then run `ld-linux -G ...` and fail with
 * "error while loading shared libraries: -G: cannot open shared object file".
 *
 * By intercepting readlink()/readlinkat() for "/proc/self/exe" and returning
 * the dispatcher path, CLAUDE_CODE_EXECPATH becomes claude-dispatch, which
 * re-launches the bundled tools through ld-linux with the right argv[0].
 *
 * Load it via the launcher shell function, e.g.:
 *     claude() { LD_PRELOAD="$HOME/.local/lib/claude-preload.so" \
 *                  /lib64/ld-linux-x86-64.so.2 "$HOME/.local/bin/claude" "$@"; }
 *
 * Dispatcher path resolution (highest precedence first):
 *   1. environment  : CLAUDE_DISPATCH
 *   2. compile-time : -DDISPATCH_PATH='"..."'   (install.sh / Makefile set this)
 *   3. built-in     : $HOME/.local/bin/claude-dispatch
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static const char *dispatch_path(void)
{
    const char *e = getenv("CLAUDE_DISPATCH");
    if (e && *e) return e;
#ifdef DISPATCH_PATH
    return DISPATCH_PATH;
#else
    static char buf[4096];
    const char *home = getenv("HOME");
    snprintf(buf, sizeof buf, "%s/.local/bin/claude-dispatch", (home && *home) ? home : "");
    return buf;
#endif
}

/* readlink() does not NUL-terminate and returns the byte count, truncating to
 * bufsiz; mirror that exactly. */
static ssize_t fill_self_exe(char *buf, size_t bufsiz)
{
    const char *p = dispatch_path();
    size_t len = strlen(p);
    if (len > bufsiz) len = bufsiz;
    memcpy(buf, p, len);
    return (ssize_t)len;
}

static int is_self_exe(const char *path)
{
    return path && strcmp(path, "/proc/self/exe") == 0;
}

typedef ssize_t (*readlink_fn)(const char *, char *, size_t);
typedef ssize_t (*readlinkat_fn)(int, const char *, char *, size_t);

ssize_t readlink(const char *path, char *buf, size_t bufsiz)
{
    if (is_self_exe(path))
        return fill_self_exe(buf, bufsiz);

    static readlink_fn orig;
    if (!orig) orig = (readlink_fn)dlsym(RTLD_NEXT, "readlink");
    return orig(path, buf, bufsiz);
}

ssize_t readlinkat(int dirfd, const char *path, char *buf, size_t bufsiz)
{
    if (is_self_exe(path))
        return fill_self_exe(buf, bufsiz);

    static readlinkat_fn orig;
    if (!orig) orig = (readlinkat_fn)dlsym(RTLD_NEXT, "readlinkat");
    return orig(dirfd, path, buf, bufsiz);
}
