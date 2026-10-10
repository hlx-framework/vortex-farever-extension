import * as path from 'path';
import { log, types, util } from 'vortex-api';
import { EXECUTABLE, GAME_ID, HLBOOT_FILE, STEAM_ID, HLX_CORE_DOMAIN, HLX_CORE_MOD_ID, GAME_VERSION_DRIVER_DOMAIN, GAME_VERSION_DRIVER_MOD_ID } from './common';
import { readFareverVersion } from './bytecode';
import { blockReenablingIncompatibleMods } from './compatibility/enforcement';
import { installFareverMod, testFareverMod } from './installer';
import { checkModsForUpdates, ensureRequiredMods } from './updates';
import { settingsReducer } from './settings/reducer';
import Settings from './settings/Settings';

const REQUIRED_MODS = [
  {
    domain: HLX_CORE_DOMAIN,
    modId: HLX_CORE_MOD_ID,
    modName: 'hlx-core',
  },
  {
    domain: GAME_VERSION_DRIVER_DOMAIN,
    modId: GAME_VERSION_DRIVER_MOD_ID,
    modName: 'game-version-driver',
  },
];

const getGameVersion = (gamePath: string): Promise<string> =>
  readFareverVersion(path.join(gamePath, HLBOOT_FILE)).then(version => version?.toString() ?? '');

function ensureRequiredModsAndCheck(api: types.IExtensionApi): Promise<void> {
  return ensureRequiredMods(api, REQUIRED_MODS).then(() => checkModsForUpdates(api));
}

function main(context: types.IExtensionContext): boolean {
  context.registerReducer(['settings', GAME_ID], settingsReducer);
  context.registerSettings('Farever', Settings as any, undefined, undefined, 51);

  context.registerGame({
    id: GAME_ID,
    name: 'Farever',
    mergeMods: true,
    queryArgs: {
      steam: [{ id: STEAM_ID }],
    },
    queryModPath: () => '.',
    logo: 'gameart.png',
    executable: () => EXECUTABLE,
    requiredFiles: [EXECUTABLE],
    setup: util.toBlue(async () => {
      try {
        await ensureRequiredModsAndCheck(context.api);
      } catch (err) {
        log('error', 'Failed during Farever setup/checks', { error: (err as Error).message });
        context.api.showErrorNotification!('Failed during Farever setup', err, { allowReport: false });
      }
    }),
    getGameVersion,
    details: {
      steamAppId: Number(STEAM_ID),
    },
  });

  const install: types.InstallFunc = (files, _destinationPath, _gameId, _progress, _choices, _unattended, archivePath) => installFareverMod(context.api, files, archivePath);
  context.registerInstaller(`${GAME_ID}-mod`, 10, testFareverMod, install);

  // setup only runs when Farever is (re-)activated; this also covers the "Check for Updates" button.
  context.once(() => {
    context.api.events.on('check-mods-version', (gameId: string) => {
      if (gameId !== GAME_ID) {
        return;
      }
      ensureRequiredModsAndCheck(context.api).catch(err => {
        log('error', 'Failed to check Farever mod versions', { error: (err as Error).message });
        context.api.showErrorNotification!('Failed to check for Farever mod updates', err, { allowReport: false });
      });
    });

    // Reverts the mod list's enable checkbox for a mod the compatibility gate disabled.
    context.api.events.on('mods-enabled', (modIds: string[], enable: boolean, gameId: string) => {
      blockReenablingIncompatibleMods(context.api, modIds, enable, gameId);
    });
  });

  return true;
}

export default main;
