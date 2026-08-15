#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

// This helper replays the eight authenticated Target111 evidence gaps on top
// of the raw Target111 tree plus its pinned semantic-supplement patch.
// Every selective edit is an exact, single-anchor replacement. The prompt
// cache detector is the one temporally safe whole-owner recovery and is
// embedded below; replay never reads another checkout or a /tmp/current tree.

const OWNER_HASHES = {
  'src/tools/BashTool/bashPermissions.ts': {
    before: '5c90be6e40d69409b9bc56ba5ffce0f54e7ab09a2184a09c51683359b82485f6',
    after: '6605406500508623fead8f41fb7454adf805af66bc5978c5abf99c25df997a5c',
  },
  'src/components/HelpV2/HelpV2.tsx': {
    before: '7cf1fa1ed52ad749d21811bebf99af51d282618804093ffbf0d849bd0b0a98d4',
    // The generated source-map payload is deliberately left at its historical
    // baseline bytes; only the bounded executable owner body is recovered.
    after: 'e3b7ca3f03447ab4221d262eb585ac5b85d726665b03eae63d00caf5d33f155e',
  },
  'src/services/mcp/client.ts': {
    before: '481f27701bf4cc59c3a5e3c8f0e2c62751e6e75019744a94dabeaec75ae31a57',
    after: '1476df25939fc762475b315c817033674ac8eb0685d7fdf7675f7fe181826b0b',
  },
  'src/services/api/promptCacheBreakDetection.ts': {
    before: 'bebdc028df79cb8df8e8ff715e0b02421db929f0a309c8af987574546513b2fe',
    after: 'dcd425e711419cb47910900d84ca75dbf6174148bd8614b32bfd89119235379f',
  },
  'src/services/api/claude.ts': {
    before: 'd6c2a9921980a47f753624d95ec0eb69287230a3fb2c139ee0a26f6de8e9c4ef',
    after: '337901d26771fc2de00cf3151ba0127e879f54306567525730fce71e70154119',
  },
  'src/entrypoints/sdk/coreSchemas.ts': {
    before: '82c3611591774b5f4c5a90563e8127426cd0eedca9e874e9c5f718c4ef59cf7d',
    after: '935723162394d610c65fc3ff2001eb7ba2df336eca9bcf5dd4b6a1478e6e023d',
  },
  'src/cli/print.ts': {
    before: '22c4748a75bc0304b1a0057f4dd01b069538897b06801c919fcb72a45543bc81',
    after: 'effa1e66824d57a3bbaf6c272d5ddee1ee1c31351de27341668594367a2bcc61',
  },
  'src/screens/Doctor.tsx': {
    before: '5406e0fcb70fef030ea3af06717d13416c032075ead8828cf4347ee673ab80ca',
    // As with HelpV2, retain the baseline generated source-map payload.
    after: '5c25be37bece84f54e7ae8a3533829c6447f987e1e5cc99c74e9c47985cca632',
  },
  'src/commands/review/UltrareviewOverageDialog.tsx': {
    before: '4c2595c75a85fc6901822b5a04ead3c3ced832295766a5fa19176de813336849',
    after: '3682bee2784a0d049acc2e44c9a1a6c316756f279a0b17dad6b462f645f2dc1c',
  },
}

const PROMPT_CACHE_SOURCE_GZIP_BASE64 =
  'H4sIAAAAAAACA8RbbXPbRpL+rl8xqfKFgE1BkrNJ9pTIWr3Qsc7Wy4r0JlteFQ0SQxIWCDAYQBKl6Oo+7Q+42l+YX3LdPe8gKDu1H25rd01heho9PT3dT/c00vmiKCtWLRecPbBDXsWDosje52mRs0c2KYs56/wlzqtZWSzS8WacbonkeqvkoqjLMRdbI5ixNedCxFP4S/+I5p9EZyP1eA/4XXWYFePri7iM51/EPM0TfufxemDjkscVv4ir8czwSNLJxCEBiuR1mvH+Mh8bmonLZH6dpGWX3ZZpxZHSodpawI9UcJf8U5FabSziauaM3ZuB+yJxnk951QdtgB5PEkMiyvHWqCgqUZXxYktUsJJoVVMHU55XjVk4BApJRAv9qdR6C73aj8jTYFZMXxflMR/V02maT71pdZVmYivBMX9S8mn08k0sZi3UM3i88oZeWRZlCzEM+bSgp6MsrhM+4PPFcdo2Z8FL2BFUpdiawG6Jpaj43GfzSRR5vyphPelk2cJDZMXtOTCKK2Tjz01FL78ZlHU1a5vJ85v3+MOfc3R+evF+0Lscvu/3hqdHF8N+7/Jv8OfZwWmvhcm4mC/qipfvBcff8yJv2ce/1rxc9sn2DYso2oL/jkHmCg6K2PrV0ngCbTDJ5SCPs2WVjsUpHMwkruLhyRDkOnl90jseDt6c9Ifw37PzwfDo/Lg3PL8cvj5517s4GLzpd4EFbtwNGF93w3l/rFmq84iv3ZjU+RhVSfsXj2f8EE7d9TEcRDiasyDcZYJ2gyQj8dl4FpeC7bFOPBonfDKdpZ+us3leLH4tRVXf3N4t77d3Xn7zp2+/+/7P/9lBaXjFRD2ZpHc4C59MwKYCfJzCk+0f4J8f2Z/gnxcvQnoR0/Qv9uTrPpyCNNEkK4oyoJ9lnCfFPAjZc0kQZTyfVrPwCmY/wv9KXtVlTic+aJpmEHbZxzEudnOEq9189iBf9xihB/oYbjxubNAuXJT8Ji1q0ccTDqKibNJq8Qztsryej3iJewbOVjSebT1/zuioFRM1iY3Qbwr288ngDSMBhqDSqiwyluZVPK4idoQOkQsmxsWCbw0G79gkSxcCdfKcsWCaFaM4+/2f/yrKaZftzODXt/OQVbO4oo1a0B4eKaZwTMABSguwYkfs+RZupkPZspqzGJyO3v0PV2o9F7zcxFGQb8bnMSOfwdBceALTWA6z2O0sBaeOZB3BEi7GIBfZGOxUPuWJWsztjOdE1Sde4kiOslFdsThJeLJX8nlxA/9us+D77/8D9Ujvpk0TbEGyIqfDv7KX2y+/29z+ZvPlyzCSjhfj31b/Os0y/MU4rC1hyRIkTMcsRgo6wWBHLEtFJZRagCvSo0Zw/Zd8XJTJj1INXaWiV8YMQObyqKjzytHevEh4pjWHxh6L6hSe7TIIGRmPc6XLDi5mOIItSjrsN/AyxHGIcWtR0ZO8yHmH/f4//5JGIDUGTkqaG4tLrhSQpGAvN7zkyZbSmVqNtBcyCvCqYMTTpSMZStEHt4NKBzfDZhBweUnqcDdVzIpbtamSAiSBd8lNarwQ+ayazcHrt8NTdFSHvcHB8E3v4Lh3yRYAEHgOPhIXCO+os4SBR5PbK82TxflyXphlBgLc1/VyE0wpo3OSwLlhYzrbUSVg5wdlPL6WUoM6MIRUwAWOthIvrqsC9+IAnN7Nyo6cwxwMwBTQSedfIBsLeJZO01GapdUSYpCSVQsoJHjYBJ4jACggr2S3M6NdgRP+BWKn4r0AfSr5XLFTYRm5zym+HPNFNdtvuCSi3uRJWqFbd/f9/2NDiGtyetTLUT1Jc0cuAUNmYF2MTyYYHwOI4uz3f/4vK8ijCPpNBw4czSSuswre+VMBTg8casGKuoJwjU52kk6VzBB6DFQdAhUvIS5Gkv8QD1GZgvBSOvn0b3FW88ax0Y4dYkvvDk7WYZEsCRALiEmov7Fy5EfvDt6D4VOY7v0yuDwYHp4f/x1E0G5wVRjlJ7VH4pp/w0uP4yxr+p4FzxMQUrpSOIcX3t/gU/I6y5AOAhsZwiVs/aC45rnQXCwRuQcI0uR25EYxcJ5lgSgIohXYdp4IFcjQoNDbQ1QnZCbtjDC8PhK34IsBDEzB8uZwwLIlS2DhpK1qlsKWCVjrgo/BH4GnLSAKSNNzTeVYv0CtzDUYhZK165bLIR8ETp1SlieG3hF+8MdGdZol6AfRNjFUclQ2bPDeK20NBin4inahwgU5dBXdXHlXY5+3GrTqluc6nLQMuSG9ZbglGLRQkQdvea5dZ8tQIf3SOongeLcMybPVNqDtvU0pKjF9AyGqKNsoJimgUPVcJVQnCHfdQwLGr4aa54dCGsb/5oCKcm1DFgmAcVZxGzc/Ijq8/AGFjwbWLrxhlJtstSlBzm9bnyt+NAZKSMcN23fHpf3TChoHRGHg0wasgZc2HyHpT08iDpj0NAGp7HAFRCiVrQ7gK3utXhpe1T5ApxqR/WdPtsx3Fm4ScKgTuz18ATuNFwYbesnCqyDcwAQH3IsAW+UJPX1XQKBNYO4kzgR3CSBnrJHphaxaRKUMfMBFS+ExkuYB9PdAiQg1gIXdR1IUyG/or2L0CZxpoBIqJ225j+T+SkIve2kOrWYJbZNVsnAfxWUZLwMriKJpgGojtCOxw9dO8py25b6G0LjwtZQroL25GIXdfU26EP4+Uq5GD7Ui7OZ8hYrX6qcJS1fe0gSALQQuDnSGI4WLAjI5RW3RoauCSIKqOPM23wVnK6/1AFJz1Q3gsmpaBr80h1rhiSMoAhQUyRN0FRqsiNtACGvs5BH+H87d1hZgmAXhVYWMMAFVeFaVNhHXorDgPlidj2A1eL7n4K3KJZuWxW01i5BRDwRkQARPMXDBxJj99zfb228PX7DEd0O64BIIwMtxlt7j22T5QKaGyO8Fc7JwxNk/pxUAdoRM43jRZWIR3+bIBfJbeGU9ooRXAH5GQW6BGCjrPAVDQHaxqlRe82UIDGqsGuC657j+ghbCsGg0SfMUgVuknNLpwS9DgLRHb3vHw/75+8ujXh980s62dlr+2PDisvf65Bei+QB67pR8kQ3ncZoPAQLDTndQ+x2RXMsfJNXuuAaNzd0nyqLdR+jTIZ+BR1e0cacg6Lyes3gEbrSGZK5CI5J4s+S/1mkpcxJQ9XQKOxur9EamOrdxicqjnevPwUxpImovmkZdIJ6A60d9C6weEGuBesvZLF4s8D01p2pIUcJsdhPDRqJlkqphBiTueQdwNRwd2IeMl5SKFblR68nZ8Ojg6E1veHrS7w8H5297Z6i0l8Pt7W1a34FOGjoCUHgJbmFTQNqiLEQtBqtHqFhI5bKETLXikNlLwzarBVOcQN6B+y04SK5Kqygky9JrgulyOcgPAHpamsXArxlNjTHrS2EnpBg6gVHrkWuB6cNvcWmnuJZvISP4bhv+bwfXBGwxvWuS77wBw5H0RGsnSMrDk3fvTs5+UhUFZV9YZLzbtNcRkJlnoN9NmeXuukVPmeReyNBKgRUrnsppEIRXdUSntByAjuHkiwhS0cjN7k768O/P55dvqX7oFlYvvNjdUlj9Q9VKqk5sPntwbyaC8DHC0vlH/90Z4A3/5fjimyJN6LXphAWtAOW339hXbboJlaQyb2oDNlVZY3EAHZ3EHQq9xKWg8TYYE4l4AloBioCmMPZf/fOziOYE7iVQsEaXXdapq8mfOzqchjIkwuq+ki+ORD3GPXPkV0VoKd4HcHxdWfa5Qi9/TsgpQoedchEoJliGD3WBWmmvDRtGs1gE6EpDXD2cbVKJjmur5IJXAQmgOTMWRRFJ0zVPmpk9hkA7+lSm2uloukepGKyPP8oCBXt49Axm0TgKnql8ziSam24D2Eodtc6v8+I2f4WJ8uPndqNVa3Yf5KSHz+hiuF6VQ2cMFG9MVGsNhCRh1N92WSjolWvURr1GBdpIgWqN8TrUYykslg+8ezAHCoQa8bpJg/unEjICx5wH0gDolrTVr+Ad67iGyQg68eiCiYQtHMwFa2AW1DXS2hlkUmrKAxmbb2YYmBFgUyzid+MMpJG3E270TXjFpTWqeDuL0+sarxoIKvESQRJOkPXLWQzGUYbWhsFXS9YJvSzw6vHt7p1IojSnaSLo0Bs75Eu3nj/fYFiIREKJiggD4sth+8luY+Zc53WxwoinE88MoFsJGCNkcqTrZpCAKIQl8MLEjeCqzCpYExwhg4DIiaQvfWY8F7CPokBmS8nYyicvpmEizn0NYlkgqCCghrOe/Ab+SYBo0GFVIJ8UEBWWxxtvYQMs4SksLGSCyxaFSDGjcfcXeeRFlU7SsUIaVF+cA6JLF1QhxytSxNYIt7WKSAZ5NVrWOfIA8wPTRWNAPCrX+D5v4vNALMDCM3pTVxfjhxKgdxVcGooaQKCQJLwaRyHyQk2CwyurzSzFCjRsNDLW+pvhDUi72QLXG9hKActERjeYHakqJ+wRiM92Nr9h0p7UPkwQpRlFE0iv0jnXO1vyjlB6I6ufg/3Cv5M6w5NE5Vi8j5nGqDzcCp6WSrg5B7sfSzgHS8TC7nO8H8abtpsULACS5noYL9KhipHSovVdMWp2ywMzA7Xvb/ky0BcN0nJ23ZtvdKlqPfu7uhUC8iqDe2SZ2QQXhw/b2wMIp4rMHR1gWtKFDS9sgO3hlTFYzZq0Q4eMxusw0paVwAwqkDxMUDM7AoDImeHfMVO13A2iKxexqCdwoHO6T4yTIs+WB5h4/rgmKr4iPam/Plx5QBTZRJCXBfiLHK0FO0HHu1Tu4GUMktn14F9OwHnwb6ExSmIEBGOsKOwZcjUdByhBbiJc0xSEP0i0tSHftYBa5pQ8cZeIhxw2EZlEFbCT5iDndNi+M7BrGXgCpeJQYv43BPk/K09LRGhdU7jv2kpr8hGy/X1V3XMlUn0jWHgIEEaa3Q3NtYttsAAJVxAAYU91VJSCDsGRfIWqMUrohB7+wst5YAR0iEhnELtLGaohDuuHlLWqNY/SaQpOFo9UFpdTdMUgtPgB2UF8qiillcIiYs+WrmkooeQ7USrJDTfsTBZXaOhrtn03Uf/JQ9hBfKrOE4j1GpLtEfgXEiIv8k1cJHhMdIYq/2ZnEKwh2SHvlS/mqgIn40aWhXYPda+TXLiM5eb6nFoVpFuEeFduqiOQgS0GMh4zeW0YUso+j5csQzePjUvYOkaekUFIz7J4AaEOvPQcFdSZjxedHwiEVptw/uxrYrz2RK9bjOMRhKRyGXm+VYBPrwDjDVRBNcCpDm5x8kU67Tjs2iO+eTjs2MOOBBsOGIc1IV8sXdPURZZWQQenfNi5Mhjf0FnHi0tS46o8154B984Gl3+/OD85G0gTgMMTZ5vkQzvgQjcUejZyAM1T/VdArw1aSfKRlvjswTJ5/Og7Yymr542VWs2ND6HW4EbWLO0xVL+sfmXcBs+vTFv+TSdOVtZtaKKhjS/1qpIRQLw1Hsnumb5qwKmR0LEHpVNDX3+tpRNO6DTiedkYEchXYkYj6Z+Uwtly5r9HzqGM2HfPX3+ts6QmnerQYq/Yy2+/k2m6SdqUGr38F9ds8zKhEMYDpcYO7y6T/nTt+x5N9muTX6VECsJRKujfgJSskpqwYXgPRiKd9uwyl54icrulheaVbhBtCQ6nbnE60Dedu7ot9MNVaO/lvOTFNOuCDOoPCwy8zBL2XbeS6n/ViLtYN1iZHYIIubsyGZ92bRou9eJrVSvU7OQ++wKdGepdTS1fI5PKsE19F+4dExotwbCFuWf1kZe2cmSb+61uBL7a+76cID17skFM1zXaGh09uZSVer2PkvUHEutDeoWI4uNwmCZ34PnSx49YcXC3yOMH9KFvbpJbE7D1/ZuwQN4w7Da6ux2bI9lwJVUBYRZX46Nvam20rY56LZL6xZ4cJ9imluxLSXSekG1lnMBct69K2tVtmLt++7sc8YoAbhriwC5iPCDEqf4gEx3hYRqR6GFEJdrOP/J/5J3QzMTXHsM70wxLNyQELZ6mV/YsGpiOW0vovLLRuqNMsuOVtbB9EgvaThulnAjnqIrc5spd2VrrOHx9R9whHDeUf5vZPr6sIpcodLnp2PvsoYpQ8Md/5Mxt69xlzx7wT3rucsEB+YuitKk/gv8uK1X4aipUv0y1Fjx7oI17xHGMM9JsmWypwciDA/AWs3WGkk4DC0Bo55g9hnaOs2kw6aPGh707MDSsZdv6Rg4Ab1ZUlMJzwB1LmYRT0+2YuuTiyQQCrqxW2FoOAUSZhWOliOhvOSHuYkR0sviF0+TtScQOICWepBzvaxAz6htZCG/EjUjxQkpAPkKc4gR77sYln8N8GFn+4GRVipMpEAgm2xAJeKo7F9XojAqVNXm9XLeHafW4+f1LK2fuicpAS4vsSqHA6XPa/0wL077b2oH37Pu71HWGvt7tFPHv2Pf9Jkr3dn1/XX/l/ucbLBs35vurDU90V77vVUHUXO73Ee4bSOr0Pb0uyoOLk30HFDg1ygtw9Zzt0K3EJlqJiWPSbmS1TBW9tuQFMnW6YoIjy1fsloxa9gVRhnOMzZTYBTpJwYJUdQ9PwqeaUlW6zFYVdX3vR3FhQdK8xJwIEixZR1ImZ3y8bANxjC/Qh223zSTdC4nmZYP2sNJeNShxTFQ/+tWvUZmuD/1HrEtV8k9thvrvFgukrxr0OJkgXnBfGYae4enmHz3q297qqDW/5pi1QAPBfOtrTnAM0Dzybc4oxDM3Bb0wKqqNcPSOnm2vWRf0yslKoc6lHLUZqGsj77JEAhnl5PfaC2l2k9Gf6ayN8pgvK61R6hFBHl+p0hAG6K/aakZh2CKdDCxPCOfY3L8joacZ07y1BvtJlbnimp6up9CiKQcRIXVmY01WqxfFZCdnR+/eH5+c/dT4YsW07apOZ82KvlxRHyx436ts4ecMsppivmthgf8NC0VQJaFmqMtUHSxicDhg1KAib2IQrOncBjuIE/iRguuL3Nyn0cLWUIjateDfsCmbrvwRszIIkQBmW+12BDBtFPlqlze//k233XFqxFMYVNmgBaEu7iT4SF/r7FrkGRp7OMfgqbSE14vyox+ZSqgPd/CWajot+RQjiIoYsvOdvosDtQuu2QXygxVw+5IuZOIad/9MOqDGV38YuoS3g1IQm97BCumW0eDdlgzQM/Su1U64ythpM9ScG86IlOhYzTomqgWxIV8LL5kuwXtWCs00Eu7r8gUkf9vhiiswiZv0vc1srvW9DdNuy598g8ri+2UjAWssrDVHUxHYi70yxLrMU/FaRVYKU+qnKZ67dSv8QOlQh9UoiijEXrlZhKSU8a1P1XMn1lGBymLifQjWYPTS3AKHzmPlti6yvfZoucJ4m8oV1rU06N0XeJ2ItiyjIu6GLZU8URqStNqZ7ALkkDGjrevH7cUp+Q02DbT2okxlL4qKPrKFBghtqQ6bGW9SQIpFlmBBU/XIICl2C4ITRgAZL+JxWi3VnNsZfpu9pllGpPecvdpr6yUMnYqglF29dJ30ILnA9lA8R2Gkq7I29VbTv3L3LVzDiz5l4WpKaGqIf7STx4ZuW8w0sdk+agYpn5gcV7fB0xx3O+ABWbdt2Z42O9qCZJ2GItVpbw+fHfMBrX3uQ1n3uQWx9ukqfF0BsHbA6zM259wZd8+ry8+0GO98aSvVmk+jXJI17cYe2G40G3+uVavF17oCe+3zK+FQtze3dc2vhrg2atM63xLMLP2jPgZ+m5hXJ9pwjgmqMjJ78OLFKqT1vo0yZTdyunhIiYF91gA7je+G9xzMayabR67vdb6sQtdLnw+aGfSnQ9343gpvxW3oMrM01RrcaSevoFHDojnisFr/5ZaJTW15qWHdMuhwd7/4Mvyck6+hiGE3cp+qez1/hijmPAhGXZYSmBo15qoqtRag8WkZaKmRM5vZ/nOHhf8JGm2Sl1cbDv7z5nbZT9X0VjnptL9TdmAFglgWFpKYyY4rawMczlwPg9j57mPXTtd8+Ma0XbvuCPKUPKFhk/8guO9Sl/+d7Bp06T/Q8yuSYmZcbAugaXyZh9hunVzIa3Nno3nP2OYYjI21HHsz5h1r87R5fM1A2/E0g08cOEPjHRvztGnLZqBhob4cjt2ZAd+W7OOmpVgFtG5B46rVYkD6zJBX6ks2+BUYj+kkSnoG0KxOWENLHyqCdlq4k9JWOK8SO87Ep7bfVCqHT+/XeXdOSbezOurFzkOfh/sBJnMCRQsru+xWTk99sUlFQOfeZ9V2V/EtvM6kBC1h3iI7e/H2f91dbW8byQ3+7l+xwaXY3VaSkysCNEYcw7HvAKNp6+ZS9ENgnGRpbQuRJZ1k1TCM7W/vkJwXkjOzkt30cGg+Odp521nOC8mHD1GJt9QY9C1Yq+wKL14D4B0ROt0V94NAF+RF2HrEPYQeys5SIayD5caoQtgjK9nuxX/FfZBA0N97sjiTNB/6WoRxsvtO8DdKmePVlIaeqNEZS8s/dVw8HVqrxSOx7yXlQxorUte7TJ1gm0he8vaUCPD5sQIQfpKfPXi57YEDnm78852caftzcHWn+oxPnMRHtY91O8mYZ5JAOtk6SvPPRFVU4UJPpR3Ei6Ivh6ge91Q7chDtjqtCfnc5WenC4YOrcaulZCslCAyyJ7JUT+WuptTR6Fd1Iqd14Ohh/kRWSmv0qzqRwwN5IsdaaPRAnMgJ5TOegOSJzKYiczeS2qjkKkhc5mi7Ym+sWAzCmRkVjXkN+OGYb3mdbIL9Gh8E8qXCphB+F3tF1BRf0umHfAWnrCWWn0GbUPtcz0xYVRQDQtASxcjtU/UgS4mQ08tEm8manZUEfwJTyOyl5tLfj+yVC68Dl3UdfU7bBtP3RBPh0ha3EHEyaL1HvOMPW0w7eboGGlvCnKIQf0UDsSiPnbudpbyRpgvhdlNmCGld4MYHbvqIPU8pJV9eQPm9Vo+F2/3VL6EoGTSsYSP8fBXs7cGCER6nHds5y0GQC8SSekELDyO3d0J3T2jkkerOCwpnOP9vKBTMiqZI+I/6KMJJnlLntchyXZ4VkG6CItbN4906GPvZ2Z0VZVM6YRrcSxrhXLBdxXDNVuwdk2fVEDpQg0a+L6rlYn3nUCMnN834K7r4js/PALC6NDfJprRcTzbiHZAdgBpZ3U7niHUylzgZRz8a320AklQsxgg+mQyKMwjsKCbTCYaZYRcKPAItISxqaeEsGCu4nI2m8+L+5kEASUZroIYNSFAY9ic72h8Xq0BouS1SaZzmwvKPToCt1nQRP07gdDOhTwUyDzRr+llEQSEg0VK/vAOIC0eaPglhkcJXsFDU7X4fFwYAT3kjQIXwdbp0YZsT2l3WT4vRpMZ1gCYFEJKHkHcZBZFzy7wLyh0k7PUUaJB76lY8K+/81CejGQYLNhh9V5hdaNyY9YfWQQDmGT0H9p4Q6nf5UIAljeCAjZkTtC6M3RIFvoc1LNLR3FvIsGnzy+0SHfEYokciZAEX1WVzBbyCHLPllqB0z67vjl3rjjs4eBLRxPfRlKkQiXA7QKAfgvX9mEqBHzDj+gne+KNoeH2Ne1Dcl3dSnsJEm92mqs1VCgw48EOVqjLw716DxH02/6uC/xLPYDdvKGzEFbhy8w/ogvnCS7ANpIgjIPd4eD6TmEM651PYo7G/CVi5ERcEJiCwu3mWO4xBSjHjTXGbRuim2f7MzrcZ2w+KhV1zFG6IAZvETTK1RHuIYHT7LOPFwykAmkaCygB56Ax3X4u9WQDAdLIArAx6o/o+AndBsjZHxIwZ1cBPEr1w0qcV1OuOQp7OikoqWuqgRA+/nH/621/OPxO/x4V9UTeXxWi5nE2B+S9MAOB/xSdske/x5aNav63ZhdwEwTTWQ3cDrIPX+pRmZTa6BvSDpRZ0Yblw6zWi48OZYc4xWhZkbDoRk5C/O6Z8YNAzQSvF2XjAvzOMeWnG/v7N7+zR5yT8+K+nrhUE3Dg6GxQWsxU3zcQy9VjCG8/3MhDOMjNLp1DlUG2i/WgrVNZ49Rgc9bKF3xevBm/fcAu96+tdmsdG2aOfOacf4K5E94I5nsx24hQQtYI7yfyhllQkd0krLby1rSdJPhybDTdncMMTthhZjIZ0DXfIqMpIrW1H6JNepO1Dp0m2QYiDGLeJUe1kNxw77bc4LGRFrxcnapzNrxbeIWiVbdfMIUWAhH9HIWLAh+744u9VYSg+LKo/4HtTmZaIvOuhKngABTvLsfkfCqYsN/lUG96mHXZN5S4WegwbMFccPS/YgDS8wFtD/KB7qm0t0aywOUk01+73wyPdVkv6p5q9g6Ikv4MDfduYEDsvPeJWICR4c1eXySkl7J6fSjcB3VOpjHyZ5VJCMbxJmkFcX88ghLmj0bwNcIflaMOEadtdOw03szwThhf4ksTInViy3eW3LeU9LUcp36SPrCyKF9snJFk8sVW4c5LNn4N/rhqrY8EePZ+MZuZdiBwOBu2oKNC2YvWzNeh25kTlTS2AvuJ+anU9SWuPaDFcV6AYzUGVAdpfPI8XizvqbJAUHAmK9V+RwMd0Ta87ZYnbiuNVjiuP7ZXBrCZ9Q3bV6jVLJSm0qVfWLV+VB3yfFP5I1h83wiV7jLeCJ/Y5wT2s+ILj7bkhXDgr3wcKW3EBb0VZJ/cGsgD5vQEbPaING/42ko99d+8VykCf2yug2O57hTTu59pcCMZ3L0ZeQN21sluWlMMg11lKUdjlVYTbYYedznKlZ7Y2Zm/FLcqxKSZ2tWzRXe8m2jOSmxlCgV+agvAzQGvt4DvnJe1d2eVmZpXlG6pY3G7g808AuUpuyzALOQ9Nuy9nlfto2uzshPsrWdjM26Ch4Xq0LCwJ0VrTLOYU/jUaSN+Yi//xdbil5ZX4F1b7DSdDvuz7mLJxyzhe3/xvR+GYIP0EnoOp5fxT8d3rt3/6/o+QAgQ5i0z1orr8pQ/2sWlDWaCWYNdEU9Q+HRuogf28XGHVn129wfqXWX3g2scgBzA6cF5L0B4pMJP4rZD+84a+33SNmGI8enrFv9++woQlRLHpjUErSfa1WmyA+nO/AUQ1KDHm5AK6ymayP52jFW3cQHKP0fWqwQDPQfFxdGmN+tDeGAJSTAvmuAbDByhkQJ1zu5w9wOE8Kk5OCqOIFzdGLOkgBTe9GdMa4nZ93KS1luBq8TQNrzg/A1QA7RGL2EPGHQrWwQJNZEUj0Va5XJiSkBTj9U0Q+gew2uDlPUSLlLt0Y1dCZ0dQ5oldbRflVI+WOJV/66ivXvEOx2OER3YbN+fCNvBCVPKtxGV6qkoi8rKMZkzOy56KjVT5COwudpS6Hfp4jF4Wf8caSIDzdH2Z1MDXFNA9XSdKeOCraWyfrpnMh+Brpy7ZuoWulAm+oY5buG5PJlfwLQgooa4TJV7w1TTWUNfUeRl8RYVFTM4bz9og54yBFXVNldTB15NYxqhWlPEhVNRox0iiMhkhgmylgamRlGXzRgRxyyFZTVt9H1+gwRfha0njAAR29fZyKAxfKzIa8HoRtEEtZv9E1NJ5JHwlhabjdVSKCV9FAsV4jSRgrgqSFD+G6l8u6qDDpJqSYLpIdZYN88LUutN3407McfpZ8oI5bhrIL7ILnRdrKSTpGnuCMMsNVlSOb+xqer1ZocUbSSSQXgypxeqBliUxdQwCSzMmw0k1jxh7jC/NbsLm/dlVFVT9/y7voIYD8VEL0O1vcNwpKG8kruzpb/EdwDDOEnpZYTWXVGX1whssSm8z39z24bZCzrQ1awlMMWNQt82lNLDeBSc2Wm/MlXU5ApJYe9W5buaQnNO0fHYqpNjiiZQUU1gnX/d7ifn5tpIZjYT//muNJYsLq8RunLIrHh2FcZXfaDg5rFnFN/pfazA8VQ25h+IgSpayhopEMZUyIwoVSkUi8lwoVCqOTMxxhrgaAvSXybkI5Tqge+CTJaLMA+9stYFzXGaiyETxYy/ttZP3YQFl6W3Twg86FHRx7+nQybqKoHYYvtnJ4n6x+nrwxIQLYYXbvclIbtinvr2MtrW3Q/wTqNHJmgqbpGVPBuIul5cZMAL9PuViRk8/bKTIVjG3UJrpnDt515vbW3ObANUOHPqQLhiZngDPAQb26tTc0kar4h9n3nBsmamg25H15JnGrmaLe+ARn01Hl0YZNReQD3+X7M51sAlMbMrfFDuvdo8eDXKgzKALu/YA+Hc/MsNGDnmZYjh2fOTa5TGrtDqS1AO19Pu3HOEBA/rJZSH2ozsqhj38H7KY2V/bYbCYW/CU/SaHCsVQfPj0w/GfL0xdUtbb4gsRUR6+fGSbRtsjAMt3Lx/V2m6fhXfoUfp0S76WWNYtvQy9b3sx9MYCAc2wbwV5AGZGfMx2VkLqm9LLd7dzfne8IcguImEeM8hFBkg8gYl6VspJqP3ZYVw4cJEyT96M/tWYgd03qwTGhnAgozviWddpKBlwI01khYT2DyccHvM8cnTPb/UM7J/E+UHVoy1oP8GgzdBAPgt3J+rH5nrZ5XtSiiH7EWHCzGYUYEzsczhEE8+XgJlseNpQwlOtPaJujKckbJbRh4Vm8OvPR3ebFcogYmc0HIoJgEg92vW1/ej+fz51Gi7pwTjpD62nZwyew82SsnDbl6ns4P0U8AnoJOBgb626T3SNMmVNmOGocXDNanunMPZVVecTHDmoWzwWBUbOnHc4wy6CwdGR4gU8+pVhguMz+X2SBY+dupDvRfTO0s3Qify0vDACQgXb/iEdQpANZuz9a6V1uKA4leLmKmMzwgu7X0rCvfpKJW4aJQ81ZzcJzEbjXrdHQ6o5i7F7xrPQ8Od8NYAY/wc5acjbQoUAAA=='

function sha256(source) {
  return crypto.createHash('sha256').update(source).digest('hex')
}

function normalizeTreeRoot(root) {
  assert.ok(root, 'Target111 evidence-gap replay requires a tree or src root')
  const resolved = path.resolve(root)
  const treeRoot = path.basename(resolved) === 'src' ? path.dirname(resolved) : resolved
  assert.ok(
    fs.statSync(path.join(treeRoot, 'src')).isDirectory(),
    `${treeRoot}: expected a source tree containing src/`,
  )
  return treeRoot
}

function replaceExactOnce(source, before, after, label) {
  const count = source.split(before).length - 1
  assert.equal(count, 1, `${label}: expected one exact historical anchor, found ${count}`)
  return source.replace(before, after)
}

function patchBash(source) {
  const relative = 'src/tools/BashTool/bashPermissions.ts'
  let next = source
  const replace = (before, after, label) => {
    next = replaceExactOnce(next, before, after, `${relative}: ${label}`)
  }
  replace(
    `import { APIUserAbortError } from '@anthropic-ai/sdk'
import type { z } from 'zod/v4'`,
    `import { APIUserAbortError } from '@anthropic-ai/sdk'
import { isAbsolute } from 'node:path'
import type { z } from 'zod/v4'`,
    'node:path import',
  )
  replace(
    `  getRuleByContentsForTool,
} from '../../utils/permissions/permissions.js'
import {`,
    `  getRuleByContentsForTool,
} from '../../utils/permissions/permissions.js'
import { pathInAllowedWorkingPath } from '../../utils/permissions/filesystem.js'
import { validatePath } from '../../utils/permissions/pathValidation.js'
import {`,
    'permission path imports',
  )
  replace(
    `  compoundCommandHasCd?: boolean,
  astCommand?: SimpleCommand,
): PermissionResult => {`,
    `  compoundCommandHasCd?: boolean,
  astCommand?: SimpleCommand,
  cwd = getCwd(),
): PermissionResult => {`,
    'bashToolCheckPermission cwd parameter',
  )
  replace(
    `  const pathResult = checkPathConstraints(
    input,
    getCwd(),
    toolPermissionContext,
    compoundCommandHasCd,
    astCommand?.redirects,`,
    `  const pathResult = checkPathConstraints(
    input,
    cwd,
    toolPermissionContext,
    compoundCommandHasCd,
    astCommand?.redirects,`,
    'per-command cwd',
  )
  replace(
    `  compoundCommandHasCd?: boolean,
  astParseSucceeded?: boolean,
): Promise<PermissionResult> {`,
    `  compoundCommandHasCd?: boolean,
  astCommand?: SimpleCommand,
  cwd = getCwd(),
): Promise<PermissionResult> {`,
    'suggestion helper parameters',
  )
  replace(
    `    input,
    toolPermissionContext,
    compoundCommandHasCd,
  )
  // 2a. Deny/ask if command was explictly denied/asked`,
    `    input,
    toolPermissionContext,
    compoundCommandHasCd,
    astCommand,
    cwd,
  )
  // 2a. Deny/ask if command was explictly denied/asked`,
    'suggestion helper forwarding',
  )
  replace(
    `    !astParseSucceeded &&
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK)`,
    `    !astCommand &&
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK)`,
    'AST security guard',
  )
  replace(
    `  return { subcommands, astCommandsByIdx }
}

/**
 * Early-exit deny enforcement`,
    `  return { subcommands, astCommandsByIdx }
}

function canUseLeadingCdAsWorkingDirectory(command: string): boolean {
  if (command.includes('||') || command.includes(';')) return false
  if (command.replaceAll('&&', '').includes('&')) return false
  return true
}

function resolveLeadingCdWorkingDirectory(
  command: SimpleCommand | undefined,
  cwd: string,
  toolPermissionContext: ToolPermissionContext,
): string | null {
  if (!command) return null
  if (command.envVars.length > 0 || command.redirects.length > 0) return null
  if (command.argv.length !== 2 || command.argv[0] !== 'cd') return null

  const target = command.argv[1]!
  if (target.startsWith('-')) return null
  if (
    !isAbsolute(target) &&
    !target.startsWith('./') &&
    !target.startsWith('../')
  ) {
    return null
  }
  const { allowed, resolvedPath } = validatePath(
    target,
    cwd,
    toolPermissionContext,
    'read',
  )
  if (!allowed) return null
  if (
    !pathInAllowedWorkingPath(resolvedPath, toolPermissionContext, [
      resolvedPath,
    ])
  ) {
    return null
  }
  return resolvedPath
}

/**
 * Early-exit deny enforcement`,
    'leading-cd helpers',
  )
  replace(
    `  const compoundCommandHasCd = cdCommands.length > 0

  // SECURITY: Block compound commands that have both cd AND git`,
    `  const compoundCommandHasCd = cdCommands.length > 0
  let permissionCwd = cwd
  let pathCommandHasCd = compoundCommandHasCd

  if (
    compoundCommandHasCd &&
    subcommands.length > 1 &&
    subcommands.length === rawSubcommands.length &&
    isNormalizedCdCommand(subcommands[0]!) &&
    canUseLeadingCdAsWorkingDirectory(input.command)
  ) {
    const resolvedCwd = resolveLeadingCdWorkingDirectory(
      astCommandsByIdx[0],
      cwd,
      appState.toolPermissionContext,
    )
    if (resolvedCwd !== null) {
      permissionCwd = resolvedCwd
      pathCommandHasCd = false
    }
  }

  // SECURITY: Block compound commands that have both cd AND git`,
    'leading-cd permission state',
  )
  replace(
    `      appState.toolPermissionContext,
      compoundCommandHasCd,
      astCommandsByIdx[i],
    ),`,
    `      appState.toolPermissionContext,
      pathCommandHasCd,
      astCommandsByIdx[i],
      permissionCwd,
    ),`,
    'subcommand permission cwd',
  )
  replace(
    `  const pathResult = checkPathConstraints(
    input,
    getCwd(),
    appState.toolPermissionContext,
    compoundCommandHasCd,
    astRedirects,
    astCommands,
  )`,
    `  const pathResult = checkPathConstraints(
    input,
    permissionCwd,
    appState.toolPermissionContext,
    pathCommandHasCd,
    astRedirects,
    astCommandsByIdx.filter(
      (command): command is SimpleCommand => command !== undefined,
    ),
  )`,
    'full-command cwd',
  )
  replace(
    `      commandSubcommandPrefix,
      compoundCommandHasCd,
      astSubcommands !== null,
    )`,
    `      commandSubcommandPrefix,
      pathCommandHasCd,
      astCommandsByIdx[0],
      permissionCwd,
    )`,
    'single-command cwd',
  )
  replace(
    `  for (const subcommand of subcommands) {
    subcommandResults.set(`,
    `  for (
    let subcommandIndex = 0;
    subcommandIndex < subcommands.length;
    subcommandIndex++
  ) {
    const subcommand = subcommands[subcommandIndex]!
    subcommandResults.set(`,
    'indexed command loop',
  )
  replace(
    `        commandSubcommandPrefix?.subcommandPrefixes.get(subcommand),
        compoundCommandHasCd,
        astSubcommands !== null,
      ),`,
    `        commandSubcommandPrefix?.subcommandPrefixes.get(subcommand),
        pathCommandHasCd,
        astCommandsByIdx[subcommandIndex],
        permissionCwd,
      ),`,
    'compound-command cwd',
  )
  return next
}

function patchHelp(source) {
  const relative = 'src/components/HelpV2/HelpV2.tsx'
  let next = source
  const replace = (before, after, label) => {
    next = replaceExactOnce(next, before, after, `${relative}: ${label}`)
  }
  replace('  const $ = _c(44);', '  const $ = _c(47);', 'memo slots')
  replace(
    '  const maxHeight = Math.floor(rows / 2);\n  const insideModal = useIsInsideModal();',
    '  const maxHeight = Math.floor(rows / 2);\n  const showFeedback = rows >= 44;\n  const insideModal = useIsInsideModal();',
    'responsive feedback gate',
  )
  replace(
    `  let t8;
  if ($[34] !== dismissShortcut || $[35] !== exitState.keyName || $[36] !== exitState.pending) {
    t8 = <Box marginTop={1}><Text dimColor={true}>{exitState.pending ? <>Press {exitState.keyName} again to exit</> : <Text italic={true}>{dismissShortcut} to cancel</Text>}</Text></Box>;
    $[34] = dismissShortcut;
    $[35] = exitState.keyName;
    $[36] = exitState.pending;
    $[37] = t8;
  } else {
    t8 = $[37];
  }
  let t9;
  if ($[38] !== t6 || $[39] !== t8) {
    t9 = <Pane color="professionalBlue">{t6}{t7}{t8}</Pane>;
    $[38] = t6;
    $[39] = t8;
    $[40] = t9;
  } else {
    t9 = $[40];
  }
  let t10;
  if ($[41] !== t5 || $[42] !== t9) {
    t10 = <Box flexDirection="column" height={t5}>{t9}</Box>;
    $[41] = t5;
    $[42] = t9;
    $[43] = t10;
  } else {
    t10 = $[43];
  }
  return t10;`,
    `  let t8;
  if ($[34] !== showFeedback) {
    t8 = showFeedback && <Box marginTop={1} flexShrink={0}><Text dimColor={true}>Something else? Use /feedback to report bugs or request features.</Text></Box>;
    $[34] = showFeedback;
    $[35] = t8;
  } else {
    t8 = $[35];
  }
  let t9;
  if ($[36] !== dismissShortcut || $[37] !== exitState.keyName || $[38] !== exitState.pending) {
    t9 = <Box marginTop={1}><Text dimColor={true}>{exitState.pending ? <>Press {exitState.keyName} again to exit</> : <Text italic={true}>{dismissShortcut} to cancel</Text>}</Text></Box>;
    $[36] = dismissShortcut;
    $[37] = exitState.keyName;
    $[38] = exitState.pending;
    $[39] = t9;
  } else {
    t9 = $[39];
  }
  let t10;
  if ($[40] !== t6 || $[41] !== t8 || $[42] !== t9) {
    t10 = <Pane color="professionalBlue">{t6}{t7}{t8}{t9}</Pane>;
    $[40] = t6;
    $[41] = t8;
    $[42] = t9;
    $[43] = t10;
  } else {
    t10 = $[43];
  }
  let t11;
  if ($[44] !== t5 || $[45] !== t10) {
    t11 = <Box flexDirection="column" height={t5}>{t10}</Box>;
    $[44] = t5;
    $[45] = t10;
    $[46] = t11;
  } else {
    t11 = $[46];
  }
  return t11;`,
    'feedback footer and memo graph',
  )
  return next
}

function patchMcpClient(source) {
  const relative = 'src/services/mcp/client.ts'
  let next = source
  const replace = (before, after, label) => {
    next = replaceExactOnce(next, before, after, `${relative}: ${label}`)
  }
  replace(
    `          requestInit: {
            headers: {
              'User-Agent': getMCPUserAgent(),
              ...combinedHeaders,`,
    `          requestInit: {
            headers: {
              'User-Agent': getMCPUserAgent(),
              'Accept-Encoding': 'identity',
              ...combinedHeaders,`,
    'SSE request headers',
  )
  replace(
    `              headers: {
                'User-Agent': getMCPUserAgent(),
                ...authHeaders,
                ...init?.headers,
                ...combinedHeaders,
                Accept: 'text/event-stream',`,
    `              headers: {
                'User-Agent': getMCPUserAgent(),
                'Accept-Encoding': 'identity',
                ...authHeaders,
                ...init?.headers,
                ...combinedHeaders,
                Accept: 'text/event-stream',`,
    'SSE event headers',
  )
  replace(
    `        const transportOptions: SSEClientTransportOptions =
          proxyOptions.dispatcher
            ? {
                eventSourceInit: {
                  fetch: async (url: string | URL, init?: RequestInit) => {
                    // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
                    return fetch(url, {
                      ...init,
                      ...proxyOptions,
                      headers: {
                        'User-Agent': getMCPUserAgent(),
                        ...init?.headers,
                      },
                    })
                  },
                },
              }
            : {}`,
    `        const transportOptions: SSEClientTransportOptions = {
          requestInit: {
            headers: {
              'User-Agent': getMCPUserAgent(),
              'Accept-Encoding': 'identity',
            },
          },
          ...(proxyOptions.dispatcher && {
            eventSourceInit: {
              fetch: async (url: string | URL, init?: RequestInit) => {
                // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
                return fetch(url, {
                  ...init,
                  ...proxyOptions,
                  headers: {
                    'User-Agent': getMCPUserAgent(),
                    'Accept-Encoding': 'identity',
                    ...init?.headers,
                  },
                })
              },
            },
          }),
        }`,
    'SSE IDE request and event headers',
  )
  replace(
    `            headers: {
              'User-Agent': getMCPUserAgent(),
              ...(sessionIngressToken &&`,
    `            headers: {
              'User-Agent': getMCPUserAgent(),
              'Accept-Encoding': 'identity',
              ...(sessionIngressToken &&`,
    'streamable HTTP headers',
  )
  replace(
    `            headers: {
              'User-Agent': getMCPUserAgent(),
              'X-Mcp-Client-Session-Id': getSessionId(),`,
    `            headers: {
              'User-Agent': getMCPUserAgent(),
              'Accept-Encoding': 'identity',
              'X-Mcp-Client-Session-Id': getSessionId(),`,
    'Claude AI proxy headers',
  )
  return next
}

function patchClaude(source) {
  return replaceExactOnce(
    source,
    `      autoModeActive: afkHeaderLatched,
      isUsingOverage: currentLimits.isUsingOverage ?? false,
      cachedMCEnabled: cacheEditingHeaderLatched,
      effortValue: effort,
      extraBodyParams: getExtraBodyParams(),`,
    `      autoModeActive: afkHeaderLatched,
      isUsingOverage: currentLimits.isUsingOverage ?? false,
      is1hCacheTTL: should1hCacheTTL(options.querySource),
      queryDepth: options.queryTracking?.depth,
      cachedMCEnabled: cacheEditingHeaderLatched,
      effortValue: effort,
      extraBodyParams: getExtraBodyParams(),
      messagesForAPI,`,
    'src/services/api/claude.ts: prompt cache detector inputs',
  )
}

function patchCoreSchemas(source) {
  const relative = 'src/entrypoints/sdk/coreSchemas.ts'
  let next = source
  next = replaceExactOnce(
    next,
    `export const McpSSEServerConfigSchema = lazySchema(() =>`,
    `export const McpToolConfigSchema = lazySchema(() =>
  z
    .object({
      name: z.string(),
      permission_policy: z.enum(['always_allow', 'always_ask', 'always_deny']),
    })
    .describe(
      'Per-tool permission policy carried on mcp_set_servers for remote servers.',
    ),
)

export const McpSSEServerConfigSchema = lazySchema(() =>`,
    `${relative}: MCP tool policy schema`,
  )
  next = replaceExactOnce(
    next,
    `    type: z.literal('sse'),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),`,
    `    type: z.literal('sse'),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    tools: z.array(McpToolConfigSchema()).optional(),`,
    `${relative}: SSE tool policies`,
  )
  next = replaceExactOnce(
    next,
    `    type: z.literal('http'),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),`,
    `    type: z.literal('http'),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    tools: z.array(McpToolConfigSchema()).optional(),`,
    `${relative}: HTTP tool policies`,
  )
  next = replaceExactOnce(
    next,
    `export const SDKAPIRetryMessageSchema = lazySchema(() =>`,
    `export const SDKMirrorErrorMessageSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('system'),
      subtype: z.literal('mirror_error'),
      error: z.string(),
      key: z.object({
        projectKey: z.string(),
        sessionId: z.string(),
        subpath: z.string().optional(),
      }),
      uuid: UUIDPlaceholder(),
      session_id: z.string(),
    })
    .describe(
      'Emitted when SessionStore.append() rejects or times out for a transcript-mirror batch. The batch is dropped (at-most-once delivery); this surfaces the failure so consumers are not silent on data loss.',
    ),
)

export const SDKAPIRetryMessageSchema = lazySchema(() =>`,
    `${relative}: mirror error schema declaration`,
  )
  return next
}

function patchPrint(source) {
  const relative = 'src/cli/print.ts'
  let next = source
  const replace = (before, after, label) => {
    next = replaceExactOnce(next, before, after, `${relative}: ${label}`)
  }
  replace(
    `import { getMcpPrefix } from 'src/services/mcp/mcpStringUtils.js'`,
    `import {
  buildMcpToolName,
  getMcpPrefix,
} from 'src/services/mcp/mcpStringUtils.js'`,
    'MCP rule-name import',
  )
  replace(
    `    clients: [],
    tools: [],
    configs: {},
  }`,
    `    clients: [],
    tools: [],
    configs: {},
    policyRules: new Set(),
  }`,
    'initial dynamic MCP policy state',
  )
  replace(
    `  clients: MCPServerConnection[]
  tools: Tools
  configs: Record<string, ScopedMcpServerConfig>
}`,
    `  clients: MCPServerConnection[]
  tools: Tools
  configs: Record<string, ScopedMcpServerConfig>
  policyRules: Set<string>
}`,
    'dynamic MCP state type',
  )
  replace(
    `  const newState: DynamicMcpState = {
    clients: newClients,
    tools: newTools,
    configs: newConfigs,
  }`,
    `  const alwaysAllowRules: string[] = []
  const alwaysDenyRules: string[] = []
  for (const [serverName, config] of Object.entries(desiredConfigs)) {
    if (config.type !== 'http' && config.type !== 'sse') continue
    for (const tool of config.tools ?? []) {
      const rule = buildMcpToolName(serverName, tool.name)
      if (tool.permission_policy === 'always_allow') {
        alwaysAllowRules.push(rule)
      } else if (tool.permission_policy === 'always_deny') {
        alwaysDenyRules.push(rule)
      }
    }
  }

  const newState: DynamicMcpState = {
    clients: newClients,
    tools: newTools,
    configs: newConfigs,
    policyRules: new Set([...alwaysAllowRules, ...alwaysDenyRules]),
  }`,
    'policy extraction and ownership set',
  )
  replace(
    `    const nonDynamicClients = prev.mcp.clients.filter(c => {
      return !allDynamicServerNames.has(c.name)
    })

    return {`,
    `    const nonDynamicClients = prev.mcp.clients.filter(c => {
      return !allDynamicServerNames.has(c.name)
    })

    const replaceDynamicPolicyRules = (
      rules: typeof prev.toolPermissionContext.alwaysAllowRules,
      replacements: string[],
    ) => {
      const sessionRules = rules.session ?? []
      const retainedRules = sessionRules.filter(
        rule => !currentState.policyRules.has(rule),
      )
      if (
        retainedRules.length === sessionRules.length &&
        replacements.length === 0
      ) {
        return rules
      }
      return { ...rules, session: [...retainedRules, ...replacements] }
    }
    const updatedAlwaysAllowRules = replaceDynamicPolicyRules(
      prev.toolPermissionContext.alwaysAllowRules,
      alwaysAllowRules,
    )
    const updatedAlwaysDenyRules = replaceDynamicPolicyRules(
      prev.toolPermissionContext.alwaysDenyRules,
      alwaysDenyRules,
    )
    const toolPermissionContext =
      updatedAlwaysAllowRules ===
        prev.toolPermissionContext.alwaysAllowRules &&
      updatedAlwaysDenyRules === prev.toolPermissionContext.alwaysDenyRules
        ? prev.toolPermissionContext
        : {
            ...prev.toolPermissionContext,
            alwaysAllowRules: updatedAlwaysAllowRules,
            alwaysDenyRules: updatedAlwaysDenyRules,
          }

    return {`,
    'replace owned session policy rules',
  )
  replace(
    `        clients: [...nonDynamicClients, ...newClients],
      },
    }`,
    `        clients: [...nonDynamicClients, ...newClients],
      },
      toolPermissionContext,
    }`,
    'publish permission context',
  )
  return next
}

function patchDoctor(source) {
  return replaceExactOnce(
    source,
    '    t40 = <Box><PressEnterToContinue /></Box>;',
    '    t40 = <><Box marginTop={1}><Text dimColor={true}>Still having issues? Run /feedback to report details.</Text></Box><Box><PressEnterToContinue /></Box></>;',
    'src/screens/Doctor.tsx: feedback footer',
  )
}

function patchUltrareview(source) {
  const relative = 'src/commands/review/UltrareviewOverageDialog.tsx'
  let next = source
  next = replaceExactOnce(
    next,
    `import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Link, Text } from '../../ink.js'`,
    `import { Dialog } from '../../components/design-system/Dialog.js'
import { GlimmerMessage } from '../../components/Spinner/GlimmerMessage.js'
import { SpinnerGlyph } from '../../components/Spinner/SpinnerGlyph.js'
import { useSettings } from '../../hooks/useSettings.js'
import { Box, Link, Text, useAnimationFrame } from '../../ink.js'`,
    `${relative}: launch indicator imports`,
  )
  next = replaceExactOnce(
    next,
    `function UltrareviewDialogContent({`,
    `function UltrareviewLaunchIndicator(): React.ReactNode {
  const reducedMotion = useSettings().prefersReducedMotion ?? false
  const [ref, time] = useAnimationFrame(reducedMotion ? null : 50)
  const glimmerIndex =
    reducedMotion ? -100 : 19 - (Math.floor(time / 200) % 29)
  const frame = Math.floor(time / 120)

  return (
    <Box ref={ref} flexDirection="row" columnGap={1}>
      <SpinnerGlyph
        frame={frame}
        messageColor="inactive"
        reducedMotion={reducedMotion}
        time={time}
      />
      <GlimmerMessage
        message="Launching"
        mode="responding"
        messageColor="inactive"
        glimmerIndex={glimmerIndex}
        flashOpacity={0}
        shimmerColor="subtle"
      />
    </Box>
  )
}

function UltrareviewDialogContent({`,
    `${relative}: launch indicator owner`,
  )
  next = replaceExactOnce(
    next,
    '<Text color="background">Launching…</Text>',
    '<UltrareviewLaunchIndicator />',
    `${relative}: launch indicator call`,
  )
  return next
}

const PATCHERS = {
  'src/tools/BashTool/bashPermissions.ts': patchBash,
  'src/components/HelpV2/HelpV2.tsx': patchHelp,
  'src/services/mcp/client.ts': patchMcpClient,
  'src/services/api/promptCacheBreakDetection.ts': () =>
    gunzipSync(Buffer.from(PROMPT_CACHE_SOURCE_GZIP_BASE64, 'base64')).toString('utf8'),
  'src/services/api/claude.ts': patchClaude,
  'src/entrypoints/sdk/coreSchemas.ts': patchCoreSchemas,
  'src/cli/print.ts': patchPrint,
  'src/screens/Doctor.tsx': patchDoctor,
  'src/commands/review/UltrareviewOverageDialog.tsx': patchUltrareview,
}

const REQUIRED_EVIDENCE = {
  'src/tools/BashTool/bashPermissions.ts': [
    'function canUseLeadingCdAsWorkingDirectory',
    'function resolveLeadingCdWorkingDirectory',
    'permissionCwd = resolvedCwd',
  ],
  'src/components/HelpV2/HelpV2.tsx': [
    'const showFeedback = rows >= 44;',
    'Something else? Use /feedback to report bugs or request features.',
  ],
  'src/services/mcp/client.ts': ["'Accept-Encoding': 'identity'"],
  'src/services/api/promptCacheBreakDetection.ts': [
    'is1hCacheTTL: boolean',
    'queryDepth?: number',
    'messagesForAPI?: Message[]',
  ],
  'src/services/api/claude.ts': [
    'is1hCacheTTL: should1hCacheTTL(options.querySource)',
    'queryDepth: options.queryTracking?.depth',
    'messagesForAPI,',
  ],
  'src/entrypoints/sdk/coreSchemas.ts': [
    'export const McpToolConfigSchema = lazySchema',
    'export const SDKMirrorErrorMessageSchema = lazySchema',
  ],
  'src/cli/print.ts': [
    'policyRules: new Set()',
    'permission_policy',
    'replaceDynamicPolicyRules',
  ],
  'src/screens/Doctor.tsx': [
    'Still having issues? Run /feedback to report details.',
  ],
  'src/commands/review/UltrareviewOverageDialog.tsx': [
    'function UltrareviewLaunchIndicator',
    'const frame = Math.floor(time / 120)',
  ],
}

export function replayTarget111EvidenceGaps(root) {
  const treeRoot = normalizeTreeRoot(root)
  const states = new Map()
  const sources = new Map()

  // Package-wide preflight: no filesystem mutation occurs until every owner
  // has authenticated as the complete before-state or complete after-state.
  for (const [relative, hashes] of Object.entries(OWNER_HASHES)) {
    const filename = path.join(treeRoot, relative)
    assert.ok(fs.existsSync(filename), `${relative}: replay owner exists`)
    const source = fs.readFileSync(filename, 'utf8')
    const hash = sha256(source)
    const state = hash === hashes.before ? 'before' : hash === hashes.after ? 'after' : 'unknown'
    assert.notEqual(
      state,
      'unknown',
      `${relative}: unrecognized or partial owner state (${hash})`,
    )
    states.set(relative, state)
    sources.set(relative, source)
  }

  const uniqueStates = new Set(states.values())
  assert.equal(
    uniqueStates.size,
    1,
    `Target111 evidence-gap package is partially applied: ${JSON.stringify(Object.fromEntries(states))}`,
  )

  if (uniqueStates.has('after')) {
    return {
      changes: [],
      hashes: Object.fromEntries(
        Object.entries(OWNER_HASHES).map(([relative, value]) => [relative, value.after]),
      ),
      treeRoot,
    }
  }

  const candidates = new Map()
  for (const [relative, patcher] of Object.entries(PATCHERS)) {
    const next = patcher(sources.get(relative))
    assert.equal(
      sha256(next),
      OWNER_HASHES[relative].after,
      `${relative}: bounded replay output hash`,
    )
    for (const fragment of REQUIRED_EVIDENCE[relative]) {
      assert.ok(next.includes(fragment), `${relative}: recovered ${fragment}`)
    }
    candidates.set(relative, next)
  }

  // All transformations and hashes have succeeded; commit synchronously.
  const changes = []
  for (const [relative, next] of candidates) {
    fs.writeFileSync(path.join(treeRoot, relative), next)
    changes.push(relative)
  }

  return {
    changes,
    hashes: Object.fromEntries(
      Object.entries(OWNER_HASHES).map(([relative, value]) => [relative, value.after]),
    ),
    treeRoot,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2]
  if (!root) {
    throw new Error('usage: replay-target111-evidence-gaps.mjs <tree-or-src-root>')
  }
  const first = replayTarget111EvidenceGaps(root)
  const second = replayTarget111EvidenceGaps(root)
  assert.deepEqual(second.changes, [], 'Target111 evidence-gap replay is idempotent')
  process.stdout.write(`${JSON.stringify(first, null, 2)}\n`)
}
