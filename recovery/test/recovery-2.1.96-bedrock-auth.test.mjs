import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_94_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564'
const TARGET_BUNDLE_SHA256 =
  '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e'

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

function between(bundle, start, end) {
  const startOffset = bundle.indexOf(start)
  assert.notEqual(startOffset, -1, `missing start delimiter: ${start}`)
  const endOffset = bundle.indexOf(end, startOffset)
  assert.notEqual(endOffset, -1, `missing end delimiter: ${end}`)
  return bundle.slice(startOffset, endOffset)
}

test('recovers case-insensitive Authorization extraction and Bedrock API-key precedence', () => {
  const source = fs.readFileSync(
    `${sourceRoot}services/api/client.ts`,
    'utf8',
  )

  assert.match(
    source,
    /function extractAuthorizationHeader\([\s\S]*?name\.toLowerCase\(\) === 'authorization'[\s\S]*?return \{ value, rest \}/,
  )
  assert.match(
    source,
    /const bedrockApiKey = process\.env\.AWS_BEARER_TOKEN_BEDROCK[\s\S]*?\? `Bearer \$\{process\.env\.AWS_BEARER_TOKEN_BEDROCK\}`[\s\S]*?: skipAuth[\s\S]*?\? authorizationHeader/,
  )
  assert.match(source, /skipAuth &&[\s\S]*?!bedrockApiKey && \{[\s\S]*?skipAuth: true/)
  assert.match(
    source,
    /apiKey:[\s\S]*?bedrockApiKey\.match\(\/\^Bearer \(\.\+\)\$\/i\)\?\.\[1\] \?\? bedrockApiKey/,
  )
  assert.match(
    source,
    /defaultHeaders: \{[\s\S]*?\.\.\.headersWithoutAuthorization,[\s\S]*?Authorization: bedrockApiKey/,
  )
  assert.doesNotMatch(source, /bedrockArgs\.skipAuth = true/)
})

test('published main client passes bearer credentials through apiKey without duplicate Authorization headers', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_94_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_96_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )

  const targetClient = between(
    target,
    'if(P==="bedrock"){let{AnthropicBedrock:D}=',
    'if(P==="foundry"){',
  )
  assert.match(
    targetClient,
    /apiKey:v\.match\(\/\^Bearer \(\.\+\)\$\/i\)\?\.\[1\]\?\?v/,
  )
  assert.match(
    targetClient,
    /defaultHeaders:\{\.\.\.Z\.rest,Authorization:v\}/,
  )
  assert.match(targetClient, /\.\.\.G&&!v&&\{skipAuth:!0\}/)

  assert.equal(
    baseline.includes(
      'function pq_(q){let K={},_;for(let[z,Y]of Object.entries(q))if(z.toLowerCase()==="authorization")_=Y;else K[z]=Y;return{value:_,rest:K}}',
    ),
    false,
  )
  assert.equal(
    target.includes(
      'function pq_(q){let K={},_;for(let[z,Y]of Object.entries(q))if(z.toLowerCase()==="authorization")_=Y;else K[z]=Y;return{value:_,rest:K}}',
    ),
    true,
  )
})

test('published onboarding and model-upgrade probes use the Bedrock apiKey option', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_94_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_96_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )

  assert.equal(
    baseline.includes(
      'case"bearer":return new K({...z,skipAuth:!0,defaultHeaders:{Authorization:`Bearer ${Y.token}`}})',
    ),
    true,
  )
  assert.equal(
    target.includes('case"bearer":return new K({...z,apiKey:Y.token})'),
    true,
  )
  assert.equal(
    baseline.includes(
      'A=new _({...O,skipAuth:!0,defaultHeaders:{Authorization:`Bearer ${process.env.AWS_BEARER_TOKEN_BEDROCK}`}})',
    ),
    true,
  )
  assert.equal(
    target.includes(
      'A=new _({...O,apiKey:process.env.AWS_BEARER_TOKEN_BEDROCK})',
    ),
    true,
  )
})
