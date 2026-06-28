/*
 * claude-dispatch — repair grep/find/rg under the WSL1 `ld-linux` launch workaround.
 *
 * Background: on WSL1, claude >= 2.1.83 fails to exec directly ("Exec format
 * error", anthropics/claude-code#38788). The community workaround is to launch
 * it through the dynamic linker. We do that with the linker's own `--preload`
 * (rather than an LD_PRELOAD env var) so the hook does NOT leak into unrelated
 * child processes:
 *
 *     ld-linux --preload <claude-preload.so>  ~/.local/bin/claude  "$@"
 *
 * claude-preload.so makes /proc/self/exe (hence CLAUDE_CODE_EXECPATH) resolve to
 * THIS dispatcher instead of the linker. The claude binary multiplexes bundled
 * tools (ugrep / rg / bfs) off argv[0], and its grep/find/rg shims call it as:
 *
 *     ARGV0=ugrep  "$CLAUDE_CODE_EXECPATH"  -G ...
 *
 * which now lands here. This program re-launches through ld-linux with the
 * correct argv[0]:
 *
 *   - called as a multiplexed tool (ugrep/rg/bfs) — a leaf grep, no hook needed:
 *         ld-linux --argv0 <tool> <claude> <args...>
 *   - called as anything else (a full-claude self-spawn, e.g. a subagent):
 *         ld-linux --preload <preload> <claude> <args...>
 *     Re-applying --preload here is what propagates the /proc/self/exe hook to
 *     self-spawned claude children, since there is no longer an LD_PRELOAD env
 *     var for them to inherit. Leaf tools don't spawn claude, so they skip it.
 *
 * Why a compiled binary and not a shell script: the shim relies on argv[0]
 * ("ARGV0=ugrep ..."), and a shebang script would have its argv[0] rewritten
 * to the interpreter, losing the tool name.
 *
 * Path resolution (highest precedence first):
 *   1. environment   : CLAUDE_BIN, CLAUDE_LD_LINUX, CLAUDE_PRELOAD
 *   2. compile-time  : -DCLAUDE_BIN=... -DLD_LINUX=... -DPRELOAD_PATH=...  (install.sh / Makefile set these)
 *   3. built-in      : $HOME/.local/{bin/claude,lib/claude-preload.so} and /lib64/ld-linux-x86-64.so.2
 */
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <libgen.h>

#ifndef LD_LINUX
#define LD_LINUX "/lib64/ld-linux-x86-64.so.2"
#endif

/* tools the claude binary answers to when invoked under that argv[0] */
static const char *const kTools[] = { "ugrep", "rg", "bfs", NULL };

static const char *resolve_claude_bin(void)
{
    const char *e = getenv("CLAUDE_BIN");
    if (e && *e) return e;
#ifdef CLAUDE_BIN
    return CLAUDE_BIN;
#else
    static char buf[4096];
    const char *home = getenv("HOME");
    snprintf(buf, sizeof buf, "%s/.local/bin/claude", (home && *home) ? home : "");
    return buf;
#endif
}

static const char *resolve_ld_linux(void)
{
    const char *e = getenv("CLAUDE_LD_LINUX");
    if (e && *e) return e;
    return LD_LINUX;
}

static const char *resolve_preload(void)
{
    const char *e = getenv("CLAUDE_PRELOAD");
    if (e && *e) return e;
#ifdef PRELOAD_PATH
    return PRELOAD_PATH;
#else
    static char buf[4096];
    const char *home = getenv("HOME");
    snprintf(buf, sizeof buf, "%s/.local/lib/claude-preload.so", (home && *home) ? home : "");
    return buf;
#endif
}

static int is_tool(const char *name)
{
    for (const char *const *t = kTools; *t; t++)
        if (strcmp(name, *t) == 0)
            return 1;
    return 0;
}

int main(int argc, char *argv[], char *envp[])
{
    char name_buf[4096];
    strncpy(name_buf, (argc > 0 && argv[0]) ? argv[0] : "", sizeof name_buf - 1);
    name_buf[sizeof name_buf - 1] = '\0';
    const char *name = basename(name_buf);

    const char *ld     = resolve_ld_linux();
    const char *claude = resolve_claude_bin();

    /* worst case we prepend 4 entries (ld, --argv0|--preload, arg, claude) + NULL */
    char **new_argv = malloc((size_t)(argc + 5) * sizeof *new_argv);
    if (!new_argv) {
        perror("claude-dispatch: malloc");
        return 1;
    }

    int n = 0;
    new_argv[n++] = (char *)ld;
    if (is_tool(name)) {
        /* leaf tool (ugrep/rg/bfs): just fix argv[0] */
        new_argv[n++] = (char *)"--argv0";
        new_argv[n++] = (char *)name;
    } else {
        /* full-claude (re)launch: re-apply the /proc/self/exe hook so this
         * child and any of its own subagents keep a correct CLAUDE_CODE_EXECPATH */
        new_argv[n++] = (char *)"--preload";
        new_argv[n++] = (char *)resolve_preload();
    }
    new_argv[n++] = (char *)claude;
    for (int i = 1; i < argc; i++)
        new_argv[n++] = argv[i];
    new_argv[n] = NULL;

    execve(ld, new_argv, envp);

    /* only reached if execve fails */
    fprintf(stderr, "claude-dispatch: execve %s: ", ld);
    perror(NULL);
    return 127;
}
