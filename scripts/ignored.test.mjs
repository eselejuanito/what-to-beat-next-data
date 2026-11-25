import assert from 'node:assert';
import { dropIgnored } from './ignored.mjs';
import { matchKey } from './build.mjs';
const games = [{ title: 'Spotify Connect' }, { title: '桜花センコクPortable' }, { title: 'Bleach ヒートザソウル2' }, { title: 'Quake' }];
const known = { [`psp|${matchKey('Bleach ヒートザソウル2')}`]: { id: 1 } };
const { games: kept, dropped } = dropIgnored(games, 'psp', { ids: new Set(['psp|spotifyconnect']), known });
assert.deepStrictEqual(kept.map((game) => game.title), ['Bleach ヒートザソウル2', 'Quake']);   // found by IGDB stays
assert.deepStrictEqual(dropped, ['Spotify Connect', '桜花センコクPortable']);
console.log('ignored.test: ok');
