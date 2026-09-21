import * as path from 'path';
import { types, util } from 'vortex-api';
import { GAME_ID } from './common';

export interface IDownloadInfo {
  localPath?: string;
  game?: string[];
  modInfo?: {
    version?: string;
    meta?: { fileVersion?: string };
    nexus?: { ids?: { gameId?: string; modId?: number; fileId?: number } };
  };
}

export function findDownload(api: types.IExtensionApi, archivePath: string): IDownloadInfo | undefined {
  const archiveName = path.basename(archivePath);
  const downloads: { [id: string]: IDownloadInfo } =
    util.getSafe(api.getState(), ['persistent', 'downloads', 'files'], {});
  return Object.values(downloads).find(dl => dl.localPath === archiveName);
}

export interface INexusIdentity {
  domain: string;
  modId: number;
}

export function resolveNexusIdentity(download: IDownloadInfo): INexusIdentity | undefined {
  const modId = download.modInfo?.nexus?.ids?.modId;
  if (modId === undefined) {
    return undefined;
  }
  return { domain: download.modInfo?.nexus?.ids?.gameId ?? download.game?.[0] ?? GAME_ID, modId };
}

// The download's own metadata isn't always populated with the file's version (e.g. it's only
// filled in by a later hash-based meta lookup) - nexusGetModFiles is the same authoritative
// source updates/index.ts already relies on for the same version string.
export async function nexusFileVersion(api: types.IExtensionApi, download: IDownloadInfo): Promise<string | undefined> {
  const fileId = download.modInfo?.nexus?.ids?.fileId;
  const identity = resolveNexusIdentity(download);
  if (fileId === undefined || identity === undefined || api.ext.nexusGetModFiles === undefined) {
    return undefined;
  }

  const files: Array<{ file_id: number; version?: string }> = await api.ext.nexusGetModFiles(identity.domain, identity.modId);
  return files.find(file => file.file_id === fileId)?.version;
}
