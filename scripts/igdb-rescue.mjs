// By hand (workflow "IGDB rescue"): for every game IGDB.json lists as not found, the best IGDB candidates for its title,
// printed in the log so they can be read and turned into sources/igdb-aliases.json entries (an alias, or null) or ignored games.
// Reads the published files; changes nothing. node scripts/igdb-rescue.mjs [--all]  (default: Latin-written titles only)
import { token, query, quote, PLATFORMS } from './igdb.mjs';
import { matchKey } from './build.mjs';
import { isUnsearchable } from './titles.mjs';

const BASE = 'https://eselejuanito.github.io/what-to-beat-next-data/';
const get = (path) => fetch(BASE + path).then((response) => response.json());

const igdbFile = await get('igdb.json');
const titles = new Map();   // "<platform>|<key>" -> title as the emulator list writes it
const ports = await get('ports.json');
for (const port of ports.ports) for (const game of port.games) titles.set(`${port.platform}|${matchKey(game.title)}`, game.title);
for (const platform of Object.keys(PLATFORMS)) {
  const file = await get(`emu/${platform}.json`).catch(() => null);
  if (file && file.games) for (const game of file.games) titles.set(`${platform}|${matchKey(game.title)}`, game.title);
}

const auth = await token();
if (!auth) throw new Error('no IGDB credentials');
const year = (game) => (game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : '?');
let n = 0;
for (const id of Object.keys(igdbFile.misses)) {
  const title = titles.get(id);
  if (!title || (!process.argv.includes('--all') && isUnsearchable(title))) continue;
  const results = await query(auth, 'games', `search ${quote(title.replace(/\[[^\]]*\]/g, ' ').trim())}; fields name,first_release_date,platforms; limit 4;`);
  console.log(`${id} | ${title} => ${results.map((game) => `${game.name} (${year(game)})`).join(' ; ') || '-'}`);
  n++;
}
console.log(`rescue: ${n} titles looked at`);
