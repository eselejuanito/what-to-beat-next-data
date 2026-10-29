// Builds the files What To Beat Next downloads (site/): which games run where, from
//   sources/ports.json  fan ports and recompilations, curated; systems from each project's latest GitHub release
//   RPCS3               PlayStation 3 compatibility list (rpcs3.net public API, one page a second)
//   PCSX2               PlayStation 2 game database (GameIndex.yaml in the PCSX2 repository, GPL-3.0)
// Only facts and links to each project's own page; never game files. Node 20+, no dependencies.
// Usage: node scripts/build.mjs [--offline <dir with rpcs3/*.json and GameIndex.yaml>]   (GITHUB_TOKEN optional)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

async function ports() {
  const { ports: list } = JSON.parse(await readFile(join(ROOT, 'sources/ports.json'), 'utf8'));
  const headers = { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const out = [];
  for (const port of list) {
    let hosts = port.hosts || [];
    let release = null;
    if (port.repo) {
      const latest = await get(`https://api.github.com/repos/${port.repo}/releases/latest`, { headers });
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
      hosts, status: port.repo && release && hosts.length ? 'verified' : 'probable', release,
      needs: ['game-files'],
    });
    console.log(`ports: ${port.project} ${hosts.join(' ') || '(no systems)'}`);
  }
  return out;
}

// ---- Emulators: one file per console, games grouped by title, best status of any of their serials --

function group(entries) {
  const byKey = new Map();
  const rank = { verified: 0, experimental: 1, no: 2 };
  for (const { title, serial, status, note } of entries) {
    const key = matchKey(title);
    if (!key) continue;
    const known = byKey.get(key);
    if (!known) byKey.set(key, { title, key, status, note, serials: [serial] });
    else {
      known.serials.push(serial);
      if (rank[status] < rank[known.status]) Object.assign(known, { status, note });
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

const SOURCES = [
  { id: 'ports', name: 'Curated ports list', url: 'https://github.com/eselejuanito/what-to-beat-next-data/blob/main/sources/ports.json', license: 'GPL-3.0', note: 'systems from each project\'s latest GitHub release' },
  { id: 'rpcs3', name: 'RPCS3 compatibility list', url: 'https://rpcs3.net/compatibility', license: 'RPCS3 public API, linked back', note: 'PlayStation 3' },
  { id: 'pcsx2', name: 'PCSX2 game database', url: 'https://github.com/PCSX2/pcsx2/blob/master/bin/resources/GameIndex.yaml', license: 'GPL-3.0', note: 'PlayStation 2' },
];

async function main() {
  const offlineAt = process.argv.indexOf('--offline');
  const offline = offlineAt > 0 ? process.argv[offlineAt + 1] : null;
  await mkdir(join(OUT, 'emu'), { recursive: true });
  const write = (name, data) => writeFile(join(OUT, name), JSON.stringify(data));
  const generated = new Date().toISOString();

  const portList = await ports();
  await write('ports.json', { generated, ports: portList });
  const emulators = {
    ps3: { project: 'RPCS3', url: 'https://rpcs3.net/', games: await rpcs3(offline) },
    ps2: { project: 'PCSX2', url: 'https://pcsx2.net/', games: await pcsx2(offline) },
  };
  for (const [platform, emulator] of Object.entries(emulators)) {
    await write(`emu/${platform}.json`, { generated, platform, ...emulator });
    console.log(`emu/${platform}: ${emulator.games.length} games`);
  }
  await write('index.json', {
    version: 1, generated, sources: SOURCES,
    files: {
      ports: { path: 'ports.json', count: portList.length },
      emu: Object.fromEntries(Object.entries(emulators).map(([platform, emulator]) => [platform, { path: `emu/${platform}.json`, count: emulator.games.length, project: emulator.project, url: emulator.url }])),
    },
  });
  await writeFile(join(OUT, 'index.html'), '<!doctype html><meta charset="utf-8"><title>What To Beat Next data</title><p>Data files for the <a href="https://github.com/eselejuanito/what-to-beat-next-data">What To Beat Next</a> browser extension: <a href="index.json">index.json</a>.</p>\n');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error); process.exit(1); });
