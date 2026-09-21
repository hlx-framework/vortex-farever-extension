import { log } from 'vortex-api';
import { GAME_ID, HLX_CORE_DOMAIN, HLX_CORE_MOD_ID, IMGUI_PLUGIN_MOD_ID } from './common';
import { INexusIdentity } from './nexusDownload';

interface IProtectedPath {
  path: string; // lowercase, forward-slash, no leading/trailing slash
  owner: INexusIdentity;
}

const HLX_CORE_OWNER: INexusIdentity = { domain: HLX_CORE_DOMAIN, modId: HLX_CORE_MOD_ID };

const PROTECTED_PATHS: IProtectedPath[] = [
  { path: 'libhl64.dll', owner: HLX_CORE_OWNER },
  { path: 'hlx/config', owner: HLX_CORE_OWNER },
  { path: 'hlx/loader', owner: HLX_CORE_OWNER },
  { path: 'hlx/plugins/imgui', owner: { domain: GAME_ID, modId: IMGUI_PLUGIN_MOD_ID } },
];

function ownerOf(destination: string): INexusIdentity | undefined {
  const normalized = destination.toLowerCase();
  return PROTECTED_PATHS.find(({ path }) => normalized === path || normalized.startsWith(`${path}/`))?.owner;
}

function isAuthorized(identity: INexusIdentity | undefined, owner: INexusIdentity): boolean {
  return identity !== undefined && identity.domain.toLowerCase() === owner.domain.toLowerCase() && identity.modId === owner.modId;
}

// Rejects an install that would write to a path reserved for a different mod (e.g. a mod
// bundling its own libhl64.dll or hlx/loader files instead of depending on hlx-core for them).
export function protectedPathViolation(destinations: Iterable<string>, identity: INexusIdentity | undefined): string | undefined {
  for (const destination of destinations) {
    const owner = ownerOf(destination);
    if (owner !== undefined && !isAuthorized(identity, owner)) {
      log('debug', 'farever install gate: protected path violation', { destination, owner, identity });
      return 'contains hlx protected files';
    }
  }
  return undefined;
}
