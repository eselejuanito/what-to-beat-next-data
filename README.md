# What To Beat Next · data

Which games run where: the data files the [What To Beat Next](https://chromewebstore.google.com/detail/what-to-beat-next/cgbojolpaeelblnddihdmfnbkhcbggah) browser extension downloads to tell which games a player's computers and handhelds can run, through fan ports, recompilations and emulators.

Rebuilt every day by GitHub Actions and published at **https://eselejuanito.github.io/what-to-beat-next-data/**:

| File | What |
|---|---|
| `index.json` | version, date, sources and licenses, list of files |
| `ports.json` | fan ports, recompilations, PortMaster (Linux handhelds) and nxnative (Switch games on Apple chips): the game, the project, the systems it runs on |
| `igdb.json` | release year, rating and time to beat (from IGDB) of the catalog's games, for the extension's catalog page |
| `classics.json` | well-liked games (IGDB: 60 %+ from 10+ votes) of the consoles without an emulator list, NES to Switch and arcade, each with its year, rating, votes and time; taken again monthly |
| `emu/ps2.json` | PlayStation 2 games and how well PCSX2 runs them |
| `emu/ps3.json` | PlayStation 3 games and how well RPCS3 runs them |
| `emu/gamecube.json`, `emu/wii.json` | GameCube and Wii games and how well Dolphin runs them (from its wiki: CC BY-SA 3.0, these two files too) |
| `emu/wiiu.json` | Wii U games and how well Cemu runs them |
| `emu/psp.json` | PSP games and how well PPSSPP runs them |
| `emu/ps5.json` | PlayStation 5 games and how well SharpEmu or KytyPS5 runs them (young emulators: "playable" is still rough) |

Status: `verified` (playable, or an official build of the port for that system), `experimental` (in-game with problems), `probable` (systems written by hand), `no`.

## Rules

- Facts and links to each project's own page only. **Never game files, ROMs, disc images, BIOS, firmware or keys**, nor links to them. Every port and emulator here needs the player's own copy of the game.
- Sources are read politely: once a day, one request at a time, identified as `what-to-beat-next-data`.
- Nothing from HowLongToBeat.

## Sources and licenses

| Source | Used for | License |
|---|---|---|
| [sources/ports.json](sources/ports.json) (curated here) + each project's GitHub releases | fan ports, recompilations | GPL-3.0 (this repository) |
| [RPCS3 compatibility list](https://rpcs3.net/compatibility) | PlayStation 3 | RPCS3's public API; credited and linked |
| [PortMaster](https://portmaster.games/) (`ports.json` of [PortMaster-New](https://github.com/PortsMaster/PortMaster-New)'s latest release) | ports for Linux handhelds | MIT |
| [nxnative](https://github.com/seedds/nxnative) games table | Switch games run natively on Mac, iPhone and iPad | MIT |
| [IGDB](https://www.igdb.com/) API (Twitch credentials as repository secrets) | years, ratings, times to beat | IGDB's terms: non-commercial use, credited |
| [Dolphin wiki](https://wiki.dolphin-emu.org/) ratings | GameCube, Wii | CC BY-SA 3.0 |
| [Cemu compatibility list](https://compat.cemu.info/) | Wii U | no license stated: titles and ratings only, credited and linked |
| [PPSSPP compatibility reports](https://report.ppsspp.org/games) | PSP | no license stated: titles and ratings only, credited and linked |
| [SharpEmu compatibility reports](https://github.com/sharpemu/sharpemu-site) | PlayStation 5 | MIT |
| [KytyPS5 compatibility list](https://kytyps5.github.io/) | PlayStation 5 | GPL-2.0 |
| [PCSX2 GameIndex.yaml](https://github.com/PCSX2/pcsx2/blob/master/bin/resources/GameIndex.yaml) | PlayStation 2 | GPL-3.0 |

## Run it

```bash
node scripts/hosts.test.mjs                 # the release-file classifier
GITHUB_TOKEN=... node scripts/build.mjs     # writes site/ (token optional, avoids rate limits)
```

Corrections and new ports: edit `sources/ports.json` and open a pull request. Where new games come from and how often each place is looked at (daily, weekly, monthly, or not needed): [sources/watch.json](sources/watch.json). Every Monday, `scripts/discover.mjs` lists new projects with a downloadable release in the **Port candidates** issue; each one is looked at and moved to `sources/ports.json` or `sources/ignore.json` by hand.
