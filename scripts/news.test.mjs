// playable + computeNews: new entries get the build's date, old news is kept for 60 days, guards hold.
import assert from 'node:assert';
import { playable, computeNews, KEEP_DAYS } from './news.mjs';

const key = (title) => title.toLowerCase().replace(/[^a-z0-9]/g, '');
const ports = [{ platform: 'pc', hosts: ['macos-arm64', 'linux-x64'], games: [{ title: 'Doom' }, { title: 'Quake' }] }];
const emu = { ps2: { games: [{ key: 'okami', status: 'verified' }, { key: 'broken', status: 'no' }] }, ps3: { games: [{ key: 'demons', status: 'experimental' }] } };

const before = playable(ports, emu, key);
assert.deepStrictEqual([...before.keys()].sort(), ['pc|doom', 'pc|quake', 'ps2|okami', 'ps3|demons']);
assert.deepStrictEqual([...before.get('pc|doom').hosts].sort(), ['linux-x64', 'macos-arm64']);
assert.strictEqual(before.get('ps2|okami').emu, true);

// Tomorrow: Heretic gets a port, "broken" starts to run, a new PS3 game appears.
const ports2 = [{ ...ports[0], games: [...ports[0].games, { title: 'Heretic' }] }];
const emu2 = { ps2: { games: [{ key: 'okami', status: 'verified' }, { key: 'broken', status: 'ingame' }] }, ps3: { games: [{ key: 'demons', status: 'experimental' }, { key: 'bloodborne', status: 'verified' }] } };
const now = new Date('2026-12-01T06:00:00Z');
let news = computeNews({ now, previous: before, current: playable(ports2, emu2, key), previousNews: null });
assert.deepStrictEqual(Object.keys(news.since).sort(), ['pc|heretic', 'ps2|broken', 'ps3|bloodborne']);
assert.deepStrictEqual(news.since['pc|heretic'], { since: now.toISOString(), hosts: ['linux-x64', 'macos-arm64'] });
assert.deepStrictEqual(news.since['ps2|broken'], { since: now.toISOString(), emu: true });

// Next day: the same build again adds nothing and keeps the dates.
const later = new Date('2026-12-02T06:00:00Z');
const kept = computeNews({ now: later, previous: playable(ports2, emu2, key), current: playable(ports2, emu2, key), previousNews: news });
assert.deepStrictEqual(kept.since, news.since);

// Old news goes after KEEP_DAYS, and what stopped being playable goes at once.
const old = { since: { 'pc|old': { since: '2026-01-01T00:00:00Z', emu: true }, 'pc|doom': { since: '2026-11-30T00:00:00Z', hosts: ['x'] } } };
const trimmed = computeNews({ now, previous: before, current: before, previousNews: { since: { ...old.since, 'pc|gone': { since: '2026-11-30T00:00:00Z' } } } });
assert.deepStrictEqual(Object.keys(trimmed.since), ['pc|doom']);
assert.ok(KEEP_DAYS === 60);

// No previous files: nothing new (no comparison), but the earlier news is kept.
const none = computeNews({ now, previous: null, current: before, previousNews: { since: { 'pc|doom': { since: '2026-11-30T00:00:00Z' } } } });
assert.deepStrictEqual(Object.keys(none.since), ['pc|doom']);

// A platform whose list shrank under 80 % adds nothing; a list that grows by a flood (60 at once) adds nothing;
// a brand-new platform (nothing before) adds nothing; a normal week of news does.
const many = (n, from = 0) => ({ ps3: { games: Array.from({ length: n }, (_, i) => ({ key: `g${from + i}`, status: 'ok' })) } });
const base = playable([], many(400), key);
assert.deepStrictEqual(computeNews({ now, previous: base, current: playable([], many(200), key), previousNews: null }).since, {});
assert.deepStrictEqual(computeNews({ now, previous: playable([], many(100), key), current: playable([], many(400), key), previousNews: null }).since, {});
assert.deepStrictEqual(computeNews({ now, previous: playable([], {}, key), current: base, previousNews: null }).since, {});
const week = computeNews({ now, previous: base, current: playable([], many(412), key), previousNews: null });
assert.strictEqual(Object.keys(week.since).length, 12);
console.log('news.test: ok');
