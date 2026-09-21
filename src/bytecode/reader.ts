// Reads Const.VERSION_MAJOR/SUB/NETWORK/BUILD straight out of hlboot.dat (no game/native code).
// Static values aren't inline; traces the Int+SetField pair the entrypoint writes them with.
// Format reference: HaxeFoundation/hashlink, src/code.c (hl_code_read), src/opcodes.h, src/hl.h (hl_type_kind).
import { fs, log } from 'vortex-api';
import { Version } from './version';

const COMPANION_TYPE_NAME = '$Const';
// order maps directly to Major.Minor.Patch.Build (version.ts)
const VERSION_FIELDS = ['VERSION_MAJOR', 'VERSION_SUB', 'VERSION_NETWORK', 'VERSION_BUILD'] as const;

// Fixed operand count per opcode (0-101); variadic ops (-1/-2) are handled separately below.
const OPCODE_ARITY = [
  2, 2, 2, 2, 2, 2, 1,                            // 0-6:   Load/Store
  3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2,     // 7-21:  Arithmetic
  1, 1,                                           // 22-23: Incr/Decr
  2, 3, 4, 5, 6, -1, -1, -1, -1,                  // 24-32: Function Calls (29-32 byte-variadic)
  2, 3, 3,                                        // 33-35: Closures
  2, 2, 3, 3, 2, 2, 3, 3,                         // 36-43: Global/Field Access
  2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1,     // 44-58: Conditional Jumps
  2, 2, 2, 2, 2, 2, 2,                            // 59-65: Type Conversions
  0, 1, 1, 1, -2, 1, 2, 1,                         // 66-73: Control Flow (70 Switch is VarInt-variadic)
  3, 3, 3, 3, 3, 3, 3, 3,                         // 74-81: Memory Access
  1, 2, 2, 2, 2,                                  // 82-86: Object Creation/Introspection
  2, 2, 2,                                        // 87-89: References
  -1, 2, 2, 4, 3,                                 // 90-94: Enum Operations (90 byte-variadic)
  0, 2, 3, 0, 3, 3, 1,                             // 95-101: Misc
];
const BYTE_COUNT_VARIADIC = new Set([29, 30, 31, 32, 90]); // CallN, CallMethod, CallThis, CallClosure, MakeEnum
const SWITCH_OP = 70;
const INT_OP = 1;
const GET_GLOBAL_OP = 36;
const SET_FIELD_OP = 39;

class Reader {
  pos = 0;
  constructor(private data: Buffer) {}

  u8(): number {
    return this.data[this.pos++];
  }

  i32(): number {
    const v = this.data.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }

  skip(n: number): void {
    this.pos += n;
  }

  // shared VarInt encoding for every index/count in the format
  index(): number {
    const b = this.u8();
    if ((b & 0x80) === 0) return b & 0x7f;
    if ((b & 0x40) === 0) {
      const v = ((b & 31) << 8) | this.u8();
      return (b & 0x20) === 0 ? v : -v;
    }
    const c = this.u8();
    const d = this.u8();
    const e = this.u8();
    const v = ((b & 31) << 24) | (c << 16) | (d << 8) | e;
    return (b & 0x20) === 0 ? v : -v;
  }
}

function readStringPool(r: Reader, count: number, data: Buffer): string[] {
  const totalBytes = r.i32();
  const blobStart = r.pos;
  r.skip(totalBytes);
  const strings: string[] = [];
  let off = blobStart;
  for (let i = 0; i < count; i++) {
    const len = r.index();
    strings.push(data.toString('utf8', off, off + len));
    off += len + 1;
  }
  return strings;
}

interface TypeEntry {
  kind: number;
  name?: string;
  superIndex: number; // -1 = none
  fields?: string[];   // only populated for HOBJ/HSTRUCT (11/21)
}

function readType(r: Reader, strings: string[]): TypeEntry {
  const kind = r.index();
  switch (kind) {
    case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7: case 8: case 9:
    case 12: case 13: case 16: case 23:
      return { kind, superIndex: -1 };
    case 10: case 20: { // HFUN / HMETHOD
      const nargs = r.index();
      for (let i = 0; i < nargs; i++) r.index();
      r.index(); // return type
      return { kind, superIndex: -1 };
    }
    case 11: case 21: { // HOBJ / HSTRUCT
      const name = strings[r.index()];
      const superIndex = r.index();
      r.index(); // global
      const nfields = r.index();
      const nproto = r.index();
      const nbindings = r.index();
      const fields: string[] = [];
      for (let i = 0; i < nfields; i++) {
        fields.push(strings[r.index()]);
        r.index(); // field type
      }
      for (let i = 0; i < nproto; i++) { r.index(); r.index(); r.index(); }
      for (let i = 0; i < nbindings; i++) { r.index(); r.index(); }
      return { kind, name, superIndex, fields };
    }
    case 14: case 19: case 22: // HREF / HNULL / HPACKED
      r.index(); // inner
      return { kind, superIndex: -1 };
    case 15: { // HVIRTUAL
      const nfields = r.index();
      for (let i = 0; i < nfields; i++) { r.index(); r.index(); }
      return { kind, superIndex: -1 };
    }
    case 17: // HABSTRACT
      r.index(); // name
      return { kind, superIndex: -1 };
    case 18: { // HENUM
      r.index(); // name
      r.index(); // global
      const nconstructs = r.index();
      for (let i = 0; i < nconstructs; i++) {
        r.index(); // construct name
        const nparams = r.index();
        for (let j = 0; j < nparams; j++) r.index();
      }
      return { kind, superIndex: -1 };
    }
    default:
      throw new Error(`hlBytecode: unknown type kind ${kind} - bytecode format has drifted, reader needs updating`);
  }
}

function readInstruction(r: Reader): { op: number; operands: number[] } {
  const op = r.index();
  if (BYTE_COUNT_VARIADIC.has(op)) {
    // all five variadics: 2 fixed operands, then a raw-byte count
    const operands: number[] = [];
    for (let i = 0; i < 2; i++) operands.push(r.index());
    const n = r.u8();
    for (let i = 0; i < n; i++) operands.push(r.index());
    return { op, operands };
  }
  if (op === SWITCH_OP) {
    const operands = [r.index()]; // src
    const n = r.index();
    operands.push(n);
    for (let i = 0; i <= n; i++) operands.push(r.index()); // n jump offsets + default_j
    return { op, operands };
  }
  const arity = OPCODE_ARITY[op];
  if (arity === undefined || arity < 0) {
    throw new Error(`hlBytecode: unhandled opcode ${op} - bytecode format has drifted, reader needs updating`);
  }
  const operands: number[] = [];
  for (let i = 0; i < arity; i++) operands.push(r.index());
  return { op, operands };
}

// delta-compressed debug info; only consumed to stay byte-aligned, values unused
function skipDebugInfo(r: Reader, nops: number): void {
  let i = 0;
  while (i < nops) {
    const c = r.u8();
    if (c & 1) {
      r.u8(); // file change: one more byte, does not advance i
    } else if (c & 2) {
      i += (c >> 2) & 15; // delta-range: bulk-fills `count` instructions, no extra bytes
    } else if (c & 4) {
      i += 1; // single instruction, 5-bit delta packed in c
    } else {
      r.u8(); r.u8(); // absolute 21-bit line: 2 more bytes
      i += 1;
    }
  }
}

const versionCache = new Map<string, { mtimeMs: number; version: Promise<Version> }>();

// best-effort: warns and returns undefined instead of throwing on a bad/missing file
export async function readFareverVersion(hlbootPath: string): Promise<Version | undefined> {
  try {
    const stat = await fs.statAsync(hlbootPath);
    const cached = versionCache.get(hlbootPath);
    if (cached !== undefined && cached.mtimeMs === stat.mtimeMs) {
      return await cached.version;
    }
    const version = parseFareverVersion(hlbootPath);
    versionCache.set(hlbootPath, { mtimeMs: stat.mtimeMs, version });
    return await version;
  } catch (err) {
    log('warn', 'Failed to resolve Farever version from hlboot.dat', { hlbootPath, error: (err as Error).message });
    return undefined;
  }
}

async function parseFareverVersion(hlbootPath: string): Promise<Version> {
  const data: Buffer = await fs.readFileAsync(hlbootPath);
  const r = new Reader(data);

  if (data.toString('ascii', 0, 3) !== 'HLB') {
    throw new Error(`hlBytecode: ${hlbootPath} is not a HashLink bytecode file (missing HLB magic)`);
  }
  const version = data[3];
  r.pos = 4;
  const flags = r.index();
  const hasDebugInfo = (flags & 1) !== 0;

  const nints = r.index();
  const nfloats = r.index();
  const nstrings = r.index();
  const nbytes = version >= 5 ? r.index() : 0;
  const ntypes = r.index();
  const nglobals = r.index();
  const nnatives = r.index();
  const nfunctions = r.index();
  if (version >= 4) r.index(); // nconstants - unused, we stop before the constants table
  const entrypoint = r.index();

  const ints: number[] = [];
  for (let i = 0; i < nints; i++) ints.push(r.i32());
  r.skip(8 * nfloats);

  const strings = readStringPool(r, nstrings, data);

  if (version >= 5) {
    const totalBytes = r.i32();
    r.skip(totalBytes);
    for (let i = 0; i < nbytes; i++) r.index();
  }

  if (hasDebugInfo) {
    const nfiles = r.index();
    const totalBytes = r.i32();
    r.skip(totalBytes);
    for (let i = 0; i < nfiles; i++) r.index();
  }

  const types: TypeEntry[] = [];
  for (let i = 0; i < ntypes; i++) types.push(readType(r, strings));

  const globals: number[] = [];
  for (let i = 0; i < nglobals; i++) globals.push(r.index());

  for (let i = 0; i < nnatives; i++) { r.index(); r.index(); r.index(); r.index(); }

  let entryInstructions: { op: number; operands: number[] }[] | null = null;
  for (let i = 0; i < nfunctions; i++) {
    r.index(); // function type
    const findex = r.index();
    const nregs = r.index();
    const nops = r.index(); // nops precedes the regs array on the wire, not after it
    for (let j = 0; j < nregs; j++) r.index();
    const isEntry = findex === entrypoint;
    const instructions: { op: number; operands: number[] }[] = [];
    for (let j = 0; j < nops; j++) {
      const ins = readInstruction(r);
      if (isEntry) instructions.push(ins);
    }
    if (hasDebugInfo) {
      skipDebugInfo(r, nops);
      if (version >= 3) {
        const nassigns = r.index();
        for (let j = 0; j < nassigns; j++) {
          r.index();
          r.index();
          if (version >= 6) r.index(); // v6 adds a 3rd index per assign record (undocumented)
        }
      }
    }
    if (isEntry) {
      entryInstructions = instructions;
      break; // rest of the function table is irrelevant
    }
  }
  if (entryInstructions === null) {
    throw new Error('hlBytecode: entrypoint function not found - bytecode format has drifted, reader needs updating');
  }

  const constTypeIndex = types.findIndex(t => t.name === COMPANION_TYPE_NAME);
  if (constTypeIndex < 0) {
    throw new Error(`hlBytecode: type ${COMPANION_TYPE_NAME} not found in hlboot.dat`);
  }
  const constType = types[constTypeIndex];

  let superFieldOffset = 0;
  for (let t = constType.superIndex; t >= 0; t = types[t].superIndex) {
    superFieldOffset += types[t].fields?.length ?? 0;
  }

  const wantedFieldIndex = new Map<number, string>(); // flattened field index -> name
  for (const name of VERSION_FIELDS) {
    const ownIndex = constType.fields?.indexOf(name) ?? -1;
    if (ownIndex < 0) {
      throw new Error(`hlBytecode: field ${name} not found on ${COMPANION_TYPE_NAME}`);
    }
    wantedFieldIndex.set(ownIndex + superFieldOffset, name);
  }

  const candidateGlobals = globals
    .map((typeIndex, globalIndex) => ({ typeIndex, globalIndex }))
    .filter(g => g.typeIndex === constTypeIndex)
    .map(g => g.globalIndex);
  if (candidateGlobals.length !== 1) {
    throw new Error(
      `hlBytecode: expected exactly one global of type ${COMPANION_TYPE_NAME}, found ${candidateGlobals.length}`);
  }
  const targetGlobal = candidateGlobals[0];

  // each static field: Int(src,ri) GetGlobal(obj,target) SetField(obj,fi,src)
  const result: { major?: number; minor?: number; patch?: number; build?: number } = {};
  for (let i = 2; i < entryInstructions.length; i++) {
    const setField = entryInstructions[i];
    if (setField.op !== SET_FIELD_OP) continue;
    const [obj, fi, src] = setField.operands;
    const fieldName = wantedFieldIndex.get(fi);
    if (fieldName === undefined) continue;

    const getGlobal = entryInstructions[i - 1];
    if (getGlobal.op !== GET_GLOBAL_OP || getGlobal.operands[0] !== obj || getGlobal.operands[1] !== targetGlobal) {
      continue;
    }
    const intLoad = entryInstructions[i - 2];
    if (intLoad.op !== INT_OP || intLoad.operands[0] !== src) continue;

    const value = ints[intLoad.operands[1]];
    switch (fieldName) {
      case 'VERSION_MAJOR': result.major = value; break;
      case 'VERSION_SUB': result.minor = value; break;
      case 'VERSION_NETWORK': result.patch = value; break;
      case 'VERSION_BUILD': result.build = value; break;
    }
  }

  if (result.major === undefined || result.minor === undefined || result.patch === undefined || result.build === undefined) {
    throw new Error('hlBytecode: could not resolve one or more VERSION_* fields from the entrypoint\'s bytecode');
  }

  return new Version(result.major, result.minor, result.patch, result.build);
}
