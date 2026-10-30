// IGDB (igdb.com, Twitch): release year, rating and time to beat of the catalog's games, for the
// extension's catalog page (games not on the owner's HowLongToBeat list yet; once they are, HLTB's
// times replace these). Credentials only here, as repository secrets: IGDB_CLIENT_ID, IGDB_CLIENT_SECRET.
// IGDB's terms: free for non-commercial use, credited. 4 requests a second at most; this goes slower.
// What was found or not is kept in the published igdb.json and looked up again after REFRESH_DAYS,
// so a daily build only asks for new games (and BUDGET at most of the slow one-by-one searches).
import { matchKey } from './build.mjs';

const API = 'https://api.igdb.com/v4/';
const REFRESH_DAYS = 30;
const BUDGET = 2500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The catalog's platform ids (data/devices.json in the extension) -> IGDB's platform ids.
export const PLATFORMS = {
  pc: [6, 14, 3], ps1: [7], ps2: [8], ps3: [9], ps4: [48], ps5: [167], psp: [38], vita: [46],
  xbox: [11], xbox360: [12], nes: [18], snes: [19], n64: [4], gamecube: [21], wii: [5], wiiu: [41],
  switch: [130], gb: [33], gbc: [22], gba: [24], nds: [20], '3ds': [37],
  genesis: [29], mastersystem: [64], gamegear: [35], segacd: [78], '32x': [30], saturn: [32], dreamcast: [23],
  arcade: [52], neogeo: [80], pce: [86], pcecd: [150],
};

async function token() {
  const { IGDB_CLIENT_ID: id, IGDB_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) return null;
  const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`, { method: 'POST' });
  if (!response.ok) throw new Error(`IGDB token: ${response.status}`);
  return { id, bearer: (await response.json()).access_token };
}

let last = 0;
async function query(auth, endpoint, body) {
  for (let attempt = 1; ; attempt++) {
    const wait = last + 300 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const response = await fetch(API + endpoint, { method: 'POST', headers: { 'Client-ID': auth.id, Authorization: `Bearer ${auth.bearer}`, Accept: 'application/json' }, body });
    if (response.ok) return response.json();
    if (attempt === 3 || (response.status !== 429 && response.status < 500)) throw new Error(`IGDB ${endpoint}: ${response.status} ${(await response.text()).slice(0, 200)}`);
    await sleep(2000 * attempt);
  }
}

const quote = (text) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const FIELDS = 'fields name,alternative_names.name,first_release_date,total_rating,platforms;';

// The IGDB game for a title: its name (or one of its other names) gives the same key, on that platform.
// Several: the earliest one (the original rather than a later re-release with the same name).
function pick(results, key, ids) {
  const same = results.filter((game) => (game.platforms || []).some((id) => ids.includes(id))
    && [game.name, ...(game.alternative_names || []).map((alt) => alt.name)].some((name) => matchKey(name) === key));
  return same.sort((a, b) => (a.first_release_date || Infinity) - (b.first_release_date || Infinity))[0] || null;
}

const hours = (seconds) => (seconds ? Math.round(seconds / 360) / 10 : undefined);

// wanted: [{ platform, title }]. previous: the igdb.json published last time, or null.
// Returns { games: { "<platform>|<key>": { id, name, year?, rating?, main?, extra?, full?, at } }, misses: { "<platform>|<key>": at } },
// or null without credentials (the build then keeps the previous file).
export async function igdb(wanted, previous, { budget = BUDGET, log = console.log } = {}) {
  const auth = await token();
  if (!auth) return null;
  const now = Date.now();
  const fresh = (at) => at && now - at < REFRESH_DAYS * 24 * 3600 * 1000;
  const games = {};
  const misses = {};
  const todo = new Map();
  for (const { platform, title } of wanted) {
    const key = matchKey(title);
    const id = `${platform}|${key}`;
    if (!key || !PLATFORMS[platform] || todo.has(id) || games[id] || misses[id]) continue;
    const known = previous && previous.games && previous.games[id];
    const missed = previous && previous.misses && previous.misses[id];
    if (known && fresh(known.at)) games[id] = known;
    else if (missed && fresh(missed)) misses[id] = missed;
    else todo.set(id, { platform, title, key });
  }
  log(`igdb: ${Object.keys(games).length} kept, ${Object.keys(misses).length} misses kept, ${todo.size} to look up`);

  const found = new Map();
  // 1. Exact names, 50 a request, per platform.
  const byPlatform = new Map();
  for (const [id, entry] of todo) byPlatform.set(entry.platform, [...(byPlatform.get(entry.platform) || []), [id, entry]]);
  for (const [platform, entries] of byPlatform) {
    const ids = PLATFORMS[platform];
    for (let i = 0; i < entries.length; i += 50) {
      const chunk = entries.slice(i, i + 50);
      const results = await query(auth, 'games', `${FIELDS} where name = (${chunk.map(([, entry]) => quote(entry.title)).join(',')}) & platforms = (${ids.join(',')}); limit 500;`);
      for (const [id, entry] of chunk) {
        const game = pick(results, entry.key, ids);
        if (game) found.set(id, game);
      }
    }
  }
  log(`igdb: ${found.size} by exact name`);

  // 2. The rest one by one with IGDB's search (other spellings: "Grand Theft Auto - San Andreas"), up to the budget.
  let searched = 0;
  for (const [id, entry] of todo) {
    if (found.has(id)) continue;
    if (searched >= budget) break;
    searched++;
    const ids = PLATFORMS[entry.platform];
    const results = await query(auth, 'games', `search ${quote(entry.title.replace(/\s+-\s+/g, ': '))}; ${FIELDS} where platforms = (${ids.join(',')}); limit 20;`);
    const game = pick(results, entry.key, ids);
    if (game) found.set(id, game);
    else misses[id] = now;
  }
  log(`igdb: ${searched} searched one by one, ${found.size} found in all`);

  // 3. Times to beat (seconds), 500 games a request.
  const times = new Map();
  const gameIds = [...new Set([...found.values()].map((game) => game.id))];
  for (let i = 0; i < gameIds.length; i += 500) {
    const results = await query(auth, 'game_time_to_beats', `fields game_id,hastily,normally,completely; where game_id = (${gameIds.slice(i, i + 500).join(',')}); limit 500;`);
    for (const time of results) times.set(time.game_id, time);
  }
  for (const [id, game] of found) {
    const time = times.get(game.id) || {};
    games[id] = Object.fromEntries(Object.entries({
      id: game.id, name: game.name,
      year: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : undefined,
      rating: game.total_rating ? Math.round(game.total_rating) : undefined,
      main: hours(time.hastily), extra: hours(time.normally), full: hours(time.completely),
      at: now,
    }).filter(([, value]) => value !== undefined));
  }
  log(`igdb: ${Object.keys(games).length} games, ${[...Object.values(games)].filter((game) => game.main || game.extra).length} with a time; ${Object.keys(misses).length} not found`);
  return { games, misses };
}

// node scripts/igdb.mjs --probe: a few known titles, to check the credentials and the queries.
if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes('--probe')) {
  const sample = [
    ['ps2', 'Okami'], ['ps2', 'Grand Theft Auto - San Andreas'], ['ps2', 'Shadow of the Colossus'], ['ps3', "Demon's Souls"],
    ['ps3', 'Metal Gear Solid 4: Guns of the Patriots'], ['switch', 'Metroid Dread'], ['switch', 'Super Mario Bros. Wonder'],
    ['n64', 'Super Mario 64'], ['ps4', 'P.T.'], ['pc', 'Stardew Valley'], ['pc', 'Balatro'], ['pc', '-SPROUT-'],
    ['pc', 'The Elder Scrolls III: Morrowind'], ['xbox360', 'Sonic Unleashed'], ['wii', "Pandora's Tower"],
  ].map(([platform, title]) => ({ platform, title }));
  const result = await igdb(sample, null, { budget: 50 });
  if (!result) { console.log('no credentials'); process.exit(1); }
  for (const [id, game] of Object.entries(result.games)) console.log(id, JSON.stringify(game));
  console.log('misses', Object.keys(result.misses).join(', '));
}
