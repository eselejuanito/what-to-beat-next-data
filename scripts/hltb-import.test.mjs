// CSV -> compact rows -> row objects, on rows shaped like the HowLongToBeat CSV.
import assert from 'node:assert';
import { parseCsv, compact, expand, cleanName } from './hltb-import.mjs';

const csv = [
  '"id","name","type","platform","release_year","main_story","main_plus_sides","completionist","main_story_polled","main_plus_sides_polled","completionist_polled"',
  '"1","Pokk&eacute;n Tournament™","game","Wii U, Mac, Mobile","2016","12.04","","30.5","20","","4"',
  '"2","Some, Game ""Quoted""","game","PlayStation 2","0","","","","","",""',          // no time: left out
  '"3","FIFA 17 Demo","game","PlayStation 3","2016","1","","","5","",""',              // a demo: left out
  '"4","Some DLC","dlc/expansion","PC","2015","3","","","5","",""',                    // not a game: left out
  '"5","Absurd Typo","game","PC","2001","567890","2","","1","3",""',                  // an impossible time: dropped, the rest stays
].join('\n');

const rows = parseCsv(csv);
assert.strictEqual(rows.length, 5);
assert.strictEqual(rows[1].name, 'Some, Game "Quoted"');

const { rows: compacted, stats } = compact(rows);
assert.deepStrictEqual(compacted, [
  [1, 'Pokkén Tournament', 2016, 'wiiu,pc', 12, 0, 30.5, 20],
  [5, 'Absurd Typo', 2001, 'pc', 0, 2, 0, 3],
]);
assert.deepStrictEqual(stats, { csvRows: 5, games: 4, noTime: 1, demos: 1, kept: 2 });

const [game] = expand(compacted);
assert.deepStrictEqual([game.id, game.name, game.year, game.main, game.extra, game.full, game.polled], [1, 'Pokkén Tournament', 2016, 12, undefined, 30.5, 20]);
assert.deepStrictEqual([...game.platforms], ['wiiu', 'pc']);
assert.strictEqual(expand([[9, 'X', 0, '', 1, 0, 0, 0]])[0].year, null);   // year 0 = unknown
assert.strictEqual(cleanName('  Jak &amp; Daxter®   Collection '), 'Jak & Daxter Collection');
console.log('hltb-import.test: ok');
