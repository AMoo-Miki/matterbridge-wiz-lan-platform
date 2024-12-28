# Matterbridge plugin for Wiz over LAN

`matterbridge-wiz-lan-platform` is a Matterbridge plugin that exposes Wiz lights and outlets to Matter without the use
of the cloud or a hub by communicating with them over LAN.

## Prerequisites

### Matterbridge

A fully configured and functioning installation of [Matterbridge](https://github.com/Luligu/matterbridge) is required.

### Wiz lights or outlets

The Wiz devices need to have been configured and usable via the Wiz app. This plugin does not use the internet and cannot provision devices. 


## How to install the plugin

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