# Changelog

All notable changes to this project will be documented in this file.

If you like this project and find it useful, please consider giving it a star on GitHub at https://github.com/AMoo-Miki/matterbridge-wiz-lan-platform.


## [2.1.1] - 2026-10-27

### Fixes
- Import Matter clusters and types from their supported subpaths in Matterbridge 3.11.0.
- Use PlatformMatterbridge, onOffPlugInUnit, and the endpoint id option supported by the current API.
- Add compatibility regression tests and production tarball packaging without development dependencies or install hooks.
- Require Matterbridge 3.11.0 and a compatible Node.js version for this build.

## [2.1.0] - 2025-02-25

### Enhancements
- Store and allow restoring of previously discovered device
- Load a provided label to override the one shown for a device

### Fixes
- Update ColorMode when handling state changes

## [2.0.0] - 2025-02-25

### Breaking Changes
- Require Matterbridge versions newer than 2.1.5

## [1.0.2] - 2024-12-29

### Fixes
- Fix state reporting key conflict
