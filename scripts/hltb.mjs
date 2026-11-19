// Approximate times for catalog games that IGDB has no time for, from sources/hltb-times.json.
// That file is made OFFLINE by scripts/hltb-fill.mjs from a local HowLongToBeat CSV (which is not in this
// repository): the build only reads the small result, so a daily build never needs the CSV.
import { readFile } from 'node:fs/promises';

export const FIELDS = ['main', 'extra', 'full'];

export async function loadHltbTimes(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

// games: igdb.json's games ({ "<platform>|<key>": {...} }). file: sources/hltb-times.json. ids: the catalog's ids.
// A game's fields that came from this file are listed in game.hltb: the next build takes them off first and puts
// them again (the file may change; a kept game's fields are not IGDB's and must not be trusted as such).
// Mutates games; returns { filled, onlyHltb }, where `onlyHltb` = { "<platform>|<key>": { main?, extra?, full? } }
// for catalog games IGDB did not find at all (kept apart: they have no IGDB id, page or cover).
export function applyHltbTimes(games, file, ids) {
  for (const game of Object.values(games)) {
    for (const field of game.hltb || []) delete game[field];
    delete game.hltb;
  }
  const onlyHltb = {};
  let filled = 0;
  if (!file || !file.games) return { filled, onlyHltb };
  for (const id of ids) {
    const times = file.games[id];
    if (!times) continue;
    const game = games[id];
    if (game) {
      const added = FIELDS.filter((field) => !(game[field] > 0) && times[field] > 0);
      for (const field of added) game[field] = times[field];
      if (added.length) { game.hltb = added; filled++; }
    } else {
      const only = Object.fromEntries(FIELDS.filter((field) => times[field] > 0).map((field) => [field, times[field]]));
      if (Object.keys(only).length) { onlyHltb[id] = only; filled++; }
    }
  }
  return { filled, onlyHltb };
}
