# Changelog

All notable changes to vortex-farever-extension are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Add entries under `[Unreleased]` as changes land.
Before tagging a release, move the `[Unreleased]` entries under a new `[X.Y.Z] - YYYY-MM-DD` heading,
and bump the version in both `package.json` and `src/info.json` to match the tag.

## [Unreleased]

## [0.0.3] - 2026-09-22

- Disable an already-installed mod that becomes incompatible after a Farever update, instead of only warning about it
- Refuse to install a mod whose declared version range doesn't match the installed Farever version, instead of only warning about it after the fact
- Add a "Farever" setting (enabled by default) to automatically download and install mod updates once a compatible newer file is found
- Also run the mod update check when the user clicks Vortex's "Check for Updates", instead of only on game activation
- With auto-update enabled, hlx-core updates install silently (just a notification once done) instead of still prompting to click "Install"
- Block manually re-enabling a mod the compatibility gate disabled, instead of letting it silently stay enabled until the next check (including via the mod list's enable checkbox, which bypasses the direct action check by batching its dispatch)
- Disable/re-enable mods through Vortex's own enable/disable channel instead of a raw state dispatch, so the mod list reliably reflects the change instead of appearing stuck on the old state
- Fix the install-time compatibility check silently allowing installs when the download's cached metadata lacked a file version (confirmed via logging: the local `modInfo` fields were empty), by falling back to a live Nexus file-version lookup - the same one already used for update checks
- Show the actual incompatibility reason when refusing to install a mod, instead of Vortex's generic "Installation canceled" toast (which discards the message for a cancellation-type error)
- Refuse to install a mod that bundles files under a path reserved for hlx-core or another required mod (`libhl64.dll`, `hlx/config/**`, `hlx/loader/**`, `hlx/plugins/imgui/**`), and reject any archive entry using a ".." path segment before it can be used to build a destination path

## [0.0.2] - 2026-07-30

- Compare versions by exact upload timestamp instead of year-level precision
- Reuse an already-downloaded archive instead of erroring on repeat activation
- Ask before installing an update instead of installing silently

## [0.0.1] - 2026-07-19

### Added
- Game registration for Farever (Steam app id 3672400).
- Automatic detection, download, and update of hlx-core (Nexus site-mod 2118), checked on game setup.
- Mod installer: recognizes any archive containing a `.hl` file and normalizes it into the `hlx/mods/<mod-name>/` layout hlx-loader expects (root-relative, wrapped-folder, and flat archive shapes all supported).
- Build tooling: webpack build to `build/`, zipped into `dist/vortex-farever-extension.zip`.
