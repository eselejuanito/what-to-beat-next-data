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
const FIELDS = 'fields name,slug,cover.image_id,alternative_names.name,first_release_date,total_rating,total_rating_count,platforms;';
// A rating from a handful of votes says little (100 % from 2 people): left out under this many.
const MIN_VOTES = 5;

// The IGDB game for a title: its name (or one of its other names) gives the same key, on that platform.
// Several: the earliest one (the original rather than a later re-release with the same name).
function pick(results, key, ids) {
  const same = results.filter((game) => (game.platforms || []).some((id) => ids.includes(id))
    && [game.name, ...(game.alternative_names || []).map((alt) => alt.name)].some((name) => matchKey(name) === key));
  return same.sort((a, b) => (a.first_release_date || Infinity) - (b.first_release_date || Infinity))[0] || null;
}

const hours = (seconds) => (seconds ? Math.round(seconds / 360) / 10 : undefined);

// wanted: [{ platform, title }]. previous: the igdb.json published last time, or null.
// Returns { games: { "<platform>|<key>": { id, name, slug, cover?, year?, rating?, main?, extra?, full?, at } }, misses: { "<platform>|<key>": at } },
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
      id: game.id, name: game.name, slug: game.slug, cover: game.cover ? game.cover.image_id : undefined,
      year: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : undefined,
      rating: game.total_rating && game.total_rating_count >= MIN_VOTES ? Math.round(game.total_rating) : undefined,
      votes: game.total_rating && game.total_rating_count >= MIN_VOTES ? game.total_rating_count : undefined,
      main: hours(time.hastily), extra: hours(time.normally), full: hours(time.completely),
      at: now,
    }).filter(([, value]) => value !== undefined));
  }
  // Ratings move: those of the games kept from the last build are read again, 500 a request.
  const kept = Object.entries(games).filter(([id]) => !found.has(id));
  const ratings = new Map();
  const keptIds = [...new Set(kept.map(([, game]) => game.id))];
  for (let i = 0; i < keptIds.length; i += 500) {
    for (const game of await query(auth, 'games', `fields total_rating,total_rating_count,slug,cover.image_id; where id = (${keptIds.slice(i, i + 500).join(',')}); limit 500;`)) ratings.set(game.id, game);
  }
  for (const [id, game] of kept) {
    const fresh = ratings.get(game.id);
    if (!fresh) continue;
    // The page (slug) and cover (image id) too: kept games from before they were stored get them here.
    const { rating, votes, slug, cover, ...rest } = game;
    games[id] = Object.fromEntries(Object.entries({
      ...rest, slug: fresh.slug, cover: fresh.cover ? fresh.cover.image_id : undefined,
      rating: fresh.total_rating && fresh.total_rating_count >= MIN_VOTES ? Math.round(fresh.total_rating) : undefined,
      votes: fresh.total_rating && fresh.total_rating_count >= MIN_VOTES ? fresh.total_rating_count : undefined,
    }).filter(([, value]) => value !== undefined));
  }
  log(`igdb: ${Object.keys(games).length} games, ${[...Object.values(games)].filter((game) => game.main || game.extra).length} with a time; ${Object.keys(misses).length} not found`);
  return { games, misses };
}

// Well-liked games of the consoles that have no per-game emulator list (NES to Switch, arcade): IGDB's
// rating of at least 60 % from at least 10 votes, main games, remakes and remasters only. Taken again
// every REFRESH_DAYS. Returns { at, consoles: { "<console id>": [{ id, name, slug, cover?, year?, rating, votes, main?, extra?, full? }] } }.
// A game counts for a console it came out on within two years of its first release (not Super Mario Bros. 3
// as a 3DS game through the Virtual Console); on recent consoles, not when it is also on PC, where it runs natively.
export const CLASSIC_CONSOLES = ['nes', 'snes', 'n64', 'switch', 'gb', 'gbc', 'gba', 'nds', '3ds', 'ps1', 'ps4', 'vita',
  'xbox', 'xbox360', 'genesis', 'mastersystem', 'gamegear', 'segacd', '32x', 'saturn', 'dreamcast', 'pce', 'pcecd', 'neogeo', 'arcade'];
const ALSO_ON_PC = new Set(['switch', 'ps4', 'vita', '3ds', 'xbox', 'xbox360']);
export async function classics(previous, { log = console.log } = {}) {
  if (previous && previous.at && Date.now() - previous.at < REFRESH_DAYS * 24 * 3600 * 1000) return previous;
  const auth = await token();
  if (!auth) return previous || null;
  const out = { at: Date.now(), consoles: {} };
  for (const consoleId of CLASSIC_CONSOLES) {
    const ids = PLATFORMS[consoleId];
    const found = [];
    for (let offset = 0; offset < 5000; offset += 500) {
      const page = await query(auth, 'games', `fields name,slug,cover.image_id,first_release_date,total_rating,total_rating_count,platforms,release_dates.platform,release_dates.y; where platforms = (${ids.join(',')}) & total_rating >= 60 & total_rating_count >= 10 & game_type = (0,8,9); sort total_rating_count desc; limit 500; offset ${offset};`);
      found.push(...page);
      if (page.length < 500) break;
    }
    const firstYear = (game) => (game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : null);
    const list = found.filter((game) => {
      if (ALSO_ON_PC.has(consoleId) && (game.platforms || []).some((id) => PLATFORMS.pc.includes(id))) return false;
      const years = (game.release_dates || []).filter((date) => ids.includes(date.platform) && date.y).map((date) => date.y);
      // Arcade: only games that came out there first (not Super Mario World on the Nintendo Super System).
      const slack = consoleId === 'arcade' ? 0 : 2;
      return !years.length || !firstYear(game) || Math.min(...years) <= firstYear(game) + slack;
    });
    const times = new Map();
    for (let i = 0; i < list.length; i += 500) {
      for (const time of await query(auth, 'game_time_to_beats', `fields game_id,hastily,normally,completely; where game_id = (${list.slice(i, i + 500).map((game) => game.id).join(',')}); limit 500;`)) times.set(time.game_id, time);
    }
    out.consoles[consoleId] = list.map((game) => {
      const time = times.get(game.id) || {};
      return Object.fromEntries(Object.entries({
        id: game.id, name: game.name, slug: game.slug, cover: game.cover ? game.cover.image_id : undefined,
        year: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : undefined,
        rating: Math.round(game.total_rating), votes: game.total_rating_count,
        main: hours(time.hastily), extra: hours(time.normally), full: hours(time.completely),
      }).filter(([, value]) => value !== undefined));
    });
    log(`classics: ${consoleId} ${list.length} (of ${found.length})`);
  }
  return out;
}

// node scripts/igdb.mjs --probe: a few known titles, to check the credentials and the queries.
if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes('--probe')) {
  const sample = [
    ['ps2', 'Okami'], ['ps2', 'Grand Theft Auto - San Andreas'], ['ps2', 'Shadow of the Colossus'], ['ps3', "Demon's Souls"],
    ['ps3', 'Metal Gear Solid 4: Guns of the Patriots'], ['switch', 'Metroid Dread'], ['switch', 'Super Mario Bros. Wonder'],
    ['n64', 'Super Mario 64'], ['ps4', 'P.T.'], ['pc', 'Stardew Valley'], ['pc', 'Balatro'], ['pc', '-SPROUT-'],
    ['pc', 'The Elder Scrolls III: Morrowind'], ['xbox360', 'Sonic Unleashed'], ['wii', "Pandora's Tower"],
  ].map(([platform, title]) => ({ platform, title }));
  if (process.argv.includes('--classics')) {
    const result = await classics(null);
    for (const [id, list] of Object.entries(result.consoles)) console.log(id, list.length, list.slice(0, 3).map((game) => `${game.name} ${game.rating}% ${game.votes}v ${game.year}`).join(' | '));
    process.exit(0);
  }
  const result = await igdb(sample, null, { budget: 50 });
  if (!result) { console.log('no credentials'); process.exit(1); }
  for (const [id, game] of Object.entries(result.games)) console.log(id, JSON.stringify(game));
  console.log('misses', Object.keys(result.misses).join(', '));
}
