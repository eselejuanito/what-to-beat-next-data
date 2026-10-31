// The release-file classifier, on names seen in real releases (2026-10-29).
import assert from 'node:assert';
import { hostsOf, matchKey } from './build.mjs';

const cases = {
  'OpenMW-0.51.0-macOS-arm64.dmg': ['macos-arm64'],
  'devilutionx-iOS.ipa': ['ios-arm64'],
  'Starship-ios-arm64.zip': ['ios-arm64'],
  'OpenMW-0.51.0-macOS-x86_64.dmg': ['macos-x64'],
  'openmw-0.51.0-Linux-64Bit.tar.gz': ['linux-x64'],
  'openmw-0.51.0-Linux-64Bit-debug.tar.gz': [],
  'OpenMW-0.51.0-Windows-x64.exe': ['windows-x64'],
  'devilutionx-macOS-universal.dmg': ['macos-arm64', 'macos-x64'],
  'devilutionx-macOS-intel-x86.dmg': ['macos-x64'],
  'devilutionx-macOS-10.4-tiger-ppc.dmg': [],
  'devilutionx-linux-aarch64.tar.xz': ['linux-arm64'],
  'devilutionx-linux-i386.tar.xz': [],
  'devilutionx-android.apk': ['android-arm64'],
  'VCMI-macOS-arm.dmg': ['macos-arm64'],
  'VCMI-macOS-intel.dmg': ['macos-x64'],
  'VCMI-Linux-arm64.AppImage': ['linux-arm64'],
  'VCMI-Android-x86_64.apk': ['android-x64'],
  'pdb-arm64.zip': [],
  'fallout2-ce-macos.dmg': ['macos-arm64', 'macos-x64'],
  'fallout2-ce-windows-x86.zip': [],
  'SoH-Dewey-Bravo-Mac.zip': ['macos-arm64', 'macos-x64'],
  'SoH-Dewey-Bravo-Win64.zip': ['windows-x64'],
  'SoH-Dewey-Bravo.appimage': ['linux-x64'],
  'Zelda64Recompiled-v1.2.2-Linux-Flatpak-X64.zip': ['linux-x64'],
  'Zelda64Recompiled-v1.2.2-Windows.zip': ['windows-x64'],
  'OpenRCT2-v0.5.6-windows-installer-win32.exe': [],
  'OpenRCT2-v0.5.6-sha256sums.txt': [],
  'fs2_open_26_2_0-RC3-builds-x64-AVX.zip': ['windows-x64'],
  'fs2_open_26_2_0-RC3-builds-ARM64.zip': ['windows-arm64'],
  'fs2_open_26_2_0-RC3-builds-Mac-arm64.tar.gz': ['macos-arm64'],
  'fs2_open_26_2_0-RC3-debug-x64-AVX.7z': [],
  'MacOS-UZDoom-Release-ARM64.dmg': ['macos-arm64'],
  'Linux-UZDoom-Release-x86_64.AppImage.zsync': [],
  's25client_dev-tools_v0.9.5.tar.gz': [],
  's25client_src_v0.9.5.tar.gz': [],
  'TheForceEngine-PDB-v1.22.420.zip': [],
  'nblood_win64_20260914-r14388.7z': ['windows-x64'],
};
for (const [name, want] of Object.entries(cases)) assert.deepStrictEqual(hostsOf(name), want, name);
assert.strictEqual(matchKey('Ōkami™'), 'okami');
assert.strictEqual(matchKey("Demon's Souls"), 'demonssouls');
console.log(`ok: ${Object.keys(cases).length} file names`);
