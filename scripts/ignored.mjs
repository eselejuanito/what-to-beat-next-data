// Games left out of the catalog on purpose: written in Japanese, Chinese, Korean or Cyrillic characters (IGDB has them under other
// names, almost none has a time, and the owner will not play them: 2026-11-25), and what is not a game (a music player, a web browser,
// a magazine, a console menu, a mod) listed by hand in sources/ignore-games.json as "<platform>|<matchKey>".
// A non-Latin title IGDB DID find (previous igdb.json) stays: it has a rating and maybe a time.
import { matchKey } from './build.mjs';
import { isUnsearchable } from './titles.mjs';

export function dropIgnored(games, platform, { ids = new Set(), known = {}, keep = new Set() } = {}) {
  const kept = [];
  const dropped = [];
  for (const game of games) {
    const id = `${platform}|${matchKey(game.title)}`;
    const out = ids.has(id) || (isUnsearchable(game.title) && !known[id] && !keep.has(id));
    (out ? dropped : kept).push(game);
  }
  return { games: kept, dropped: dropped.map((game) => game.title) };
}
