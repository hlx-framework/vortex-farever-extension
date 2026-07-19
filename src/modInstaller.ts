import { types } from 'vortex-api';
import { GAME_ID } from './common';

function normalizePath(file: string): string {
  return file.replace(/\\/g, '/');
}

function isDirectoryEntry(file: string): boolean {
  return file.endsWith('/') || file.endsWith('\\');
}

export async function testFareverMod(files: string[], gameId: string): Promise<types.ISupportedResult> {
  return {
    supported: gameId === GAME_ID && files.some(file => normalizePath(file).toLowerCase().endsWith('.hl')),
    requiredFiles: [],
  };
}

function computeDestinations(files: string[]): Map<string, string> {
  const normalized = files.map(normalizePath);
  const destinations = new Map<string, string>();

  const hlIndex = normalized.findIndex(file => file.toLowerCase().endsWith('.hl'));
  if (hlIndex === -1) {
    // shouldn't happen - testFareverMod already required a .hl file to be present
    files.forEach((file, i) => destinations.set(file, normalized[i]));
    return destinations;
  }

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

export async function installFareverMod(files: string[]): Promise<types.IInstallResult> {
  const realFiles = files.filter(file => !isDirectoryEntry(file));
  const destinations = computeDestinations(realFiles);
  const instructions: types.IInstruction[] = realFiles.map(file => ({
    type: 'copy',
    source: file,
    destination: destinations.get(file),
  }));
  return { instructions };
}
