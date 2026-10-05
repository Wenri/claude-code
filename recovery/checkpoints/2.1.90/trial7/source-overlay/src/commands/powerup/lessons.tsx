import { c as _c } from 'react/compiler-runtime';
import { Box, Text } from '../../ink.js';
import { Byline } from '../../components/design-system/Byline.js';
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js';
import { AnimatedDemo, LiveModeDemo } from './demos.js';
import * as React from 'react';

function Strong(t0) {
  const $ = _c(2);
  const {
    children
  } = t0;
  let t1;
  if ($[0] !== children) {
    t1 = <Text bold={true} color="claude">{children}</Text>;
    $[0] = children;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

function Suggestion(t0) {
  const $ = _c(2);
  const {
    children
  } = t0;
  let t1;
  if ($[0] !== children) {
    t1 = <Text color="suggestion">{children}</Text>;
    $[0] = children;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

function ListHint() {
  const $ = _c(1);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = <Text dimColor={true} italic={true}><Byline><KeyboardShortcutHint shortcut={"\u2191\u2193"} action="select" /><KeyboardShortcutHint shortcut="Enter" action="open" /><KeyboardShortcutHint shortcut="Esc" action="close" /></Byline></Text>;
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}

function DetailHint() {
  const $ = _c(1);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = <Text dimColor={true} italic={true}><Byline><KeyboardShortcutHint shortcut="Enter" action="mark done" /><KeyboardShortcutHint shortcut="Esc" action="back" /></Byline></Text>;
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}

const LESSONS = [{
  id: "at-mentions",
  title: "Talk to your codebase",
  tagline: "@ files, line refs",
  body: React.createElement(Box, {
    flexDirection: "column",
    gap: 1
  }, React.createElement(Text, null, "Type ", React.createElement(Strong, null, "@"), " anywhere in your prompt to fuzzy-find and attach a file. Claude reads it before answering — no more pasting code."), React.createElement(AnimatedDemo, {
    frames: [`> what does [suggestion:@]
#type a file name…`, `> what does [suggestion:@src/auth.ts]
  [suggestion:❯ src/auth.ts]
#   src/auth.test.ts`, `> what does [suggestion:@src/auth.ts] do?
#◐ Reading src/auth.ts…`, `> what does [suggestion:@src/auth.ts] do?
Exports validateToken() which
checks JWT expiry and signature.`]
  }), React.createElement(Text, null, "Reference specific lines with ", React.createElement(Suggestion, null, "src/app.ts:42"), " and Claude jumps straight there. Works in both directions: Claude cites files the same way, so you can click to open them in your editor."), React.createElement(Text, {
    dimColor: !0
  }, "Also try: ", React.createElement(Suggestion, null, "@folder/"), " to attach a whole directory tree."))
}, {
  id: "modes",
  title: "Steer with modes",
  tagline: "shift+tab, plan, auto",
  body: React.createElement(Box, {
    flexDirection: "column",
    gap: 1
  }, React.createElement(Text, null, "Press ", React.createElement(Strong, null, "shift+tab"), " to cycle permission modes. Each mode changes how much Claude asks before acting:"), React.createElement(LiveModeDemo, null), React.createElement(Box, {
    flexDirection: "column",
    paddingLeft: 2
  }, React.createElement(Text, null, React.createElement(Text, {
    color: "success"
  }, "default"), " — ask before every edit"), React.createElement(Text, null, React.createElement(Text, {
    color: "autoAccept"
  }, "accept edits"), " — edit freely, ask for commands"), React.createElement(Text, null, React.createElement(Text, {
    color: "planMode"
  }, "plan"), " — research and propose, never touch files"), React.createElement(Text, null, React.createElement(Text, {
    color: "warning"
  }, "auto"), " — Claude decides what is safe")), React.createElement(Text, {
    dimColor: !0
  }, "Use ", React.createElement(Text, {
    color: "planMode"
  }, "plan"), " for big refactors you want to review first. Use ", React.createElement(Text, {
    color: "warning"
  }, "auto"), " for long unattended tasks. Run ", React.createElement(Suggestion, null, "/permissions"), " to pre-allow specific commands so Claude stops asking about them."))
}, {
  id: "undo",
  title: "Undo anything",
  tagline: "/rewind, Esc-Esc",
  body: React.createElement(Box, {
    flexDirection: "column",
    gap: 1
  }, React.createElement(Text, null, "Claude checkpoints your files before every edit. Press", " ", React.createElement(Strong, null, "Esc Esc"), " (double-tap) to open ", React.createElement(Suggestion, null, "/rewind"), " and roll back to any prior state — code, conversation, or both."), React.createElement(AnimatedDemo, {
    frames: [`[success:✓] Updated regex in parser.ts
#[error:8 tests failing]`, `#press Esc Esc
Rewind to:
  [suggestion:❯ before parser.ts edit]`, `#[success:✓] parser.ts restored
> try a simpler approach
#◐ thinking…`]
  }), React.createElement(Text, null, "Went down the wrong path? Rewind to before the detour and try a different prompt. Your git history stays clean."), React.createElement(Text, {
    dimColor: !0
  }, "Also: ", React.createElement(Suggestion, null, "/clear"), " wipes conversation but keeps files.", " ", React.createElement(Suggestion, null, "/branch"), " forks the conversation to try two approaches."))
}, {
  id: "background",
  title: "Run in the background",
  tagline: "tasks, /tasks",
  body: React.createElement(Box, {
    flexDirection: "column",
    gap: 1
  }, React.createElement(Text, null, "Long builds and test suites do not have to block you. Add", " ", React.createElement(Strong, null, "&"), " to any bash command and it runs in the background — you keep chatting, Claude notifies you when it finishes."), React.createElement(AnimatedDemo, {
    frames: [`> run the test suite [claude:&]
#task started in background`, `> now fix the lint in app.ts
#◐ Editing app.ts…
#[warning:◐] bun test · 12s`, `> now fix the lint in app.ts
[success:✓] Removed unused import
#[warning:◐] bun test · 28s`, `> now fix the lint in app.ts
[success:✓] Removed unused import
#[success:✓] bun test · 284 pass`]
  }), React.createElement(Text, null, "Run ", React.createElement(Suggestion, null, "/tasks"), " to see everything in flight. Claude can read task output mid-run and react to failures automatically."), React.createElement(Text, {
    dimColor: !0
  }, "Subagents and workflows also run as tasks — it is all one queue."))
}, {
  id: "memory",
  title: "Teach Claude your rules",
  tagline: "CLAUDE.md, /memory",
  body: React.createElement(Box, {
    flexDirection: "column",
    gap: 1
  }, React.createElement(Text, null, "Drop a ", React.createElement(Suggestion, null, "CLAUDE.md"), " file in your repo and Claude reads it at the start of every session. Put your conventions there: test commands, style rules, do-not-touch directories."), React.createElement(AnimatedDemo, {
    frames: [`#─ CLAUDE.md ─
#Run tests with: [suggestion:bun test]
#Never edit src/legacy/`, `> add tests for the cache
#◐ reading CLAUDE.md…`, `> add tests for the cache
Writing cache.test.ts,
running [suggestion:bun test] to verify.`]
  }), React.createElement(Text, null, "Run ", React.createElement(Suggestion, null, "/init"), " to generate a starter CLAUDE.md from your codebase. Run ", React.createElement(Suggestion, null, "/memory"), " to edit it inline."), React.createElement(Text, {
    dimColor: !0
  }, "Works at three levels: repo, your home directory (all projects), and per-directory overrides."))
}, {
  id: "mcp",
  title: "Extend with tools",
  tagline: "MCP, /mcp",
  body: React.createElement(Box, {
    flexDirection: "column",
    gap: 1
  }, React.createElement(Text, null, "MCP servers give Claude new tools: read your Slack, query your database, control your browser. Run ", React.createElement(Suggestion, null, "/mcp"), " to browse and connect servers."), React.createElement(AnimatedDemo, {
    frames: [`> [suggestion:/mcp]
Connected servers:
  [success:✓] slack    [success:✓] github`, `> anything urgent in #eng?
#◐ [suggestion:slack] · reading channel…`, `Boris posted about the merge
freeze. Also 3 PRs await
your review on github.`]
  }), React.createElement(Text, null, 'Once connected, tools appear automatically — ask Claude to "check my calendar" or "search our Notion" and it just works.'), React.createElement(Text, {
    dimColor: !0
  }, "From your shell:", " ", React.createElement(Suggestion, null, "claude mcp add my-server -- npx some-mcp-pkg"), " to wire one up without leaving the terminal."))
}, {
  id: "automate",
  title: "Automate your workflow",
  tagline: "skills, hooks",
  body: React.createElement(Box, {
    flexDirection: "column",
    gap: 1
  }, React.createElement(Text, null, "Save a prompt to ", React.createElement(Suggestion, null, ".claude/skills/deploy/SKILL.md"), " and it becomes ", React.createElement(Suggestion, null, "/deploy"), " — type it, Claude runs it. Run", " ", React.createElement(Suggestion, null, "/skills"), " to see what you have."), React.createElement(AnimatedDemo, {
    frames: [`> [suggestion:/deploy] staging
#◐ skill: deploy`, `[success:✓] built
[success:✓] tests pass
#◐ pushing to staging…`, `[success:✓] deployed
#[suggestion:staging.app.com]
#PostToolUse hook ran prettier`]
  }), React.createElement(Text, null, "Hooks run your own scripts on events: before a tool call, after a response, on session start. Use them to enforce rules, log activity, or inject context. Run ", React.createElement(Suggestion, null, "/hooks"), " to see what fires when."), React.createElement(Text, {
    dimColor: !0
  }, "Run ", React.createElement(Suggestion, null, "/install-github-app"), " to let Claude review PRs when tagged."))
}, {
  id: "subagents",
  title: "Multiply yourself",
  tagline: "subagents, /agents",
  body: React.createElement(Box, {
    flexDirection: "column",
    gap: 1
  }, React.createElement(Text, null, 'Claude can spawn copies of itself to work in parallel. Ask it to "use subagents to search these 5 directories" and watch the fan-out.'), React.createElement(AnimatedDemo, {
    frames: [`> find any error handling bugs
#◐ Spawning 3 agents…`, `#[warning:◐] agent-1 · scanning api
#[warning:◐] agent-2 · scanning utils
#[warning:◐] agent-3 · scanning cli`, `#[success:✓] agent-1 · found reject
#[warning:◐] agent-2 · scanning utils
#[success:✓] agent-3 · no issues`, `Found 2 issues:
  [suggestion:api/fetch.ts:42] unhandled
  [suggestion:utils/retry.ts:18] swallowed`]
  }), React.createElement(Text, null, "Define specialized agents in ", React.createElement(Suggestion, null, ".claude/agents/"), " — a test runner, a code reviewer, a docs writer — each with its own tools and instructions. Run ", React.createElement(Suggestion, null, "/agents"), " to manage them."), React.createElement(Text, {
    dimColor: !0
  }, "Subagents run in isolated context. For true parallel sessions on separate branches, launch with ", React.createElement(Suggestion, null, "claude --worktree"), "."))
}, {
  id: "cross-device",
  title: "Code from anywhere",
  tagline: "/remote-control, /teleport",
  body: React.createElement(Box, {
    flexDirection: "column",
    gap: 1
  }, React.createElement(Text, null, "Run ", React.createElement(Suggestion, null, "/remote-control"), " and this terminal becomes visible on your phone and at claude.ai/code. Watch output, send prompts, approve tool calls — all from another device while this session keeps running."), React.createElement(AnimatedDemo, {
    frames: [`> [suggestion:/remote-control]
#◐ connecting…`, `[success:✓] connected
see this session at
[suggestion:claude.ai/code/abc123]`, `#─ on your phone ─
#abc123 · running tests
[warning:◐] 142 of 284`, `#─ on your phone ─
#abc123 · [success:✓] all pass
> ship it`]
  }), React.createElement(Text, null, "Started a session on the web and want to move it here? Run", " ", React.createElement(Suggestion, null, "/teleport"), " to pull it into this terminal with full history."), React.createElement(Text, {
    dimColor: !0
  }, "Kick off a long task, close your laptop, check progress from your phone."))
}, {
  id: "model-dial",
  title: "Dial the model",
  tagline: "/model, /effort",
  body: React.createElement(Box, {
    flexDirection: "column",
    gap: 1
  }, React.createElement(Text, null, "Run ", React.createElement(Suggestion, null, "/model"), " to switch models. Opus for hard problems, Sonnet for most work, Haiku for quick questions. Each trades speed for depth."), React.createElement(AnimatedDemo, {
    frames: [`> [suggestion:/effort] high
#effort set to [claude:high]`, `> why is the list page slow?
#[claude:◐ thinking deeply…]`, `Three hypotheses, ranked:
 1. N+1 query in loader
 2. missing index on users`]
  }), React.createElement(Text, null, React.createElement(Suggestion, null, "/effort"), " controls how long Claude thinks before answering.", " ", React.createElement(Strong, null, "high"), " for tricky bugs, ", React.createElement(Strong, null, "low"), " when you just need a quick edit."), React.createElement(Text, {
    dimColor: !0
  }, "Also: ", React.createElement(Suggestion, null, "/fast"), " toggles fast mode — same model, faster output."))
}] as const;

export { LESSONS, ListHint, DetailHint };
