import { Version } from '../bytecode';

export interface IGameVersionRange {
  min?: Version;
  maxExclusive?: Version; // one past the last component the author wrote - see Version.parseMaxBound
  maxText?: string; // author's original max text, for messages (maxExclusive isn't human-meaningful)
}

// Optional "-min<Version>-max<Version>" suffix on a version string, either half optional.
// Dash rather than "+" because Nexus's file-version field only allows [a-zA-Z0-9.-].
// A dash that isn't this convention (semver pre-release, a date, etc.) means "no declared range",
// not "invalid" - mods that don't opt in must never be blocked or disabled by this check.
export function parseGameVersionRange(version: string): IGameVersionRange | undefined {
  const dashIndex = version.indexOf('-');
  if (dashIndex < 0) {
    return undefined;
  }
  const match = version.slice(dashIndex).match(/^-(?:min(\d+(?:\.\d+){0,3}))?-?(?:max(\d+(?:\.\d+){0,3}))?$/);
  if (match === null || (match[1] === undefined && match[2] === undefined)) {
    return undefined;
  }
  return {
    min: match[1] !== undefined ? Version.parse(match[1]) : undefined,
    maxExclusive: match[2] !== undefined ? Version.parseMaxBound(match[2]) : undefined,
    maxText: match[2],
  };
}

export function parseDeclaredVersionRange(versionString: string | undefined): IGameVersionRange | undefined {
  return versionString === undefined ? undefined : parseGameVersionRange(versionString);
}

export function gameVersionIncompatibilityReason(range: IGameVersionRange | undefined, gameVersion: Version): string | undefined {
  if (range === undefined) {
    return undefined;
  }
  if (range.min !== undefined && !gameVersion.isAtLeast(range.min)) {
    return `requires Farever ${range.min.toString()} or newer (installed: ${gameVersion.toString()})`;
  }
  if (range.maxExclusive !== undefined && !gameVersion.isBelow(range.maxExclusive)) {
    return `requires Farever ${range.maxText} or older (installed: ${gameVersion.toString()})`;
  }
  return undefined;
}

export function versionIncompatibilityReason(versionString: string | undefined, gameVersion: Version): string | undefined {
  return gameVersionIncompatibilityReason(parseDeclaredVersionRange(versionString), gameVersion);
}
