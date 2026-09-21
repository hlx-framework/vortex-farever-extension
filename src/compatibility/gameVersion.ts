import * as path from 'path';
import { selectors, types } from 'vortex-api';
import { GAME_ID, HLBOOT_FILE } from '../common';
import { readFareverVersion, Version } from '../bytecode';

export async function currentGameVersion(api: types.IExtensionApi): Promise<Version | undefined> {
  const discovery = selectors.discoveryByGame(api.getState(), GAME_ID);
  if (discovery?.path === undefined) {
    return undefined;
  }

  return readFareverVersion(path.join(discovery.path, HLBOOT_FILE));
}
