import * as path from 'path';
import { log, types } from 'vortex-api';
import { GAME_ID } from './common';
import { currentGameVersion } from './compatibility/gameVersion';
import { gameVersionIncompatibilityReason, parseDeclaredVersionRange } from './compatibility/versionRange';
import { findDownload, nexusFileVersion, resolveNexusIdentity } from './nexusDownload';
import { protectedPathViolation } from './protectedPaths';

function normalizePath(file: string): string {
  return file.replace(/\\/g, '/');
}

function isDirectoryEntry(file: string): boolean {
  return file.endsWith('/') || file.endsWith('\\');
}

async function archiveVersionString(api: types.IExtensionApi, archivePath: string | undefined): Promise<string | undefined> {
  if (archivePath === undefined) {
    log('debug', 'farever install gate: no archivePath given, skipping version check');
    return undefined;
  }

  const download = findDownload(api, archivePath);
  // Same fallback order Vortex's own attribute extractor uses, so this agrees with the
  // mod.attributes.version the post-install compatibility check reads.
  const local = download?.modInfo?.version ?? download?.modInfo?.meta?.fileVersion;
  const version = local ?? (download !== undefined ? await nexusFileVersion(api, download) : undefined);
  log('debug', 'farever install gate: resolved archive version', {
    archiveName: path.basename(archivePath),
    downloadFound: download !== undefined,
    modInfoVersion: download?.modInfo?.version,
    metaFileVersion: download?.modInfo?.meta?.fileVersion,
    resolved: version,
  });
  return version;
}

// Fails closed: an unreadable game version blocks the install rather than letting it through.
async function incompatibilityReason(api: types.IExtensionApi, archivePath: string | undefined): Promise<string | undefined> {
  const versionString = await archiveVersionString(api, archivePath);
  const range = parseDeclaredVersionRange(versionString);
  if (range === undefined) {
    log('debug', 'farever install gate: no declared version range, allowing install', { versionString });
    return undefined;
  }

  const gameVersion = await currentGameVersion(api);
  if (gameVersion === undefined) {
    return "requires a Farever version range, but the installed game's version could not be determined";
  }

  const reason = gameVersionIncompatibilityReason(range, gameVersion);
  log('debug', 'farever install gate: verdict', { versionString, gameVersion: gameVersion.toString(), reason });
  return reason;
}

export async function testFareverMod(files: string[], gameId: string): Promise<types.ISupportedResult> {
  return {
    supported: gameId === GAME_ID && files.some(file => normalizePath(file).toLowerCase().endsWith('.hl')),
    requiredFiles: [],
  };
}

// Rejects a ".." segment in an archive entry before it's ever concatenated into a destination
// path - otherwise a file could be named to land outside the folder computeDestinations intends,
// including inside a protected path the check below is meant to guard.
function rejectPathTraversal(files: string[]): void {
  const unsafe = files.find(file => normalizePath(file).split('/').includes('..'));
  if (unsafe !== undefined) {
    throw new Error(`This mod contains an unsafe path "${unsafe}"`);
  }
}

function computeDestinations(files: string[]): Map<string, string> {
  const normalized = files.map(normalizePath);
  const destinations = new Map<string, string>();

  const hlIndex = normalized.findIndex(file => file.toLowerCase().endsWith('.hl'));
  const anchor = normalized[hlIndex];
  let prepend: string;
  if (anchor.toLowerCase().includes('hlx/')) {
    prepend = '';
  } else if (anchor.includes('/')) {
    prepend = 'hlx/mods/';
  } else {
    const modName = anchor.replace(/\.hl$/i, '');
    prepend = `hlx/mods/${modName}/`;
  }

  for (let i = 0; i < files.length; i++) {
    destinations.set(files[i], prepend + normalized[i]);
  }
  return destinations;
}

export async function installFareverMod(api: types.IExtensionApi, files: string[], archivePath?: string): Promise<types.IInstallResult> {
  const reason = await incompatibilityReason(api, archivePath);
  if (reason !== undefined) {
    // Not ProcessCanceled: Vortex always shows that as a generic "Installation canceled"
    // toast regardless of the message, discarding the reason - a plain Error is shown as
    // "failed to install" with our actual message.
    throw new Error(`This mod ${reason}`);
  }

  const realFiles = files.filter(file => !isDirectoryEntry(file));
  rejectPathTraversal(realFiles);
  const destinations = computeDestinations(realFiles);

  const download = archivePath !== undefined ? findDownload(api, archivePath) : undefined;
  const identity = download !== undefined ? resolveNexusIdentity(download) : undefined;
  const violation = protectedPathViolation(destinations.values(), identity);
  if (violation !== undefined) {
    throw new Error(`This mod ${violation}`);
  }

  const instructions: types.IInstruction[] = realFiles.map(file => ({
    type: 'copy',
    source: file,
    destination: destinations.get(file),
  }));
  return { instructions };
}
