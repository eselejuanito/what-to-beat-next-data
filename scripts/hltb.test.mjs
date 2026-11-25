// applyHltbTimes: fills only what IGDB lacks, marks it, takes it off again when the file changes, keeps games IGDB lacks apart.
import assert from 'node:assert';
import { applyHltbTimes } from './hltb.mjs';

const file = { games: {
  'pc|a': { main: 10, extra: 20, full: 30, h: 1 },
  'pc|b': { main: 5, h: 2 },
  'pc|c': { main: 7, extra: 9, h: 3 },
  'pc|zero': { main: 0, h: 4 },
} };
const games = {
  'pc|a': { id: 1, name: 'A', main: 8 },          // IGDB has main: kept; extra and full come from the file
  'pc|b': { id: 2, name: 'B', main: 6, extra: 12, full: 20 }, // complete: untouched
  'pc|zero': { id: 4, name: 'Z' },
};
const ids = ['pc|a', 'pc|b', 'pc|c', 'pc|zero', 'pc|nofile'];

let r = applyHltbTimes(games, file, ids);
assert.deepStrictEqual(games['pc|a'], { id: 1, name: 'A', main: 8, extra: 20, full: 30, hltb: ['extra', 'full'] });
assert.deepStrictEqual(games['pc|b'], { id: 2, name: 'B', main: 6, extra: 12, full: 20 });
assert.deepStrictEqual(games['pc|zero'], { id: 4, name: 'Z' });
assert.deepStrictEqual(r.onlyHltb, { 'pc|c': { main: 7, extra: 9 } });
assert.strictEqual(r.filled, 2);

// A second build with a changed file: the old HLTB fields go, the new ones come.
file.games['pc|a'] = { main: 99, extra: 21, h: 1 };
r = applyHltbTimes(games, file, ids);
assert.deepStrictEqual(games['pc|a'], { id: 1, name: 'A', main: 8, extra: 21, hltb: ['extra'] });

// No file: nothing added, nothing left behind.
r = applyHltbTimes(games, null, ids);
assert.deepStrictEqual(games['pc|a'], { id: 1, name: 'A', main: 8 });
assert.deepStrictEqual(r, { filled: 0, corrected: [], onlyHltb: {} });
// IGDB far over HowLongToBeat's (over 20 h and over 3x): HowLongToBeat's wins and is marked; a near one stays.
const big = { games: { 'pc|k': { main: 30.5, extra: 42.1, full: 56.2, h: 5 }, 'pc|near': { main: 25, extra: 30, h: 6 }, 'pc|small': { main: 3, h: 7 } } };
const bigGames = {
  'pc|k': { id: 5, name: 'K', main: 348.3, extra: 356.7, full: 56.2 },
  'pc|near': { id: 6, name: 'N', main: 60, extra: 40 },   // 60 > 3 x 25? no (2.4x): stays; extra 40 vs 30: stays
  'pc|small': { id: 7, name: 'S', main: 12 },             // 12 > 3 x 3 but not over 20 h: stays
};
r = applyHltbTimes(bigGames, big, ['pc|k', 'pc|near', 'pc|small']);
assert.deepStrictEqual(bigGames['pc|k'], { id: 5, name: 'K', main: 30.5, extra: 42.1, full: 56.2, hltb: ['main', 'extra'] });
assert.deepStrictEqual(bigGames['pc|near'], { id: 6, name: 'N', main: 60, extra: 40 });
assert.deepStrictEqual(bigGames['pc|small'], { id: 7, name: 'S', main: 12 });
assert.deepStrictEqual(r.corrected.map((c) => `${c.id}:${c.field}`), ['pc|k:main', 'pc|k:extra']);
console.log('hltb.test: ok');
