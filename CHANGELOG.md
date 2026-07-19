# Changelog

All notable changes to vortex-farever-extension are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Add entries under `[Unreleased]` as changes land.
Before tagging a release, move the `[Unreleased]` entries under a new `[X.Y.Z] - YYYY-MM-DD` heading,
and bump the version in both `package.json` and `src/info.json` to match the tag.

## [Unreleased]

## [0.0.1] - 2026-07-19

### Added
- Game registration for Farever (Steam app id 3672400).
- Automatic detection, download, and update of hlx-core (Nexus site-mod 2118), checked on game setup.
- Mod installer: recognizes any archive containing a `.hl` file and normalizes it into the `hlx/mods/<mod-name>/` layout hlx-loader expects (root-relative, wrapped-folder, and flat archive shapes all supported).
- Build tooling: webpack build to `build/`, zipped into `dist/vortex-farever-extension.zip`.
