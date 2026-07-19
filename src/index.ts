import { types } from 'vortex-api';
import { EXECUTABLE, GAME_ID, STEAM_ID } from './common';
import { ensureHlxCoreUpToDate } from './hlxCore';
import { installFareverMod, testFareverMod } from './modInstaller';

function main(context: types.IExtensionContext): boolean {
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
    setup: (() => ensureHlxCoreUpToDate(context.api)) as any,
    details: {
      steamAppId: Number(STEAM_ID),
    },
  });

  context.registerInstaller(`${GAME_ID}-mod`, 10, testFareverMod as any, installFareverMod as any);

  return true;
}

export default main;
