import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { parse, tokenizer } from 'acorn'
import { indexGeneratedBundle } from '../lib/structural-delta.mjs'

const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const bundleOptions = {
  skip: !selected
    ? 'not applicable to ' + semanticCase
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.112, 2.1.113, and 2.1.116 bundles are required'
      : false,
  timeout: 90_000,
}

const BASELINE_SHA256 =
  'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f'
const TARGET_SHA256 =
  '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba'
const LATEST_SHA256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

// The semantic-literal scanner inventories the installed target's 87-byte
// launcher prefix. Structural ranges and semantic tests use cli.inner.js.
const TARGET_REPORT_PROLOGUE = 87

// Exact target113 routines parser/loader closure.
const targetUnits = [
  [19327,11830942,11831218,"FunctionDeclaration","a9639d2879e259a05a9bab515e672e0204bebde65504663bd3559a8a2843d762","6ab8c8c8276730c75f61b631e1e382d925a2c056f7ec42d71c4100f02fc4f698"],
  [19328,11831218,11832054,"FunctionDeclaration","f235d122d2f6a39764df8fbae2972ef058e72cff80c5c39cfc43b2394f8a6db7","af2f0a90ced6a71f88ec8b3a5a06d331a4c12e848e98d3c9c823004a0fdc3670"],
  [19329,11832054,11832417,"FunctionDeclaration","34dc3bfa3c0435dd4e2875a82aa3a4c6044f629d1173dac89a20ad7b93c041ee","e03406df9a746773b5817e32252d5d66294450fb7900edc32d3c47528d81a394"],
  [19330,11832417,11833065,"FunctionDeclaration","fd9e90184d267bc5ac8eca80d63f618b2ad831835e54e2949d553b132c5e5532","911944046cafe40da76798a3c193785db1e731718ffed571b9cc593b5e6887fe"],
  [19331,11833065,11833837,"FunctionDeclaration","ebad2f54376ec5f641662bb537a5e3be2d8e9852399091f67d7b972145dd015e","89a2cd3a9cafeaba981e3da87b3506b474fa50d2c258cfd1816fb84d90076811"],
  [19332,11833837,11833923,"FunctionDeclaration","9c50572683fc01f3d233063af74e5cc0791f50dfb14bdf0d0b4ab2d46bc9f069","9878d68391996800614748ef0c9c742239800a620a2ec7d2c98e397601de0b69"],
  [19333,11833923,11833978,"FunctionDeclaration","d4016017c65e19ddecfef3734a65fb8ea06782c38e1a2215de675208302d0817","dfc6eed7ad95f36c2f6dab36c830bd133e7bed22a4904f0ca72a4d2ddaf57c9d"],
  [19334,11833978,11834061,"FunctionDeclaration","4e151e24d813a984a05fc963dfb5e75b21f975b95f8801efb5f3f980e697f7be","4666c3f4ea913938642ec3edc98c9e1016c76cf9d163f18fb1a93cd8a0e6e169"],
  [19335,11834061,11834292,"FunctionDeclaration","644721ea3709e8015469005b16f99ce714eb9c648ea8641ead8ec212c993ca14","41095c88b5bcb1ab68a80ee540e79e7a0ed962fd52562d4f82979480f6ed0217"],
  [19336,11834292,11835184,"FunctionDeclaration","3e8cc1f815e793a28117f1cf8bf260e9fc21c2b3c23376535757fbbbc06eba28","e7eec5f6163ebe9990a07e902b439f625c448be2f87c9725b33abdabb9db8d2f"],
  [19337,11835184,11835283,"FunctionDeclaration","1ad21015ffc535a9287799ab813b94cb75abe7c3e2d84bbb89bd2b55ed507e1b","e4a8d07ff0d80ba52e31c71f8e9fcaf4a1096da86d84fe3df317aee81c6b77c6"],
  [19338,11835283,11835462,"FunctionDeclaration","eb6b50b065fe5714fc29430bf86c274c7d54f613cd7e9b04c17ce81ea1b5c993","cc65802429467aef30f227d539ebef7b84fad067c5e0e8c7101222a671f9551c"],
  [19339,11835462,11835531,"FunctionDeclaration","42268dbc59e31263b6d7539bdb1522b26606aa24ac67804f2cf262795059c549","def43733171a4d7366de3a5804c1373920d97bb907fb95b8290f27db04ef92c4"],
  [19340,11835531,11835603,"FunctionDeclaration","68534298b1d5ac2edff872ef472b2432c34af29306582574bde3bbd44533ca93","fde876febeade5c0010e3e24d4abb5bab4c40522e4497140812865f27939343a"],
  [19341,11835603,11835682,"FunctionDeclaration","36c7cac7604050407ee91fa053ee099f95ab9612f27440b64a6a7288bb055a2c","bc64d840210cabd5c9b7812c229fc55395846d389b3735e1a72da9bfaffda416"],
  [19342,11835682,11835774,"FunctionDeclaration","470fbf772805e510bf1af5a37dbebfd67971bc1964642a390d5db1e36f67abb7","65efaaf4a0835d714d631d5d29e0602538fe0cdbe7959d2bf16103dd8e9aa82d"],
  [19343,11835774,11835790,"VariableDeclaration","b9a0db483160f31a9d54d3777f89bc659ec919458a558c9b3f3e6ceaeb3d6420","f01cd597bd3633d1bebd07d15c2a2b1ddbc1cf9bf23063af95e902d5b68e0e6d"],
  [19344,11835790,11836183,"VariableDeclaration","e2685de8516d2ee226a6aa47dfe2c8f0f8d8a4ac57942de2d090d00c0ff62a54","8d4394759d710d1626b7830353da755153fb5354cb684ac7cfd594e4cbcd61a8"],
  [19345,11836183,11836195,"VariableDeclaration","d1cc50d5387141a668d00cfa00590a321ef3ece5e0603c059e29131c351ffaa1","c01b63c9a83efc2c82e465e2d798fc3c37152b39ff84fb5b2ced94dd86e0163b"],
  [19346,11836195,11836869,"VariableDeclaration","e78a93302c49ec2a672acfc56c18a3edef5a41ccc9bf366e983baf7d13578f10","934d7bf7daa81106d1c93d8e5b7ff554ffdb2042fa76afdf9b97fc1e540fe292"],
]

// The same closed cluster survives minifier renaming in target116.
const latestUnits = [
  [19583,11921637,11921913,"FunctionDeclaration","dbb15bbb252c7af2f8083527883f1831d35140291f72072702b5af6fc50775e4","6ab8c8c8276730c75f61b631e1e382d925a2c056f7ec42d71c4100f02fc4f698"],
  [19584,11921913,11922749,"FunctionDeclaration","c8d51b6107fb05688ff2f9ed7a1aa621c88b773d381fba980c28a4c5ec48c79c","af2f0a90ced6a71f88ec8b3a5a06d331a4c12e848e98d3c9c823004a0fdc3670"],
  [19585,11922749,11923112,"FunctionDeclaration","3aa122c269a145ea59dbfcadaa1255cdc5ed05eaddaf5b7eca2379d0690a2b1e","e03406df9a746773b5817e32252d5d66294450fb7900edc32d3c47528d81a394"],
  [19586,11923112,11923760,"FunctionDeclaration","bcccada881d6b4ef5ca5eb3c7727e507b3ab8b19c2169f4849e47aedbb12ee9c","911944046cafe40da76798a3c193785db1e731718ffed571b9cc593b5e6887fe"],
  [19587,11923760,11924532,"FunctionDeclaration","84ff253583a99ad1eec4e78778ccf1f552209a1fc3289e9cf4fb7860764cca68","89a2cd3a9cafeaba981e3da87b3506b474fa50d2c258cfd1816fb84d90076811"],
  [19588,11924532,11924618,"FunctionDeclaration","026dbc9964ecceeb049d3c8108d2d8035fabab6af4d11587c13c43ee8f1620e7","9878d68391996800614748ef0c9c742239800a620a2ec7d2c98e397601de0b69"],
  [19589,11924618,11924673,"FunctionDeclaration","3fd4d1947d4493396b56ebb072968ecfcafed400274b080b49c3225168ebe23a","dfc6eed7ad95f36c2f6dab36c830bd133e7bed22a4904f0ca72a4d2ddaf57c9d"],
  [19590,11924673,11924756,"FunctionDeclaration","a4e143d0d26fa3578a01e69d3a01a6f58ad9fde2d2b79a2f30ebfd16762db33e","4666c3f4ea913938642ec3edc98c9e1016c76cf9d163f18fb1a93cd8a0e6e169"],
  [19591,11924756,11924987,"FunctionDeclaration","0985bf4e712bb43f5fb3d7b4b11b0c747f1a8d3efe766e2df4450975b86158fb","41095c88b5bcb1ab68a80ee540e79e7a0ed962fd52562d4f82979480f6ed0217"],
  [19592,11924987,11925879,"FunctionDeclaration","18ea3f8e83174b84fd8f2200f8dddace5aec4e977cae0c8e76139a9e1706bddd","e7eec5f6163ebe9990a07e902b439f625c448be2f87c9725b33abdabb9db8d2f"],
  [19593,11925879,11925978,"FunctionDeclaration","04d08d3634042a8c8828c11c5a08ce8875769208d1565aed9ce63041c5baba8c","e4a8d07ff0d80ba52e31c71f8e9fcaf4a1096da86d84fe3df317aee81c6b77c6"],
  [19594,11925978,11926157,"FunctionDeclaration","f3c691c740017b2a138e13a37447fcb2be2ec2a393e8302017557caa893ae6e3","cc65802429467aef30f227d539ebef7b84fad067c5e0e8c7101222a671f9551c"],
  [19595,11926157,11926226,"FunctionDeclaration","d0b01cc63e7ebdec471ed58fa2218d617484bdecbcce14d91ca3cfd2f654c511","def43733171a4d7366de3a5804c1373920d97bb907fb95b8290f27db04ef92c4"],
  [19596,11926226,11926298,"FunctionDeclaration","ed604ad274d778053f37616ca1cf8baf7728523674350083886e37f303f5df1e","fde876febeade5c0010e3e24d4abb5bab4c40522e4497140812865f27939343a"],
  [19597,11926298,11926377,"FunctionDeclaration","76f750f18573d8cb0e71902abc1f15309396686e06a5db748088b407338a1cb9","bc64d840210cabd5c9b7812c229fc55395846d389b3735e1a72da9bfaffda416"],
  [19598,11926377,11926469,"FunctionDeclaration","7cefff8288219ade3582541cf9bee3c26160fa82f8c2aee54224171aa0064adf","65efaaf4a0835d714d631d5d29e0602538fe0cdbe7959d2bf16103dd8e9aa82d"],
  [19599,11926469,11926485,"VariableDeclaration","677d35e827a5a25396cf25ef6848cdcfa57178ead7d15fd58b02adf36029f43f","f01cd597bd3633d1bebd07d15c2a2b1ddbc1cf9bf23063af95e902d5b68e0e6d"],
  [19600,11926485,11926878,"VariableDeclaration","2ed01dbaef258c0025d63a93652da2ec1b4dfd46176caff64f4cae2d739cae84","8d4394759d710d1626b7830353da755153fb5354cb684ac7cfd594e4cbcd61a8"],
  [19601,11926878,11926890,"VariableDeclaration","b0b4973ea643308261a4485487039e27022b49537fd0985336955c3091819069","c01b63c9a83efc2c82e465e2d798fc3c37152b39ff84fb5b2ced94dd86e0163b"],
  [19602,11926890,11927564,"VariableDeclaration","d8cad41f4ff1a5c84cd42ab9b71d2e83194a169ec73f53479bad98edffe52525","934d7bf7daa81106d1c93d8e5b7ff554ffdb2042fa76afdf9b97fc1e540fe292"],
]

// Scanner-authenticated target-added owner residues for the closure. Each row
// is [unit, kind, value, installed-cli start, installed-cli end,
// baseline occurrence count, target occurrence number].
const residueRows = [
  [19327,"property","schedule",11831078,11831086,7,8],
  [19327,"string","cron",11831110,11831116,7,8],
  [19327,"property","expression",11831117,11831127,0,1],
  [19327,"string","invalid cron expression \"",11831145,11831170,0,1],
  [19327,"string","\" in schedule",11831174,11831187,0,1],
  [19328,"property","triggers",11831282,11831290,0,1],
  [19328,"string","<missing>",11831560,11831571,2,3],
  [19328,"string","invalid event \"",11831540,11831555,0,1],
  [19328,"string","\" in on: entry",11831572,11831586,0,1],
  [19328,"property","branches",11831607,11831615,14,15],
  [19328,"property","field",11831639,11831644,12,13],
  [19328,"string","ref",11831645,11831650,24,52],
  [19328,"property","op",11831651,11831653,41,52],
  [19328,"property","paths",11831682,11831687,26,27],
  [19328,"property","field",11831711,11831716,12,14],
  [19328,"string","paths",11831717,11831724,1,2],
  [19328,"property","op",11831725,11831727,41,53],
  [19328,"string","glob_any",11831728,11831738,0,1],
  [19328,"property","labels",11831762,11831768,43,44],
  [19328,"property","field",11831792,11831797,12,15],
  [19328,"string","labels",11831798,11831806,6,7],
  [19328,"property","op",11831807,11831809,41,54],
  [19328,"property","field",11831888,11831893,12,16],
  [19328,"property","op",11831904,11831906,41,55],
  [19328,"string","eq",11831907,11831911,0,1],
  [19328,"property","where",11831954,11831959,2,3],
  [19329,"string","on: entry must be a string or {event: ...} mapping",11832086,11832138,0,1],
  [19329,"string","where: list element must be a single-field map {field: predicate}",11832274,11832341,0,1],
  [19330,"string","where: must be a map of field→predicate, or a list of single-field maps",11832421,11832499,0,1],
  [19330,"string","where: missing predicate for \"",11832596,11832626,0,1],
  [19330,"property","field",11832657,11832662,12,17],
  [19330,"property","op",11832665,11832667,41,56],
  [19330,"string","eq",11832668,11832672,0,2],
  [19330,"string","where: empty list for \"",11832740,11832763,0,1],
  [19330,"property","field",11832800,11832805,12,18],
  [19330,"property","op",11832808,11832810,41,57],
  [19330,"string","in",11832811,11832815,25,26],
  [19330,"string","where: list for \"",11832849,11832866,0,1],
  [19330,"string","\" mixes scalars and objects; use {one_of: [...]} or an op object",11832870,11832934,0,1],
  [19330,"string","where: empty predicate for \"",11832998,11833026,0,1],
  [19331,"string","where: unsupported predicate for \"",11833101,11833135,0,1],
  [19331,"string"," (did you mean \"",11833279,11833295,0,1],
  [19331,"string","\"?)",11833299,11833302,0,1],
  [19331,"property","join",11833326,11833330,1619,2121],
  [19331,"string","where: unknown op \"",11833240,11833259,0,1],
  [19331,"string","\" on \"",11833263,11833269,0,1],
  [19331,"string","; valid ops: ",11833307,11833320,0,1],
  [19331,"string","where: \"",11833392,11833400,0,1],
  [19331,"string","\" on \"",11833404,11833410,0,2],
  [19331,"string","\" takes a list; use is/is_not for a single value",11833414,11833462,0,1],
  [19331,"string","where: \"",11833501,11833509,0,2],
  [19331,"string","\" on \"",11833513,11833519,0,3],
  [19331,"string","\" needs at least one value",11833523,11833549,0,1],
  [19331,"string","where: \"",11833589,11833597,0,3],
  [19331,"string","\" on \"",11833601,11833607,0,4],
  [19331,"string","\" list must contain scalars",11833611,11833638,0,1],
  [19331,"property","field",11833653,11833658,12,19],
  [19331,"property","op",11833661,11833663,41,58],
  [19331,"property","op",11833666,11833668,41,59],
  [19331,"string","where: \"",11833723,11833731,0,4],
  [19331,"string","\" on \"",11833735,11833741,0,5],
  [19331,"string","\" takes a single value; use one_of/none_of for a list",11833745,11833798,0,1],
  [19332,"string","\" on \"",11833844,11833850,0,6],
  [19332,"string","\" needs a scalar value",11833854,11833876,0,1],
  [19332,"property","field",11833891,11833896,12,20],
  [19332,"property","op",11833899,11833901,41,60],
  [19332,"property","op",11833904,11833906,41,61],
  [19336,"regexp",{"flags":"","pattern":"^cron\\(\\s*(.+?)\\s*\\)$"},11834409,11834432,0,1],
  [19336,"string","invalid cron expression in \"",11834492,11834520,0,1],
  [19336,"string","cron",11834550,11834556,7,9],
  [19336,"property","expression",11834557,11834567,0,2],
  [19336,"string","deprecated 'on: ",11834582,11834598,0,1],
  [19336,"string","'; use top-level 'schedule: \"",11834602,11834631,0,1],
  [19336,"string","\"'",11834635,11834637,0,1],
  [19336,"string","github:pull-request-opened",11834648,11834676,0,1],
  [19336,"string","github.pull_request.opened",11834696,11834724,0,1],
  [19336,"string","deprecated 'on: ",11834740,11834756,0,2],
  [19336,"string","'; use 'on: github.pull_request.opened'",11834760,11834799,0,1],
  [19336,"string","github:pull-request-merged",11834810,11834838,0,1],
  [19336,"string","github.pull_request.merged",11834858,11834886,0,1],
  [19336,"string","deprecated 'on: ",11834902,11834918,0,3],
  [19336,"string","'; use 'on: github.pull_request.merged'",11834922,11834961,0,1],
  [19336,"regexp",{"flags":"","pattern":"^slack:new-message\\(\\s*channel\\s*:\\s*#?([^\\s)]+)\\s*\\)$"},11834979,11835035,0,1],
  [19336,"string","slack.message",11835073,11835088,0,1],
  [19336,"property","field",11835091,11835096,12,21],
  [19336,"property","op",11835107,11835109,41,62],
  [19336,"string","eq",11835110,11835114,0,3],
  [19336,"string","deprecated 'on: ",11835140,11835156,0,4],
  [19337,"string","}'",11835208,11835210,0,1],
  [19337,"string","invalid trigger \"",11835245,11835262,0,1],
  [19338,"property","provider",11835330,11835338,10,11],
  [19338,"property","field",11835424,11835429,12,22],
  [19338,"property","field",11835443,11835448,12,23],
  [19339,"property","op",11835463,11835465,41,63],
  [19339,"property","op",11835479,11835481,41,64],
  [19339,"property","field",11835514,11835519,12,24],
  [19339,"property","op",11835522,11835524,41,65],
  [19344,"regexp",{"flags":"","pattern":"^[a-z][a-z0-9_]*(\\.[a-z0-9_]+)+$"},11835902,11835936,0,1],
  [19344,"property","op",11835946,11835948,41,66],
  [19344,"string","eq",11835949,11835953,0,4],
  [19344,"property","is_not",11835963,11835969,0,1],
  [19344,"property","op",11835971,11835973,41,67],
  [19344,"string","not_in",11835974,11835982,0,1],
  [19344,"property","one_of",11835992,11835998,0,1],
  [19344,"property","op",11836000,11836002,41,68],
  [19344,"string","in",11836003,11836007,25,27],
  [19344,"property","none_of",11836017,11836024,0,1],
  [19344,"property","op",11836026,11836028,41,69],
  [19344,"string","not_in",11836029,11836037,0,2],
  [19344,"property","list",11836038,11836042,53,54],
  [19344,"property","starts_with",11836047,11836058,0,1],
  [19344,"property","op",11836060,11836062,41,70],
  [19344,"string","starts_with",11836063,11836076,41,42],
  [19344,"property","list",11836077,11836081,53,55],
  [19344,"property","op",11836096,11836098,41,71],
  [19344,"string","contains",11836099,11836109,3,4],
  [19344,"property","list",11836110,11836114,53,56],
  [19344,"property","matches",11836119,11836126,42,43],
  [19344,"property","op",11836128,11836130,41,72],
  [19344,"string","matches",11836131,11836140,2,3],
  [19344,"property","list",11836141,11836145,53,57],
  [19344,"property","glob",11836150,11836154,14,15],
  [19344,"property","op",11836156,11836158,41,73],
  [19344,"string","glob",11836159,11836165,5,6],
  [19344,"property","list",11836166,11836170,53,58],
  [19344,"property","eq",11836175,11836177,33,34],
  [19344,"property","op",11836179,11836181,41,74],
  [19346,"property","in",11836196,11836198,23,24],
  [19346,"property","op",11836200,11836202,41,75],
  [19346,"string","in",11836203,11836207,25,28],
  [19346,"property","list",11836208,11836212,53,60],
  [19346,"property","not_in",11836217,11836223,0,1],
  [19346,"property","op",11836225,11836227,41,76],
  [19346,"string","not_in",11836228,11836236,0,3],
  [19346,"property","list",11836237,11836241,53,61],
  [19346,"string","[Routines] ",11836475,11836486,0,1],
  [19346,"property","triggers",11836528,11836536,0,2],
  [19346,"string","[Routines] skipping ",11836552,11836572,0,1],
  [19346,"string",": no usable trigger (need at least one of: schedule, on)",11836585,11836641,0,1],
  [19346,"property","basename",11836678,11836686,46,128],
  [19346,"string",".md",11836698,11836703,39,40],
  [19346,"property","frontmatter",11836807,11836818,28,29],
  [19346,"property","triggers",11836842,11836850,0,3],
  [19346,"property","triggers",11836853,11836861,0,4],
]
const RESIDUE_MATRIX_SHA256 = '331c3936eb8c37c60e079b43c0870d0c8684d201cae4409d22f794b2212349bb'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function walk(value, visit) {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit)
    return
  }
  if (typeof value.type === 'string') visit(value)
  for (const [key, child] of Object.entries(value)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function canonicalFlags(flags) {
  return [...flags].sort().join('')
}

function acornLiteral(node) {
  if (node.type === 'Literal') {
    if (node.regex) {
      return {
        kind: 'regexp',
        value: {
          flags: canonicalFlags(node.regex.flags),
          pattern: node.regex.pattern,
        },
      }
    }
    if (typeof node.value === 'string') {
      return { kind: 'string', value: node.value }
    }
    if (typeof node.value === 'number') {
      return { kind: 'number', value: String(node.value) }
    }
    if (typeof node.value === 'bigint') {
      return { kind: 'bigint', value: node.value.toString() }
    }
  }
  if (node.type === 'TemplateElement') {
    const value = node.value?.cooked ?? node.value?.raw
    if (typeof value === 'string') return { kind: 'string', value }
  }
  return null
}

function acornProperty(node) {
  if (
    ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) &&
    node.computed === false &&
    node.key?.type === 'Identifier'
  ) {
    return {
      end: node.key.end,
      kind: 'property',
      start: node.key.start,
      value: node.key.name,
    }
  }
  if (
    node.type === 'MemberExpression' &&
    node.computed === false &&
    node.property?.type === 'Identifier'
  ) {
    return {
      end: node.property.end,
      kind: 'property',
      start: node.property.start,
      value: node.property.name,
    }
  }
  return null
}

function typedOccurrences(source, start, end) {
  const fragment = source.slice(start, end)
  const ast = parse(fragment, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const rows = []
  walk(ast, node => {
    const literal = acornLiteral(node)
    if (literal) {
      rows.push([
        literal.kind,
        literal.value,
        start + node.start,
        start + node.end,
      ])
    }
    const property = acornProperty(node)
    if (property) {
      rows.push([
        property.kind,
        property.value,
        start + property.start,
        start + property.end,
      ])
    }
  })
  return rows
}

function rowKey(row) {
  return JSON.stringify(row)
}

function identifierPositions(source, names) {
  const wanted = new Set(names)
  const positions = new Map(names.map(name => [name, []]))
  for (const token of tokenizer(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })) {
    if (token.type.label === 'name' && wanted.has(token.value)) {
      positions.get(token.value).push(token.start)
    }
  }
  return positions
}

function authenticateUnits(indexed, expected, label) {
  for (const identity of expected) {
    const [index, start, end, nodeType, sourceHash, coarseHash] = identity
    const unit = indexed.publicUnits[index]
    assert.deepEqual(
      [
        unit.index,
        unit.start,
        unit.end,
        unit.nodeType,
        unit.sourceHash,
        unit.coarseHash,
      ],
      identity,
      label + ' unit ' + index,
    )
    assert.equal(
      sha256(indexed.source.slice(start, end)),
      sourceHash,
      label + ' unit ' + index + ': bytes',
    )
  }
  for (let index = 1; index < expected.length; index += 1) {
    assert.equal(
      expected[index - 1][2],
      expected[index][1],
      label + ': closure is contiguous',
    )
  }
}

let authenticated
function authenticatedBundles() {
  if (authenticated) return authenticated
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  const latestBytes = fs.readFileSync(latestPath)
  assert.equal(sha256(baselineBytes), BASELINE_SHA256)
  assert.equal(sha256(targetBytes), TARGET_SHA256)
  assert.equal(sha256(latestBytes), LATEST_SHA256)
  authenticated = {
    baseline: baselineBytes.toString('utf8'),
    latest: indexGeneratedBundle(latestPath),
    target: indexGeneratedBundle(targetPath),
  }
  return authenticated
}

test(
  'target113 pins every routines parser/loader unit and target-added residue',
  bundleOptions,
  () => {
    const { baseline, latest, target } = authenticatedBundles()
    authenticateUnits(target, targetUnits, 'target113')
    authenticateUnits(latest, latestUnits, 'target116')
    assert.equal(targetUnits.length, 20)
    assert.equal(latestUnits.length, 20)
    assert.deepEqual(
      targetUnits.map(unit => unit[5]),
      latestUnits.map(unit => unit[5]),
      'the complete closure persists by exact coarse structural identity',
    )

    for (const fragment of [
      'invalid cron expression',
      'where: unsupported predicate',
      "deprecated 'on: ",
      '[Routines]',
    ]) {
      assert.equal(baseline.includes(fragment), false, fragment + ': target-added')
      assert.equal(target.source.includes(fragment), true, fragment + ': target113')
      assert.equal(latest.source.includes(fragment), true, fragment + ': target116')
    }

    assert.equal(residueRows.length, 144)
    assert.equal(
      sha256(JSON.stringify(residueRows)),
      RESIDUE_MATRIX_SHA256,
      'pinned residue matrix',
    )
    assert.equal(new Set(residueRows.map(row => row[0])).size, 12)
    const expectedIndexes = new Set(targetUnits.map(unit => unit[0]))
    const observedClosure = new Set(
      typedOccurrences(
        target.source,
        targetUnits[0][1],
        targetUnits.at(-1)[2],
      ).map(rowKey),
    )
    for (const [
      index,
      kind,
      value,
      reportStart,
      reportEnd,
      baselineOccurrenceCount,
      targetOccurrenceNumber,
    ] of residueRows) {
      assert.equal(expectedIndexes.has(index), true, index + ': closure unit')
      assert.ok(
        targetOccurrenceNumber > baselineOccurrenceCount,
        index + ': target-added occurrence accounting',
      )
      const innerIdentity = [
        kind,
        value,
        reportStart - TARGET_REPORT_PROLOGUE,
        reportEnd - TARGET_REPORT_PROLOGUE,
      ]
      assert.equal(
        observedClosure.has(rowKey(innerIdentity)),
        true,
        index + ': ' + kind + ' ' + JSON.stringify(value) + ' at ' + reportStart,
      )
    }
  },
)

function assertDormantTopology({
  initializer,
  initializerPositions,
  indexed,
  loader,
  loaderPositions,
  parser,
  parserPositions,
}) {
  const positions = identifierPositions(indexed.source, [
    initializer,
    loader,
    parser,
  ])
  assert.deepEqual(positions.get(loader), loaderPositions, loader + ': refs')
  assert.deepEqual(positions.get(parser), parserPositions, parser + ': refs')
  assert.deepEqual(
    positions.get(initializer),
    initializerPositions,
    initializer + ': refs',
  )

  const loaderAssignment = indexed.source.slice(
    loaderPositions[1],
    loaderPositions[1] + 40,
  )
  assert.match(
    loaderAssignment,
    new RegExp('^' + loader + '=O8\\(async function\\('),
  )
  assert.equal(
    new RegExp('\\b' + loader + '\\s*\\(').test(indexed.source),
    false,
    loader + ': no direct call',
  )
  assert.equal(
    parserPositions[1] > loaderPositions[1],
    true,
    parser + ': only consumer is inside the uncalled loader',
  )
}

test(
  'the routines loader remains an uncalled memoized value through target116',
  bundleOptions,
  () => {
    const bundles = authenticatedBundles()
    assertDormantTopology({
      initializer: 'ae7',
      initializerPositions: [11836199, 11837537],
      indexed: bundles.target,
      loader: 'Z4O',
      loaderPositions: [11836191, 11836256],
      parser: 'ne7',
      parserPositions: [11830951, 11836342],
    })
    assertDormantTopology({
      initializer: 'PK4',
      initializerPositions: [11926894, 11928202],
      indexed: bundles.latest,
      loader: 'wJO',
      loaderPositions: [11926886, 11926951],
      parser: 'jK4',
      parserPositions: [11921646, 11927037],
    })

    const targetInitializer = bundles.target.source.slice(
      targetUnits.at(-1)[1],
      targetUnits.at(-1)[2],
    )
    const latestInitializer = bundles.latest.source.slice(
      latestUnits.at(-1)[1],
      latestUnits.at(-1)[2],
    )
    for (const initializer of [targetInitializer, latestInitializer]) {
      assert.match(initializer, /O8\(async function\(H\)/)
      assert.match(initializer, /["']routines["']/)
      assert.match(initializer, /\.frontmatter/)
      assert.match(initializer, /\[Routines\]/)
      assert.match(initializer, /\.triggers\.length===0/)
      assert.match(initializer, /Array\.from\(q\.values\(\)\)/)
    }
  },
)
