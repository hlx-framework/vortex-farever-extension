import { types, util } from 'vortex-api';
import { GAME_ID } from '../common';
import { setAutoUpdateMods } from './actions';

export const settingsReducer: types.IReducerSpec = {
  reducers: {
    [setAutoUpdateMods as any]: (state: any, payload: boolean) => ({ ...state, autoUpdateMods: payload }),
  },
  defaults: {
    autoUpdateMods: true,
  },
};

export function autoUpdateModsEnabled(api: types.IExtensionApi): boolean {
  return util.getSafe(api.getState(), ['settings', GAME_ID, 'autoUpdateMods'], true);
}
