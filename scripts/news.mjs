// "New": which games became playable since the last build, for the extension's "New since your last visit".
// A game is playable when a fan port / recompilation lists it, or an emulator list says its status is not "no".
// The build compares this build's playable set with the one in the files already published (the previous
// build); what is not in that one gets the build's date (`since`) and is kept for KEEP_DAYS. Written to news.json:
//   { generated, since: { "<platform>|<matchKey>": { since: ISO date, hosts?: ["macos-arm64", …], emu?: true } } }
// The extension turns that into "new for your devices since you last looked" (hosts: the systems a port has a
// build for; emu: an emulator list has it). Nothing here is personal: the same file for everybody.
export const KEEP_DAYS = 60;
// A platform whose list shrank below this share of the previous one is not trusted today (a site that answered
// half a page). And a platform that suddenly gains more than FLOOD_MIN games and over a quarter of its list in one
// build is a list that came back whole after a short one (or was rebuilt), not news: it adds nothing.
export const GUARD = 0.8;
export const FLOOD_MIN = 50;
export const FLOOD_SHARE = 0.25;
const DAY = 24 * 3600 * 1000;

// Map "<platform>|<key>" -> { hosts: Set, emu: boolean } of everything playable. matchKey: the build's key function.
export function playable(portList, emulators, matchKey) {
  const out = new Map();
  const at = (id) => { if (!out.has(id)) out.set(id, { hosts: new Set(), emu: false }); return out.get(id); };
  for (const port of portList || []) {
    for (const game of port.games || []) {
      const key = matchKey(game.title);
      if (!key) continue;
      const item = at(`${port.platform}|${key}`);
      for (const host of port.hosts || []) item.hosts.add(host);
    }
  }
  for (const [platform, emulator] of Object.entries(emulators || {})) {
    for (const game of emulator.games || []) {
      if (game.status === 'no' || !game.key) continue;
      at(`${platform}|${game.key}`).emu = true;
    }
  }
  return out;
}

const platformOf = (id) => id.slice(0, id.indexOf('|'));
const flags = (item) => ({ ...(item.hosts.size ? { hosts: [...item.hosts].sort() } : {}), ...(item.emu ? { emu: true } : {}) });

// previous: the playable Map of the files published before this build, or null when they could not be read
// (then nothing new is added: no comparison is possible). previousNews: the published news.json or null.
export function computeNews({ now = new Date(), previous, current, previousNews }) {
  const since = {};
  // What was new before and is still playable and recent stays (with today's hosts).
  for (const [id, item] of Object.entries((previousNews && previousNews.since) || {})) {
    if (current.has(id) && now - Date.parse(item.since) < KEEP_DAYS * DAY) since[id] = { since: item.since, ...flags(current.get(id)) };
  }
  if (!previous) return { generated: now.toISOString(), since };
  const count = (map) => { const n = new Map(); for (const id of map.keys()) n.set(platformOf(id), (n.get(platformOf(id)) || 0) + 1); return n; };
  const before = count(previous);
  const after = count(current);
  const trusted = (platform) => (before.get(platform) || 0) > 0 && (after.get(platform) || 0) >= GUARD * before.get(platform);
  const added = new Map();
  for (const id of current.keys()) if (!previous.has(id)) added.set(platformOf(id), (added.get(platformOf(id)) || 0) + 1);
  const flood = (platform) => (added.get(platform) || 0) > Math.max(FLOOD_MIN, FLOOD_SHARE * (before.get(platform) || 0));
  for (const [id, item] of current) {
    const platform = platformOf(id);
    if (!previous.has(id) && !since[id] && trusted(platform) && !flood(platform)) since[id] = { since: now.toISOString(), ...flags(item) };
  }
  return { generated: now.toISOString(), since };
}
