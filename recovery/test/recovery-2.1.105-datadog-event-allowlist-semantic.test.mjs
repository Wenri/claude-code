import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const caseName = "2.1.104-to-2.1.105";
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE;
const selected = !semanticCase || semanticCase === caseName;
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, "src"),
);
const prior100Path = process.env.CLAUDE_CODE_2_1_100_BUNDLE;
const prior101Path = process.env.CLAUDE_CODE_2_1_101_BUNDLE;
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE;
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE;
const followupPath = process.env.CLAUDE_CODE_2_1_107_BUNDLE;
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE;
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        "recovery/cases",
        caseName,
        "structural/generated-delta.json.gz",
      ),
    ),
  ),
);

const eventNames = [
  "tengu_mcp_tools_refreshed_mid_turn",
  "tengu_sdk_init_handshake",
];

const units = new Map([
  [
    5073,
    [
      "VariableDeclaration",
      3729115,
      3731175,
      "255f0a070bd0b17680440ad906ec17234579b04463942015a96b60e0460260d5",
    ],
  ],
  [
    12746,
    [
      "FunctionDeclaration",
      9731500,
      9746246,
      "53675c8c172c312b1486d90018276b1e1be94c1ddfd23b6b3b8b07f9c288129b",
    ],
  ],
  [
    18971,
    [
      "FunctionDeclaration",
      13474531,
      13476760,
      "9c06fead214194876dbde0c925c0c1dee151dadba2e5ffd3289eae3606431460",
    ],
  ],
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1;
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), "utf8");
}

function executeAllowedEvents(contents) {
  const marker = "const DATADOG_ALLOWED_EVENTS = new Set([";
  const start = contents.indexOf(marker);
  assert.notEqual(start, -1, "Datadog allowlist declaration is required");
  const end = contents.indexOf("\n])", start);
  assert.notEqual(end, -1, "Datadog allowlist terminator is required");
  const declaration = contents.slice(start, end + 3);
  return new Function(`${declaration}; return DATADOG_ALLOWED_EVENTS`)();
}

test(
  "authenticated target105 adds both reachable events to the Datadog allowlist",
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !prior100Path ||
          !prior101Path ||
          !baselinePath ||
          !targetPath ||
          !followupPath ||
          !latestPath
        ? "authenticated 2.1.100, 2.1.101, 2.1.104, 2.1.105, 2.1.107, and 2.1.116 bundles are required"
        : false,
  },
  () => {
    const artifacts = [
      [
        prior100Path,
        "d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be",
        0,
      ],
      [
        prior101Path,
        "bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb",
        0,
      ],
      [
        baselinePath,
        "ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39",
        0,
      ],
      [
        targetPath,
        "8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75",
        2,
      ],
      [
        followupPath,
        "6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844",
        2,
      ],
      [
        latestPath,
        "d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a",
        2,
      ],
    ];
    const contents = artifacts.map(([filename, hash, count]) => {
      const bytes = fs.readFileSync(filename);
      assert.equal(sha256(bytes), hash);
      const text = bytes.toString("utf8");
      for (const eventName of eventNames) {
        assert.equal(occurrences(text, eventName), count, eventName);
      }
      return text;
    });

    const target = contents[3];
    for (const [index, [nodeType, start, end, hash]] of units) {
      const region = structural.regions[index];
      assert.equal(region.classification, "unresolved", `${index}: class`);
      assert.equal(region.target.index, index, `${index}: target index`);
      assert.equal(region.target.nodeType, nodeType, `${index}: node type`);
      assert.equal(region.target.parseStatus, "parsed", `${index}: parse`);
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      );
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`);
    }

    const allowlist = target.slice(3729115, 3731175);
    for (const eventName of eventNames) {
      assert.equal(occurrences(allowlist, eventName), 1);
    }

    const refreshCaller = target.slice(9731500, 9746246);
    assert.ok(refreshCaller.includes("options.refreshTools"));
    assert.ok(refreshCaller.includes("tengu_mcp_tools_refreshed_mid_turn"));
    assert.ok(refreshCaller.includes("oldMcpCount:"));
    assert.ok(refreshCaller.includes("newMcpCount:"));
    assert.ok(refreshCaller.includes("recovered:"));

    const handshakeCaller = target.slice(13474531, 13476760);
    assert.ok(handshakeCaller.includes("tengu_sdk_init_handshake"));
    assert.ok(
      handshakeCaller.includes("uptime_ms:Math.round(process.uptime()*1000)"),
    );
    assert.ok(handshakeCaller.includes("mcp_client_count:"));
    assert.ok(handshakeCaller.includes("mcp_pending_count:"));
  },
);

test(
  "source root owns both target105 allowlist additions and keeps the filter connected",
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const datadog = source("services/analytics/datadog.ts");
    for (const eventName of eventNames) {
      assert.equal(occurrences(datadog, `'${eventName}'`), 1);
    }
    assert.ok(datadog.includes("DATADOG_ALLOWED_EVENTS.has(eventName)"));
  },
);

test(
  "executable allowlist accepts the two target105 events and rejects an unknown event",
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const allowedEvents = executeAllowedEvents(
      source("services/analytics/datadog.ts"),
    );
    for (const eventName of eventNames) {
      assert.equal(allowedEvents.has(eventName), true);
    }
    assert.equal(allowedEvents.has("tengu_not_a_real_datadog_event"), false);
  },
);
