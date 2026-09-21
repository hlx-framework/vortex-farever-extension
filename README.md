# vortex-farever-extension

Vortex game extension for Farever (Steam app id 3672400).

- Registers Farever as a manageable game in Vortex.
- On every switch to Farever as the active game (`setup`),
  checks Nexus Mods site-mod 2118 (hlx-core) for a newer file than the last
  one installed, and if found, downloads and installs it automatically
  (no prompt), straight into the game's root folder.

## Supported mod zip layouts

Any archive containing a `.hl` file anywhere is recognized as an hlx mod; the
`.hl` file's own path decides how it's installed (all end up under the game's
`hlx/mods/<mod-name>/` folder, except for hlx-core's own release, which is
root-relative already):

| Zip contains | Installed to |
| --- | --- |
| `hlx/mods/<mod-name>/<mod-name>.hl` (or anything else with `hlx/` in the path, e.g. hlx-core's own `libhl64.dll` + `hlx/loader/hlx-loader.hl`) | copied as-is, relative to the game root |
| `<mod-name>/<mod-name>.hl` | `hlx/mods/<mod-name>/<mod-name>.hl` |
| `<mod-name>.hl` (no wrapping folder) | `hlx/mods/<mod-name>/<mod-name>.hl` (auto-wrapped) |

Anything else (no `.hl` file at all) is declined, and Vortex's own default
installer handles it instead.

## Declaring a supported Farever version range

A mod's Nexus file version can end with `-min<version>` and/or `-max<version>`
to declare which Farever versions it supports, e.g. `1.2.0-min1.0.0-max2.0.0`.

- `-min1.0.0`: requires Farever 1.0.0 or newer.
- `-max2.0.0`: requires Farever 2.0.0 or older (any 2.0.0.x build).
- Both can be combined; either half is optional.

A version without this suffix (or with a `-` used for something else, like a
pre-release tag) is treated as supporting any Farever version. Mods outside
their declared range are refused at install time, and get disabled (with a
notification) if Farever updates past their range after install.

## Build

```bash
npm install
npm run build
```

Produces `build/index.js`, `build/info.json`, `build/gameart.png`, then zips
their contents into `dist/vortex-farever-extension.zip`.

## Manual test in Vortex

Vortex loads extensions from a folder under its extensions directory, e.g.
on Windows: `%APPDATA%\Vortex\plugins\vortex-farever-extension\`.

Copy the contents of `build/` into that folder, then restart Vortex. Farever
should show up under "Games" (or get auto-detected if installed via Steam).
