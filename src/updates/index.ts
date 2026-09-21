import { actions, log, selectors, types, util } from 'vortex-api';
import { GAME_ID, HLX_CORE_DOMAIN, HLX_CORE_MOD_ID } from '../common';
import { Version } from '../bytecode';
import { enforceCompatibility, excludeUnverifiableMods } from '../compatibility/enforcement';
import { currentGameVersion } from '../compatibility/gameVersion';
import { versionIncompatibilityReason } from '../compatibility/versionRange';
import { INexusModFile, mainFilesOrAll, newestFile } from '../nexusFiles';
import { autoUpdateModsEnabled } from '../settings/reducer';

function reportFailure(api: types.IExtensionApi, message: string, err: unknown): void {
  api.showErrorNotification!(message, err, { allowReport: false });
}

function getMods(api: types.IExtensionApi): { [id: string]: types.IMod } {
  return util.getSafe(api.getState(), ['persistent', 'mods', GAME_ID], {});
}

async function checkForNewerFile<T extends INexusModFile>(
  api: types.IExtensionApi,
  domain: string,
  modId: number,
  installedFileId: number | undefined,
  pickBest: (files: T[]) => T | undefined,
): Promise<T | undefined> {
  const files: T[] = await api.ext.nexusGetModFiles!(domain, modId);
  const best = pickBest(files);
  return best !== undefined && best.file_id !== installedFileId ? best : undefined;
}

interface IFareverModFile extends INexusModFile {
  version: string;
}

function pickCompatibleFile(files: IFareverModFile[], gameVersion: Version): IFareverModFile | undefined {
  const compatible = mainFilesOrAll(files).filter(file =>
    versionIncompatibilityReason(file.version, gameVersion) === undefined);
  return newestFile(compatible);
}

async function autoInstallModUpdate(api: types.IExtensionApi, modId: string, modName: string, domain: string, nexusModId: number, file: IFareverModFile): Promise<void> {
  try {
    await installNexusFile(api, domain, nexusModId, file.file_id);
    api.sendNotification!({
      id: `farever-mod-updated-${modId}`,
      type: 'success',
      message: `${modName} updated to ${file.version}`,
    });
  } catch (err) {
    reportFailure(api, `Failed to auto-update ${modName}`, err);
  }
}

async function checkModForUpdate(api: types.IExtensionApi, modId: string, mod: types.IMod, gameVersion: Version): Promise<void> {
  const nexusModId = mod.attributes?.modId;
  if (nexusModId === undefined) {
    return;
  }

  const domain = mod.attributes?.downloadGame ?? GAME_ID;
  const best = await checkForNewerFile<IFareverModFile>(api, domain, nexusModId, mod.attributes?.fileId,
    files => pickCompatibleFile(files, gameVersion));
  if (best === undefined) {
    return;
  }

  api.store!.dispatch(actions.setModAttributes(GAME_ID, modId, {
    newestFileId: best.file_id,
    newestVersion: best.version,
  }));

  if (autoUpdateModsEnabled(api)) {
    const modName = (mod.attributes?.name as string | undefined) ?? modId;
    await autoInstallModUpdate(api, modId, modName, domain, nexusModId, best);
  }
}

// Compatibility enforcement and the update check share one "do we know the game version" gate.
export async function checkModsForUpdates(api: types.IExtensionApi): Promise<void> {
  try {
    const mods = getMods(api);

    const gameVersion = await currentGameVersion(api);
    if (gameVersion === undefined) {
      excludeUnverifiableMods(api, mods);
      return;
    }

    enforceCompatibility(api, mods, gameVersion);

    const nexusMods = Object.entries(mods).filter(([, mod]) =>
      mod.attributes?.source === 'nexus' && mod.attributes?.modId !== HLX_CORE_MOD_ID);

    await Promise.all(nexusMods.map(([modId, mod]) => checkModForUpdate(api, modId, mod, gameVersion).catch(err =>
      log('warn', 'Failed to check mod for updates', { modId, error: (err as Error).message }))));
  } catch (err) {
    reportFailure(api, 'Failed to check mod versions against game version', err);
  }
}

function findInstalledHlxCoreFileId(api: types.IExtensionApi): number | undefined {
  const hlxCore = Object.values(getMods(api)).find(mod =>
    mod.attributes?.source === 'nexus' && mod.attributes?.modId === HLX_CORE_MOD_ID);
  return hlxCore?.attributes?.fileId;
}

// Reuse a completed 'never' download instead of re-downloading (rejects AlreadyDownloaded).
function findExistingDownloadId(api: types.IExtensionApi, domain: string, fileId: number): string | undefined {
  const downloads = selectors.downloadsForGame(api.getState(), domain);
  const match = Object.entries(downloads).find(([, dl]) =>
    dl.state === 'finished' && dl.modInfo?.nexus?.ids?.fileId === fileId);
  return match?.[0];
}

// Downloads (or reuses) and installs a specific Nexus file. installFareverMod still applies the
// compatibility gate independently at install time, so this never bypasses it.
async function installNexusFile(api: types.IExtensionApi, domain: string, modId: number, fileId: number): Promise<void> {
  const nxmUrl = `nxm://${domain}/mods/${modId}/files/${fileId}`;
  const dlId = findExistingDownloadId(api, domain, fileId) ?? await util.toPromise<string>(cb =>
    api.events.emit('start-download', [nxmUrl], { game: domain }, undefined, cb, 'never', { allowInstall: false }));
  await util.toPromise<string>(cb =>
    api.events.emit('start-install-download', dlId, { allowAutoEnable: true }, cb));
}

async function installHlxCoreUpdate(api: types.IExtensionApi, installedFileId: number | undefined, fileId: number): Promise<void> {
  log('info', 'installing hlx-core', { from: installedFileId, to: fileId });
  await installNexusFile(api, HLX_CORE_DOMAIN, HLX_CORE_MOD_ID, fileId);
  api.sendNotification!({
    id: 'farever-hlx-core-updated',
    type: 'success',
    message: 'hlx-core is up to date',
  });
}

function notifyHlxCoreUpdateAvailable(api: types.IExtensionApi, installedFileId: number | undefined, latest: INexusModFile): void {
  api.sendNotification!({
    id: 'farever-hlx-core-update-available',
    type: 'info',
    title: 'hlx-core update available',
    message: 'A newer version of hlx-core is available for Farever.',
    noDismiss: true,
    actions: [
      {
        title: 'Install',
        action: async (dismiss) => {
          dismiss();
          try {
            await installHlxCoreUpdate(api, installedFileId, latest.file_id);
          } catch (err) {
            reportFailure(api, 'Failed to install hlx-core', err);
          }
        },
      },
    ],
  });
}

// Independent of checkModsForUpdates: hlx-core is a hard dependency, checked regardless of
// whether Farever's own version could be determined.
export async function checkHlxCoreForUpdate(api: types.IExtensionApi): Promise<void> {
  try {
    if (api.ext?.ensureLoggedIn !== undefined) {
      await api.ext.ensureLoggedIn();
    }

    const installedFileId = findInstalledHlxCoreFileId(api);
    const latest = await checkForNewerFile<INexusModFile>(api, HLX_CORE_DOMAIN, HLX_CORE_MOD_ID, installedFileId,
      files => newestFile(mainFilesOrAll(files)));
    if (latest === undefined) {
      return;
    }

    if (autoUpdateModsEnabled(api)) {
      try {
        await installHlxCoreUpdate(api, installedFileId, latest.file_id);
      } catch (err) {
        reportFailure(api, 'Failed to auto-update hlx-core', err);
      }
      return;
    }

    notifyHlxCoreUpdateAvailable(api, installedFileId, latest);
  } catch (err) {
    reportFailure(api, 'Failed to check hlx-core version', err);
  }
}
