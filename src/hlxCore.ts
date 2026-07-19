import { log, types, util } from 'vortex-api';
import { GAME_ID, HLX_CORE_DOMAIN, HLX_CORE_MOD_ID } from './common';

interface INexusModFile {
  file_id: number;
  category_id: number;
  uploaded_time: string;
}

function findInstalledFileId(api: types.IExtensionApi): number | undefined {
  const state = api.getState();
  const mods: { [id: string]: types.IMod } = util.getSafe(state, ['persistent', 'mods', GAME_ID], {});
  const hlxCore = Object.values(mods).find(mod =>
    mod.attributes?.source === 'nexus' && mod.attributes?.modId === HLX_CORE_MOD_ID);
  return hlxCore?.attributes?.fileId;
}

async function getLatestFile(api: types.IExtensionApi): Promise<INexusModFile | undefined> {
  const files: INexusModFile[] = await api.ext.nexusGetModFiles!(HLX_CORE_DOMAIN, HLX_CORE_MOD_ID);
  const mainFiles = files.filter(file => file.category_id === 1);
  const candidates = mainFiles.length > 0 ? mainFiles : files;
  return candidates
    .sort((lhs, rhs) => Number.parseInt(rhs.uploaded_time, 10) - Number.parseInt(lhs.uploaded_time, 10))[0];
}

async function installHlxCore(api: types.IExtensionApi, fileId: number): Promise<void> {
  const nxmUrl = `nxm://${HLX_CORE_DOMAIN}/mods/${HLX_CORE_MOD_ID}/files/${fileId}`;
  const dlId = await util.toPromise<string>(cb =>
    api.events.emit('start-download', [nxmUrl], { game: HLX_CORE_DOMAIN }, undefined, cb, 'never', { allowInstall: false }));
  await util.toPromise<string>(cb =>
    api.events.emit('start-install-download', dlId, { allowAutoEnable: true }, cb));
}

export async function ensureHlxCoreUpToDate(api: types.IExtensionApi): Promise<void> {
  try {
    if (api.ext?.ensureLoggedIn !== undefined) {
      await api.ext.ensureLoggedIn();
    }

    const installedFileId = findInstalledFileId(api);
    const latest = await getLatestFile(api);
    log('info', 'comparing hlx-core version', { installed: installedFileId, latest: latest?.file_id });
    if (latest === undefined || latest.file_id === installedFileId) {
      return;
    }

    log('info', 'installing hlx-core', { from: installedFileId, to: latest.file_id });
    await installHlxCore(api, latest.file_id);
    api.sendNotification!({
      id: 'farever-hlx-core-updated',
      type: 'success',
      message: 'hlx-core is up to date',
    });
  } catch (err) {
    api.showErrorNotification!('Failed to check/install hlx-core', err, { allowReport: false });
  }
}
