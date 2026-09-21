// Major.Minor.Patch.Build - maps 1:1 to Const.VERSION_MAJOR/SUB/NETWORK/BUILD.
export class Version {
  constructor(
    public readonly major: number,
    public readonly minor: number = 0,
    public readonly patch: number = 0,
    public readonly build: number = 0,
  ) {}

  compareTo(other: Version): number {
    return this.major - other.major || this.minor - other.minor || this.patch - other.patch || this.build - other.build;
  }

  isAtLeast(required: Version): boolean {
    return this.compareTo(required) >= 0;
  }

  // Compares against an EXCLUSIVE bound, e.g. one produced by parseMaxBound.
  isBelow(exclusiveBound: Version): boolean {
    return this.compareTo(exclusiveBound) < 0;
  }

  toString(): string {
    return `${this.major}.${this.minor}.${this.patch}.${this.build}`;
  }

  static parse(text: string): Version | undefined {
    const components = parseComponents(text);
    if (components === undefined) {
      return undefined;
    }
    return new Version(components[0], components[1] ?? 0, components[2] ?? 0, components[3] ?? 0);
  }

  // Exclusive upper bound one past the last written component, so an omitted trailing component
  // means "any": "1.2" -> 1.3.0.0 (accepts any 1.2.x); "1.2.3.4" -> 1.2.3.5. Use with isBelow().
  static parseMaxBound(text: string): Version | undefined {
    const components = parseComponents(text);
    if (components === undefined) {
      return undefined;
    }
    const bumped = [...components];
    bumped[bumped.length - 1]++;
    while (bumped.length < 4) bumped.push(0);
    return new Version(bumped[0], bumped[1], bumped[2], bumped[3]);
  }
}

// Components actually written, 1-4 groups, no defaulting - parse and parseMaxBound fill gaps differently.
function parseComponents(text: string): number[] | undefined {
  const match = text.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?/);
  if (match === null) {
    return undefined;
  }
  return match.slice(1).filter(g => g !== undefined).map(Number);
}
