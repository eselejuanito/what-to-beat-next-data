// Spellings of a catalog title, on names seen in the emulator lists (2026-11-19).
import assert from 'node:assert';
import { spellings, keysOf, decode } from './titles.mjs';

assert.strictEqual(decode('Pokk&eacute;n Tournament'), 'Pokkén Tournament');
assert.strictEqual(decode('Tom &amp; Jerry &#233;'), 'Tom & Jerry é');

let s = spellings('Metal Slug 4 & 5 [Disc 2 of 2]');
assert.ok(s.names.includes('Metal Slug 4 and 5'), s.names.join(' | '));
assert.ok(keysOf('Metal Slug 4 & 5 [Disc 2 of 2]').has('metalslug45'));

s = spellings('Space Channel 5 - Special Edition [Disc 1 of 2]');
assert.ok(s.names.includes('Space Channel 5: Special Edition'));
assert.deepStrictEqual(s.search, ['Space Channel 5: Special Edition']);

s = spellings('Final Fantasy XII International - Zodiac Job System [with Bonus DVD]');
assert.ok(s.search.includes('Final Fantasy XII International: Zodiac Job System'));

s = spellings('King of Fighters XI, The');
assert.ok(s.search.includes('The King of Fighters XI'));

s = spellings("Jak & Daxter®: The Lost Frontier™");
assert.ok(s.names.includes('Jak & Daxter: The Lost Frontier'));

// A year in a tag is a hint to tell remakes apart ("Shadow Warrior (1997)" is not the 2013 game).
assert.strictEqual(spellings('Shadow Warrior (1997)').year, 1997);
assert.strictEqual(spellings('Shadow Warrior').year, null);
assert.strictEqual(spellings('Prey [2017]').year, 2017);

// An alternate name (HowLongToBeat's) adds its own spellings and keys.
assert.ok(keysOf('Fahrenheit', ['Indigo Prophecy']).has('indigoprophecy'));
assert.ok(spellings('Fahrenheit', ['Indigo Prophecy']).search.includes('Indigo Prophecy'));

// Nothing else is invented: a plain title has one spelling.
assert.deepStrictEqual(spellings('Doom').names, ['Doom']);
console.log('titles.test: ok');

// igdb.mjs pick(): the same game under another spelling, and the year hint.
import { pick } from './igdb.mjs';
const ts = (year) => Date.UTC(year, 5, 1) / 1000;
const PC = [6, 14, 3];
const results = [
  { name: 'Shadow Warrior', platforms: [6], first_release_date: ts(2013) },
  { name: 'Shadow Warrior', platforms: [6], first_release_date: ts(1997) },
  { name: 'Metal Slug 4 and 5', platforms: [8], first_release_date: ts(2005) },
  { name: 'Other', alternative_names: [{ name: 'Pokkén Tournament' }], platforms: [41], first_release_date: ts(2016) },
];
assert.strictEqual(pick(results, keysOf('Shadow Warrior (1997)'), PC, 1997).first_release_date, ts(1997));
assert.strictEqual(pick(results, keysOf('Shadow Warrior (1999)'), PC, 1999), null);          // no game of that year: not guessed
assert.strictEqual(pick(results, keysOf('Shadow Warrior'), PC).first_release_date, ts(1997)); // no hint: the earliest
assert.ok(pick(results, keysOf('Metal Slug 4 & 5 [Disc 2 of 2]'), [8]));
assert.ok(pick(results, keysOf('Pokk&eacute;n Tournament'), [41]));                           // entity + alternative name
assert.strictEqual(pick(results, keysOf('Metal Slug 4 & 5'), PC), null);                      // wrong platform
console.log('igdb pick: ok');
