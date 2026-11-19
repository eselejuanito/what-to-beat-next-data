// What counts as a demo, on names seen in the RPCS3 / PCSX2 / Dolphin / PPSSPP / shadPS4 lists (2026-11-19).
import assert from 'node:assert';
import { isDemo, dropDemos } from './demos.mjs';

const demos = [
  'FIFA 17 Demo', 'Killzone 3 Open Beta', 'Final Fantasy XIII Trial Version', 'Fuel Overdose Demo 2', 'Pro Evolution Soccer 2013 Demo 2',
  'LittleBigPlanet™Demo', 'Jak X Beta Trial Code', 'SOCOM II - U.S. Navy SEALs [Public Beta v1.0]', 'PSP Kiosk #3', 'Ico [Preview]',
  'Resident Evil 4 Preview Disc', 'Killzone 3 Preview', 'BLAZBLUE CROSS TAG BATTLE -Trial Version-', 'Ace Combat Infinity Beta Test Ver.', 'Gundam Breaker Beta Version', 'Dead or Alive 5 Alpha Demo: Premium Edition', 'Killzone 3 Demo (3D)',
  'Namco Transmission Demo Disc V1.03 [SoulCalibur II Pack-In]', 'METAL GEAR SOLID PEACE WALKER DEMO-OPS', 'DEAD OR ALIVE Paradise 体験版',
  'Activision Demo Action Pack', 'Macross Trial Frontier',
];
const games = [
  'P.T.', 'Prototype', 'Prototype 2', 'Soldner-X 2: Final Prototype', 'Indivisible Prototype', '[PROTOTYPE BIOHAZARD BUNDLE]',
  'Tales of Monkey Island - Chapter 4: The Trial and Execution of Guybrush Threepwood', 'Trials Fusion', "Demon's Souls", 'Demolition Man',
  'Urban Trial Freestyle', 'Gran Turismo 5 Time Trial Challenge', 'Beta BLOC', 'Killzone 3', 'Final Fantasy XIII', 'Ico', 'Betrayal at Krondor', 'Alpha Protocol',
];
for (const title of demos) assert.ok(isDemo(title), `should be a demo: ${title}`);
for (const title of games) assert.ok(!isDemo(title), `should be kept: ${title}`);

const { games: kept, dropped } = dropDemos([{ title: 'FIFA 17 Demo' }, { title: 'FIFA 17' }, { title: 'P.T.' }]);
assert.deepStrictEqual(kept.map((game) => game.title), ['FIFA 17', 'P.T.']);
assert.deepStrictEqual(dropped, ['FIFA 17 Demo']);
console.log('demos.test: ok');
