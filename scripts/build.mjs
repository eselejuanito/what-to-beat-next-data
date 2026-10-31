// Builds the files What To Beat Next downloads (site/): which games run where, from
//   sources/ports.json  fan ports and recompilations, curated; systems from each project's latest GitHub release
//   RPCS3               PlayStation 3 compatibility list (rpcs3.net public API, one page a second)
//   PCSX2               PlayStation 2 game database (GameIndex.yaml in the PCSX2 repository, GPL-3.0)
//   PortMaster          ports for Linux handhelds (ports.json of PortsMaster/PortMaster-New's latest release, MIT)
//   Dolphin wiki        GameCube and Wii ratings (wiki.dolphin-emu.org, CC BY-SA 3.0: emu/gamecube.json and emu/wii.json too)
//   shadPS4             PlayStation 4 reports (issues of shadps4-compatibility/shadps4-game-compatibility, status
//                       labels; no license stated: titles and statuses only, credited and linked back)
//   Cemu, PPSSPP        Wii U and PSP compatibility lists, read from their public pages (compat.cemu.info,
//                       report.ppsspp.org; no license stated: only titles and ratings, credited and linked back)
//   SharpEmu, KytyPS5   PlayStation 5 emulators' compatibility lists (sharpemu-site: MIT; kytyps5.github.io: GPL-2.0)
//   IGDB                year, rating and time to beat of those games (igdb.mjs; needs the IGDB_* secrets)
//   nxnative            Switch games whose own code runs natively on Apple chips (its games table, MIT)
// Only facts and links to each project's own page; never game files. Node 20+, no dependencies.
// Usage: node scripts/build.mjs [--offline <dir with rpcs3/*.json and GameIndex.yaml>]   (GITHUB_TOKEN optional)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { igdb, classics } from './igdb.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'site');
const AGENT = 'what-to-beat-next-data (+https://github.com/eselejuanito/what-to-beat-next-data)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The key the extension uses to compare titles: letters and digits only, lower case, no accents or ™.
export function matchKey(title) {
  return (title || '').replace(/[™®©]/g, '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

async function get(url, { json = true, headers = {} } = {}) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': AGENT, ...headers } });
    if (response.ok) return json ? response.json() : response.text();
    if (response.status === 404) return null;
    if (attempt === 3) throw new Error(`${url}: ${response.status}`);
    await sleep(5000 * attempt);
  }
}

// ---- Ports: systems from the names of the latest release's files ----------------------------------

// "OpenMW-0.51.0-macOS-arm64.dmg" -> ["macos-arm64"]; a Mac file with no architecture is taken as
// both (universal builds rarely say so). Debug symbols, sources and checksums say nothing.
export function hostsOf(name) {
  const file = name.toLowerCase();
  if (/(^pdb|-pdb-|debug|symbols|(sources?|src)[._-]|dev-tools|sha\d*sums|\.sha\d+$|\.sig$|\.asc$|\.zsync$|\.json$|checksum)/.test(file)) return [];
  const arm = /(arm64|aarch64|armv8|apple-?silicon|[-_.]arm[-_.])/.test(file);
  const x64 = /(x86[_-]64|x64|amd64|win64|64-?bit)/.test(file);
  const universal = /universal/.test(file);
  if (/(\.apk$|android)/.test(file)) return [/(x86_64|x64)/.test(file) ? 'android-x64' : 'android-arm64'];
  if (/(mac|osx|darwin|\.dmg$)/.test(file)) {
    if (/(ppc|tiger|10\.4)/.test(file)) return [];
    if (universal || (!arm && !x64 && !/intel|x86/.test(file))) return ['macos-arm64', 'macos-x64'];
    return [arm ? 'macos-arm64' : 'macos-x64'];
  }
  if (/(linux|\.appimage$|flatpak|\.deb$|ubuntu|debian|steamdeck|\.tar\.(gz|xz|bz2)$)/.test(file) && !/(win|mac|osx)/.test(file)) {
    if (/(i386|i686|x86(?![_-]64))/.test(file) && !x64) return [];
    return [arm ? 'linux-arm64' : 'linux-x64'];
  }
  // No system named, a Windows-style archive with an architecture ("builds-x64-AVX.zip"): Windows.
  const windowsArchive = /\.(zip|7z)$/.test(file) && (x64 || arm);
  if (/(win|\.exe$|msvc|mingw|\.msi$)/.test(file) || windowsArchive) {
    if (/(win32|x86(?![_-]64)|i686)/.test(file) && !x64 && !arm) return [];
    return [arm ? 'windows-arm64' : 'windows-x64'];
  }
  return [];
}

export async function ports() {
  const { ports: list } = JSON.parse(await readFile(join(ROOT, 'sources/ports.json'), 'utf8'));
  const headers = { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const out = [];
  for (const port of list) {
    let hosts = port.hosts || [];
    let release = null;
    if (port.repo) {
      // "latest" skips pre-releases; some projects only publish those (a "continuous" build).
      const latest = await get(`https://api.github.com/repos/${port.repo}/releases/latest`, { headers })
        || ((await get(`https://api.github.com/repos/${port.repo}/releases?per_page=1`, { headers })) || [])[0];
      if (latest) {
        hosts = [...new Set(latest.assets.flatMap((asset) => hostsOf(asset.name)))].sort();
        release = { version: latest.tag_name, date: (latest.published_at || '').slice(0, 10) };
      }
      if (!hosts.length) hosts = port.hosts || [];
      await sleep(300);
    }
    out.push({
      games: port.games.map((game) => ({ title: game.title, keys: [...new Set([game.title, ...(game.aliases || [])].map(matchKey))] })),
      platform: port.platform, method: port.method, project: port.project, url: port.url,
      // "experimental" in the source: on the radar, playable but rough (AnyPS5).
      hosts, status: port.status || (port.repo && release && hosts.length ? 'verified' : 'probable'), release,
      needs: ['game-files'],
    });
    console.log(`ports: ${port.project} ${hosts.join(' ') || '(no systems)'}`);
  }
  return out;
}

// ---- PortMaster: games packaged for Linux handhelds (Anbernic, TrimUI, …) -------------------------
// Most need the owner's files of the game (bought on Steam, GOG, itch.io); "ready to run" ones come
// with them (free games). A console game's port (Super Mario 64) takes that console from the
// curated list, else "pc".
export async function portmaster(curated) {
  const data = await get('https://github.com/PortsMaster/PortMaster-New/releases/latest/download/ports.json');
  const consoleOf = new Map();
  for (const port of curated) if (port.platform !== 'pc') for (const game of port.games) for (const key of game.keys) consoleOf.set(key, port.platform);
  const ARCH = { aarch64: 'arm64', armhf: 'arm' };
  return Object.values((data && data.ports) || {}).flatMap((port) => {
    const title = port.attr && port.attr.title;
    const key = matchKey(title);
    const hosts = [...new Set((port.attr.arch || ['aarch64']).map((arch) => ARCH[arch]).filter(Boolean))].map((arch) => `linux-handheld-${arch}`);
    if (!key || !hosts.length) return [];
    return [{
      games: [{ title, keys: [key] }],
      platform: consoleOf.get(key) || 'pc', method: 'fan_port', project: 'PortMaster',
      url: `https://portmaster.games/detail.html?name=${encodeURIComponent(port.name.replace(/\.zip$/, ''))}`,
      hosts, status: 'verified', release: { version: port.source.release_id, date: port.source.date_updated },
      needs: port.attr.rtr ? [] : ['game-files'],
    }];
  });
}

// ---- nxnative: Switch games run natively on Apple chips (Mac; iPhone 15 Pro / M1 iPad and later) --
// Not an emulator nor a port: the game's own ARM code runs directly, with its graphics rebuilt on Metal.
export async function nxnative() {
  const text = await get('https://raw.githubusercontent.com/seedds/nxnative/HEAD/docs/images/gallery.tsv', { json: false });
  const games = (text || '').split('\n').filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('\t')[1]).filter(Boolean)
    .map((title) => ({ title, keys: [matchKey(title)] }));
  return games.length ? [{
    games, platform: 'switch', method: 'native_layer', project: 'nxnative', url: 'https://github.com/seedds/nxnative',
    hosts: ['ios-arm64', 'macos-arm64'], status: 'verified', release: null, needs: ['game-files', 'console-keys'],
  }] : [];
}

// ---- Emulators: one file per console, games grouped by title, best status of any of their serials --

function group(entries) {
  const byKey = new Map();
  const rank = { verified: 0, experimental: 1, no: 2 };
  // project / url: which emulator, when a console has more than one (PlayStation 5).
  for (const { title, serial, status, note, project, url } of entries) {
    const key = matchKey(title);
    if (!key) continue;
    const known = byKey.get(key);
    const which = project ? { project, url } : {};
    if (!known) byKey.set(key, { title, key, status, note, ...which, serials: [serial] });
    else {
      known.serials.push(serial);
      if (rank[status] < rank[known.status]) Object.assign(known, { status, note, ...which });
    }
  }
  // Serials only counted: the extension matches by title, and the files stay small.
  return [...byKey.values()].map(({ serials, ...game }) => ({ ...game, serials: serials.length })).sort((a, b) => a.key.localeCompare(b.key));
}

// RPCS3: Playable -> verified; Ingame -> experimental; Intro, Loadable -> no.
async function rpcs3(offline) {
  const STATUS = { Playable: 'verified', Ingame: 'experimental', Intro: 'no', Loadable: 'no' };
  const entries = [];
  for (let page = 1; page <= 100; page++) {
    const data = offline
      ? JSON.parse(await readFile(join(offline, 'rpcs3', `${page}.json`), 'utf8').catch(() => '{"results":{}}'))
      : await get(`https://rpcs3.net/compatibility?api=v1&r=200&p=${page}`);
    const results = Object.entries((data && data.results) || {});
    if (!results.length) break;
    for (const [serial, game] of results) {
      if (STATUS[game.status]) entries.push({ title: game.title, serial, status: STATUS[game.status], note: game.status });
    }
    if (!offline) await sleep(1000);
  }
  return group(entries);
}

// PCSX2 GameIndex.yaml, read without a YAML library (one serial per top-level key):
// compat 5 Playable, 6 Perfect -> verified; 4 In-game -> experimental; 1-3 -> no.
async function pcsx2(offline) {
  const text = offline
    ? await readFile(join(offline, 'GameIndex.yaml'), 'utf8')
    : await get('https://raw.githubusercontent.com/PCSX2/pcsx2/master/bin/resources/GameIndex.yaml', { json: false });
  const NOTE = { 1: 'Nothing', 2: 'Intro', 3: 'Menu', 4: 'In-game', 5: 'Playable', 6: 'Perfect' };
  const entries = [];
  let current = null;
  const finish = () => {
    if (!current || !current.compat) return;
    const status = current.compat >= 5 ? 'verified' : current.compat === 4 ? 'experimental' : 'no';
    entries.push({ title: current.en || current.name, serial: current.serial, status, note: NOTE[current.compat] });
  };
  for (const line of text.split('\n')) {
    const serial = line.match(/^([A-Z]{4}-\d{5}):\s*$/);
    if (serial) { finish(); current = { serial: serial[1] }; continue; }
    if (!current) continue;
    const field = line.match(/^ {2}(name|name-en|compat):\s*"?(.*?)"?\s*$/);
    if (field) {
      if (field[1] === 'name') current.name = field[2];
      if (field[1] === 'name-en') current.en = field[2];
      if (field[1] === 'compat') current.compat = Number(field[2]);
    }
  }
  finish();
  return group(entries);
}

// Dolphin's wiki: each game page is in a "<n> stars (Rating)" category and in "GameCube games", "Wii games"
// or "WiiWare games" (Virtual Console games are other consoles' and are left out).
// 5 Perfect, 4 Playable -> verified; 3 Starts (runs with problems) -> experimental; 1-2 -> no; 0 is "not rated yet".
export async function dolphin() {
  const API = 'https://wiki.dolphin-emu.org/api.php?action=query&format=json';
  const PLATFORM = { 'Category:GameCube games': 'gamecube', 'Category:Wii games': 'wii', 'Category:WiiWare games': 'wii' };
  const STATUS = { 5: 'verified', 4: 'verified', 3: 'experimental', 2: 'no', 1: 'no' };
  const byConsole = { gamecube: [], wii: [] };
  for (const stars of [5, 4, 3, 2, 1]) {
    const pages = new Map();
    let more = '';
    for (;;) {
      const data = await get(`${API}&generator=categorymembers&gcmtitle=${encodeURIComponent(`Category:${stars} stars (Rating)`)}&gcmnamespace=0&gcmlimit=500&prop=categories&cllimit=max&clcategories=${encodeURIComponent(Object.keys(PLATFORM).join('|'))}${more}`);
      for (const page of Object.values((data && data.query && data.query.pages) || {})) {
        const known = pages.get(page.pageid) || { title: page.title, categories: [] };
        known.categories.push(...(page.categories || []).map((category) => category.title));
        pages.set(page.pageid, known);
      }
      if (!data || !data.continue) break;
      more = Object.entries(data.continue).map(([key, value]) => `&${key}=${encodeURIComponent(value)}`).join('');
      await sleep(1000);
    }
    for (const page of pages.values()) {
      const consoleId = page.categories.map((category) => PLATFORM[category]).find(Boolean);
      // "Super Mario Galaxy" and "Metroid Prime (GC)": the wiki's own disambiguation goes.
      if (consoleId) byConsole[consoleId].push({ title: page.title.replace(/\s*\((GC|Wii|WiiWare|GameCube)\)$/, ''), serial: page.title, status: STATUS[stars], note: `${stars} stars` });
    }
    await sleep(1000);
  }
  return { gamecube: group(byConsole.gamecube), wii: group(byConsole.wii) };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°' };
const decode = (text) => text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, code) => (code[0] === '#'
  ? String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)))
  : ENTITIES[code.toLowerCase()] ?? match)).replace(/\s+/g, ' ').trim();

// Cemu (compat.cemu.info: one page, a row per game): Perfect, Playable -> verified; Runs -> experimental;
// Loads, Unplayable -> no; Unknown left out. Virtual Console games are other consoles' and are left out too.
export async function cemu() {
  const STATUS = { Perfect: 'verified', Playable: 'verified', Runs: 'experimental', Loads: 'no', Unplayable: 'no' };
  const html = (await get('https://compat.cemu.info/', { json: false })) || '';
  const entries = [];
  for (const row of html.split(/<tr>/).slice(1)) {
    const title = (row.match(/<td class="title">\s*<a[^>]*>([^<]+)<\/a>/) || [])[1];
    const rating = (row.match(/<td class="rating">\s*<img[^>]*alt="([^"]+)"/) || [])[1];
    if (!title || !STATUS[rating] || /virtual_console/.test(row)) continue;
    entries.push({ title: decode(title), serial: decode(title), status: STATUS[rating], note: rating });
  }
  return group(entries);
}

// PPSSPP (report.ppsspp.org/games, 50 a page, one page every 1.5 s): Perfect, Playable -> verified;
// Ingame -> experimental; Menu, None -> no. Homebrew rows are left out (not games of a store or a disc).
export async function ppsspp() {
  const STATUS = { Perfect: 'verified', Playable: 'verified', Ingame: 'experimental', Menu: 'no', None: 'no' };
  const entries = [];
  for (let page = 1; page <= 400; page++) {
    const html = await get(`https://report.ppsspp.org/games?page=${page}`, { json: false });
    const rows = (html || '').split(/<tr class="games">/).slice(1);
    if (!rows.length) break;
    for (const row of rows) {
      const title = (row.match(/class="title">([^<]+)<\/a>/) || [])[1];
      const region = (row.match(/class="region_version">([^<]*)</) || [])[1] || '';
      const compat = (row.match(/<span class="label[^"]*">([^<]+)<\/span>/) || [])[1];
      if (!title || /homebrew/i.test(region) || !STATUS[compat && compat.trim()]) continue;
      entries.push({ title: decode(title), serial: `${decode(title)} ${region}`, status: STATUS[compat.trim()], note: compat.trim() });
    }
    await sleep(1500);
  }
  return group(entries);
}

// shadPS4: one issue per game and system ("CUSA03507 - Bully"), its status as a label:
// status-playable -> verified; status-ingame -> experimental; menus, boots, nothing -> no.
export async function shadps4() {
  const STATUS = { 'status-playable': 'verified', 'status-ingame': 'experimental', 'status-menus': 'no', 'status-boots': 'no', 'status-nothing': 'no' };
  const headers = { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const entries = [];
  for (let page = 1; page <= 100; page++) {
    const issues = await get(`https://api.github.com/repos/shadps4-compatibility/shadps4-game-compatibility/issues?state=all&per_page=100&page=${page}`, { headers });
    if (!issues || !issues.length) break;
    for (const issue of issues) {
      if (issue.pull_request) continue;
      const [, serial, title] = issue.title.match(/^(\w{4}\d{5})\s*-\s*(.+)$/) || [];
      const label = issue.labels.map((item) => item.name).find((name) => STATUS[name]);
      if (title && label) entries.push({ title: title.replace(/[™®]/g, ''), serial, status: STATUS[label], note: label.slice(7) });
    }
    await sleep(500);
  }
  return group(entries);
}

// PlayStation 5: two young emulators, each game kept with the one that runs it best (its project and page).
// SharpEmu (reports in sharpemu-site, one file per title id; names from its games.json):
//   playable -> verified, ingame -> experimental, boots / menus / nothing -> no.
// KytyPS5 (compat-index.json of its site): in-game -> experimental, the rest -> no. PS4 title ids (CUSA) are left out.
export async function ps5() {
  const SHARP = { project: 'SharpEmu', url: 'https://github.com/sharpemu/sharpemu' };
  const KYTY = { project: 'KytyPS5', url: 'https://kytyps5.github.io/' };
  const raw = 'https://raw.githubusercontent.com/';
  const entries = [];
  const kyty = await get(`${raw}KytyPS5/kytyps5.github.io/HEAD/src/data/compat-index.json`);
  for (const game of kyty || []) {
    if (!/^PPSA/.test(game.titleId || '')) continue;
    entries.push({ title: game.title, serial: game.titleId, status: game.overall === 'in-game' ? 'experimental' : 'no', note: game.overall, ...KYTY });
  }
  const names = new Map();
  for (const game of (await get(`${raw}sharpemu/sharpemu-site/HEAD/src/data/games.json`)) || []) {
    for (const id of game.allTitleIds || [game.titleId]) names.set(id, game.name);
  }
  const headers = { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const tree = await get('https://api.github.com/repos/sharpemu/sharpemu-site/git/trees/HEAD?recursive=1', { headers });
  const STATUS = { playable: 'verified', ingame: 'experimental' };
  for (const { path } of (tree && tree.tree) || []) {
    const id = (path.match(/^src\/content\/compat\/[^/]+\/(PPSA\d+)\.md$/) || [])[1];
    if (!id || !names.has(id)) continue;
    const status = ((await get(`${raw}sharpemu/sharpemu-site/HEAD/${path}`, { json: false })) || '').match(/^status:\s*"?([a-z-]+)/m);
    if (status) entries.push({ title: names.get(id), serial: id, status: STATUS[status[1]] || 'no', note: status[1], ...SHARP });
    await sleep(100);
  }
  return group(entries);
}

const SOURCES = [
  { id: 'ports', name: 'Curated ports list', url: 'https://github.com/eselejuanito/what-to-beat-next-data/blob/main/sources/ports.json', license: 'GPL-3.0', note: 'systems from each project\'s latest GitHub release' },
  { id: 'rpcs3', name: 'RPCS3 compatibility list', url: 'https://rpcs3.net/compatibility', license: 'RPCS3 public API, linked back', note: 'PlayStation 3' },
  { id: 'portmaster', name: 'PortMaster', url: 'https://portmaster.games/', license: 'MIT', note: 'Linux handhelds' },
  { id: 'nxnative', name: 'nxnative', url: 'https://github.com/seedds/nxnative', license: 'MIT', note: 'Switch games on Apple chips' },
  { id: 'dolphin', name: 'Dolphin wiki ratings', url: 'https://wiki.dolphin-emu.org/', license: 'CC BY-SA 3.0 (emu/gamecube.json, emu/wii.json)', note: 'GameCube and Wii' },
  { id: 'cemu', name: 'Cemu compatibility list', url: 'https://compat.cemu.info/', license: 'no license stated; titles and ratings only, linked back', note: 'Wii U' },
  { id: 'ppsspp', name: 'PPSSPP compatibility reports', url: 'https://report.ppsspp.org/games', license: 'no license stated; titles and ratings only, linked back', note: 'PSP' },
  { id: 'shadps4', name: 'shadPS4 compatibility reports', url: 'https://github.com/shadps4-compatibility/shadps4-game-compatibility', license: 'no license stated; titles and statuses only, linked back', note: 'PlayStation 4' },
  { id: 'sharpemu', name: 'SharpEmu compatibility reports', url: 'https://github.com/sharpemu/sharpemu-site', license: 'MIT', note: 'PlayStation 5' },
  { id: 'kytyps5', name: 'KytyPS5 compatibility list', url: 'https://kytyps5.github.io/', license: 'GPL-2.0', note: 'PlayStation 5' },
  { id: 'igdb', name: 'IGDB', url: 'https://www.igdb.com/', license: 'IGDB API, non-commercial, credited', note: 'years, ratings, times to beat' },
  { id: 'pcsx2', name: 'PCSX2 game database', url: 'https://github.com/PCSX2/pcsx2/blob/master/bin/resources/GameIndex.yaml', license: 'GPL-3.0', note: 'PlayStation 2' },
];

async function main() {
  const offlineAt = process.argv.indexOf('--offline');
  const offline = offlineAt > 0 ? process.argv[offlineAt + 1] : null;
  await mkdir(join(OUT, 'emu'), { recursive: true });
  const write = (name, data) => writeFile(join(OUT, name), JSON.stringify(data));
  const generated = new Date().toISOString();

  const curated = await ports();
  const portList = [...curated, ...await portmaster(curated), ...await nxnative()];
  await write('ports.json', { generated, ports: portList });
  const emulators = {
    ps3: { project: 'RPCS3', url: 'https://rpcs3.net/', games: await rpcs3(offline) },
    ps2: { project: 'PCSX2', url: 'https://pcsx2.net/', games: await pcsx2(offline) },
    ...(offline ? {} : await dolphin().then(({ gamecube, wii }) => ({
      gamecube: { project: 'Dolphin', url: 'https://dolphin-emu.org/', games: gamecube },
      wii: { project: 'Dolphin', url: 'https://dolphin-emu.org/', games: wii },
    }))),
    ...(offline ? {} : {
      wiiu: { project: 'Cemu', url: 'https://cemu.info/', games: await cemu() },
      psp: { project: 'PPSSPP', url: 'https://www.ppsspp.org/', games: await ppsspp() },
      ps4: { project: 'shadPS4', url: 'https://shadps4.net/', games: await shadps4() },
    }),
    ...(offline ? {} : { ps5: { project: 'SharpEmu / KytyPS5', url: 'https://github.com/sharpemu/sharpemu', games: await ps5() } }),
  };
  for (const [platform, emulator] of Object.entries(emulators)) {
    await write(`emu/${platform}.json`, { generated, platform, ...emulator });
    console.log(`emu/${platform}: ${emulator.games.length} games`);
  }
  // IGDB: every game of the catalog, asking only for the new ones (the rest come from the last published file).
  const BASE = 'https://eselejuanito.github.io/what-to-beat-next-data/';
  const previous = offline ? null : await get(`${BASE}igdb.json`).catch(() => null);
  const wanted = [
    ...portList.flatMap((port) => port.games.map((game) => ({ platform: port.platform, title: game.title }))),
    ...Object.entries(emulators).flatMap(([platform, emulator]) => emulator.games.filter((game) => game.status !== 'no').map((game) => ({ platform, title: game.title }))),
  ];
  const times = offline ? null : await igdb(wanted, previous);
  const igdbFile = times ? { generated, ...times } : previous;
  if (igdbFile) await write('igdb.json', igdbFile);
  // Well-liked games of the consoles without an emulator list (NES to Switch, arcade), monthly.
  const previousClassics = offline ? null : await get(`${BASE}classics.json`).catch(() => null);
  const fresh = offline ? null : await classics(previousClassics);
  // Kept as it was (same "generated", so the extension does not download it again) until it is taken anew.
  const classicsFile = fresh && (fresh === previousClassics ? previousClassics : { ...fresh, generated });
  if (classicsFile) await write('classics.json', classicsFile);

  await write('index.json', {
    version: 1, generated, sources: SOURCES,
    files: {
      ports: { path: 'ports.json', count: portList.length },
      ...(classicsFile ? { classics: { path: 'classics.json', count: Object.values(classicsFile.consoles).reduce((sum, list) => sum + list.length, 0), generated: classicsFile.generated } } : {}),
      ...(igdbFile ? { igdb: { path: 'igdb.json', count: Object.keys(igdbFile.games).length, generated: igdbFile.generated } } : {}),
      emu: Object.fromEntries(Object.entries(emulators).map(([platform, emulator]) => [platform, { path: `emu/${platform}.json`, count: emulator.games.length, project: emulator.project, url: emulator.url }])),
    },
  });
  await writeFile(join(OUT, 'index.html'), '<!doctype html><meta charset="utf-8"><title>What To Beat Next data</title><p>Data files for the <a href="https://github.com/eselejuanito/what-to-beat-next-data">What To Beat Next</a> browser extension: <a href="index.json">index.json</a>.</p>\n');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error); process.exit(1); });
