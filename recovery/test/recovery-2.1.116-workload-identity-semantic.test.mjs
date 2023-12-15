import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import { analyze as analyzeScopes } from 'eslint-scope'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_116_BUNDLE is not set'
      : false,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath || !baselineBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

const pinnedUnits = new Map([
  [2012, [864055, 864327, '7ebf9f475d1c82c3e24815f3173d70d56c20dc9548218788058480ab827efbf6', 'unresolved']],
  [2013, [864327, 864361, 'cd2cebcc5e709012c2cfddd25df7a3b2e2ad35c89eaa7a4514ddf784026e4218', 'unresolved']],
  [2014, [864361, 864746, 'bcd8d9cc82c46b01bcaf352625a707f152b7422e5dbc2d41f75ba802f7387637', 'unresolved']],
  [2015, [864746, 864806, '3a2a645d37d2e8be28491b50288ff092fff14835c13b536bd70538f89a689293', 'unresolved']],
  [2016, [864806, 864903, '7a055922b1dc5f93f0c97234ab6037927c4d4ed1ecd243569b45582150436051', 'unresolved']],
  [2017, [864903, 865017, '48a0237ed209f2dc5c391a72185fdb593fedf9f4af82df62b62f51e0cc24b069', 'unresolved']],
  [2018, [865017, 865250, '934ae9702ef16bef070447b0d061f275b43d5c6b321fcc32a268f1b7416ed764', 'unresolved']],
  [2019, [865250, 865344, '11384811b29fc0411fc05bdfb32a19239c23ad457fe51099c07809aac01ddb50', 'unresolved']],
  [2020, [865344, 865360, '894eae8875c69d15c279b3006101f1ab0ac91f1948d24fef07bcec77bc9bbbd3', 'moved']],
  [2021, [865360, 865544, 'b4959dbbb9517945e762e21190e5199d38f1eaf425e8f7303359778a0542932d', 'unresolved']],
  [4603, [2047615, 2047774, 'd563d3b457cafdeb49817c9f8c8725e9eb946cb22bab38bc2f1844de85d8b472', 'unresolved']],
  [4604, [2047774, 2048133, 'cbef8f6e630b664d05dc941adda1816268cd452af4aad2d8cf7edc6c464d8a8b', 'unresolved']],
  [4605, [2048133, 2051227, '812d19e6785a37008013deb8bce0526565fbc840aeebeb5ea7312bf85ca74539', 'unresolved']],
  [4606, [2051227, 2051268, 'bc10857cb82bebfe00a438f7a9385634e41f0273ee9e06d14659cedb08672d28', 'unresolved']],
  [4607, [2051268, 2051585, 'c814939995ac6ad2692f53e6ac4e0dbd8b480369f8ec676d6c4908f235b3ac5b', 'unresolved']],
  [4608, [2051585, 2051665, 'e0bdb7b5503bedb39a2fd4faa7d65fbbef0acc5c8e1496177b2b77b3cfe1b0d4', 'unresolved']],
  [4609, [2051665, 2051687, 'fee02132e06fbdb887de94cc06de9e80554da2b547f90486ba483a5c42449256', 'unresolved']],
  [4610, [2051687, 2052054, 'eb77f801ccde152fbdafeaf8554feaf1614ea36ff708b9d0c5b4d0b9a464b1d4', 'unresolved']],
  [4611, [2052054, 2052521, '38cea0ee1f94b9122f304a84a7bc75e432ed625b0ec99ed592d6953bd8329d77', 'unresolved']],
  [4612, [2052521, 2052851, 'ced92dbe5945e0c7ad79a2e08ad80e70d7a8f2d4a095bba41f7bb950812ec21f', 'unresolved']],
  [4613, [2052851, 2053535, '6392d424107cdb76b60f0ac4ef67eadf98e87aeab24746e553aaaec099c157f9', 'unresolved']],
  [4614, [2053535, 2054049, 'ef58cf4f444e1234ebf5704482e250b368e353f74337a0ebf62b28a24ceb9034', 'unresolved']],
  [4615, [2054049, 2054456, '8ce63a8fffb7802b53c89fd1d2c29e500678231dfda574041294a997b2aa48f6', 'unresolved']],
  [4616, [2054456, 2054657, '204e5ed6e4e4feaef5ef031003ca27bcbf5adc4e98980f2213efb7f930b9d655', 'unresolved']],
  [4617, [2054657, 2054877, '62bb4014bef807648dad31e043f69a353a77e0257b5789d81e1825bf86fa1779', 'unresolved']],
  [4618, [2054877, 2055986, '63597f6d5a8d43b89701e676d03050d6bae9b657d3a6061c41fae8e7c21e7b91', 'unresolved']],
  [4619, [2055986, 2056009, '8859321d8d8b0b379ed798fd7c3a4fcedf1e7766e72917be8356dc4856b76037', 'unresolved']],
  [4620, [2056009, 2057732, '3e6d30d0617bdcacc28f95dac7d77564c50510cd1a94d64294985395695f372b', 'unresolved']],
  [4621, [2057732, 2057761, '99e4db7f07e54e67d15e892cc6f21c714c598a59332114def37852258a09f04a', 'unresolved']],
  [4622, [2057761, 2058050, '93f8e0605f363301f2522edccfaa07ab1426b934281d4cc6bd5525b20028e4bc', 'unresolved']],
  [4623, [2058050, 2058248, 'b4d3a869ec59e45450d6603d4c3402e4e127e3ae985aa21dbcdbbc5e9ec199c2', 'unresolved']],
  [4624, [2058248, 2059593, '13a080193574833b41df109611fbc9e1742f52a713b33dae98e6349c5923acb3', 'unresolved']],
  [4625, [2059593, 2060030, '60f8feb20e91cab37d8a4a0c4c02b4b06d581a5e37d275286c34219e9511982b', 'unresolved']],
  [4626, [2060030, 2060516, '37c2794e936dc42ad3a13efa374177fd265815ebea890cd02a881b77ebff17e5', 'unresolved']],
  [4627, [2060516, 2060563, 'dba9edfff79bf55141b6a9035243f36cffd815098af5c68835715bd1af293ab0', 'unresolved']],
  [4628, [2060563, 2061556, '53be4c626386c8ffda02e4ddfdaa16c435c26703e7b4c732a7045c38c533087d', 'unresolved']],
  [4629, [2061556, 2061579, 'b948d11b1e074b391d3eb65f4463724919f2f741af52163e3edcae5bb0764ad0', 'unresolved']],
  [4630, [2061579, 2061590, 'b5498897ca4cac6b364f774ffc4b9f3b35c752dad1ca26644bb8dfeb53b0c6f0', 'moved']],
  [4631, [2061590, 2062006, 'ad0ba5e003d5f723ed48ffd2af8b324d32cf9fb64918db8cdca681b80bb3658a', 'unresolved']],
  [4632, [2062006, 2062639, 'eb51bb3e463f1b3f9473c065619335ac26ef45772a0ac0866058d9fa2410b404', 'unresolved']],
  [4633, [2062639, 2062901, '946e177de22b2bb82543c215bba4ba8f489fb386e59311da8e744078b92e67fb', 'unresolved']],
  [4634, [2062901, 2062938, '4b9d4e5bb76e930c5318d00354a74769d2f86a01db827b4261a8d45231014b29', 'unresolved']],
  [6039, [2739644, 2743848, '01a67363658817a3e4b753ced4a7d02033f514b6ab045b3aeb76beb0eac66e13', 'unresolved']],
  [6206, [2803864, 2804117, 'cbb1e631c7ef812fc7198568262c243d2df04060b403ce1d7e64fc396c888d47', 'unresolved']],
  [11564, [7254359, 7254838, 'e4b7134d4f6309a7e640d81b525937579e9d6b1553d77081d0ee67a60bb7d028', 'unresolved']],
  [15049, [9389095, 9392397, '8146f6360885946077867c4dd84943cd67d8b5b2352b7be26d7239b5b1686316', 'unresolved']],
  [15061, [9394110, 9394259, '7e9356367339a04b6888c014173dd0b07bd9e221d7ad6387d925b03bb27271f5', 'unresolved']],
])

const dependencyUnits = new Set(
  Array.from({ length: 29 }, (_, offset) => 4603 + offset),
)

const sdkHelperReferences = new Map([
  [
    'gj',
    {
      definition: 2_047_619,
      references: [
        2_047_619, 2_048_491, 2_048_525, 2_048_563, 2_048_640, 2_048_744,
        2_048_832, 2_049_209, 2_049_254, 2_049_304, 2_049_412, 2_049_584,
        2_049_661, 2_050_466, 2_050_553, 2_050_607, 2_050_697, 2_050_759,
        2_050_958, 2_059_907, 2_059_968,
      ],
      units: [4603, 4605, 4625],
    },
  ],
  [
    'bp',
    {
      definition: 2_047_658,
      references: [
        2_047_658, 2_055_977, 2_056_540, 2_057_537, 2_060_257, 2_060_911,
        2_061_218, 2_061_309,
      ],
      units: [4603, 4618, 4620, 4626, 4628],
    },
  ],
  [
    'qN8',
    {
      definition: 2_047_693,
      references: [2_047_693, 2_050_510, 2_050_842],
      units: [4603, 4605],
    },
  ],
  [
    'kv$',
    {
      definition: 2_047_759,
      references: [2_047_759, 2_055_447, 2_057_049],
      units: [4603, 4618, 4620],
    },
  ],
])

function targetUnitForPosition(position) {
  const region = structural.regions.find(
    candidate =>
      candidate.target.start <= position && position < candidate.target.end,
  )
  assert.ok(region, `target unit for ${position}`)
  return region.target.index
}

function countExact(sourceText, fragment) {
  return sourceText.split(fragment).length - 1
}

test(
  '2.1.116 workload-identity evidence pins the complete SDK and CLI call graph',
  bundleOptions,
  () => {
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(targetBytes.length, 13_102_272)
    assert.equal(sha256(targetBytes), targetSha256)
    const target = targetBytes.toString('utf8')

    for (const [index, [start, end, sourceHash, classification]] of pinnedUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: classification`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
    }

    assert.equal(dependencyUnits.size, 29)
    for (const index of dependencyUnits) assert.ok(pinnedUnits.has(index))
  },
)

test(
  'SDK platform-header helpers are confined to the authenticated credential graph',
  pairOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    const helperUnit = structural.regions[4603]
    assert.equal(
      target.slice(helperUnit.target.start, helperUnit.target.end),
      'var gj=(H)=>process.env[H]?.trim()||void 0,bp=()=>Math.floor(Date.now()/1000),qN8=()=>({"X-Stainless-OS":"linux","X-Stainless-Runtime":"node"}),kv$="vendored";',
    )
    for (const [fragment, [baselineCount, targetCount]] of new Map([
      ['"X-Stainless-OS"', [5, 7]],
      ['"X-Stainless-Runtime"', [5, 7]],
      ['"vendored"', [0, 1]],
    ])) {
      assert.equal(countExact(baseline, fragment), baselineCount, fragment)
      assert.equal(countExact(target, fragment), targetCount, fragment)
    }

    const program = parse(target, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      ranges: true,
      sourceType: 'module',
    })
    const scopeManager = analyzeScopes(program, {
      ecmaVersion: 2024,
      fallback: 'iteration',
      ignoreEval: true,
      impliedStrict: true,
      optimistic: false,
      sourceType: 'module',
    })
    const moduleScope = scopeManager.scopes.find(
      scope => scope.type === 'module' && scope.block === program,
    )
    assert.ok(moduleScope, 'target module scope')

    for (const [name, expected] of sdkHelperReferences) {
      const variables = moduleScope.variables.filter(
        variable => variable.name === name,
      )
      assert.equal(variables.length, 1, `${name}: one top-level binding`)
      const variable = variables[0]
      assert.deepEqual(
        variable.identifiers.map(identifier => identifier.start),
        [expected.definition],
        `${name}: definition`,
      )
      const references = variable.references.map(
        reference => reference.identifier.start,
      )
      assert.deepEqual(references, expected.references, `${name}: references`)
      const referencedUnits = [
        ...new Set(references.map(targetUnitForPosition)),
      ]
      assert.deepEqual(referencedUnits, expected.units, `${name}: owner units`)
      assert.ok(
        referencedUnits.every(index => dependencyUnits.has(index)),
        `${name}: dependency-only references`,
      )
    }
  },
)

test(
  'WIF runtime is introduced at the authenticated 2.1.114 to 2.1.116 boundary',
  pairOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(baselineBytes.length, 12_986_755)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    for (const fragment of [
      'oidc_federation',
      'getWIFTokenCache',
      'user_oauth profile detected; not supported in CC (inc-4829)',
      'incomplete config (need FEDERATION_RULE_ID + ORGANIZATION_ID)',
      'Identity token is ',
      'label:"WIF"',
    ]) {
      assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
      assert.equal(target.includes(fragment), true, `${fragment}: target`)
    }
  },
)

test(
  'source owns WIF precedence, status, credential wrapping, and token caching',
  sourceOptions,
  () => {
    const model = source('src/utils/model/model.ts')
    for (const dependencyLiteral of [
      'X-Stainless-OS',
      'X-Stainless-Runtime',
      'vendored',
    ]) {
      assert.equal(
        model.includes(dependencyLiteral),
        false,
        `model.ts does not own ${dependencyLiteral}`,
      )
    }
    assertFragments('src/constants/oauth.ts', [
      "'ANTHROPIC_FEDERATION_RULE_ID'",
      "'ANTHROPIC_ORGANIZATION_ID'",
      "'ANTHROPIC_IDENTITY_TOKEN'",
      "'ANTHROPIC_IDENTITY_TOKEN_FILE'",
      "authenticationType === 'oidc_federation'",
      "return 'credentials-file'",
      'authenticationType !== undefined',
      "return 'env-quad'",
      'incomplete config (need FEDERATION_RULE_ID + ORGANIZATION_ID)',
      'env-quad · org ${maskWIFIdentifier(organizationId)} · rule',
      'credentials-file · profile',
      "return 'inactive'",
    ])
    const wrapper = assertFragments('src/utils/workloadIdentity.ts', [
      "loadConfig()",
      "authentication.type === 'user_oauth'",
      'user_oauth profile detected; not supported in CC (inc-4829)',
      "process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'",
      "getProxyFetchOptions({ forAnthropicAPI: true })",
      'onSafetyWarning:',
      'onCacheWriteError:',
      'new TokenCache(',
      'if (error instanceof WorkloadIdentityError) throw error',
      'new WorkloadIdentityError(',
      'credentialsPromise = undefined',
      'tokenCachePromise = undefined',
    ])
    assert.ok(
      wrapper.indexOf("authentication.type === 'user_oauth'") <
        wrapper.indexOf('return defaultCredentials({'),
    )
  },
)

test(
  'source threads WIF through direct API, utility auth, status, and retries',
  sourceOptions,
  () => {
    const client = assertFragments('src/services/api/client.ts', [
      'const resolvedApiKey = apiKey || getAnthropicApiKey()',
      '!isClaudeAISubscriber() && !resolvedApiKey && isWIFActive()',
      'const tokenCache = await getWIFTokenCache()',
      'authToken: await tokenCache.getToken()',
      'credentials?.baseURL ?? process.env.ANTHROPIC_BASE_URL',
      'defaultHeaders: headersWithoutAuthorization',
    ])
    assert.ok(
      client.indexOf('!isClaudeAISubscriber() &&') <
        client.indexOf('// Determine authentication method'),
    )

    assertFragments('src/utils/http.ts', [
      'export async function getAuthHeadersWithWIF',
      '!getAnthropicApiKey()',
      "await import('./workloadIdentity.js')",
      'Authorization: `Bearer ${await tokenCache.getToken()}`',
      "'anthropic-beta': OAUTH_BETA_HEADER",
      'return getAuthHeaders()',
    ])
    assertFragments('src/services/api/metricsOptOut.ts', [
      'await getAuthHeadersWithWIF()',
    ])
    assertFragments('src/services/api/firstTokenDate.ts', [
      'await getAuthHeadersWithWIF()',
    ])
    assertFragments('src/utils/status.tsx', [
      'if (isWIFActive())',
      "label: 'WIF'",
      'value: getWIFStatusLine()',
    ])
    assertFragments('src/services/api/withRetry.ts', [
      '!getAnthropicApiKey() &&',
      ';(await getWIFTokenCache())?.invalidate()',
      'async function handleWIFCredentialError',
      'error instanceof WorkloadIdentityError',
      'error.statusCode === null',
      'error.statusCode === 401',
      'error.statusCode >= 500',
      '(await handleWIFCredentialError(error))',
    ])
  },
)

test('WIF precedence blocks env fallback for an explicit non-federated profile', () => {
  function precedence(config, env) {
    if (config !== null) {
      const authenticationType = config?.authentication?.type
      if (authenticationType === 'oidc_federation') return 'credentials-file'
      if (authenticationType !== undefined) return null
    }
    if (
      [
        'ANTHROPIC_FEDERATION_RULE_ID',
        'ANTHROPIC_ORGANIZATION_ID',
        'ANTHROPIC_IDENTITY_TOKEN',
        'ANTHROPIC_IDENTITY_TOKEN_FILE',
      ].some(name => env[name]?.trim())
    ) {
      return 'env-quad'
    }
    return null
  }

  assert.equal(
    precedence(
      { authentication: { type: 'user_oauth' } },
      { ANTHROPIC_FEDERATION_RULE_ID: 'rule' },
    ),
    null,
  )
  assert.equal(
    precedence(
      { authentication: { type: 'oidc_federation' } },
      {},
    ),
    'credentials-file',
  )
  assert.equal(
    precedence(null, { ANTHROPIC_IDENTITY_TOKEN_FILE: '/token' }),
    'env-quad',
  )
  assert.equal(precedence(null, {}), null)
})
