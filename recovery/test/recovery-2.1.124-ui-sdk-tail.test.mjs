import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const releases = {
  baseline: {
    env: "CLAUDE_CODE_2_1_123_BUNDLE",
    bytes: 13_949_576,
    sha256: "59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd",
  },
  target: {
    env: "CLAUDE_CODE_2_1_124_BUNDLE",
    bytes: 13_980_928,
    sha256: "dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590",
  },
};

const targetStatements = {
  C179: [
    [
      12_596_341,
      768,
      "c2e95d684ad43ae8636a16185dff5dc84f23da5c3f20c01f18056a5885b4d94b",
    ],
  ],
  C180: [
    [
      12_606_378,
      89,
      "5435ce1ab40c574752359fd5f0f5008db63c6ceb447f75d684225de268a77ad9",
    ],
  ],
  C181: [
    [
      12_610_728,
      6_066,
      "9fb0eea3fe28ec9c61abf731fb27f7bdc690f100bc45eb04874f73f6fae56094",
    ],
  ],
  C182: [
    [
      12_617_612,
      27,
      "a44d8dba2a810beec6713169af0f6c1e0d531edf463819323c7d3079949ea79f",
    ],
    [
      12_617_866,
      4_003,
      "42ba27b3acd1c6ea7bef10f35c8fd8026142fd2cb788b5a88d3e6ac48e84eb0f",
    ],
    [
      12_621_948,
      32_073,
      "599270eaa956e426a4b07d3ce2967cbb5185060b2e41172aa5d6bbbda1dd36d2",
    ],
  ],
  C183: [
    [
      12_658_321,
      1_849,
      "e9322c3d700b8cfb5ad1db9cb02aa2d60cbbfea02ea60a4299f3137cd53fc9d5",
    ],
    [
      12_660_170,
      212,
      "ffad4a7ade03dd19b7b81c7d6bd83e7e512ea9b3bed1584b7ab0372cb7d64d0e",
    ],
    [
      12_660_382,
      1_008,
      "1dd277057c0ef62ec7f412712873b22fe95d9fdca5faa85589b810b84b317553",
    ],
  ],
  C184: [
    [
      12_710_156,
      57,
      "ee651f3e624eb2ba7e1e271f35f8e47f1920158b495f9e97bdcad9fb9dc9b9f3",
    ],
  ],
  C185: [
    [
      12_721_616,
      91,
      "0a58505ddb886932cddb421fb7262b5303f256014dfaa3979f42c5b6a97e84fe",
    ],
    [
      12_721_707,
      114,
      "f035ab6bc0fd0e007e0328ce147a4dac9ef6b92dbf5de668e1e14774cf9b176e",
    ],
    [
      12_721_821,
      439,
      "cf806d78f1c81655da974493f91d431d78afb6dab2e6ad469e17abfdd19a3ea9",
    ],
    [
      12_722_260,
      4_927,
      "d23d71ee83ec450a02785764010d1e873688255cce24917505f19729c4c5bd4e",
    ],
    [
      12_727_187,
      12,
      "8baa430f4acf7162adbfa0208ef7666de3117406e100101b039cacad6a2d8790",
    ],
    [
      12_727_199,
      191,
      "b40a928f276e567cfae69b62b6c95a8036509594bf13d76ea04b58404fcf0667",
    ],
    [
      12_727_390,
      53,
      "550822aee12a4844e4d0f20c2a0322c0323515e203dd57413b1b50864f8e2639",
    ],
    [
      12_727_443,
      184,
      "af26ca9bd6040ee693ed99f5a5053d2f139718db177703141789c297c5a91459",
    ],
    [
      12_727_627,
      20,
      "fbaea42c057a0beff4f0b9e5e008affd887c1588975abd6b0745069f0459aa60",
    ],
    [
      12_727_647,
      3_329,
      "d2498cf2ea3f297652d3b8ce12ca1c9928a79f0c4644822ab079c3dabc419aff",
    ],
    [
      12_730_976,
      642,
      "ea6ac510ff0b472c4a5092ada6e90731c5f88539f5b239b62a2ae401f8de3f10",
    ],
    [
      12_731_626,
      57,
      "d368c474138b100eac4c602e01f3907611b5bd739b75caefb9032ac5664060de",
    ],
  ],
  C187: [
    [
      12_753_999,
      20_966,
      "ba9d7e4764c387626cde2d7a7bb531224b21f73b6137347d1553c872d8a0c0b9",
    ],
  ],
  C191: [
    [
      12_830_515,
      245,
      "884bacf842458fab610a117ebde2d3e0d0d83e84044b55c9627adfc2f90a7ca5",
    ],
  ],
  C193: [
    [
      13_009_751,
      1_317,
      "d45f9a581e4357a542218382d0fa7257f1041fcb4bbe6bd1f817e12e4a5025dd",
    ],
  ],
  C194: [
    [
      13_019_956,
      242,
      "b140f66ae556a2ba332a2ee1c15d7ff3d540a96b42213cf0c4aa628128f628d2",
    ],
  ],
  C195: [
    [
      13_627_052,
      245,
      "d3b7bbb7791366faff82b1afe0927cccf2e48928785ec0be41dfa340510504d5",
    ],
    [
      13_627_297,
      8,
      "cc6c0733327bc39f36fb6855e9138a1a3c12f4789a12df2096bebb09a96cc25a",
    ],
    [
      13_627_305,
      76,
      "b26d431fccf4e8b448d9850dd90f50b9099260ff4077b850177942c9463c36bd",
    ],
  ],
  C196: [
    [
      13_675_898,
      18_901,
      "33bc5ea9acb9d87cd0466283236bf3e0a636aec31a064dc6505dc456e1e6f82f",
    ],
  ],
  C197: [
    [
      13_709_514,
      44_286,
      "903ec777db19cc0943d3ae7120637ab0c42114cdd8d3fe8c7a8d43b72f0ae726",
    ],
  ],
};

const removedBaselineStatements = {
  C186: [
    [
      12_703_876,
      117,
      "207d01ff5da179a22a50ef271f2cc44b590d323065b017b7ff62e401288c31e7",
    ],
    [
      12_703_993,
      23,
      "a1aa3c0b36bc860b9f72c7da0d32e058b94db63e4e2425b964d1c8684e706b0c",
    ],
    [
      12_704_016,
      590,
      "f125e6dcde29b1401db41f01055c82fed6264c91a7c9f9407a9e7713c64a1910",
    ],
  ],
  C188: [
    [
      12_795_223,
      23,
      "ca3ea3f5bb3af9d56bde2a05ea657fa5f95331a7551af6e0bf6805fc4c89de40",
    ],
    [
      12_795_246,
      224,
      "cc2d47757109686183057b1f1cd42ce4bd6c1b232dc78628df2251d141b516cc",
    ],
    [
      12_795_470,
      174,
      "e0fef2bdbf44424a602b88d9c9c8ca44a24ab2a16981750162bb5cfb3b505f22",
    ],
  ],
  C189: [
    [
      12_798_931,
      23,
      "246a5f6e5a84c8a467bf7772c0c80c00348e75782fbb5cc895e7848e5eb52953",
    ],
    [
      12_798_954,
      100,
      "4402e502ec502638c59df7a248377189808fa52e1420fd3eec6eebd281c027a3",
    ],
    [
      12_799_054,
      53,
      "6f0968d6357197898179c469853e6f3298751ec75ffb8d33972520fec7c520ef",
    ],
  ],
};

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readBundle(release) {
  const filename = process.env[release.env];
  assert.ok(filename, `${release.env} must be set`);
  const contents = fs.readFileSync(filename);
  assert.equal(contents.length, release.bytes);
  assert.equal(sha256(contents), release.sha256);
  return contents;
}

function source(relative) {
  return fs
    .readFileSync(path.join(repo, relative), "utf8")
    .split("\n//# sourceMappingURL=", 1)[0];
}

function compact(value) {
  return value.replaceAll(";", "").replaceAll(/\s+/g, " ").trim();
}

function assertFragments(relative, fragments) {
  const contents = compact(source(relative));
  for (const fragment of fragments) {
    assert.ok(contents.includes(compact(fragment)), `${relative}: ${fragment}`);
  }
}

test("authenticates every assigned C179-C197 target cluster", () => {
  const baseline = readBundle(releases.baseline);
  const target = readBundle(releases.target);

  for (const [cluster, statements] of Object.entries(targetStatements)) {
    for (const [offset, bytes, expected] of statements) {
      assert.equal(
        sha256(target.subarray(offset, offset + bytes)),
        expected,
        `${cluster}: target statement`,
      );
    }
  }

  for (const [cluster, statements] of Object.entries(
    removedBaselineStatements,
  )) {
    for (const [offset, bytes, expected] of statements) {
      const statement = baseline.subarray(offset, offset + bytes);
      assert.equal(
        sha256(statement),
        expected,
        `${cluster}: baseline statement`,
      );
      assert.equal(
        target.indexOf(statement),
        -1,
        `${cluster}: removed statement`,
      );
    }
  }
});

test("recovers Fleet detail, PR remount, feedback copy, and wheel marker", () => {
  assertFragments("src/components/FleetView.tsx", [
    "export function flattenDetail(value: string): string",
    "return stripAnsi(value) .replace(/<(system-reminder|task-notification)>[\\s\\S]*?(<\\/\\1>|$)/g",
    "import { useInterval } from 'usehooks-ts'",
    "Date.now() - Date.parse(job.state.updatedAt) < 60_000 ? 1_000 : null",
    "(job.state.tempo === 'blocked' && job.state.needs) || job.state.detail",
    "prStatuses: statusesRef.current",
    "lastPrStatuses = action.prStatuses",
    "Couldn't rename — the job may have been removed or its state file is unwritable.",
    "batch.unbatched.map(async url => fetched.set(url, await fetchPrStatus(url)),",
  ]);
  assertFragments(
    "src/components/FeedbackSurvey/MemoryEvaluationSurveyView.tsx",
    ["'Did this memory help? (optional)'"],
  );
  assertFragments("src/components/ScrollKeybindingHandler.tsx", [
    "config.wheelFlood ? ' · wheelFlood' : ''",
  ]);
});

test("consolidates startup notifications and migrates impression state", () => {
  const registry = source("src/hooks/notifs/useStartupNotifications.tsx");
  for (const id of [
    "npm-deprecation",
    "official-marketplace",
    "install-messages",
    "chrome-extension",
    "model-migration",
    "subscription-switch",
  ]) {
    assert.ok(registry.includes(`id: "${id}"`), id);
  }
  assertFragments("src/hooks/notifs/useStartupNotifications.tsx", [
    "if (getIsNonInteractiveSession() || hasRun.current) return",
    "void Promise.allSettled(",
    "(seen[config.id] ?? 0) >= config.maxImpressions",
    "maxImpressions: 3",
    "return { ...current, seenNotifications: next }",
  ]);

  const repl = source("src/screens/REPL.tsx");
  assert.equal((repl.match(/useStartupNotifications\(\)/g) ?? []).length, 1);
  for (const removedName of [
    "useNpmDeprecationNotification",
    "useOfficialMarketplaceNotification",
    "useInstallMessages",
    "useChromeExtensionNotification",
    "useModelMigrationNotifications",
    "useCanSwitchToExistingSubscription",
  ]) {
    assert.ok(!repl.includes(removedName), removedName);
  }

  assertFragments("src/migrations/migrateNotificationImpressions.ts", [
    '"subscription-switch": "subscriptionNoticeCount"',
    'if (typeof legacyValue === "number" && legacyValue > 0)',
    "current.seenNotifications !== undefined ? current : { ...current, seenNotifications }",
  ]);
  assertFragments("src/main.tsx", [
    "const CURRENT_MIGRATION_VERSION = 13",
    "migrateNotificationImpressions()",
  ]);
  assertFragments("src/commands/logout/logout.tsx", [
    "const notificationId = 'subscription-switch'",
    "updated.seenNotifications = remainingNotifications",
  ]);
});

test("recovers SDK fixes, origin envelopes, and print control handlers", () => {
  assertFragments("src/entrypoints/sdk/controlSchemas.ts", [
    "ccshare_url: z .string() .optional()",
    "Internal share URL for the conversation. Only set in internal builds when the upload succeeded; absent otherwise.",
  ]);
  assertFragments("src/components/InvalidSettingsDialog.tsx", [
    "onFix: () => void",
    "else if (value === 'fix') { onFix() }",
    "{ label: 'Fix with Claude', value: 'fix' }",
  ]);
  assertFragments("src/dialogLaunchers.tsx", [
    "Promise<void | 'fix'>",
    "onContinue={() => done(undefined)} onFix={() => done('fix')}",
  ]);
  assertFragments("src/main.tsx", [
    "if (invalidSettingsResult === 'fix')",
    "await import('./screens/Doctor.js')",
    "buildFixPrompt(null, null, nonMcpErrors, [], null, [], [], [])",
  ]);

  const engine = source("src/QueryEngine.ts");
  assert.equal(
    (engine.match(/origin: options\?\.origin/g) ?? []).length,
    9,
    "C196 result envelope origins",
  );
  assertFragments("src/cli/print.ts", [
    "message.request.subtype === 'file_suggestions'",
    "await import('src/hooks/fileSuggestions.js')",
    "generateFileSuggestions( globalFileIndexCache, message.request.query, true, )",
    "suggestions.map(suggestion => ({ path: suggestion.displayText, }))",
    "ccshare_url: ccshareUrl",
  ]);
});
