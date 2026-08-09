import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'

const BASELINE_SHA256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const TARGET_SHA256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

// These are deliberately exact generated-code fragments. Symbol-bearing
// entries pin the authenticated minifier output; stable literals pin behavior
// that is intentionally localized into readable source. Equal baseline/target
// counts identify inherited source-localization gaps, not adjacent deltas.
const FRAGMENTS = [
  ['mcp deferred templates', 'tengu_mcp_resource_templates_fetched', 0, 1, '9528213f735766d633aaaccd353cda623fa602ce03d86ca53bca7840f03196d6'],
  ['config enum value search', 'if(oH.type==="enum")return oH.options.some((m$)=>m$.toLowerCase().includes(TH));return!1', 0, 1, 'd664bee584f9a6510fdd6869c0458bcb9c5b6de2d2f1785bc4caef9e94a43df8'],
  ['GitHub rate-limit hint', 'GitHub API rate limit exceeded (5,000/hr shared across all tools and agents).', 0, 1, 'e348d760baa3e825cdbe1610d6c1900e63f4d015f769aab6e550eb11a34e08e0'],
  ['usage fallback conversion', 'resets_at:new Date(q.resets_at*1000).toISOString()', 0, 1, '75870ce2aa9d674eec68dd6ce525e90bfe882c319fe4e50e3ccfdbd6780228fc'],
  ['usage contributors inherited UI', "What's contributing to your limits usage?", 1, 1, '471c6e7c5d2c937989b0bbcde1f6511d12162bcb859dd5bd91ba14db5ae522ca'],
  ['large fd scanner', `function Vp1(H,$,q,K,_){let Y=Buffer.from('{"type":"attribution-snapshot"'),O=Buffer.from('{"parentUuid":'),M=Buffer.from('"parentUuid":'),w=Buffer.from('"uuid":"'),D=Buffer.from('","timestamp":"'),j=Buffer.from('"isSidechain":true'),J=Buffer.from('"compact_boundary"')`, 0, 1, '680cc1c2f1a70ffcdd323b7a3dd5c00f6cd85c888080ec123b6c7fb40c0bf456'],
  ['resume non-ENOENT rethrow', '}catch(h){if(!b7(h))throw zH(h),h}return R(Nl7(q));', 0, 1, 'a2e4f598272db0fc2af282342c4fb4a684889308eed845c35cdde0fbbaaa8b35'],
  ['main-thread agent hooks', 'mainThreadAgentHooks', 0, 3, '58c2552a1d11cedb959944163ef934e1ede335303ee9f858ccca5191468bd221'],
  ['command no-match UI', 'No commands match "', 0, 1, '72ae1f2a51677fd56d34acad049b3f45cc4fecd2e9516930678cb313c4e7c038'],
  ['dangerous path reason', 'decisionReason:{type:"safetyCheck"', 3, 4, '8f078683176b23d5cff8311a3f5a3094f47ad5357746252994b2e9ed77402fee'],
  ['dangerous path classifier gate', 'classifierApprovable:!1', 1, 2, 'a050a1080cc8c4539ed8a0b1ae61f9dff0216354d9b3daaea0fbe98d95290d75'],
  ['undo ctrl-minus', 'ctrl+-', 0, 1, 'cc34804621341ae8f4645dbad0a85564435090d852037f3ab598ef28a514cb82'],
  ['undo ctrl-shift-underscore', 'ctrl+shift+_', 0, 1, '7968fd7e24b128a9642f0e9a00d7433cc33011c3a3b85070ad6fa628d02b5a76'],
  ['Cmd and Super arrows', 'case"left":if(WH.superKey)return S.startOfLine();if(WH.ctrl||WH.meta||WH.fn)return S.prevWord();if(A&&!WH.shift&&S.text===""){if(f)e();else A();return S}return S.left();case"right":if(WH.superKey)return S.endOfLine()', 0, 1, '8a03482690713b935a78391b175566055e49deecb705c7cfa4a657ccb30e74f0'],
  ['process-group suspend', 'SIGTSTP', 2, 3, 'f58507cce6fcc6c0d81b0b9c0f880fde473bbb9971da83f8242cbe0c7bb4750d'],
  ['terminal scrolling setup', 'For smoother scrolling', 0, 1, '99954ec55d1b12ac84d204a3f9d0d0db3f34c151d56bbd4e13593ae99258e6f1'],
  ['plugin dependency autoupdate', 'autoupdate dep-resolution', 0, 1, '4788b06db901db70f4236d7d5869cf569f8ee87642ce695a652025d0cfe110be'],
  ['plugin Installed-row dedupe', 'Y=new Set;for(let M of H)if(dv1(M))z("attention",M),Y.add(M.id);for(let M of H)if(q.has(M.id)&&!Y.has(M.id))z("favorites",M),Y.add(M.id);for(let M of H)if(!MS7(M)&&!Y.has(M.id))z("main",M);else f=!0', 0, 1, 'b64e84e9703f61d9b8fde53dfa3bfe62dfd1ea9c7209d4715afa0feb8fcd4749'],
  ['plugin categorized rows inherited', 'kind:"section-header"', 1, 1, '7bdbb4ee17af0ccd90c5b0566dfc7c0ffb33cff69a430205fe7b7dba49c50aa7'],
  ['plugin modal pagination inherited', 'Math.max(8,G-10)', 1, 1, 'b0f32da397ce754a28ce9caf37bbe6727c9990ceb22e429af98383e6f53f36b5'],
  ['cache TTL threading', 'cache_control:vn({ttl:K})', 0, 4, '523b405552ff6a21188d1379cf2309e2cd4620089f27b9a11705c5b869bb38c0'],
  ['branch streaming', 'let z;try{z=Re$.createReadStream(f,{encoding:"utf8"}),await I36.once(z,"open")}catch(P){if(i8(P))throw Error("No conversation to branch");throw zH(P),P}', 0, 1, '9d5c4bc39f9711349cab67d0240e74e6d1ae78a61c75cf6e8a5479bc264d212f'],
  ['short-modal height budget', 'YK=8+(Lq?1:0),VK=2,W_=Math.max(1,Math.floor(($-YK-VK)/3))', 0, 1, 'c8ec50b9a64423ec041f09350586a6434ac1d56d0414b930650a999ca67cdcda'],
  ['visible-tail reset', 'let f=K?0:Math.min(_,Math.max(0,H.screen.height-H.viewport.height+1)),z=new BB8({x:0,y:f},H.viewport.width);return z7K(z,H,f,H.screen.height,q),[{type:"clearTerminal",reason:$,altScreen:K,debug:A},...z.diff]', 0, 1, '779d3c31f7c12b640f5ecf1bc5713f1a6228cdd4d077b4e49285eae4f0ef42cd'],
  ['Indic wide-cell tails', 'let z=K>=3||K===2&&Ua_($.char);if(z&&_+1<A)f.push({type:"cursorTo",col:_+2}),f.push({type:"stdout",content:" ".repeat(K-1)}),f.push({type:"cursorTo",col:_+1})', 0, 1, 'eef1c5453de4a2bff728b2d8df4d8179eec8871ba4426a7a649a7b715f3520d6'],
  ['MCP stale-client merge', 'if(K$.name in bH||!IH.mcp.clients.some((cH)=>cH.type==="connected"&&cH.client===K$.client))continue;bH={...bH,[K$.name]:D$}', 0, 1, '98b017441a3a90ee8c3e0a835687cee8c0a6cec988cf1c158ba1d35393812fad'],
  ['stable relaunch cwd', 'session was resumed from a different project directory', 0, 1, '73d88f4471cf2e173f3a828ad9f5ce6e124e4c141f7d74b2df32fe207b2f5eb5'],
  ['doctor immediate command', 'settings",isEnabled:()=>!yH(process.env.DISABLE_DOCTOR_COMMAND),type:"local-jsx",immediate:!0,load', 0, 1, '7b21c8a29bf92be34a804619fdd34cf2bc8601d38b95339daf141e6d387ad382'],
  ['resume error surface inherited string', 'Failed to load conversation', 2, 2, 'a7367485803ad4dec1313d5bd4da673c7da20fed8adae72e9a1ca61fb2c6d345'],
  ['large scanner boundary vocabulary inherited', 'compact_boundary', 28, 28, '851321d0b611c9ff80c26f524476047befd0c92a563ddc831c64743db37f27bf'],
  ['thinking 15s milestone', 'still thinking', 0, 1, '4dc1e12a512cf559ca89e9cec8d31d9757f28c3920bf3fb5f4cdb8920a689a0f'],
  ['thinking 60s milestone', 'almost done thinking', 0, 1, 'a91a5f48f1574234ba92a4e91be82683f4e2ccdf157cb97469a077dd9cb1bf39'],
  ['Ink update autofocus', 'if(_?.autoFocus===!0)pc(H).handleAutoFocus(H);', 0, 1, '5d1b799a58ce2d316e04d4514cec2007768166de72defb80d68a031dd1ed33f9'],
  ['terminal JSON safety', "settings.json isn't a JSON object", 0, 1, '9253a7f0f9e0fbb352543ed76abbcfd24a4412429af51479e3a666818d519602'],
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

test('authenticated 2.1.114 and 2.1.116 generated fragments are exact', () => {
  const baseline = loadBundle(
    'CLAUDE_CODE_2_1_114_BUNDLE',
    12_986_755,
    BASELINE_SHA256,
  )
  const target = loadBundle(
    'CLAUDE_CODE_2_1_116_BUNDLE',
    13_102_272,
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
