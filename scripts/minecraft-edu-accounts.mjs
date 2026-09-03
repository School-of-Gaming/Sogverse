/**
 * Manage the shared Minecraft Education class logins in the sog.gg Entra ID
 * tenant — the `@gamer.sog.gg` account pool a gedu hands out at the start of a
 * session.
 *
 * These accounts are generated in bulk, used for a term, then wiped and
 * regenerated. This script is the whole lifecycle: audit what exists, plan a
 * new pool of names, release the licences, delete, create, verify, and emit the
 * CSV the admin hands to gedus.
 *
 * See `docs/runbooks/minecraft-education-accounts.md` for the runbook and for the
 * platform constraints the design works around — they are not obvious, and
 * every one of them was discovered the expensive way.
 *
 * ## Auth
 *
 * Uses your Azure CLI login (`az login`), which must hold **Global
 * Administrator** or equivalent: creating, deleting and relicensing users are
 * all privileged directory writes.
 *
 * The `AZURE_CLIENT_ID` service principal in `.env.local` has enough power for
 * the create / delete / set-department subset (`User.ReadWrite.All`) but NOT
 * for touching group membership, so the CLI token is the default rather than
 * maintaining two auth paths. Pass `--app-auth` to use the service principal.
 *
 * ## Report-only unless told otherwise
 *
 * Every destructive verb refuses to write without `--apply`. A bare invocation
 * prints exactly what it would do and exits.
 *
 *   node scripts/minecraft-edu-accounts.mjs audit
 *   node scripts/minecraft-edu-accounts.mjs plan --fi 500 --en 100
 *   node scripts/minecraft-edu-accounts.mjs release          # dry run
 *   node scripts/minecraft-edu-accounts.mjs release --apply
 *   node scripts/minecraft-edu-accounts.mjs delete  --apply
 *   node scripts/minecraft-edu-accounts.mjs create  --apply
 *   node scripts/minecraft-edu-accounts.mjs verify
 *
 * A full reset is: plan -> release --apply -> delete --apply -> create --apply
 * -> verify. Release before delete, always: it frees the seats synchronously,
 * so you can confirm you have capacity for the new pool *before* the
 * irreversible step.
 *
 * ## Additive passes
 *
 * `plan --add` extends the live pool instead of replacing it — no release, no
 * delete, and every name already in the tenant is excluded from the draw. It
 * also creates gedu pool logins (SOGGeduNN on the gedu domain), which take the
 * same student licence by an explicit group add rather than by department.
 *
 *   node scripts/minecraft-edu-accounts.mjs plan --add --gedu-from 26 \
 *        --gedu-to 46 --en 240
 *   node scripts/minecraft-edu-accounts.mjs create --apply
 *   node scripts/minecraft-edu-accounts.mjs verify
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const GRAPH = "https://graph.microsoft.com/v1.0";
const DOMAIN = "gamer.sog.gg";
/** Shared gedu pool logins (SOGGeduNN) — same student licence, other domain. */
const GEDU_DOMAIN = "gedu.sog.gg";
const STUDENT_SKU = "18250162-5d87-4436-a834-d795c15c80f3"; // M365EDU_A3_STUUSEBNFT
const MINECRAFT_PLAN = "4c246bbc-f513-4311-beff-eba54c353256";
const STATIC_STUDENT_GRP = "2de2fefa-95ec-44d4-93b1-23ab41ca9293";
/** The value the Dynamic Gamers membership rule matches on. */
const GAMER_DEPARTMENT = "Gamer";
const USAGE_LOCATION = "FI";
/** UPN local part cap — these are typed by 7-to-12-year-olds. */
const MAX_LOCAL = 18;
const PLAN_FILE = path.join(process.cwd(), "minecraft-edu-plan.json");

// ---------------------------------------------------------------- word lists
// Nothing here can read as a tease: no words about looks, body, or being
// silly. Only fast / brave / clever / cool. Finnish keeps its umlauts — they
// are stripped for the UPN and kept for the in-game name (see the docs).
const FI_ADJ = [
  ["nopea", "fast"], ["rohkea", "brave"], ["urhea", "valiant"], ["vahva", "strong"],
  ["viisas", "wise"], ["villi", "wild"], ["reipas", "brisk"], ["taitava", "skilful"],
  ["ovela", "cunning"], ["huima", "awesome"], ["mahtava", "mighty"], ["uljas", "gallant"],
  ["kultainen", "golden"], ["hopeinen", "silvery"], ["tulinen", "fiery"], ["raikas", "fresh"],
  ["sukkela", "nimble"], ["notkea", "supple"], ["hurja", "fierce"], ["jalo", "noble"],
  ["sulava", "smooth"], ["oiva", "excellent"], ["rivakka", "swift"], ["virkku", "lively"],
  ["nokkela", "clever"], ["sisukas", "gritty"], ["peloton", "fearless"], ["luja", "solid"],
  ["kelpo", "worthy"], ["reilu", "fair"], ["rento", "easy-going"], ["iloinen", "cheerful"],
  ["ketterä", "agile"], ["terävä", "sharp"], ["pirteä", "perky"], ["vikkelä", "nimble"],
  ["sitkeä", "tenacious"], ["jäinen", "icy"], ["väkevä", "potent"], ["myrskyisä", "stormy"],
  ["näppärä", "handy"], ["tyylikäs", "stylish"],
];
const FI_NOUN = [
  ["susi", "wolf"], ["karhu", "bear"], ["ilves", "lynx"], ["kotka", "eagle"],
  ["haukka", "hawk"], ["leijona", "lion"], ["tiikeri", "tiger"], ["salama", "lightning"],
  ["myrsky", "storm"], ["tuuli", "wind"], ["kuu", "moon"], ["aurinko", "sun"],
  ["vuori", "mountain"], ["joki", "river"], ["meri", "sea"], ["kallio", "cliff"],
  ["routa", "ground frost"], ["halla", "frost"], ["usva", "mist"], ["sumu", "fog"],
  ["lumi", "snow"], ["liekki", "flame"], ["soihtu", "torch"], ["miekka", "sword"],
  ["kilpi", "shield"], ["ritari", "knight"], ["peikko", "troll"], ["keiju", "fairy"],
  ["velho", "wizard"], ["noita", "witch"], ["lohi", "salmon"], ["kettu", "fox"],
  ["orava", "squirrel"], ["hirvi", "elk"], ["poro", "reindeer"], ["mursu", "walrus"],
  ["norppa", "ringed seal"], ["korppi", "raven"], ["kurki", "crane"], ["joutsen", "swan"],
  ["majava", "beaver"], ["saukko", "otter"], ["ahma", "wolverine"], ["naali", "arctic fox"],
  ["riekko", "ptarmigan"], ["tikka", "woodpecker"], ["komeetta", "comet"],
  ["planeetta", "planet"], ["raketti", "rocket"], ["sampo", "Sampo"], ["tonttu", "elf"],
  ["hiisi", "goblin"], ["louhi", "Louhi"], ["ukko", "Ukko, god of thunder"],
  ["tapio", "Tapio, god of the forest"], ["virta", "current"], ["koski", "rapids"],
  ["aalto", "wave"], ["tuisku", "blizzard"], ["pyry", "snowfall"], ["ukkonen", "thunder"],
  ["pilvi", "cloud"], ["taivas", "sky"], ["tähti", "star"], ["pöllö", "owl"],
  ["lohikäärme", "dragon"], ["jänis", "hare"], ["metsä", "forest"], ["jää", "ice"],
  ["käärme", "snake"], ["höyry", "steam"], ["yö", "night"], ["päivä", "day"],
  ["sää", "weather"], ["närhi", "jay"], ["härkä", "bull"], ["käpy", "pine cone"],
];
// Widened for the 2026 additive pass: English only, and large enough that a
// 240-name draw reuses no single word more than a few times. Same safety rule
// as the Finnish lists — nothing about looks, body, or being silly or stupid.
const EN_ADJ = [
  "brave", "swift", "mighty", "clever", "bold", "cosmic", "turbo", "mega",
  "super", "epic", "wild", "lucky", "snappy", "zippy", "plucky", "dapper",
  "jazzy", "breezy", "frosty", "blazing", "sparky", "whizzy", "nimble", "fearless",
  "golden", "silver", "silent", "mystic", "stealthy", "rapid", "royal", "noble",
  "fierce", "crimson", "arctic", "solar", "lunar", "atomic", "sonic", "hyper",
  "amber", "ancient", "azure", "bright", "cobalt", "coral", "crystal", "daring",
  "dazzling", "electric", "emerald", "eternal", "flying", "galactic", "gallant", "gleaming",
  "glowing", "granite", "heroic", "hidden", "iron", "jade", "keen", "laser",
  "lightning", "loyal", "magic", "magnetic", "midnight", "neon", "nova", "ocean",
  "onyx", "phantom", "pixel", "plasma", "polar", "prime", "quantum", "quick",
  "radiant", "retro", "roaming", "rocket", "ruby", "sapphire", "scarlet", "secret",
  "shadow", "sharp", "shining", "sky", "spark", "steady", "stellar", "storm",
  "thunder", "titan", "topaz", "ultra", "valiant", "vivid", "wise", "zephyr",
];
const EN_NOUN = [
  "badger", "otter", "fox", "hedgehog", "squirrel", "robin", "magpie", "falcon",
  "kestrel", "osprey", "dragon", "griffin", "phoenix", "wizard", "knight", "comet",
  "meteor", "rocket", "thunder", "boulder", "acorn", "conker", "puffin", "dolphin",
  "narwhal", "panther", "tiger", "wolf", "bear", "lynx", "raven", "owl",
  "wren", "stoat", "heron", "curlew", "pike", "salmon", "stag", "hare",
  "kite", "merlin", "harrier", "bramble", "arrow", "beacon", "blade", "blaze",
  "bolt", "breeze", "cobra", "compass", "condor", "coral", "crane", "cyclone",
  "drake", "eagle", "ember", "fang", "flame", "flare", "galaxy", "glacier",
  "hawk", "hunter", "jaguar", "koala", "kraken", "lantern", "leopard", "lion",
  "mammoth", "ninja", "nova", "ocelot", "orbit", "panda", "pegasus", "pilot",
  "pioneer", "pulse", "python", "quest", "quill", "raccoon", "ranger", "raptor",
  "reef", "ripple", "river", "rover", "sable", "sabre", "scout", "seeker",
  "sentry", "serpent", "shark", "shield", "sparrow", "sphinx", "spirit", "stallion",
  "star", "stingray", "storm", "summit", "swan", "talon", "tempest", "torch",
  "tornado", "trail", "tundra", "turtle", "unicorn", "valley", "viper", "voyager",
  "walrus", "warden", "wave", "whale", "wildcat", "wombat", "wraith", "yeti",
  "zebra",
];

// -------------------------------------------------------------------- helpers
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);
const APPLY = has("apply");

/** Load .env.local without clobbering the shell — the shell always wins. */
function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

let cachedToken = null;
async function token() {
  if (cachedToken) return cachedToken;
  if (has("app-auth")) {
    loadEnvLocal();
    const res = await fetch(
      `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.AZURE_CLIENT_ID,
          client_secret: process.env.AZURE_CLIENT_SECRET,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      }
    );
    cachedToken = (await res.json()).access_token;
  } else {
    // execSync with one constant string rather than execFileSync with an args
    // array: on Windows az ships as a .cmd shim, which Node refuses to spawn
    // directly (EINVAL) — it has to go through a shell, and passing an args
    // array alongside `shell: true` is deprecated (DEP0190). Nothing here is
    // interpolated, so there is no argument to escape.
    cachedToken = execSync(
      "az account get-access-token --resource https://graph.microsoft.com" +
        " --query accessToken -o tsv",
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
  }
  if (!cachedToken) {
    console.error("No Graph token. Run `az login`, or pass --app-auth.");
    process.exit(1);
  }
  return cachedToken;
}

async function graph(method, urlOrPath, body) {
  const url = urlOrPath.startsWith("http") ? urlOrPath : GRAPH + urlOrPath;
  const bearer = await token();
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${bearer}`,
        ConsistencyLevel: "eventual",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get("retry-after") || 2 ** attempt);
      await new Promise((r) => setTimeout(r, Math.min(wait, 60) * 1000));
      continue;
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
  return { status: 0, body: null };
}

async function paged(p) {
  const out = [];
  let url = GRAPH + p;
  while (url) {
    const { status, body } = await graph("GET", url);
    if (status !== 200) throw new Error(`GET ${url} -> ${status}`);
    out.push(...(body.value ?? []));
    url = body["@odata.nextLink"];
  }
  return out;
}

/** Run `fn` over `items` with bounded concurrency; Graph is a shared budget. */
async function pool(items, fn, limit = 10) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    })
  );
  return results;
}

const asciiFi = (s) => s.replace(/ä/g, "a").replace(/ö/g, "o").replace(/å/g, "a");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Mirrors generatePassword() in the platform's Graph module: the literal
 * `Sogverse` plus two digits. Deliberately identical to what the gedu reset
 * tool produces, so a reset password and an initial password look the same to
 * whoever reads one out. Only 100 distinct values — acceptable only because
 * these are shared class logins with no personal data behind them.
 */
const genPassword = () =>
  `Sogverse${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;

async function seats() {
  const { body } = await graph("GET", "/subscribedSkus");
  const sku = body.value.find((s) => s.skuId === STUDENT_SKU);
  return {
    total: sku.prepaidUnits.enabled,
    used: sku.consumedUnits,
    free: sku.prepaidUnits.enabled - sku.consumedUnits,
  };
}

const USER_SELECT =
  "id,userPrincipalName,displayName,givenName,surname,department," +
  "usageLocation,accountEnabled,licenseAssignmentStates";

/** Every user in the tenant. The additive plan needs both domains at once. */
const allUsers = () => paged(`/users?$select=${USER_SELECT}&$top=999`);

const gamerAccounts = () =>
  allUsers().then((us) =>
    us.filter((u) => (u.userPrincipalName ?? "").toLowerCase().endsWith(`@${DOMAIN}`))
  );
const isLicensed = (u) =>
  (u.licenseAssignmentStates ?? []).some(
    (s) =>
      s.skuId === STUDENT_SKU &&
      s.state === "Active" &&
      !(s.disabledPlans ?? []).includes(MINECRAFT_PLAN)
  );

function writeCsv(file, rows) {
  const head = [
    "Tyyppi / Type",
    "Kayttajatunnus / Username", "Salasana / Password", "Nimi pelissa / Name in game",
    "Kieli / Language", "Merkitys / Meaning (EN)", "Lisenssi / Licence",
    "Kerho / Club", "Kerholainen / Student",
  ];
  const esc = (v) =>
    /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const lines = [head.map(esc).join(",")];
  for (const r of rows) {
    const gedu = r.kind === "gedu";
    lines.push(
      [
        gedu ? "Gedu" : "Gamer",
        r.upn, r.password, r.ingame,
        // A gedu pool login has no language: its name is a number, not a word.
        gedu ? "" : r.lang === "fi" ? "suomi" : "English",
        r.meaning ?? "",
        r.licensed === false ? "PUUTTUU / MISSING" : "OK - Minecraft Education",
        "", "",
      ].map(esc).join(",")
    );
  }
  // BOM so Excel renders the umlauts; Google Sheets ignores it.
  writeFileSync(file, "\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");
}


// --------------------------------------------------------------------- verbs
async function audit() {
  const us = await gamerAccounts();
  const s = await seats();
  const licensed = us.filter(isLicensed);
  const noLoc = us.filter((u) => !u.usageLocation);
  const noDept = us.filter((u) => u.department !== GAMER_DEPARTMENT);
  const withSurname = us.filter((u) => u.surname);
  const names = new Map();
  for (const u of us) names.set(u.displayName, (names.get(u.displayName) ?? 0) + 1);
  const dupes = [...names.entries()].filter(([, n]) => n > 1);

  console.log(`@${DOMAIN} accounts        : ${us.length}`);
  console.log(`  licensed (Minecraft on) : ${licensed.length}`);
  console.log(`  UNLICENSED              : ${us.length - licensed.length}`);
  console.log(`  missing usageLocation   : ${noLoc.length}`);
  console.log(`  department != ${GAMER_DEPARTMENT}     : ${noDept.length}`);
  console.log(`  carrying a surname      : ${withSurname.length}  (must be 0)`);
  console.log(`  duplicate in-game names : ${dupes.length}`);
  for (const [n, c] of dupes.slice(0, 10)) console.log(`      ${n} x${c}`);
  console.log(`\nA3 student seats          : ${s.used}/${s.total} used, ${s.free} free`);
  const unl = us.filter((u) => !isLicensed(u));
  if (unl.length) {
    console.log(`\nunlicensed accounts (first 15):`);
    for (const u of unl.slice(0, 15)) console.log(`   ${u.userPrincipalName}`);
  }
}

function buildPool(adjs, nouns) {
  const out = [];
  for (const a of adjs) {
    const [af, am] = Array.isArray(a) ? a : [a, ""];
    for (const n of nouns) {
      const [nf, nm] = Array.isArray(n) ? n : [n, ""];
      // Several words sit in both lists (storm, thunder, nova, rocket, coral),
      // so the cross product contains StormStorm. Drop the diagonal.
      if (af === nf) continue;
      const local = `${asciiFi(af)}.${asciiFi(nf)}`;
      if (local.length <= MAX_LOCAL) {
        out.push({
          local,
          ingame: cap(af) + cap(nf),
          meaning: `${am} ${nm}`.trim(),
          adj: af,
          noun: nf,
        });
      }
    }
  }
  return out;
}

/**
 * Additive pass: extend the live pool instead of replacing it.
 *
 * The reset flow above may generate whatever it likes, because `delete` has
 * just emptied the domain. An additive pass has no such luxury — every name
 * already in the tenant is taken, on BOTH halves of the uniqueness rule, so
 * the live directory is the exclusion list. Two knobs matter:
 *
 *   --gedu-from/--gedu-to  a range of SOGGeduNN shared logins on the gedu
 *                          domain, licensed by explicit group membership.
 *   --en                   how many gamer accounts to draw.
 *
 * `--max-use` caps how often any single word may appear across the draw. A
 * child who is CosmicWolf while four others are CosmicSomething has been
 * handed a name that does not feel like theirs, and the whole point of the
 * word lists is that it should.
 */
async function planAdd() {
  const nEn = Number(arg("en", "0"));
  const geduFrom = Number(arg("gedu-from", "0"));
  const geduTo = Number(arg("gedu-to", "-1"));
  const maxUse = Number(arg("max-use", "3"));

  const live = await allUsers();
  const takenUpn = new Set(
    live.map((u) => (u.userPrincipalName ?? "").toLowerCase())
  );
  const takenName = new Set(
    live.map((u) => (u.displayName ?? "").toLowerCase())
  );

  const rows = [];

  for (let n = geduFrom; n <= geduTo; n++) {
    const local = `SOGGedu${n}`;
    const upn = `${local}@${GEDU_DOMAIN}`;
    if (takenUpn.has(upn.toLowerCase())) {
      console.error(`ABORT: ${upn} already exists`);
      process.exit(1);
    }
    rows.push({
      kind: "gedu",
      upn,
      local,
      ingame: local,
      meaning: "",
      lang: "",
      password: genPassword(),
    });
  }

  const free = buildPool(EN_ADJ, EN_NOUN).filter(
    (c) =>
      !takenUpn.has(`${c.local}@${DOMAIN}`) &&
      !takenName.has(c.ingame.toLowerCase())
  );
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }

  const adjUse = new Map();
  const nounUse = new Map();
  const picked = [];
  for (const c of free) {
    if (picked.length === nEn) break;
    const a = adjUse.get(c.adj) ?? 0;
    const n = nounUse.get(c.noun) ?? 0;
    if (a >= maxUse || n >= maxUse) continue;
    adjUse.set(c.adj, a + 1);
    nounUse.set(c.noun, n + 1);
    picked.push(c);
  }
  if (picked.length < nEn) {
    console.error(
      `need ${nEn} gamer names, drew only ${picked.length} ` +
        `(${free.length} free combinations, max ${maxUse} uses per word).\n` +
        `Raise --max-use or widen the word lists.`
    );
    process.exit(1);
  }
  for (const c of picked) {
    rows.push({
      kind: "gamer",
      upn: `${c.local}@${DOMAIN}`,
      local: c.local,
      ingame: c.ingame,
      meaning: c.meaning,
      lang: "en",
      password: genPassword(),
    });
  }

  if (new Set(rows.map((r) => r.upn.toLowerCase())).size !== rows.length) {
    console.error("UPN collision inside the plan");
    process.exit(1);
  }
  if (new Set(rows.map((r) => r.ingame.toLowerCase())).size !== rows.length) {
    console.error("in-game name collision inside the plan");
    process.exit(1);
  }

  writeFileSync(PLAN_FILE, JSON.stringify(rows, null, 1), "utf8");
  const csv = arg("csv", "minecraft-edu-accounts.csv");
  writeCsv(csv, rows);

  const nGedu = rows.length - picked.length;
  const s = await seats();
  console.log(`planned ${rows.length} accounts: ${nGedu} gedu + ${picked.length} gamer`);
  console.log(`  free English combinations : ${free.length}`);
  console.log(`  distinct adjectives drawn : ${adjUse.size}/${EN_ADJ.length}`);
  console.log(`  distinct nouns drawn      : ${nounUse.size}/${EN_NOUN.length}`);
  console.log(`  max uses of any one word  : ${maxUse}`);
  console.log(`  plan -> ${PLAN_FILE}`);
  console.log(`  csv  -> ${csv}`);
  console.log(
    `\nA3 student seats: ${s.used}/${s.total} used, ${s.free} free; this plan needs ${rows.length}`
  );
  if (rows.length > s.free) {
    console.log(`  WARNING: short by ${rows.length - s.free} seats`);
  }
  console.log(`\nsamples:`);
  for (const r of rows.filter((r) => r.kind === "gedu").slice(0, 3)) {
    console.log(`   ${r.upn.padEnd(32)} -> ${r.ingame}   [static group]`);
  }
  for (const r of rows.filter((r) => r.kind === "gamer").slice(0, 12)) {
    console.log(`   ${r.upn.padEnd(32)} -> ${r.ingame}`);
  }
  console.log(`\nNothing was written to Azure. Next: create --apply`);
}

function plan() {
  if (has("add")) return planAdd();
  const nFi = Number(arg("fi", "500"));
  const nEn = Number(arg("en", "100"));
  const pick = (poolList, count, lang) => {
    const p = [...poolList];
    for (let i = p.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    if (count > p.length) {
      console.error(`${lang}: need ${count}, pool has ${p.length}`);
      process.exit(1);
    }
    return p.slice(0, count).map((x) => ({
      upn: `${x.local}@${DOMAIN}`,
      local: x.local,
      ingame: x.ingame,
      meaning: x.meaning,
      lang,
      password: genPassword(),
    }));
  };
  const rows = [
    ...pick(buildPool(FI_ADJ, FI_NOUN), nFi, "fi"),
    ...pick(buildPool(EN_ADJ, EN_NOUN), nEn, "en"),
  ];
  if (new Set(rows.map((r) => r.upn)).size !== rows.length) {
    console.error("UPN collision"); process.exit(1);
  }
  if (new Set(rows.map((r) => r.ingame)).size !== rows.length) {
    console.error("in-game name collision"); process.exit(1);
  }

  writeFileSync(PLAN_FILE, JSON.stringify(rows, null, 1), "utf8");
  const csv = arg("csv", "minecraft-edu-accounts.csv");
  writeCsv(csv, rows);
  console.log(`planned ${rows.length} accounts (${nFi} fi + ${nEn} en)`);
  console.log(`  plan -> ${PLAN_FILE}`);
  console.log(`  csv  -> ${csv}`);
  console.log(`\nsamples:`);
  for (const r of rows.slice(0, 8)) {
    console.log(
      `   ${r.upn.padEnd(32)} -> ${r.ingame}${r.meaning ? `  (${r.meaning})` : ""}`
    );
  }
  console.log(
    `\nNothing was written to Azure. Next: release --apply, delete --apply, create --apply`
  );
}

/**
 * Drop every gamer account out of its licensing group so the seats come back
 * *before* anything irreversible happens. Clearing `department` removes it from
 * the dynamic group; the static group needs an explicit membership delete.
 */
async function release() {
  const us = await gamerAccounts();
  const withDept = us.filter((u) => u.department);
  const staticMembers = await paged(
    `/groups/${STATIC_STUDENT_GRP}/members?$select=id,userPrincipalName&$top=999`
  );
  const staticGamers = staticMembers.filter((m) =>
    (m.userPrincipalName ?? "").toLowerCase().endsWith(`@${DOMAIN}`)
  );

  console.log(`would clear department on : ${withDept.length}`);
  console.log(`would remove from static  : ${staticGamers.length}`);
  if (!APPLY) return console.log(`\n(dry run — pass --apply to write)`);

  for (const [label, items, fn] of [
    ["clear department", withDept, (u) => graph("PATCH", `/users/${u.id}`, { department: null })],
    ["remove from group", staticGamers,
      (u) => graph("DELETE", `/groups/${STATIC_STUDENT_GRP}/members/${u.id}/$ref`)],
  ]) {
    const res = await pool(items, fn);
    const ok = res.filter((r) => r.status === 200 || r.status === 204).length;
    console.log(`${label}: ok=${ok} fail=${items.length - ok}`);
  }
  console.log(`\nSeat release is asynchronous — re-run \`audit\` until free seats settle.`);
}

async function del() {
  const us = await gamerAccounts();
  const stray = us.filter(
    (u) => !(u.userPrincipalName ?? "").toLowerCase().endsWith(`@${DOMAIN}`)
  );
  if (stray.length) {
    console.error(`ABORT: ${stray.length} non-${DOMAIN} accounts in list`);
    process.exit(1);
  }
  console.log(`would delete ${us.length} @${DOMAIN} accounts`);
  if (!APPLY) return console.log(`\n(dry run — pass --apply to write)`);

  const backup = `deleted-accounts-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(backup, JSON.stringify(us, null, 1), "utf8");
  console.log(`snapshot -> ${backup}`);
  const res = await pool(us, (u) => graph("DELETE", `/users/${u.id}`));
  const ok = res.filter((r) => r.status === 204 || r.status === 200).length;
  console.log(`deleted ok=${ok} fail=${us.length - ok}`);
  console.log(
    `\nDeleted users sit in the 30-day recycle bin holding their licence record\n` +
      `but NOT a seat — the seat is released immediately.`
  );
}

async function create() {
  if (!existsSync(PLAN_FILE)) {
    console.error(`No plan file. Run \`plan\` first.`);
    process.exit(1);
  }
  const rows = JSON.parse(readFileSync(PLAN_FILE, "utf8"));

  // An additive plan is drawn against a directory that keeps changing, and
  // `create` may be re-run after a partial failure. Re-check every name against
  // the live tenant rather than trusting the plan: Graph answers a duplicate
  // UPN with a 400 that reads like a validation error, which is an expensive
  // way to discover you are creating the same pool twice.
  const live = new Set(
    (await allUsers()).map((u) => (u.userPrincipalName ?? "").toLowerCase())
  );
  const clash = rows.filter((r) => live.has(r.upn.toLowerCase()));
  if (clash.length) {
    console.error(`ABORT: ${clash.length} planned accounts already exist, e.g.`);
    for (const c of clash.slice(0, 5)) console.error(`   ${c.upn}`);
    process.exit(1);
  }

  const s = await seats();
  const nGedu = rows.filter((r) => r.kind === "gedu").length;
  console.log(
    `would create ${rows.length} accounts (${nGedu} gedu, ` +
      `${rows.length - nGedu} gamer); ${s.free} seats free`
  );
  if (rows.length > s.free) {
    console.log(`  WARNING: short by ${rows.length - s.free} seats`);
  }
  if (!APPLY) return console.log(`\n(dry run — pass --apply to write)`);

  const res = await pool(rows, async (r) => {
    const gedu = r.kind === "gedu";
    const { status, body } = await graph("POST", "/users", {
      accountEnabled: true,
      // displayName and givenName carry the SAME whole name, and surname is
      // omitted entirely. Minecraft Education renders givenName + surname
      // initial, so any surname would swallow the second half of the name.
      displayName: r.ingame,
      givenName: r.ingame,
      mailNickname: r.local,
      userPrincipalName: r.upn,
      usageLocation: USAGE_LOCATION,
      // Two licensing paths, one licence. A gamer account carries the value the
      // Dynamic Gamers rule matches. A gedu pool login is added to the static
      // group below instead and deliberately carries NO department, so the
      // dynamic group goes on meaning exactly "the gamer pool".
      ...(gedu ? {} : { department: GAMER_DEPARTMENT }),
      passwordProfile: {
        // A shared class login keeps the password it is given — the point is
        // reading it out to the room. That covers the gedu pool logins too:
        // SOGGeduNN names a seat in a room, not a person.
        forceChangePasswordNextSignIn: false,
        password: r.password,
      },
    });
    if (status !== 200 && status !== 201) return { status, r, body };
    r.id = body.id;
    if (!gedu) return { status, r, body };
    const g = await graph("POST", `/groups/${STATIC_STUDENT_GRP}/members/$ref`, {
      "@odata.id": `${GRAPH}/directoryObjects/${body.id}`,
    });
    r.grouped = g.status === 204 || g.status === 200;
    return { status, r, body, group: g };
  });

  const ok = res.filter((x) => x.status === 200 || x.status === 201).length;
  console.log(`created ok=${ok} fail=${rows.length - ok}`);
  for (const x of res.filter((y) => y.status !== 200 && y.status !== 201).slice(0, 8)) {
    console.log(
      `   ${x.r.upn} -> ${x.status} ${String(x.body?.error?.message ?? "").slice(0, 120)}`
    );
  }
  // A gedu account whose group add failed exists and is UNLICENSED — the one
  // failure mode this flow has that the gamer path does not, because its
  // licence is a second write rather than a property of the first.
  const ungrouped = res.filter((x) => x.r.kind === "gedu" && x.r.id && !x.r.grouped);
  if (ungrouped.length) {
    console.log(`\nGROUP ADD FAILED for ${ungrouped.length} gedu accounts (they exist, unlicensed):`);
    for (const x of ungrouped.slice(0, 10)) {
      console.log(
        `   ${x.r.upn} -> ${x.group?.status} ` +
          `${String(x.group?.body?.error?.message ?? "").slice(0, 100)}`
      );
    }
  }
  writeFileSync(PLAN_FILE, JSON.stringify(rows, null, 1), "utf8");
  console.log(`\nLicensing is asynchronous — run \`verify\` in a minute or two.`);
}


async function verify() {
  const us = await allUsers();
  const byUpn = new Map(us.map((u) => [(u.userPrincipalName ?? "").toLowerCase(), u]));
  const rows = existsSync(PLAN_FILE) ? JSON.parse(readFileSync(PLAN_FILE, "utf8")) : [];
  const check = rows.length
    ? rows
    : us
        .filter((u) => (u.userPrincipalName ?? "").toLowerCase().endsWith(`@${DOMAIN}`))
        .map((u) => ({
          kind: "gamer",
          upn: u.userPrincipalName,
          ingame: u.displayName,
          lang: "fi",
        }));

  let good = 0;
  const bad = [];
  for (const r of check) {
    const u = byUpn.get(r.upn.toLowerCase());
    const okNow = Boolean(u && isLicensed(u) && u.accountEnabled);
    r.licensed = okNow;
    if (okNow) good++;
    else bad.push(r.upn);
  }
  console.log(`licensed & enabled: ${good}/${check.length}`);
  for (const k of ["gedu", "gamer"]) {
    const set = check.filter((r) => (r.kind ?? "gamer") === k);
    if (set.length) {
      console.log(`   ${k.padEnd(6)}: ${set.filter((r) => r.licensed).length}/${set.length}`);
    }
  }
  if (bad.length) {
    console.log(`problems (first 15):`);
    for (const u of bad.slice(0, 15)) console.log(`   ${u}`);
  }
  const s = await seats();
  console.log(`\nA3 student seats: ${s.used}/${s.total} used, ${s.free} free`);
  if (rows.length) {
    const csv = arg("csv", "minecraft-edu-accounts.csv");
    writeCsv(csv, rows);
    writeFileSync(PLAN_FILE, JSON.stringify(rows, null, 1), "utf8");
    console.log(`csv -> ${csv}`);
  }
}


// ---------------------------------------------------------------------- main
const VERBS = { audit, plan, release, delete: del, create, verify };
const verb = process.argv[2];
if (!verb || !VERBS[verb]) {
  console.error(
    `usage: node scripts/minecraft-edu-accounts.mjs <${Object.keys(VERBS).join("|")}> [--apply]`
  );
  process.exit(1);
}
await VERBS[verb]();
