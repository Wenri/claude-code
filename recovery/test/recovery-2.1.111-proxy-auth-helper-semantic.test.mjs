import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL, fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const caseName = "2.1.110-to-2.1.111";
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE;
const selected = !semanticCase || semanticCase === caseName;
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, "src"),
);
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE;
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE;
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

const units = new Map([
  [
    2615,
    [
      "FunctionDeclaration",
      1051662,
      1071796,
      "032d227d239e145504baa8900383fd56cf3d69f7874c0e7d504d58e5e028b795",
    ],
  ],
  [
    3019,
    [
      "FunctionDeclaration",
      2061784,
      2061806,
      "8d0b2b8b76a8ed2c0be7e188a98519af9e894f0ec47c24c0c57c5925ced8d043",
    ],
  ],
  [
    3020,
    [
      "FunctionDeclaration",
      2061806,
      2061904,
      "0685b667e1a36d75b61056f772d75d4b6b5a7a8f100b78f279e5c3561012e59b",
    ],
  ],
  [
    3021,
    [
      "FunctionDeclaration",
      2061904,
      2061965,
      "0c57cb8d4052e24bea93fbf540b4a1cb0fed16227258edf608d4da8bc2097709",
    ],
  ],
  [
    3022,
    [
      "FunctionDeclaration",
      2061965,
      2062108,
      "17cb68b0688487168bd46ee1068901119c32d75199c4b63d9e050f4e1397dfcd",
    ],
  ],
  [
    3023,
    [
      "FunctionDeclaration",
      2062108,
      2062933,
      "2fd4bbe60780a97dbc987828d137f37844a4490c76cc83ad109595f8890d5c2c",
    ],
  ],
  [
    3024,
    [
      "FunctionDeclaration",
      2062933,
      2062972,
      "0e148a675d2130e3154e0f1c2bcfd963f302d5ad12baba3e584f201495b8274e",
    ],
  ],
  [
    3025,
    [
      "FunctionDeclaration",
      2062972,
      2063003,
      "b25faec849265f9228f6872b9c316323fae48efab45912e7b4397c53e74efb31",
    ],
  ],
  [
    3026,
    [
      "FunctionDeclaration",
      2063003,
      2063079,
      "ac067d97348ab775afebee2c7785b5903cb6229489ac63243b98838255b9bda5",
    ],
  ],
  [
    3027,
    [
      "FunctionDeclaration",
      2063079,
      2063177,
      "5f7ed092ce31e2f816c0e4f30a436eb23ff9e8d6107a74c6a2bb32deae3f9707",
    ],
  ],
  [
    3028,
    [
      "FunctionDeclaration",
      2063177,
      2063555,
      "8f7dcb2ecf2fa76f4f0f84afb21c2d202a58ff55cc5b86ecb04c4ddb21b9cef2",
    ],
  ],
  [
    9504,
    [
      "VariableDeclaration",
      6972462,
      6977068,
      "24d41e5ca52100e10e588a4c5fb53c6e1688129e0fcd32ba532b7e0deb875210",
    ],
  ],
  [
    13853,
    [
      "FunctionDeclaration",
      10052746,
      10053442,
      "cee6fa1e0f07efa9d872028018603ad9d3bbbae4e9e5b58dcf96d34b182bb7d2",
    ],
  ],
  [
    19299,
    [
      "FunctionDeclaration",
      13411220,
      13415652,
      "a72286c22e3910da0da18d5e5a7a0271df24fa9a4746b7e8ebf61cfb33f31f10",
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

function section(contents, startMarker, endMarker) {
  const start = contents.indexOf(startMarker);
  assert.notEqual(start, -1, `missing section start: ${startMarker}`);
  const end = contents.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing section end: ${endMarker}`);
  return contents.slice(start, end);
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      "../lib/node_modules/typescript/lib/typescript.js",
    ),
    path.join(
      repositoryRoot,
      ".pixi/envs/default/lib/node_modules/typescript/lib/typescript.js",
    ),
  ];
  const candidate = candidates.find(fs.existsSync);
  assert.ok(candidate, "the pinned TypeScript compiler must be available");
  const module = await import(pathToFileURL(candidate).href);
  return module.default ?? module;
}

async function compileCommonJs(contents) {
  const ts = await loadTypeScript();
  return ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function memoize(fn) {
  const values = new Map();
  const wrapped = (argument) => {
    if (!values.has(argument)) values.set(argument, fn(argument));
    return values.get(argument);
  };
  wrapped.cache = { clear: () => values.clear() };
  return wrapped;
}

async function executeProxyModule(contents) {
  const state = {
    debug: [],
    execaCalls: [],
    nonInteractive: false,
    result: {
      failed: false,
      timedOut: false,
      exitCode: 0,
      stderr: "",
      stdout: "Negotiate generated-token",
    },
  };
  const axios = {
    create: () => ({
      defaults: {},
      interceptors: { request: { use: () => 1 } },
    }),
    defaults: {},
    interceptors: { request: { use: () => 1, eject: () => undefined } },
  };
  const javascript = await compileCommonJs(contents);
  const module = { exports: {} };
  new Function("require", "exports", "module", javascript)(
    (id) => {
      if (id === "axios") return axios;
      if (id === "execa") {
        return {
          execa: async (...args) => {
            state.execaCalls.push(args);
            return state.result;
          },
        };
      }
      if (id === "https-proxy-agent") {
        return { HttpsProxyAgent: class HttpsProxyAgent {} };
      }
      if (id === "lodash-es/memoize.js") return memoize;
      if (id.endsWith("/bootstrap/state.js")) {
        return {
          getIsNonInteractiveSession: () => state.nonInteractive,
        };
      }
      if (id.endsWith("/caCerts.js")) {
        return { getCACertificates: () => undefined };
      }
      if (id.endsWith("/debug.js")) {
        return {
          logForDebugging: (...args) => state.debug.push(args),
        };
      }
      if (id.endsWith("/envUtils.js")) {
        return {
          isEnvTruthy: (value) =>
            ["1", "true", "yes", "on"].includes(String(value).toLowerCase()),
        };
      }
      if (id.endsWith("/mtls.js")) {
        return {
          getMTLSAgent: () => undefined,
          getMTLSConfig: () => undefined,
          getTLSFetchOptions: () => ({}),
        };
      }
      throw new Error(`unexpected proxy import: ${id}`);
    },
    module.exports,
    module,
  );
  return { proxy: module.exports, state };
}

async function executeProxyRetry(contents, configured) {
  const retryFunction = section(
    contents,
    "function shouldRetry(error: APIError)",
    "\nexport function getDefaultMaxRetries",
  );
  const javascript = await compileCommonJs(`
    type APIError = any
    class APIConnectionError extends Error {}
    const isMockRateLimitError = () => false
    const isPersistentRetryEnabled = () => false
    const isTransientCapacityError = () => false
    const isEnvTruthy = () => false
    const parseMaxTokensContextOverflowError = () => false
    const getConfiguredProxyAuthHelper = () => ${configured}
    let challenge: string | undefined
    const clearProxyAuthHelperCache = (value?: string) => { challenge = value }
    const isClaudeAISubscriber = () => false
    const isEnterpriseSubscriber = () => false
    const clearApiKeyHelperCache = () => undefined
    const isOAuthTokenRevokedError = () => false
    ${retryFunction}
    export { shouldRetry, getChallenge }
    function getChallenge() { return challenge }
  `);
  const module = { exports: {} };
  new Function("require", "exports", "module", javascript)(
    () => ({}),
    module.exports,
    module,
  );
  const retryable = module.exports.shouldRetry({
    status: 407,
    message: "proxy authentication required",
    headers: {
      get: (name) =>
        name === "proxy-authenticate" ? "Negotiate challenge-token" : null,
    },
  });
  return { retryable, challenge: module.exports.getChallenge() };
}

test(
  "authenticated target111 introduces the proxy-auth schema, runtime, trust classification, and setup caller",
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? "authenticated 2.1.110, 2.1.111, and 2.1.116 bundles are required"
        : false,
  },
  () => {
    const artifacts = [
      [
        baselinePath,
        "cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861",
        0,
      ],
      [
        targetPath,
        "8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0",
        7,
      ],
      [
        latestPath,
        "d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a",
        7,
      ],
    ];
    const contents = artifacts.map(([filename, hash, count]) => {
      const bytes = fs.readFileSync(filename);
      assert.equal(sha256(bytes), hash);
      const text = bytes.toString("utf8");
      assert.equal(occurrences(text, "proxyAuthHelper"), count);
      return text;
    });

    const target = contents[1];
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

    const schema = target.slice(1051662, 1071796);
    assert.ok(
      schema.includes(
        'proxyAuthHelper:y.string().optional().describe("Shell command that outputs a Proxy-Authorization header value (EAP)")',
      ),
    );

    const runtime = target.slice(2061784, 2063555);
    for (const fragment of [
      'CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER!=="1"',
      "CLAUDE_CODE_PROXY_AUTH_HELPER_TTL_MS",
      "workspace trust not yet accepted — skipping",
      "CLAUDE_CODE_PROXY_URL",
      "CLAUDE_CODE_PROXY_HOST",
      "CLAUDE_CODE_PROXY_AUTHENTICATE",
      "proxyAuthHelper failed:",
      '"Proxy-Authorization"',
    ]) {
      assert.ok(runtime.includes(fragment), fragment);
    }
    assert.ok(target.slice(6972462, 6977068).includes('"proxyAuthHelper"'));

    const retryCaller = target.slice(10052746, 10053442);
    assert.ok(retryCaller.includes("status===407"));
    assert.ok(retryCaller.includes('headers?.get("proxy-authenticate")'));

    const setupCaller = target.slice(13411220, 13415652);
    assert.ok(setupCaller.includes("proxyAuthHelper"));
    assert.ok(setupCaller.includes("fromProjectOrLocal:"));
    assert.ok(setupCaller.includes("trustAccepted:"));
    assert.ok(setupCaller.includes("projectSettings"));
    assert.ok(setupCaller.includes("localSettings"));

    const latest = contents[2];
    const latestGate = latest.indexOf("CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER");
    assert.notEqual(latestGate, -1);
    assert.equal(
      latest.slice(latestGate - 80, latestGate + 100).includes('!=="1"'),
      false,
      "116 evolves the feature gate to truthy-env parsing",
    );
    const latestReset = latest.indexOf(
      "helper:void 0,fromProjectOrLocal:!1,trustAccepted:",
    );
    assert.notEqual(latestReset, -1);
    assert.ok(latest.slice(latestReset, latestReset + 80).includes("()=>!1"));
  },
);

test(
  "source root connects the schema and dangerous-setting gate to the proxy runtime and setup",
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const settings = source("utils/settings/types.ts");
    const managedEnv = source("utils/managedEnvConstants.ts");
    const proxy = source("utils/proxy.ts");
    const retry = source("services/api/withRetry.ts");
    const setup = source("setup.ts");

    assert.ok(settings.includes("proxyAuthHelper: z"));
    assert.ok(
      settings.includes(
        "Shell command that outputs a Proxy-Authorization header value (EAP)",
      ),
    );
    assert.ok(managedEnv.includes("'proxyAuthHelper',"));
    for (const fragment of [
      "export function _setProxyAuthHelperConfig(",
      "export function getConfiguredProxyAuthHelper(",
      "export async function getProxyAuthFromHelper(",
      "export function getProxyAuthFromHelperCached(",
      "export function clearProxyAuthHelperCache(",
      "export function prefetchProxyAuthFromHelperIfSafe(",
      "export function _resetProxyAuthHelperForTesting(",
      "CLAUDE_CODE_PROXY_AUTH_HELPER_TTL_MS",
      "CLAUDE_CODE_PROXY_AUTHENTICATE",
      "headers: { 'Proxy-Authorization': proxyAuth }",
    ]) {
      assert.ok(proxy.includes(fragment), fragment);
    }
    assert.ok(
      setup.includes("(getSettings_DEPRECATED() || {}).proxyAuthHelper"),
    );
    assert.ok(setup.includes("getSettingsForSource('projectSettings')"));
    assert.ok(setup.includes("getSettingsForSource('localSettings')"));
    assert.ok(setup.includes("trustAccepted: checkHasTrustDialogAccepted"));
    assert.ok(setup.includes("prefetchProxyAuthFromHelperIfSafe()"));
    assert.ok(
      retry.includes(
        "if (error.status === 407 && getConfiguredProxyAuthHelper())",
      ),
    );
    assert.ok(retry.includes("error.headers?.get('proxy-authenticate')"));
    assert.ok(retry.includes("clearProxyAuthHelperCache("));
  },
);

test(
  "executable proxy helper enforces trust, forwards challenge context, caches, and injects the Bun header",
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const contents = source("utils/proxy.ts");
    const { proxy, state } = await executeProxyModule(contents);
    assert.deepEqual(
      await executeProxyRetry(source("services/api/withRetry.ts"), true),
      { retryable: true, challenge: "Negotiate challenge-token" },
    );
    assert.deepEqual(
      await executeProxyRetry(source("services/api/withRetry.ts"), false),
      { retryable: false, challenge: undefined },
    );
    const savedEnv = {
      enable: process.env.CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER,
      ttl: process.env.CLAUDE_CODE_PROXY_AUTH_HELPER_TTL_MS,
      httpsProxy: process.env.HTTPS_PROXY,
      unixSocket: process.env.ANTHROPIC_UNIX_SOCKET,
    };
    const savedBun = globalThis.Bun;
    const savedConsoleError = console.error;
    const errors = [];
    try {
      process.env.CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER = "1";
      process.env.CLAUDE_CODE_PROXY_AUTH_HELPER_TTL_MS = "300000";
      process.env.HTTPS_PROXY = "https://proxy.example.test:8443";
      delete process.env.ANTHROPIC_UNIX_SOCKET;
      proxy._resetProxyAuthHelperForTesting();
      proxy._setProxyAuthHelperConfig({
        helper: "/usr/local/bin/proxy-auth",
        fromProjectOrLocal: true,
        trustAccepted: () => false,
      });

      assert.equal(await proxy.getProxyAuthFromHelper(), null);
      assert.equal(state.execaCalls.length, 0);
      assert.ok(state.debug[0][0].includes("workspace trust not yet accepted"));

      state.nonInteractive = true;
      proxy.clearProxyAuthHelperCache("Negotiate challenge-token");
      assert.equal(
        await proxy.getProxyAuthFromHelper(),
        "Negotiate generated-token",
      );
      assert.equal(state.execaCalls.length, 1);
      const [helper, options] = state.execaCalls[0];
      assert.equal(helper, "/usr/local/bin/proxy-auth");
      assert.equal(options.timeout, 30_000);
      assert.equal(options.reject, false);
      assert.equal(
        options.env.CLAUDE_CODE_PROXY_URL,
        "https://proxy.example.test:8443",
      );
      assert.equal(options.env.CLAUDE_CODE_PROXY_HOST, "proxy.example.test");
      assert.equal(
        options.env.CLAUDE_CODE_PROXY_AUTHENTICATE,
        "Negotiate challenge-token",
      );

      assert.equal(
        await proxy.getProxyAuthFromHelper(),
        "Negotiate generated-token",
      );
      assert.equal(state.execaCalls.length, 1, "fresh cache avoids execution");

      globalThis.Bun = {};
      assert.deepEqual(proxy.getProxyFetchOptions().proxy, {
        url: "https://proxy.example.test:8443",
        headers: { "Proxy-Authorization": "Negotiate generated-token" },
      });

      process.env.CLAUDE_CODE_PROXY_AUTH_HELPER_TTL_MS = "0";
      state.result = {
        failed: true,
        timedOut: false,
        exitCode: 7,
        stderr: "credential broker denied the request",
        stdout: "",
      };
      console.error = (...args) => errors.push(args);
      assert.equal(
        await proxy.getProxyAuthFromHelper(),
        "Negotiate generated-token",
        "helper failure returns the stale cached value",
      );
      assert.ok(
        errors[0][0].startsWith(
          "proxyAuthHelper failed: exited 7: credential broker denied the request",
        ),
      );

      const usesTruthyGate = contents.includes(
        "!isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER)",
      );
      process.env.CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER = "true";
      assert.equal(
        proxy.getConfiguredProxyAuthHelper(),
        usesTruthyGate ? "/usr/local/bin/proxy-auth" : undefined,
      );
    } finally {
      console.error = savedConsoleError;
      if (savedBun === undefined) delete globalThis.Bun;
      else globalThis.Bun = savedBun;
      for (const [name, value] of [
        ["CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER", savedEnv.enable],
        ["CLAUDE_CODE_PROXY_AUTH_HELPER_TTL_MS", savedEnv.ttl],
        ["HTTPS_PROXY", savedEnv.httpsProxy],
        ["ANTHROPIC_UNIX_SOCKET", savedEnv.unixSocket],
      ]) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  },
);
