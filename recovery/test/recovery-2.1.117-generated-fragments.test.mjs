import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'

const BASELINE_SHA256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'
const TARGET_SHA256 =
  '518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661'

// Each fragment is byte-exact authenticated generated code. Equal counts are
// explicitly inherited observations; target-only counts authenticate adjacent
// 2.1.117 behavior even when the readable source localization is larger.
export const FRAGMENTS = [
  ['byte watchdog diagnostic', '[byte-watchdog] firing: idle=', 0, 1, 'b6adf577692a3da702d4fe50826a4c4f84d1cd3565a1839b2520a9a1286c4cd8', 'adjacent-target-only'],
  ['byte watchdog event', 'cli_byte_watchdog_fired', 0, 1, 'ecc7263ad3dc90f232e791e366b82270fda6b5122cf14c60560f7d03fb997ae8', 'adjacent-target-only'],
  ['path traversal hardening', "Path contains '..' traversal after a directory segment, which may follow a symlink outside the working directory", 0, 1, '527db53eded7e885a4d7789931415e3f344b7f693603af6a2d65dbbd2e9bab8a', 'adjacent-target-only'],
  ['broken symlink handling', 'copyDir: skipping broken symlink', 0, 1, 'd4013db4f8dbaa6f3298515cd632bc35b63f661f3895c5a08d905ca62120d070', 'adjacent-target-only'],
  ['escaping symlink handling', 'copyDir: skipping symlink escaping source tree:', 0, 1, 'f889bc4eed17244d30821382a9ca893cc9554dd6e5d75141e560f77a6669b5eb', 'adjacent-target-only'],
  ['version path safety', 'contains path-unsafe characters', 0, 1, '0460e215731f84595ffcb686bd871296a534225b009faf273c51c1097ffa3628', 'adjacent-target-only'],
  ['sha option safety', 'cannot start with "-"', 0, 3, '0b7a9c863d58e7d773732e73284119d61df59c02130127a8a166d74c273c6d6c', 'adjacent-target-only'],
  ['ref option safety', 'refs cannot start with "-"', 0, 1, '5a6b4f46bf621d199cf8e05f53a613f538468f247578bdb2e6ad2227b4d82db8', 'adjacent-target-only'],
  ['cd multi-positional denial', 'cd with two or more directory arguments requires manual approval.', 0, 1, 'e557557e94777bd04e275f2dec7c734695e702f1319d282fbbaf0942100416f6', 'adjacent-target-only'],
  ['SDK OAuth refresh protocol', 'oauth_token_refresh', 22, 22, '2e27e4244f2e905f73ef744bf34cfbe0f6dd57f3c8a5ec5f4c4ee187bc7d83d2', 'inherited-source-localization-gap'],
  ['SDK OAuth refresh callback recovery', 'tengu_oauth_401_sdk_callback_refreshed', 1, 1, '63feb2a260109ee991929abcfe1ade4ebdf477b3090766e89f7bbbcfc3e28fb8', 'inherited-source-localization-gap'],
  ['autocompact experiment', 'tengu_amber_redwood2', 0, 1, '115ae69d5d40e8179daa9cce186e41dd551544d86725812910475b7e6e25f259', 'adjacent-target-only'],
  ['autocompact hint', 'compacted at the auto window', 0, 1, 'f95c5ea4cf970ac97b97b46b365019cb6d43434945fd97b692ab74ec1a679df6', 'adjacent-target-only'],
  ['cron session ownership', 'createdBySessionId', 0, 7, 'd7b533c3ded44108e460ea5f6728be1b2c53311a89dfe88dbfe9640d6a77d437', 'adjacent-target-only'],
  ['cron pid ownership', 'createdByPid', 0, 8, '71c6d27242ddba788d054fb33f52ca739534c6fabceb9bc6455e32abc40644c6', 'adjacent-target-only'],
  ['one-time routines', 'run_once_at', 0, 7, 'cce3fea49a9745e3914abbf37e89342f9c456d466337eafbe13696934ab74e4e', 'adjacent-target-only'],
  ['routines link', '/code/routines', 0, 3, 'c326be27457c86871b2ed99b5396d875a4684aaf56b186121baaff1e010dfd2f', 'adjacent-target-only'],
  ['ultrareview guide', 'If the user asks about "ultrareview"', 0, 1, 'c9e933eef23b7cd7500048a707681650f51f42f149af0a8fef3cc7cc865497ab', 'adjacent-target-only'],
  ['remote inference configuration', 'Model and effort switching in remote sessions is coming soon', 0, 1, 'b8c63fbd5e4c7605e450aebbac630f40386bf11095859fb9e81b619e8e8a6d49', 'adjacent-target-only'],
  ['remote rewind', 'Rewind is not yet available in remote sessions', 0, 1, '7bde012415b28059d97f729b99ceffa73040388e11bd813ba6ded6b8260af6b4', 'adjacent-target-only'],
  ['remote context request', 'get_context_usage', 2, 3, 'c93041c5bbbed0e18d40194bedf25774b795a6b5767883aad52badc74666530b', 'adjacent-target-only'],
  ['remote file suggestions', 'remote file_suggestions RPC failed', 0, 1, '76260c6f12553f42df475b46b72e30794f53b40d7941459c0855f417776edf50', 'adjacent-target-only'],
  ['archived remote attach', 'is archived and cannot accept new messages.', 0, 1, '232af2149b89b6c2668a6c7dcd301c04356641048f26483a08ef203ac475c761', 'adjacent-target-only'],
  ['background job agent', 'This session is a background job.', 0, 1, '927ebd92c4dbd4452fae8a0633aa07adfb9cd4af3e7c5bc5d492cdf21f3c1762', 'generated-only-new-internal-module'],
  ['skill url template metadata', 'urlTemplate', 0, 1, '009d55e9d06e6a28fff81acab99c4604b25449565b751fff4e58963ee72e60bf', 'adjacent-target-only'],
  ['advisor gate', 'tengu_advisor', 6, 7, '3fc952a125b256b6f1d3edd740253aca0725e36aa95131b827ffa69e15ce6df3', 'adjacent-target-only'],
  ['plugin reconnect key', 'pluginReconnectKey', 7, 7, '4ff2f879351f383be335dd6b75410322d91bb1c091f2b060fd211bdbfa8e8c4e', 'inherited-observation'],
  ['model deprecation remap', 'has been updated to ${$.remappedTo}.', 0, 1, '4e5f43817eed6b44226509aec78e883a115f6b6d44a6cbf70baab2b276e88792', 'adjacent-target-only'],
  ['generated fork module', String.raw`Usage: /fork \\<directive\\>`, 0, 1, 'e48f9e1ee9cf0a5be95e5eb6846e81f3173a6185cb0e1d80852f6edabc93c84a', 'inherited-generated-feature-module'],
  ['active agent MCP heading', 'Active agent MCPs', 0, 1, 'c29387f7dec6e7fbd13551af1a8fad33bcad8d3783609f3240c760eb46985ad7', 'adjacent-target-only'],
  ['ultrathink turn notice', 'Deeper reasoning requested for this turn', 0, 1, 'ab43b85e4de923fc6a6b78b34efd04da470910131af815aab633355b1c851101', 'adjacent-target-only'],
  ['agent MCP scope label', 'Agent config (from agent frontmatter)', 0, 1, '97be6cd053db3af5024c77e34f25189e238a9d8f6f99ab8ba26e0401d632a4a0', 'adjacent-target-only'],
  ['thin-client command metadata', 'thinClientDispatch', 0, 9, 'eb3d731be431a82832cf13ac5acb72840eb3acf1fceaff7acc11c4d74605e815', 'adjacent-target-only'],
  ['thin-client post-text mode', 'post-text', 0, 6, 'cefb26654c57311fb526830269bacadb2a1ef05684c8fea4117e2c1e19432e96', 'adjacent-target-only'],
  ['autocompact command removal', 'name:"autocompact"', 2, 0, '2ef772d270f355aa7527e967ad2b2c76fbe0aa22fde830116438fcba62037f83', 'adjacent-target-removal'],
  ['workspace command requirements', 'requires:{workspace:!0}', 0, 3, 'fe17f7f398750772094047e52f7ef9824b15cdfefdd07e968ae968400d9c096b', 'adjacent-target-only'],
  ['routine connector heading', 'Connected connectors (available for routines):', 0, 1, 'c2471b3a89690081851c1b194a8632a3e1f731a239bce2c5e1b664849c4ad21f', 'adjacent-target-only'],
  ['Ink-only command requirements', 'requires:{ink:!0}', 0, 20, '34de74fec95cf0b99846c26f62b398c1bf6d8897d2eb42a0b7185d3bc9e83966', 'adjacent-target-only'],
  ['workspace-free stickers command', 'requires:{}', 0, 1, 'c13c880ae69a2bc6517c3bc877140e5cdf1ad150c8ed1eedeaf6373b13432754', 'adjacent-target-only'],
  ['files command initializer removal', 'name:"files"', 2, 1, '9cc1f051f02abdfb340ad4e07b30a6635649434d862abe70c480200d3620649f', 'adjacent-target-removal'],
  ['termio insert-lines edit', 'type:"edit",action:{type:"insertLines"', 0, 1, 'f61f1d62a2d8c9f2ed2c5e317b2cb85dfb97883a8acd0a3cd81cf2828c25c6b3', 'adjacent-target-only'],
  ['termio delete-lines edit', 'type:"edit",action:{type:"deleteLines"', 0, 1, '84aceea41f35e21ff4a13e66d9d766fa38212f1b9b844840f9ed5932f18754b9', 'adjacent-target-only'],
  ['termio index scroll', 'type:"scroll",action:{type:"index"', 0, 1, '2342285246c9d13d7ddc6e555138030db08104b698421fdb56501e9892ca90ab', 'adjacent-target-only'],
  ['termio reverse-index scroll', 'type:"scroll",action:{type:"reverseIndex"', 0, 1, '645160e592d03797a7caf33c7fbff845eba3ce5cd6762dc60372507c7c24d3f9', 'adjacent-target-only'],
]

function loadBundle(environmentName, expectedBytes, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count++
    offset += fragment.length
  }
  return count
}

test('authenticated 2.1.116 and 2.1.117 generated fragments are exact', () => {
  const baseline = loadBundle(
    'CLAUDE_CODE_2_1_116_BUNDLE',
    13_102_272,
    BASELINE_SHA256,
  )
  const target = loadBundle(
    'CLAUDE_CODE_2_1_117_BUNDLE',
    13_114_118,
    TARGET_SHA256,
  )

  for (const [name, fragment, baselineCount, targetCount, fragmentSha256] of FRAGMENTS) {
    assert.equal(
      crypto.createHash('sha256').update(fragment).digest('hex'),
      fragmentSha256,
      `${name}: fragment hash`,
    )
    assert.equal(occurrences(baseline, fragment), baselineCount, `${name}: baseline`)
    assert.equal(occurrences(target, fragment), targetCount, `${name}: target`)
  }
})
