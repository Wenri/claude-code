import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASELINE_MAP_SHA256, safeRelative } from './diagnostic-build-inputs.mjs'

const VIRTUAL_ROOT = '/home/runner/code/tmp/claude-cli-external-build-2201'
const OWNER_PATHS = ['node_modules/@grpc/grpc-js/build/src/channelz.js', 'node_modules/@grpc/grpc-js/build/src/orca.js']
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Fixed edge inventory from retained-full-v2 diagnostic-build.json SHA-256
// 7c102e676865e20d68707fad56145ecefe746a2dc5d78cd97506dadf34feb594.
// Every physical byte pin is from the unchanged baseline mapped input tree.
const SOURCE_PINS = [
  ["node_modules/@aws-crypto/sha256-js/build/RawSha256.js",5128,"edf430dae46209527e5a7f2f5438a7b64eebd834674f08e3a55606705103d26b"],
  ["node_modules/@aws-crypto/sha256-js/build/constants.js",1641,"45340eb7f030f48987449216a5e43d03939696791f8e7eb874f7121bbdf2c190"],
  ["node_modules/@aws-crypto/sha256-js/build/jsSha256.js",2853,"49b2a1957e91af995586498a862e6cd1f9d2a83d8a0183a53142571a8a8de58f"],
  ["node_modules/@grpc/grpc-js/build/src/admin.js",1203,"8c2cd31dc0bec93d511ae41d09f08be2213be34e0b9f60573a6dd196aa87f97e"],
  ["node_modules/@grpc/grpc-js/build/src/backoff-timeout.js",6287,"f82515c6a031bf6f62a724c524da130647a4f35d0920a94a8c260d32c85c742e"],
  ["node_modules/@grpc/grpc-js/build/src/call.js",5779,"5140425c72ac14eb7ce50de206228a257e63c4b508d81c41c27fcc33e9757701"],
  ["node_modules/@grpc/grpc-js/build/src/certificate-provider.js",6124,"b4413db657cdb84a2ce479a752763e71aa02cccadce4f63fc8ff485261ec6698"],
  ["node_modules/@grpc/grpc-js/build/src/channel-credentials.js",18045,"50ee27f7b53eb7ee210d1ded3c4cb89ea8d0d0eb0954dc6e455eed5f8335dc1e"],
  ["node_modules/@grpc/grpc-js/build/src/channel.js",2729,"b0d3dfe61438c3901beb53b1459c495d6dbe65cae71864f3df8122d691cf2a6e"],
  ["node_modules/@grpc/grpc-js/build/src/channelz.js",22978,"45e081ca49fdb57147e36c6e948a7a7430f1593fa6c6465c2326c5546db3ab8e"],
  ["node_modules/@grpc/grpc-js/build/src/client-interceptors.js",17875,"93a12881497d55a94fb8e3271bbd503f20059cdb3776876f1b96a2fad07ebd39"],
  ["node_modules/@grpc/grpc-js/build/src/client.js",19103,"e3a84fe730d6afdb4fef32e6774aded7932c3a24b446d992baaa77d50bbaea7b"],
  ["node_modules/@grpc/grpc-js/build/src/compression-filter.js",12622,"bcdb903ca3651983eacddafe16862ed5c25faa7aee946f79273d903a92666b5a"],
  ["node_modules/@grpc/grpc-js/build/src/connectivity-state.js",1256,"c2c896a8814cee73b9f13829f7b3b95e7861daf24b620cfde69760773a781a96"],
  ["node_modules/@grpc/grpc-js/build/src/constants.js",3082,"24e18395d722626f978df87d9b3e24174cca482bd5369ce89cd414b7aa27971c"],
  ["node_modules/@grpc/grpc-js/build/src/control-plane-status.js",1534,"409ebb7350195928f63386afda09c663fbd3ac968a572360fd9418e8b9e951fb"],
  ["node_modules/@grpc/grpc-js/build/src/duration.js",2356,"c6f06aa8d1ae71e5136edbcb42586db951414aebc3f4aaf6e33afe03dbd5b28a"],
  ["node_modules/@grpc/grpc-js/build/src/experimental.js",7290,"53b84de0de89a06c0b9d654b0fe15306648fad2eeda3bdda6d597b683a2cb327"],
  ["node_modules/@grpc/grpc-js/build/src/http_proxy.js",9504,"4a6c7b2ff90af034d9b78cf681e55f97c1fc651e2428f8f767bb7633608113e3"],
  ["node_modules/@grpc/grpc-js/build/src/index.js",10007,"248fae70078a28b5dde8f8607df8cf6619a4da4066eea55a4df36b9694c92de3"],
  ["node_modules/@grpc/grpc-js/build/src/internal-channel.js",27366,"d04c913ed06645fd102901fb01149e47d8b541131217c3060c485bfd34f7dc3c"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-child-handler.js",5866,"7d7fc2bda20905a33a36e8daedd3b4ac60d165ee309410db8432a7082ae986bf"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-outlier-detection.js",25256,"ecf55803df4dbc4d9240a78ff0558fe562a4cff86dee5b3959d2d03f5c19266e"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-pick-first.js",22090,"7bec812850bb38317e8ffa477d809d21744577102f03c21f15d34a1c95867f18"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-round-robin.js",8951,"3b1b9b559cc1aa39e4a2784d3c7b0e1a8492a037fd5b4bd6367ef166338a608d"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-weighted-round-robin.js",18691,"42c6c0cb2774dd5d949283aeede326206cc62601ab4a858dab7b48b1dec305f7"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer.js",5013,"4b21a6d3bea94fa06f86e158ec93914ea666e73f0e9ffe311c9c14cfb3a7a319"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancing-call.js",13599,"d6931b65c4e0af5290b23ff3f3a10499a59a6aae54411c5de0775783c5c58d18"],
  ["node_modules/@grpc/grpc-js/build/src/logging.js",4200,"9d8c08337c42fdaa1e4093e171f177245f0c2ae4b221e9fd6469421c0307a453"],
  ["node_modules/@grpc/grpc-js/build/src/make-client.js",5424,"5c1ae3c7ca3b5b2d8076bcb27719839b74664241780d2fe4fc0ef9ff51aeab69"],
  ["node_modules/@grpc/grpc-js/build/src/metadata.js",9368,"730c1668b76f73084e3a402ebfb201bfb55381cb678eebfff4d0a3543e114d18"],
  ["node_modules/@grpc/grpc-js/build/src/orca.js",11724,"66c2fee5605355d5c45bda85da3f2bd96ad954935bad0e43ccbf4c1237b1661a"],
  ["node_modules/@grpc/grpc-js/build/src/picker.js",3288,"f8c0beefece60363399f39748476fa540cdc0074dc7623017398db146d85a3bb"],
  ["node_modules/@grpc/grpc-js/build/src/resolver-dns.js",16268,"1c23572ebcc3751c7f1ed1379da72d685f40b730b29aa07a618bffba7d14ed5f"],
  ["node_modules/@grpc/grpc-js/build/src/resolver-ip.js",4179,"b6b183c241ac60511259c3b29dee9e2bbe3ae1e13e4360f8122e1f07cf6a8e91"],
  ["node_modules/@grpc/grpc-js/build/src/resolving-call.js",12954,"6ae57d67a0377d5747d7b725e983e7bd6c5fc1797139de25667f748abe2291d0"],
  ["node_modules/@grpc/grpc-js/build/src/resolving-load-balancer.js",13556,"437502084ddc988064d63dc65d1f78f44318e5eb4217a7ccb69419eaa059c976"],
  ["node_modules/@grpc/grpc-js/build/src/retrying-call.js",27550,"a4d55d4b57417b0f94b040e4cb2e4eed8b3c5224b90fae940bb8f73e69ff58c2"],
  ["node_modules/@grpc/grpc-js/build/src/server-call.js",6918,"6113961fa7a833197dd28217e614d941bf4e2e938475c848ea8c9c1f62d94f09"],
  ["node_modules/@grpc/grpc-js/build/src/server-interceptors.js",30582,"76be06258ce191f9806954dcf1282ae713f0831b6d7101dcd2aa2e0a01c26e83"],
  ["node_modules/@grpc/grpc-js/build/src/server.js",81336,"b1d9488072f57c0aa82f505addb0f8967dd4895f8065438e2b36e9b93f4ab912"],
  ["node_modules/@grpc/grpc-js/build/src/service-config.js",17194,"cd2ce9d9b3e77630befb3b9f9da05cefadc2c54f6a603215d7d7c98f621b4019"],
  ["node_modules/@grpc/grpc-js/build/src/single-subchannel-channel.js",9989,"e2acfc0b1b5b9d470353144a642b77a731373ca600ccb81fda2900af047e977e"],
  ["node_modules/@grpc/grpc-js/build/src/subchannel-address.js",5928,"e105ceec9a9ebb9a29b2f0cdd38b9d258416cef73c4da6c03de57f1c6d7c6b9d"],
  ["node_modules/@grpc/grpc-js/build/src/subchannel-call.js",23941,"2ab864ec952102a1956cf7792b0cb3d04465c12fae63f3eebdbed45fb171d5e4"],
  ["node_modules/@grpc/grpc-js/build/src/subchannel-interface.js",3565,"7db7f8175ff05fbe9ce32d005d86fc7a511f2ba6cd2dbc36643eabdf2c8bfe12"],
  ["node_modules/@grpc/grpc-js/build/src/subchannel-pool.js",5644,"cca88948f2cbf433629167ee4ddf3595247040a0db2dbffd555dc68ea4dd6859"],
  ["node_modules/@grpc/grpc-js/build/src/subchannel.js",16794,"2de30b32ee8c13ef92aa41fc90261ef46c2ba3d00c4bff1d5f68f545b8c714eb"],
  ["node_modules/@grpc/grpc-js/build/src/transport.js",27235,"1f5e22bea97a2a5e2643b0bdcbbb4e86d794778e97da3017fc6f57c562738b6c"],
  ["node_modules/@grpc/proto-loader/build/src/index.js",10264,"6f99a960ec14b1afc20fc996824815d9d89d58e7d537c2f2e5c028d8012b012e"],
  ["node_modules/@js-sdsl/ordered-map/dist/cjs/index.js",20626,"09569c2f44472c1ad69bd9977d695fe808091319fab55241197d23d9e6b00676"],
  ["node_modules/@opentelemetry/core/build/src/baggage/constants.js",1534,"a897bae8f0811b4488e18a8c61db7f5ed252a1f4583c27374d45871537dc7ff6"],
  ["node_modules/@opentelemetry/core/build/src/baggage/utils.js",3282,"5d5662d2be924c84aec789ba943f38ff508047e8b85cb69d20cfcff86675e228"],
  ["node_modules/jsonwebtoken/node_modules/semver/internal/constants.js",859,"0e3c33323906f2c612b0855895965f3ebac4865dd8fa9c6b4893cd4ea71e383e"],
  ["node_modules/jsonwebtoken/node_modules/semver/internal/re.js",7998,"1ed1a651e379e5fe1612c9f1349179ebc787313b6b100d363beacffe32c54387"],
  ["node_modules/picomatch/lib/constants.js",4458,"d386ec4ee55ba11bf99e4c1a4b0b7e673726dcac56d401b52f6f669dc70957b6"],
  ["node_modules/picomatch/lib/parse.js",27544,"e8dba2cc1f3663fff122933848349d2d9a6ff1caf725336a90050f32fb59b885"],
  ["node_modules/picomatch/lib/picomatch.js",9881,"808ceda04cf4a7911e9d4eab72ac8d590685960d56238018917d17b57baf9ddd"],
  ["node_modules/picomatch/lib/scan.js",9189,"227fcc994a477ea95c5a0435d32783566334c6bd0dcc4a103029735ad8c9c535"],
  ["node_modules/picomatch/lib/utils.js",1994,"f04604f70cd1a3f6ace80b84766468674ff38b4bb83818d2ef1d81fc6355f935"],
  ["node_modules/pngjs/lib/bitpacker.js",4670,"3f7bfabcbc82bedd0cc8551bc210b44dc1fb179fa2ce3b8b1d39fa307d8af204"],
  ["node_modules/pngjs/lib/constants.js",662,"9e3b4f994ac93751e9ccb4d453e85e4f25a0b086a9f24ec92c7dcb06995bdf6c"],
  ["node_modules/pngjs/lib/packer-async.js",1162,"f50df0610749ce7b1a99abbe9e4596df7c16f96efd3848f12dd632b22cb02b45"],
  ["node_modules/pngjs/lib/packer-sync.js",1193,"1b516238168a42704e62ba44528406188864a6ddda2ae92d1b91e5e078cdaa2d"],
  ["node_modules/pngjs/lib/packer.js",3723,"b5f9956364c80d67c28d615ace639a5fb4d4d79d3acb235237f3050dca220e03"],
  ["node_modules/pngjs/lib/parser.js",7720,"574e43fea28a28cc6feb7ab62a480a86bb75411ee4bfaba76a7e9d7310b6e94c"],
  ["node_modules/semver/internal/constants.js",873,"38a112baf27ceca0260082ff26ac2fd7a9861cab1af12dd65e720277f68e6ce9"],
  ["node_modules/semver/internal/re.js",8141,"016655766a1381078a83ba04cd6ba39afc6e64c3e5a95789ad82c3672ae87a94"],
  ["node_modules/sharp/node_modules/semver/internal/constants.js",873,"38a112baf27ceca0260082ff26ac2fd7a9861cab1af12dd65e720277f68e6ce9"],
  ["node_modules/sharp/node_modules/semver/internal/re.js",8141,"016655766a1381078a83ba04cd6ba39afc6e64c3e5a95789ad82c3672ae87a94"],
  ["node_modules/undici/lib/core/constants.js",2610,"962e2278404f3c0b0d45bf67eb1966c39dc33c04b89e2e9f4a955ac057272b82"],
  ["node_modules/undici/lib/core/request.js",10439,"917b30ebe5b842f7b3c2949e7f8fbe7f58139dd8d65833d640b41ffd19a90985"],
  ["node_modules/undici/lib/core/tree.js",3455,"7f2625127a44664c9fd531c0938b00a8fbac467e2ad15e65dbef48cb5029a385"],
  ["node_modules/undici/lib/core/util.js",19042,"ebbaa1263b06489bc467b6b62d95b247f38006f94d17131482ea03685ef18da9"],
  ["node_modules/undici/lib/web/cookies/constants.js",306,"85a24ae49eb5954e15363049bbc68967f01aae7260246daa3f49ad375429acb4"],
  ["node_modules/undici/lib/web/cookies/parse.js",12390,"e7552e4673668f44e0802e5f3317e4883c53eda5c0da915a9ab9435c0a4756e5"],
  ["node_modules/undici/lib/web/fetch/constants.js",3395,"d6c377a0ce91b947a1299845516886be525f474aedad65c7dde35f2c9301b97e"],
  ["node_modules/undici/lib/web/fetch/index.js",82477,"ec5fa587004c3d852f4e29ca4726eff00bede5cc4793dc6431b0c13ca0576c9f"],
  ["node_modules/undici/lib/web/fetch/request.js",34565,"eed7953967abb30acad4c7ae54417e61d2c53bd3393a6f1929270865724345ad"],
  ["node_modules/undici/lib/web/fetch/response.js",19205,"103a92a5e44ee47822ad5892b6134b8b237fad505a4ccf9fb4d2963af1c49fb6"],
  ["node_modules/undici/lib/web/fetch/util.js",50492,"85ee9fbb5c6083b521ac108959dddc4029e3549350da5e4ec10bfc2077846039"],
  ["node_modules/undici/lib/web/websocket/connection.js",14206,"399bfffecf05b8c1c43db4ca7b8ed11ad2176eb0e08d89e917c643e2c38c2761"],
  ["node_modules/undici/lib/web/websocket/constants.js",1073,"55527aeddaa0d2ca2a9b57080be9ee3113f674dce45069cf6d494d5149f8767c"],
  ["node_modules/undici/lib/web/websocket/frame.js",2307,"a60454364e7f2ec5db26c6ff03d20262d35fb2f1a0b2f6d625fd644be21cb118"],
  ["node_modules/undici/lib/web/websocket/receiver.js",13659,"d8b8196ca9f01c90892e383da0340c6ade6fafc5415b5eaedd74431d3936a9ff"],
  ["node_modules/undici/lib/web/websocket/sender.js",2291,"147f118843cdbbb884b39b2f4644cbec6671a530018e3baedafadf04339e4dcd"],
  ["node_modules/undici/lib/web/websocket/util.js",9101,"709b5f90955689909493541471d703c6e69694a26c7bccbf3ec00f1b51d4ea16"],
  ["node_modules/undici/lib/web/websocket/websocket.js",18499,"6c5b8b1ef1e252dc8f4100646989a9b93ef8e6861e4bfa8fcfc0409660aed1cd"],
  ["node_modules/ws/lib/buffer-util.js",3056,"8b0a45739132f82e25ea13163780abf547ccfe989267f3eb7abb475beec92da3"],
  ["node_modules/ws/lib/constants.js",479,"7efe5c0b888e4fde8bd9076c65b81bfd0df0963810b977d890df126929bb9190"],
  ["node_modules/ws/lib/event-target.js",7321,"c45d3c6e12d170c860c0c3f1a050aa0f864d9806632b609a1e607d675aba128c"],
  ["node_modules/ws/lib/permessage-deflate.js",14510,"adcedcb3069b7c6db3fd6cec93699ef70bd4061126b987dd9a8f7cb16d2b7530"],
  ["node_modules/ws/lib/receiver.js",16460,"7b9f6afc1fffb5c98d768d7d3d6fc1b709f28b45c6ae2682ff255075394323d9"],
  ["node_modules/ws/lib/sender.js",16711,"a80e8688dde53d46d836a58c9d15121ee12e978b7b0f656ed818c63d20df5f94"],
  ["node_modules/ws/lib/validation.js",3903,"41ce8e83d0d434132e1704895fedb91f6703a701b42d91c80954ab29b2845593"],
  ["node_modules/ws/lib/websocket-server.js",16393,"fe8a410e89325608dc94d09778a2650bf041b9b7f5dff61d5005ea111e09a508"],
  ["node_modules/ws/lib/websocket.js",36463,"ea50fd045185975e0e572637cd96fa065a7e988a1d1c890d18002c75a8a253b9"],
]
const RESOLUTION_EDGES = [
  ["node_modules/@aws-crypto/sha256-js/build/RawSha256.js","./constants","node_modules/@aws-crypto/sha256-js/build/constants.js"],
  ["node_modules/@aws-crypto/sha256-js/build/jsSha256.js","./constants","node_modules/@aws-crypto/sha256-js/build/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/backoff-timeout.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/call.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/certificate-provider.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/channel-credentials.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/channel.js","./channel-credentials","node_modules/@grpc/grpc-js/build/src/channel-credentials.js"],
  ["node_modules/@grpc/grpc-js/build/src/channelz.js","./admin","node_modules/@grpc/grpc-js/build/src/admin.js"],
  ["node_modules/@grpc/grpc-js/build/src/channelz.js","./connectivity-state","node_modules/@grpc/grpc-js/build/src/connectivity-state.js"],
  ["node_modules/@grpc/grpc-js/build/src/channelz.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/channelz.js","./make-client","node_modules/@grpc/grpc-js/build/src/make-client.js"],
  ["node_modules/@grpc/grpc-js/build/src/channelz.js","./subchannel-address","node_modules/@grpc/grpc-js/build/src/subchannel-address.js"],
  ["node_modules/@grpc/grpc-js/build/src/channelz.js","@grpc/proto-loader","node_modules/@grpc/proto-loader/build/src/index.js"],
  ["node_modules/@grpc/grpc-js/build/src/channelz.js","@js-sdsl/ordered-map","node_modules/@js-sdsl/ordered-map/dist/cjs/index.js"],
  ["node_modules/@grpc/grpc-js/build/src/client-interceptors.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/client.js","./connectivity-state","node_modules/@grpc/grpc-js/build/src/connectivity-state.js"],
  ["node_modules/@grpc/grpc-js/build/src/client.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/compression-filter.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/control-plane-status.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/experimental.js","./admin","node_modules/@grpc/grpc-js/build/src/admin.js"],
  ["node_modules/@grpc/grpc-js/build/src/experimental.js","./backoff-timeout","node_modules/@grpc/grpc-js/build/src/backoff-timeout.js"],
  ["node_modules/@grpc/grpc-js/build/src/experimental.js","./channel-credentials","node_modules/@grpc/grpc-js/build/src/channel-credentials.js"],
  ["node_modules/@grpc/grpc-js/build/src/experimental.js","./duration","node_modules/@grpc/grpc-js/build/src/duration.js"],
  ["node_modules/@grpc/grpc-js/build/src/experimental.js","./subchannel-address","node_modules/@grpc/grpc-js/build/src/subchannel-address.js"],
  ["node_modules/@grpc/grpc-js/build/src/experimental.js","./subchannel-interface","node_modules/@grpc/grpc-js/build/src/subchannel-interface.js"],
  ["node_modules/@grpc/grpc-js/build/src/http_proxy.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/http_proxy.js","./subchannel-address","node_modules/@grpc/grpc-js/build/src/subchannel-address.js"],
  ["node_modules/@grpc/grpc-js/build/src/index.js","./admin","node_modules/@grpc/grpc-js/build/src/admin.js"],
  ["node_modules/@grpc/grpc-js/build/src/index.js","./channel-credentials","node_modules/@grpc/grpc-js/build/src/channel-credentials.js"],
  ["node_modules/@grpc/grpc-js/build/src/index.js","./channelz","node_modules/@grpc/grpc-js/build/src/channelz.js"],
  ["node_modules/@grpc/grpc-js/build/src/index.js","./connectivity-state","node_modules/@grpc/grpc-js/build/src/connectivity-state.js"],
  ["node_modules/@grpc/grpc-js/build/src/index.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/index.js","./make-client","node_modules/@grpc/grpc-js/build/src/make-client.js"],
  ["node_modules/@grpc/grpc-js/build/src/index.js","./orca","node_modules/@grpc/grpc-js/build/src/orca.js"],
  ["node_modules/@grpc/grpc-js/build/src/internal-channel.js","./channel-credentials","node_modules/@grpc/grpc-js/build/src/channel-credentials.js"],
  ["node_modules/@grpc/grpc-js/build/src/internal-channel.js","./channelz","node_modules/@grpc/grpc-js/build/src/channelz.js"],
  ["node_modules/@grpc/grpc-js/build/src/internal-channel.js","./connectivity-state","node_modules/@grpc/grpc-js/build/src/connectivity-state.js"],
  ["node_modules/@grpc/grpc-js/build/src/internal-channel.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/internal-channel.js","./subchannel-interface","node_modules/@grpc/grpc-js/build/src/subchannel-interface.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-child-handler.js","./connectivity-state","node_modules/@grpc/grpc-js/build/src/connectivity-state.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-outlier-detection.js","./connectivity-state","node_modules/@grpc/grpc-js/build/src/connectivity-state.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-outlier-detection.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-outlier-detection.js","./duration","node_modules/@grpc/grpc-js/build/src/duration.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-outlier-detection.js","./subchannel-address","node_modules/@grpc/grpc-js/build/src/subchannel-address.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-outlier-detection.js","./subchannel-interface","node_modules/@grpc/grpc-js/build/src/subchannel-interface.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-pick-first.js","./connectivity-state","node_modules/@grpc/grpc-js/build/src/connectivity-state.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-pick-first.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-pick-first.js","./subchannel-address","node_modules/@grpc/grpc-js/build/src/subchannel-address.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-round-robin.js","./connectivity-state","node_modules/@grpc/grpc-js/build/src/connectivity-state.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-round-robin.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-round-robin.js","./subchannel-address","node_modules/@grpc/grpc-js/build/src/subchannel-address.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-weighted-round-robin.js","./connectivity-state","node_modules/@grpc/grpc-js/build/src/connectivity-state.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-weighted-round-robin.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-weighted-round-robin.js","./duration","node_modules/@grpc/grpc-js/build/src/duration.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-weighted-round-robin.js","./orca","node_modules/@grpc/grpc-js/build/src/orca.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer-weighted-round-robin.js","./subchannel-address","node_modules/@grpc/grpc-js/build/src/subchannel-address.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancer.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancing-call.js","./connectivity-state","node_modules/@grpc/grpc-js/build/src/connectivity-state.js"],
  ["node_modules/@grpc/grpc-js/build/src/load-balancing-call.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/logging.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/metadata.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/orca.js","./backoff-timeout","node_modules/@grpc/grpc-js/build/src/backoff-timeout.js"],
  ["node_modules/@grpc/grpc-js/build/src/orca.js","./channel-credentials","node_modules/@grpc/grpc-js/build/src/channel-credentials.js"],
  ["node_modules/@grpc/grpc-js/build/src/orca.js","./connectivity-state","node_modules/@grpc/grpc-js/build/src/connectivity-state.js"],
  ["node_modules/@grpc/grpc-js/build/src/orca.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/orca.js","./duration","node_modules/@grpc/grpc-js/build/src/duration.js"],
  ["node_modules/@grpc/grpc-js/build/src/orca.js","./make-client","node_modules/@grpc/grpc-js/build/src/make-client.js"],
  ["node_modules/@grpc/grpc-js/build/src/orca.js","./subchannel-interface","node_modules/@grpc/grpc-js/build/src/subchannel-interface.js"],
  ["node_modules/@grpc/grpc-js/build/src/orca.js","@grpc/proto-loader","node_modules/@grpc/proto-loader/build/src/index.js"],
  ["node_modules/@grpc/grpc-js/build/src/picker.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/resolver-dns.js","./backoff-timeout","node_modules/@grpc/grpc-js/build/src/backoff-timeout.js"],
  ["node_modules/@grpc/grpc-js/build/src/resolver-dns.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/resolver-ip.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/resolver-ip.js","./subchannel-address","node_modules/@grpc/grpc-js/build/src/subchannel-address.js"],
  ["node_modules/@grpc/grpc-js/build/src/resolving-call.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/resolving-load-balancer.js","./backoff-timeout","node_modules/@grpc/grpc-js/build/src/backoff-timeout.js"],
  ["node_modules/@grpc/grpc-js/build/src/resolving-load-balancer.js","./connectivity-state","node_modules/@grpc/grpc-js/build/src/connectivity-state.js"],
  ["node_modules/@grpc/grpc-js/build/src/resolving-load-balancer.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/retrying-call.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/server-call.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/server-interceptors.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/server-interceptors.js","./orca","node_modules/@grpc/grpc-js/build/src/orca.js"],
  ["node_modules/@grpc/grpc-js/build/src/server.js","./channelz","node_modules/@grpc/grpc-js/build/src/channelz.js"],
  ["node_modules/@grpc/grpc-js/build/src/server.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/server.js","./subchannel-address","node_modules/@grpc/grpc-js/build/src/subchannel-address.js"],
  ["node_modules/@grpc/grpc-js/build/src/service-config.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/single-subchannel-channel.js","./channelz","node_modules/@grpc/grpc-js/build/src/channelz.js"],
  ["node_modules/@grpc/grpc-js/build/src/single-subchannel-channel.js","./connectivity-state","node_modules/@grpc/grpc-js/build/src/connectivity-state.js"],
  ["node_modules/@grpc/grpc-js/build/src/single-subchannel-channel.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/subchannel-call.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/subchannel-pool.js","./subchannel-address","node_modules/@grpc/grpc-js/build/src/subchannel-address.js"],
  ["node_modules/@grpc/grpc-js/build/src/subchannel.js","./backoff-timeout","node_modules/@grpc/grpc-js/build/src/backoff-timeout.js"],
  ["node_modules/@grpc/grpc-js/build/src/subchannel.js","./channelz","node_modules/@grpc/grpc-js/build/src/channelz.js"],
  ["node_modules/@grpc/grpc-js/build/src/subchannel.js","./connectivity-state","node_modules/@grpc/grpc-js/build/src/connectivity-state.js"],
  ["node_modules/@grpc/grpc-js/build/src/subchannel.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/subchannel.js","./subchannel-address","node_modules/@grpc/grpc-js/build/src/subchannel-address.js"],
  ["node_modules/@grpc/grpc-js/build/src/transport.js","./channelz","node_modules/@grpc/grpc-js/build/src/channelz.js"],
  ["node_modules/@grpc/grpc-js/build/src/transport.js","./constants","node_modules/@grpc/grpc-js/build/src/constants.js"],
  ["node_modules/@grpc/grpc-js/build/src/transport.js","./subchannel-address","node_modules/@grpc/grpc-js/build/src/subchannel-address.js"],
  ["node_modules/@opentelemetry/core/build/src/baggage/utils.js","./constants","node_modules/@opentelemetry/core/build/src/baggage/constants.js"],
  ["node_modules/jsonwebtoken/node_modules/semver/internal/re.js","./constants","node_modules/jsonwebtoken/node_modules/semver/internal/constants.js"],
  ["node_modules/picomatch/lib/parse.js","./constants","node_modules/picomatch/lib/constants.js"],
  ["node_modules/picomatch/lib/picomatch.js","./constants","node_modules/picomatch/lib/constants.js"],
  ["node_modules/picomatch/lib/scan.js","./constants","node_modules/picomatch/lib/constants.js"],
  ["node_modules/picomatch/lib/utils.js","./constants","node_modules/picomatch/lib/constants.js"],
  ["node_modules/pngjs/lib/bitpacker.js","./constants","node_modules/pngjs/lib/constants.js"],
  ["node_modules/pngjs/lib/packer-async.js","./constants","node_modules/pngjs/lib/constants.js"],
  ["node_modules/pngjs/lib/packer-sync.js","./constants","node_modules/pngjs/lib/constants.js"],
  ["node_modules/pngjs/lib/packer.js","./constants","node_modules/pngjs/lib/constants.js"],
  ["node_modules/pngjs/lib/parser.js","./constants","node_modules/pngjs/lib/constants.js"],
  ["node_modules/semver/internal/re.js","./constants","node_modules/semver/internal/constants.js"],
  ["node_modules/sharp/node_modules/semver/internal/re.js","./constants","node_modules/sharp/node_modules/semver/internal/constants.js"],
  ["node_modules/undici/lib/core/request.js","./constants","node_modules/undici/lib/core/constants.js"],
  ["node_modules/undici/lib/core/tree.js","./constants","node_modules/undici/lib/core/constants.js"],
  ["node_modules/undici/lib/core/util.js","./constants","node_modules/undici/lib/core/constants.js"],
  ["node_modules/undici/lib/web/cookies/parse.js","./constants","node_modules/undici/lib/web/cookies/constants.js"],
  ["node_modules/undici/lib/web/fetch/index.js","./constants","node_modules/undici/lib/web/fetch/constants.js"],
  ["node_modules/undici/lib/web/fetch/request.js","./constants","node_modules/undici/lib/web/fetch/constants.js"],
  ["node_modules/undici/lib/web/fetch/response.js","./constants","node_modules/undici/lib/web/fetch/constants.js"],
  ["node_modules/undici/lib/web/fetch/util.js","./constants","node_modules/undici/lib/web/fetch/constants.js"],
  ["node_modules/undici/lib/web/websocket/connection.js","./constants","node_modules/undici/lib/web/websocket/constants.js"],
  ["node_modules/undici/lib/web/websocket/frame.js","./constants","node_modules/undici/lib/web/websocket/constants.js"],
  ["node_modules/undici/lib/web/websocket/receiver.js","./constants","node_modules/undici/lib/web/websocket/constants.js"],
  ["node_modules/undici/lib/web/websocket/sender.js","./constants","node_modules/undici/lib/web/websocket/constants.js"],
  ["node_modules/undici/lib/web/websocket/util.js","./constants","node_modules/undici/lib/web/websocket/constants.js"],
  ["node_modules/undici/lib/web/websocket/websocket.js","./constants","node_modules/undici/lib/web/websocket/constants.js"],
  ["node_modules/ws/lib/buffer-util.js","./constants","node_modules/ws/lib/constants.js"],
  ["node_modules/ws/lib/event-target.js","./constants","node_modules/ws/lib/constants.js"],
  ["node_modules/ws/lib/permessage-deflate.js","./constants","node_modules/ws/lib/constants.js"],
  ["node_modules/ws/lib/receiver.js","./constants","node_modules/ws/lib/constants.js"],
  ["node_modules/ws/lib/sender.js","./constants","node_modules/ws/lib/constants.js"],
  ["node_modules/ws/lib/validation.js","./constants","node_modules/ws/lib/constants.js"],
  ["node_modules/ws/lib/websocket-server.js","./constants","node_modules/ws/lib/constants.js"],
  ["node_modules/ws/lib/websocket.js","./constants","node_modules/ws/lib/constants.js"],
]


export function baselineVirtualGrpcPathRules() {
  return OWNER_PATHS.map(sourceRelative => ({ sourceRelative, virtualAbsolutePath: `${VIRTUAL_ROOT}/${sourceRelative}` }))
}

// A filename/resolution candidate only. The two parent inputs retain every byte;
// dependencies share the existing physical identities, including incoming cycles.
export function createVirtualGrpcPathRecipe({ inputRoot, manifestFiles, rules }) {
  assert(Array.isArray(rules) && rules.length === OWNER_PATHS.length, 'Exactly two pinned gRPC rules are required')
  const expectedRules = baselineVirtualGrpcPathRules(), selected = new Set()
  for (const rule of rules) {
    assert(rule && typeof rule === 'object' && !Array.isArray(rule), 'Invalid gRPC rule')
    assert.deepEqual(Object.keys(rule).sort(), ['sourceRelative', 'virtualAbsolutePath'], 'Unexpected gRPC rule fields')
    const expected = expectedRules.find(item => item.sourceRelative === rule.sourceRelative)
    assert(expected && !selected.has(rule.sourceRelative), 'Unknown or duplicate gRPC source rule')
    assert.deepEqual(rule, expected, 'gRPC rule differs from pinned recipe')
    selected.add(rule.sourceRelative)
  }
  assert.equal(typeof inputRoot, 'string')
  const root = path.resolve(inputRoot), rootStatus = fs.lstatSync(root)
  assert(rootStatus.isDirectory() && !rootStatus.isSymbolicLink(), 'gRPC input root must be a real directory')
  assert(Array.isArray(manifestFiles), 'Staged manifest is required')
  const manifest = new Map(manifestFiles.map(row => [safeRelative(row.path), row]))
  assert.equal(manifest.size, manifestFiles.length, 'Duplicate staged manifest path')
  const pins = new Map(SOURCE_PINS.map(([relative, bytes, hash]) => [relative, { bytes, sha256: hash }]))
  function readPinned(relative) {
    const expected = pins.get(relative), actual = manifest.get(relative)
    assert(expected && actual && actual.bytes === expected.bytes && actual.sha256 === expected.sha256,
      `gRPC manifest pin differs: ${relative}`)
    let filename = root
    const segments = relative.split('/')
    for (let i = 0; i < segments.length; i++) {
      filename = path.join(filename, segments[i])
      const status = fs.lstatSync(filename)
      assert(!status.isSymbolicLink(), `Symlink gRPC input is not accepted: ${relative}`)
      assert(i === segments.length - 1 ? status.isFile() : status.isDirectory(), `Nonregular gRPC input: ${relative}`)
    }
    const bytes = fs.readFileSync(filename)
    assert.equal(bytes.length, expected.bytes, `gRPC input length differs: ${relative}`)
    assert.equal(sha256(bytes), expected.sha256, `gRPC input hash differs: ${relative}`)
    return bytes
  }
  // Setup checks the complete allowlist, including non-target requests whose
  // matching callback returns undefined. Callback checks then detect later edits.
  for (const relative of pins.keys()) readPinned(relative)
  const files = {}, virtualToRelative = new Map(), relativeToVirtual = new Map()
  for (const rule of expectedRules) {
    const bytes = readPinned(rule.sourceRelative), contents = bytes.toString('utf8')
    assert(bytes.equals(Buffer.from(contents, 'utf8')), 'gRPC source UTF-8 decoding changed bytes')
    files[rule.virtualAbsolutePath] = contents
    virtualToRelative.set(rule.virtualAbsolutePath, rule.sourceRelative)
    relativeToVirtual.set(rule.sourceRelative, rule.virtualAbsolutePath)
  }
  const edges = new Map()
  for (const [importer, specifier, target] of RESOLUTION_EDGES) {
    assert(pins.has(importer) && pins.has(target), 'Unpinned gRPC edge endpoint')
    const key = `${importer}\0${specifier}`
    assert(!edges.has(key), 'Duplicate pinned gRPC edge')
    edges.set(key, target)
  }
  const specifiers = [...new Set(RESOLUTION_EDGES.map(row => row[1]))].sort()
  const filter = new RegExp(`^(?:${specifiers.map(escapeRegex).join('|')})$`)
  const records = []
  const plugin = {
    name: 'two-pinned-virtual-grpc-paths',
    setup(build) {
      build.onResolve({ filter, namespace: 'file' }, args => {
        const event = { hook: 'onResolve', specifier: args.path, importer: args.importer,
          namespace: args.namespace, kind: args.kind, accepted: false }
        records.push(event)
        assert.equal(args.namespace, 'file', 'Unexpected gRPC resolver namespace')
        assert(filter.test(args.path), 'Unexpected gRPC resolver specifier')
        assert(typeof args.importer === 'string' && path.isAbsolute(args.importer), 'Invalid gRPC importer')
        const virtualOwner = virtualToRelative.get(args.importer)
        const relative = virtualOwner ?? path.relative(root, args.importer)
        safeRelative(relative)
        assert(!relativeToVirtual.has(relative) || virtualOwner, 'Physical duplicate of virtual gRPC parent')
        const target = edges.get(`${relative}\0${args.path}`)
        assert(target, `Unrecorded matching gRPC request: ${relative} -> ${args.path}`)
        readPinned(relative); readPinned(target)
        const virtualTarget = relativeToVirtual.get(target)
        Object.assign(event, { sourceRelative: relative, sourceSha256: pins.get(relative).sha256,
          recordedTarget: target, targetSha256: pins.get(target).sha256 })
        if (virtualOwner || virtualTarget) {
          assert.equal(args.kind, 'require-call', 'Pinned gRPC redirect must be a require call')
          const destination = virtualTarget ?? path.join(root, target)
          Object.assign(event, { accepted: true, action: virtualTarget ? 'canonical-virtual-parent' : 'physical-child', resolvedPath: destination })
          return { path: destination, namespace: 'file' }
        }
        Object.assign(event, { accepted: true, action: 'recorded-native-passthrough' })
        return undefined
      })
    },
  }
  const filename = fileURLToPath(import.meta.url)
  return { files, plugin, records, recipe: {
    kind: 'two-pinned-virtual-grpc-paths', sourceEquivalenceEstablished: false,
    baselineSourceMapSha256: BASELINE_MAP_SHA256,
    priorResolutionReportSha256: '7c102e676865e20d68707fad56145ecefe746a2dc5d78cd97506dadf34feb594',
    inputRoot: root, rules: expectedRules, filter: { source: filter.source, namespace: 'file' },
    inputPins: SOURCE_PINS.map(([relative, bytes, hash]) => ({ path: relative, bytes, sha256: hash })),
    edges: RESOLUTION_EDGES.map(([importer, specifier, target]) => ({ importer, specifier, target })),
    unhookedBuiltinEdges: [{ importer: OWNER_PATHS[0], specifier: 'net', basis: 'compiler-handled-builtin' }],
    tool: { path: filename, sha256: sha256(fs.readFileSync(filename)) },
    limitations: ['Only exact recorded importer/specifier pairs may match this hook; unchanged non-target pairs return undefined and are recorded.',
      'Matching resolver hooks may change compiler behavior even when returning undefined; full emitted AST comparison remains required.',
      'Native built-in net remains compiler-handled; no virtual files are written to the filesystem.',
      'Dependency targets and virtual filenames are explicit build candidates; mirror source-map input is not authenticated original npm source.'],
  } }
}
