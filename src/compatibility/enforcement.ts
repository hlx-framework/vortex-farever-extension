import { actions, log, selectors, types, util } from 'vortex-api';
import { GAME_ID } from '../common';
import { Version } from '../bytecode';
import { parseDeclaredVersionRange, versionIncompatibilityReason } from './versionRange';

const AUTO_DISABLED_ATTRIBUTE = 'fareverAutoDisabledIncompatibleVersion';

function declaredVersionRange(mod: types.IMod) {
  return parseDeclaredVersionRange(mod.attributes?.version as string | undefined);
}

// actions.setModsEnabled (not a raw setModEnabled dispatch) is what the mod list itself calls to
// toggle a mod - going through it keeps the UI in sync instead of leaving it showing stale state.
function setEnabled(api: types.IExtensionApi, profileId: string, modIds: string[], enable: boolean): void {
  actions.setModsEnabled(api, profileId, modIds, enable).catch((err: Error) =>
    log('warn', 'Failed to change Farever mod enabled state', { modIds, enable, error: err.message }));
}

function disableAndFlag(api: types.IExtensionApi, profileId: string, modId: string): void {
  setEnabled(api, profileId, [modId], false);
  api.store!.dispatch(actions.setModAttributes(GAME_ID, modId, { [AUTO_DISABLED_ATTRIBUTE]: true }));
}

export function excludeUnverifiableMods(api: types.IExtensionApi, mods: { [id: string]: types.IMod }): void {
  const profile = selectors.activeProfile(api.getState());
  if (profile === undefined) {
    return;
  }

  const disabledNames: string[] = [];
  for (const [modId, mod] of Object.entries(mods)) {
    if (declaredVersionRange(mod) === undefined) continue;
    if (profile.modState[modId]?.enabled === false) continue;
    disableAndFlag(api, profile.id, modId);
    disabledNames.push((mod.attributes?.name as string | undefined) ?? modId);
  }

  api.sendNotification!({
    id: 'farever-game-version-unknown',
    type: 'warning',
    title: "Farever's version could not be determined",
    message: disabledNames.length > 0
      ? `Disabled until compatibility can be verified: ${disabledNames.join(', ')}`
      : 'Mod compatibility cannot be checked right now.',
    noDismiss: true,
  });
}

// Also re-enables mods this or excludeUnverifiableMods previously disabled, once compatible again.
export function enforceCompatibility(api: types.IExtensionApi, mods: { [id: string]: types.IMod }, gameVersion: Version): void {
  const profile = selectors.activeProfile(api.getState());
  if (profile === undefined) {
    return;
  }

  for (const [modId, mod] of Object.entries(mods)) {
    const reason = versionIncompatibilityReason(mod.attributes?.version as string | undefined, gameVersion);
    if (reason === undefined) {
      if (mod.attributes?.[AUTO_DISABLED_ATTRIBUTE] === true) {
        api.store!.dispatch(actions.setModAttributes(GAME_ID, modId, { [AUTO_DISABLED_ATTRIBUTE]: undefined }));
        if (profile.modState[modId]?.enabled === false) {
          setEnabled(api, profile.id, [modId], true);
        }
      }
      continue;
    }

    if (profile.modState[modId]?.enabled === false) continue;

    disableAndFlag(api, profile.id, modId);
    api.sendNotification!({
      id: `farever-mod-incompatible-${modId}`,
      type: 'warning',
      title: 'Mod disabled: incompatible',
      message: `${mod.attributes?.name ?? modId} was disabled because it ${reason}`,
    });
  }
}

// Reacts to the 'mods-enabled' event actions.setModsEnabled fires after enabling a mod,
// reverting it if it's still flagged incompatible.
export function blockReenablingIncompatibleMods(api: types.IExtensionApi, modIds: string[], enable: boolean, gameId: string): void {
  if (!enable || gameId !== GAME_ID) {
    return;
  }

  const profile = selectors.activeProfile(api.getState());
  if (profile === undefined) {
    return;
  }

  const mods: { [id: string]: types.IMod } = util.getSafe(api.getState(), ['persistent', 'mods', GAME_ID], {});
  const blocked = modIds.filter(modId => mods[modId]?.attributes?.[AUTO_DISABLED_ATTRIBUTE] === true);
  if (blocked.length === 0) {
    return;
  }

  setEnabled(api, profile.id, blocked, false);
  for (const modId of blocked) {
    api.sendNotification!({
      id: `farever-mod-incompatible-${modId}`,
      type: 'warning',
      title: "Mod can't be enabled",
      message: `${mods[modId].attributes?.name ?? modId} is incompatible with the installed Farever version`,
    });
  }
}
