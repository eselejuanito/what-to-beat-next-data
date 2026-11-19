// Offline tool: matches the catalog's games against a local HowLongToBeat CSV (hltb_dataset_normalized.csv, NOT
// kept in this repository) and writes the small result the build reads, plus what still needs a human look.
//
//   node scripts/hltb-fill.mjs [--csv file] [--site dir-or-url] [--out dir]
//
// Reads the catalog (ports.json + emu/*.json) and igdb.json from --site (default: the published site).
// Writes:
//   sources/hltb-times.json   { games: { "<platform>|<key>": { main?, extra?, full?, h: <HLTB id>, by? } } }  COMMITTED, used by build.mjs
//   out/hltb-auto.json        matches that were NOT an exact name (looser spelling, accepted by the rules below), to audit
//   out/hltb-review.json      games with no accepted match: reason + candidates for a second pass by hand (ignored by git)
//
// Matching, in order. A match is accepted only with a row that has times.
//   1. Exact: the same match key (title, the port's other keys, IGDB's own name for it).
//   2. Safe spellings (variants()): "X, The" <-> "The X", "&" <-> "and", brackets and edition words dropped, roman <-> arabic
//      numerals; one side exact, or both reaching the same key in the same way.
//   3. Fuzzy (trigrams): >= FUZZY_MIN similar, same numbers in the title, same platform.
//   For 2 and 3 the years must agree (within 1; unknown on a side: the platform must match). For 1, within 3.
// "Before the colon" ("Dynasty Warriors 8: Xtreme Legends" -> "Dynasty Warriors 8") is only ever a suggestion: it is
// often a different game.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { matchKey } from './build.mjs';
import { isDemo } from './demos.mjs';

const BASE = 'https://eselejuanito.github.io/what-to-beat-next-data/';
const ROOT = new URL('..', import.meta.url).pathname;
const MAX_HOURS = 500;
const FUZZY_MIN = 0.85;
const EMU = ['ps2', 'ps3', 'gamecube', 'wii', 'wiiu', 'psp', 'ps4', 'ps5'];

// Catalog platform id -> HLTB platform names (HLTB lists several per game, comma separated).
const HLTB_PLATFORMS = {
  pc: ['PC', 'Mac', 'Linux'], ps1: ['PlayStation'], ps2: ['PlayStation 2', 'Playstation 2'], ps3: ['PlayStation 3'], ps4: ['PlayStation 4'],
  ps5: ['PlayStation 5'], psp: ['PlayStation Portable'], vita: ['PlayStation Vita'], xbox: ['Xbox'], xbox360: ['Xbox 360'],
  nes: ['NES'], snes: ['Super Nintendo'], n64: ['Nintendo 64'], gamecube: ['Nintendo GameCube'], wii: ['Wii'], wiiu: ['Wii U'],
  switch: ['Nintendo Switch'], gb: ['Game Boy'], gbc: ['Game Boy Color'], gba: ['Game Boy Advance'], nds: ['Nintendo DS'], '3ds': ['Nintendo 3DS'],
  genesis: ['Sega Mega Drive/Genesis'], mastersystem: ['Sega Master System'], gamegear: ['Sega Game Gear'], segacd: ['Sega CD'],
  '32x': ['Sega 32X'], saturn: ['Sega Saturn'], dreamcast: ['Dreamcast'], arcade: ['Arcade'], neogeo: ['Neo Geo'], pce: ['TurboGrafx-16'], pcecd: ['TurboGrafx-CD'],
};

// ---- helpers ---------------------------------------------------------------------------------------
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
async function load(base, path) {
  if (/^https?:/.test(base)) {
    const response = await fetch(new URL(path, base.endsWith('/') ? base : `${base}/`), { headers: { 'User-Agent': 'what-to-beat-next-data' } });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  }
  return JSON.parse(await readFile(join(base, path), 'utf8'));
}

// CSV with quoted fields (and doubled quotes inside them). Returns an array of objects.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((name, i) => [name, r[i] ?? ''])));
}

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15 };
const ROMAN_OF = Object.fromEntries(Object.entries(ROMAN).map(([k, v]) => [v, k]));
const EDITION = /\b(?:the\s+)?(?:game of the year|goty|definitive|complete|ultimate|deluxe|enhanced|special|remastered|remaster|hd|director'?s cut|collector'?s|anniversary|legendary|gold|premium|standard|digital)\s*(?:edition|collection|version|cut)?\b/gi;

// Spellings that are safe to treat as the same game. Anything else ("before-colon") is a suggestion only.
export const SAFE = new Set(['exact', 'and', 'no-the', 'article-moved', 'article-dropped', 'no-brackets', 'no-edition', 'roman', 'arabic-to-roman', 'no-article-and-the']);

// Looser spellings of a title, as Map<matchKey, kind>.
export function variants(title) {
  const out = new Map();
  const add = (kind, text) => { const key = matchKey(text); if (key.length >= 3 && !out.has(key)) out.set(key, kind); };
  const base = (title || '').replace(/[™®©]/g, '');
  add('exact', base);
  add('and', base.replace(/&/g, ' and '));
  add('no-the', base.replace(/^the\s+/i, ''));
  // "King of Fighters XI, The" <-> "The King of Fighters XI"
  const suffix = base.match(/^(.*?),\s*(the|a|an)\s*$/i);
  if (suffix) { add('article-moved', `${suffix[2]} ${suffix[1]}`); add('article-dropped', suffix[1]); }
  const plain = base.replace(/[([][^)\]]*[)\]]/g, ' ');
  add('no-brackets', plain);
  add('no-edition', plain.replace(EDITION, ' '));
  add('before-colon', base.split(/\s*[:–—]\s+|\s+-\s+/)[0]);
  add('roman', base.replace(/\b([ivx]{1,5})\b/gi, (m) => (ROMAN[m.toLowerCase()] ? String(ROMAN[m.toLowerCase()]) : m)));
  add('arabic-to-roman', base.replace(/\b([2-9]|1[0-5])\b/g, (m) => ROMAN_OF[Number(m)] || m));
  add('no-article-and-the', base.replace(/^the\s+/i, '').replace(/\band\b/gi, ' '));
  return out;
}

// Some titles reach us with HTML entities ("Pokk&eacute;n Tournament").
const ENTITIES = { amp: '&', quot: '"', apos: "'", eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä', ccedil: 'ç', ecirc: 'ê', acirc: 'â', ocirc: 'ô', icirc: 'î', reg: '®', trade: '™', copy: '©' };
export const decode = (text) => (text || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, name) => {
  if (name[0] === '#') { const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1)); return code ? String.fromCodePoint(code) : m; }
  return ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? m;
});

const trigrams = (key) => { const set = new Set(); for (let i = 0; i + 3 <= key.length; i++) set.add(key.slice(i, i + 3)); return set; };
// The numbers a title carries, roman ones too (Swords & Soldiers is not Swords & Soldiers II; Bloons TD X is not Bloons TD).
const numbersOf = (name) => (name || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).map((word) => (ROMAN[word] ? String(ROMAN[word]) : /^\d+$/.test(word) ? word : '')).filter(Boolean).join(',');

const hrs = (text) => {
  const n = Number(text);
  return n > 0 && n <= MAX_HOURS ? Math.round(n * 10) / 10 : undefined;
};
const timesOf = (row) => ({ main: hrs(row.main_story), extra: hrs(row.main_plus_sides), full: hrs(row.completionist) });
const hasTime = (row) => Object.values(timesOf(row)).some((v) => v !== undefined);
const polled = (row) => Math.max(Number(row.main_story_polled) || 0, Number(row.main_plus_sides_polled) || 0, Number(row.completionist_polled) || 0);

// ---- main ------------------------------------------------------------------------------------------
async function main() {
  const csvPath = arg('csv', join(ROOT, 'hltb_dataset_normalized.csv'));
  const site = arg('site', BASE);
  const out = arg('out', join(ROOT, 'out'));

  const rows = parseCsv(await readFile(csvPath, 'utf8')).filter((row) => row.type === 'game');
  const withTimes = rows.filter(hasTime);
  console.log(`csv: ${rows.length} games, ${withTimes.length} with a time`);

  // Indexes. Exact and variant ones over all rows (to tell "found, no times" from "not found"); trigrams over rows with times.
  const byKey = new Map();
  const byVariant = new Map();
  const push = (map, key, value) => { const list = map.get(key); if (list) list.push(value); else map.set(key, [value]); };
  for (const row of rows) {
    row.platforms = new Set(row.platform.split(',').map((p) => p.trim()).filter(Boolean));
    row.year = Number(row.release_year) || null;
    row.key = matchKey(row.name);
    if (!row.key) continue;
    push(byKey, row.key, row);
    for (const [key, kind] of variants(row.name)) push(byVariant, key, { row, kind });
  }
  const byGram = new Map();
  for (const row of withTimes) if (row.key.length >= 4) { row.grams = trigrams(row.key); for (const gram of row.grams) push(byGram, gram, row); }

  // The catalog: the same list build.mjs asks IGDB about.
  const ports = (await load(site, 'ports.json')).ports;
  const igdb = await load(site, 'igdb.json');
  const wanted = new Map();
  const want = (platform, title, aliases = []) => {
    const key = matchKey(title);
    const id = `${platform}|${key}`;   // the id keeps the title as published; matching uses it decoded
    if (key && !wanted.has(id)) wanted.set(id, { id, platform, title: decode(title), aliases: aliases.map(matchKey) });
  };
  for (const port of ports) for (const game of port.games) want(port.platform, game.title, game.keys || []);
  for (const platform of EMU) for (const game of (await load(site, `emu/${platform}.json`)).games) if (game.status !== 'no') want(platform, game.title);
  console.log(`catalog: ${wanted.size} games; igdb.json: ${Object.keys(igdb.games).length} found, ${Object.keys(igdb.misses || {}).length} misses`);

  const platformOk = (row, platform) => (HLTB_PLATFORMS[platform] || []).some((n) => row.platforms.has(n));
  // Years must agree; with a year unknown on a side, the platform has to match instead.
  const agrees = (row, platform, year, tolerance) => (year && row.year ? Math.abs(row.year - year) <= tolerance : platformOk(row, platform));
  const best = (candidates, platform, year) => {
    const score = (row) => (hasTime(row) ? 1000 : 0) + (platformOk(row, platform) ? 100 : 0)
      + (year && row.year ? (Math.abs(row.year - year) <= 1 ? 50 : Math.abs(row.year - year) <= 3 ? 10 : -50) : 0) + Math.min(polled(row), 40) / 4;
    return [...candidates].sort((a, b) => score(b) - score(a))[0];
  };

  // Hand-made links (sources/hltb-aliases.json): { "<platform>|<key>": <HLTB id> | null }. A number points the game at that HLTB row
  // (any spelling, any year); null says "looked at, HLTB does not have it" (it leaves the review list).
  const manual = JSON.parse(await readFile(join(ROOT, 'sources/hltb-aliases.json'), 'utf8').catch(() => '{"games":{}}')).games;
  const byId = new Map(rows.map((row) => [Number(row.id), row]));

  const result = {};   // id -> { main, extra, full, h, by? }
  const auto = [];     // accepted, not exact: to audit
  const review = [];   // not accepted
  const stats = { catalog: wanted.size, exact: 0, safeSpelling: 0, fuzzy: 0, noMatch: 0, foundNoTimes: 0, yearMismatch: 0 };

  for (const { id, platform, title, aliases } of wanted.values()) {
    const ig = igdb.games[id];
    const year = ig ? ig.year : null;
    const record = { id, platform, title, igdbName: ig ? ig.name : undefined, year: year || undefined };
    const accept = (row, by, extra) => {
      const t = timesOf(row);
      result[id] = { ...Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined)), h: Number(row.id), ...(by === 'exact' ? {} : { by }) };
      if (by !== 'exact') auto.push({ ...record, hltb: brief(row), by, ...extra });
    };
    const names = [title, ig && ig.name].filter(Boolean);
    let problem = null;

    // 0. Looked at by hand.
    if (id in manual) {
      const row = manual[id] === null ? null : byId.get(manual[id]);
      if (manual[id] === null) { stats.manualNone = (stats.manualNone || 0) + 1; continue; }
      if (row && hasTime(row)) { accept(row, 'manual'); stats.manual = (stats.manual || 0) + 1; continue; }
    }

    // 1. Exact.
    const keys = [...new Set([matchKey(title), ...aliases, ig ? matchKey(ig.name) : ''].filter(Boolean))];
    const exactKey = keys.find((key) => byKey.has(key));
    if (exactKey) {
      const row = best(byKey.get(exactKey), platform, year);
      // Same name, another year: a port or re-release of the same game when HLTB itself lists this system on the row.
      if (year && row.year && Math.abs(row.year - year) > 3 && !(hasTime(row) && platformOk(row, platform))) problem = { reason: 'year-mismatch', hltb: brief(row) };
      else if (!hasTime(row)) problem = { reason: 'found-without-times', hltb: brief(row) };
      else { accept(row, 'exact'); stats.exact++; continue; }
    }

    // A demo only counts through an exact name (a row that is itself that demo); looser spellings would give it the full game's time.
    if (names.some((name) => isDemo(name))) problem = problem || { reason: 'demo' };

    // 2. Safe spellings.
    const found = new Map();
    for (const name of problem && problem.reason === 'demo' ? [] : names) {
      for (const [key, kind] of variants(name)) {
        for (const { row, kind: rowKind } of byVariant.get(key) || []) {
          const ok = (kind === 'exact' && SAFE.has(rowKind)) || (rowKind === 'exact' && SAFE.has(kind)) || (kind === rowKind && SAFE.has(kind));
          if (ok && hasTime(row) && agrees(row, platform, year, 1) && !found.has(row)) found.set(row, kind === 'exact' ? rowKind : kind);
        }
      }
    }
    if (found.size) {
      const row = best(found.keys(), platform, year);
      accept(row, `spelling:${found.get(row)}`);
      stats.safeSpelling++;
      continue;
    }

    // 3. Fuzzy.
    const mine = trigrams(matchKey(title));
    const tally = new Map();
    if (mine.size >= 2) {
      for (const gram of mine) {
        const list = byGram.get(gram);
        if (list && list.length < 4000) for (const row of list) tally.set(row, (tally.get(row) || 0) + 1);
      }
    }
    const scored = [...tally].map(([row, shared]) => [row, shared / (mine.size + row.grams.size - shared)]).filter(([, s]) => s >= 0.6)
      .sort((a, b) => b[1] - a[1]).slice(0, 5);
    const myNumbers = numbersOf(title);
    const pick = scored.find(([row, s]) => s >= FUZZY_MIN && numbersOf(row.name) === myNumbers && agrees(row, platform, year, 1) && platformOk(row, platform));
    if (pick && !problem) {
      accept(pick[0], 'fuzzy', { score: Math.round(pick[1] * 100) / 100 });
      stats.fuzzy++;
      continue;
    }

    // Not accepted: why, and what to look at.
    const suggestions = [];
    const seen = new Set();
    const addSuggestion = (row, how) => { if (!seen.has(row) && hasTime(row)) { seen.add(row); suggestions.push({ ...brief(row), how, ...Object.fromEntries(Object.entries(timesOf(row)).filter(([, v]) => v !== undefined)) }); } };
    for (const name of names) for (const [key, kind] of variants(name)) if (kind !== 'exact') for (const { row, kind: rowKind } of byVariant.get(key) || []) addSuggestion(row, rowKind === 'exact' ? kind : `${kind}~${rowKind}`);
    for (const [row, s] of scored) addSuggestion(row, `fuzzy ${s.toFixed(2)}`);
    suggestions.sort((a, b) => (Math.abs((a.year || 0) - (year || 0)) - Math.abs((b.year || 0) - (year || 0))));
    const reason = problem ? problem.reason : 'no-match';
    if (reason === 'year-mismatch') stats.yearMismatch++; else if (reason === 'found-without-times') stats.foundNoTimes++; else if (reason === 'demo') stats.demo = (stats.demo || 0) + 1; else stats.noMatch++;
    review.push({ ...record, reason, ...(problem ? { hltb: problem.hltb } : {}), suggestions: suggestions.slice(0, 4) });
  }

  function brief(row) { return { id: Number(row.id), name: row.name, year: row.year || undefined, platforms: [...row.platforms].slice(0, 4).join(', ') || undefined }; }

  // The committed file: one game per line, so a change shows as a small diff.
  const generated = new Date().toISOString().slice(0, 10);
  const lines = Object.entries(result).sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, value]) => `${JSON.stringify(id)}:${JSON.stringify(value)}`);
  await writeFile(join(ROOT, 'sources/hltb-times.json'),
    `{"generated":"${generated}","note":"Approximate times (hours) from HowLongToBeat, made offline by scripts/hltb-fill.mjs; the build uses only the fields IGDB lacks. main=main story, extra=main+sides, full=completionist. h=HowLongToBeat id.","games":{\n${lines.join(',\n')}\n}}\n`);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'hltb-auto.json'), JSON.stringify({ generated, count: auto.length, games: auto }, null, 1));
  await writeFile(join(out, 'hltb-review.json'), JSON.stringify({ generated, count: review.length, games: review }, null, 1));
  const needing = [...wanted.keys()].filter((id) => ['main', 'extra', 'full'].some((f) => !(igdb.games[id] && igdb.games[id][f] > 0)));
  const gained = needing.filter((id) => result[id] && ['main', 'extra', 'full'].some((f) => result[id][f] && !(igdb.games[id] && igdb.games[id][f] > 0))).length;
  console.log(JSON.stringify({ ...stats, matched: Object.keys(result).length, needingATime: needing.length, gainTimeFromHltb: gained, stillWithoutMatch: review.length }, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error); process.exit(1); });
