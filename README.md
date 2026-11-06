# Matterbridge plugin for Wiz over LAN

`matterbridge-wiz-lan-platform` is a Matterbridge plugin that exposes Wiz lights and outlets to Matter without the use
of the cloud or a hub by communicating with them over LAN.

## Prerequisites

### Matterbridge

A fully configured and functioning installation of [Matterbridge](https://github.com/Luligu/matterbridge) is required.

This compatibility build requires Matterbridge **3.11.0 or newer in the 3.x series** and a Node.js version supported by Matterbridge (22.13+, 24.x, or 26.x).

### Wiz lights or outlets

The Wiz devices need to have been configured and usable via the Wiz app. This plugin does not use the internet and cannot provision devices. 


## How to install the plugin

### Install this compatibility build from a tarball

Upload `matterbridge-wiz-lan-platform-2.1.1.tgz` with the Matterbridge frontend's plugin upload control, then restart Matterbridge. Check that the plugin reports version 2.1.1 and loads without a missing-export error.

This is a local compatibility build; installing the package by name from npm will not install this fix. The tarball includes compiled JavaScript and the settings schema. Its production manifest has no development dependencies or install hooks, and is marked private so Matterbridge can retain the uploaded tarball for Docker recreation.

To build the upload file from this source:

```sh
npm ci --ignore-scripts
npm test
npm run pack:plugin
```

Use `pack:plugin` for the upload artifact; it stages a production-only manifest before running `npm pack`. Local tests use Matterbridge 3.11.0. Physical WiZ discovery and controller pairing require verification on the target network.

### With the frontend (preferred method)

Open the Matterbridge frontend, key in `matterbridge-wiz-lan-platform` for the "plugin name" of the "install a plugin" box and click the "install" button.

### Without the frontend

```
npm install -g matterbridge-wiz-lan-platform --omit=dev
matterbridge -add matterbridge-wiz-lan-platform
```

Then start Matterbridge

# Frequently Asked Questions

## What is supported?

This plugin supports Wiz RGB, tunable white, and dimmable lights and power outlets. However, I have only testd it with Wiz RGB lights.
