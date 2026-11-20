// HowLongToBeat CSV -> sources/hltb-games.json: a compact, cleaned copy of what the matcher needs, so the 36 MB CSV never has
// to live in this repository (it is in .gitignore) and hltb-fill.mjs can run from the JSON alone.
//
//   node scripts/hltb-import.mjs [file.csv]        (default: hltb_dataset_normalized.csv in the project folder)
//
// Kept: games only (type "game"), with at least one time to beat, no demos / betas / trials, the name cleaned (HTML entities
// decoded, ™ ® © dropped, spaces collapsed), the year, the systems the catalog knows, the three times in hours and how many
// people reported them (the most of the three). Left out: everything else in the CSV (genres, developer, publisher, release
// day, co-op / versus times, crawl dates, urls...). Rows are arrays, in the order of "cols"; 0 = unknown.
import { readFile, writeFile } from 'node:fs/promises';
import { decode } from './titles.mjs';
import { isDemo } from './demos.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
export const GAMES_FILE = `${ROOT}sources/hltb-games.json`;
export const COLS = ['id', 'name', 'year', 'platforms', 'main', 'extra', 'full', 'polled'];
const MAX_HOURS = 500;

// Catalog platform id -> HLTB's names for it (HLTB lists several per game).
export const HLTB_PLATFORMS = {
  pc: ['PC', 'Mac', 'Linux'], ps1: ['PlayStation'], ps2: ['PlayStation 2', 'Playstation 2'], ps3: ['PlayStation 3'], ps4: ['PlayStation 4'],
  ps5: ['PlayStation 5'], psp: ['PlayStation Portable'], vita: ['PlayStation Vita'], xbox: ['Xbox'], xbox360: ['Xbox 360'],
  nes: ['NES'], snes: ['Super Nintendo'], n64: ['Nintendo 64'], gamecube: ['Nintendo GameCube'], wii: ['Wii'], wiiu: ['Wii U'],
  switch: ['Nintendo Switch'], gb: ['Game Boy'], gbc: ['Game Boy Color'], gba: ['Game Boy Advance'], nds: ['Nintendo DS'], '3ds': ['Nintendo 3DS'],
  genesis: ['Sega Mega Drive/Genesis'], mastersystem: ['Sega Master System'], gamegear: ['Sega Game Gear'], segacd: ['Sega CD'],
  '32x': ['Sega 32X'], saturn: ['Sega Saturn'], dreamcast: ['Dreamcast'], arcade: ['Arcade'], neogeo: ['Neo Geo'], pce: ['TurboGrafx-16'], pcecd: ['TurboGrafx-CD'],
};
const ID_OF = new Map(Object.entries(HLTB_PLATFORMS).flatMap(([id, names]) => names.map((name) => [name, id])));

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

const hours = (text) => {
  const n = Number(text);
  return n > 0 && n <= MAX_HOURS ? Math.round(n * 10) / 10 : 0;
};
export const cleanName = (name) => decode(name).replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim();

// The CSV's rows (objects) -> the compact rows. Returns { rows, stats }.
export function compact(csvRows) {
  const stats = { csvRows: csvRows.length, games: 0, noTime: 0, demos: 0, kept: 0 };
  const rows = [];
  for (const row of csvRows) {
    if (row.type !== 'game') continue;
    stats.games++;
    const [main, extra, full] = [hours(row.main_story), hours(row.main_plus_sides), hours(row.completionist)];
    if (!main && !extra && !full) { stats.noTime++; continue; }
    const name = cleanName(row.name);
    if (!name) continue;
    if (isDemo(name)) { stats.demos++; continue; }
    const platforms = [...new Set(row.platform.split(',').map((p) => ID_OF.get(p.trim())).filter(Boolean))].join(',');
    const polled = Math.max(Number(row.main_story_polled) || 0, Number(row.main_plus_sides_polled) || 0, Number(row.completionist_polled) || 0);
    rows.push([Number(row.id), name, Number(row.release_year) || 0, platforms, main, extra, full, polled]);
    stats.kept++;
  }
  rows.sort((a, b) => a[0] - b[0]);
  return { rows, stats };
}

// Compact rows -> the row objects hltb-fill.mjs works with.
export function expand(rows) {
  return rows.map(([id, name, year, platforms, main, extra, full, polled]) => ({
    id, name, year: year || null, platforms: new Set(platforms ? platforms.split(',') : []),
    main: main || undefined, extra: extra || undefined, full: full || undefined, polled,
  }));
}

export async function loadHltbGames(path = GAMES_FILE) {
  const file = JSON.parse(await readFile(path, 'utf8'));
  return expand(file.rows);
}

async function main() {
  const csvPath = process.argv[2] || `${ROOT}hltb_dataset_normalized.csv`;
  const { rows, stats } = compact(parseCsv(await readFile(csvPath, 'utf8')));
  const generated = new Date().toISOString().slice(0, 10);
  const body = rows.map((row) => JSON.stringify(row)).join(',\n');
  await writeFile(GAMES_FILE,
    `{"generated":"${generated}","note":"Games and times to beat (hours) from HowLongToBeat, cleaned and made offline by scripts/hltb-import.mjs from a local CSV that is not in this repository. Games with at least one time; no demos. year 0 = unknown; platforms = catalog system ids; polled = how many people reported the times. Used by scripts/hltb-fill.mjs.","cols":${JSON.stringify(COLS)},"rows":[\n${body}\n]}\n`);
  console.log(JSON.stringify(stats));
  console.log(`wrote ${GAMES_FILE}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error); process.exit(1); });
