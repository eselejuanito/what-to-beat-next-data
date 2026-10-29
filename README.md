# What To Beat Next · data

Which games run where: the data files the [What To Beat Next](https://chromewebstore.google.com/detail/what-to-beat-next/cgbojolpaeelblnddihdmfnbkhcbggah) browser extension downloads to tell which games a player's computers and handhelds can run, through fan ports, recompilations and emulators.

Rebuilt every day by GitHub Actions and published at **https://eselejuanito.github.io/what-to-beat-next-data/**:

| File | What |
|---|---|
| `index.json` | version, date, sources and licenses, list of files |
| `ports.json` | fan ports and recompilations: the game, the project, the systems of its latest release |
| `emu/ps2.json` | PlayStation 2 games and how well PCSX2 runs them |
| `emu/ps3.json` | PlayStation 3 games and how well RPCS3 runs them |

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
| [PCSX2 GameIndex.yaml](https://github.com/PCSX2/pcsx2/blob/master/bin/resources/GameIndex.yaml) | PlayStation 2 | GPL-3.0 |

## Run it

```bash
node scripts/hosts.test.mjs                 # the release-file classifier
GITHUB_TOKEN=... node scripts/build.mjs     # writes site/ (token optional, avoids rate limits)
```

Corrections and new ports: edit `sources/ports.json` and open a pull request.
