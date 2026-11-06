import assert from 'node:assert/strict';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { colorTemperatureLight, dimmableLight, onOffPlugInUnit } from 'matterbridge';
import { AnsiLogger, LogLevel } from 'matterbridge/logger';
import { BridgedDeviceBasicInformation, ColorControl, LevelControl, OnOff } from 'matterbridge/matter/clusters';
const pluginRoot = process.env.WIZ_PLUGIN_ROOT
  ? pathToFileURL(path.resolve(process.env.WIZ_PLUGIN_ROOT) + path.sep)
  : new URL('../', import.meta.url);
const { default: initializePlugin } = await import(new URL('dist/index.js', pluginRoot));
const { MatterbridgeWizLanPlatform } = await import(new URL('dist/platform.js', pluginRoot));
const { LanComm } = await import(new URL('dist/lib/lan-comm.js', pluginRoot));
const { State } = await import(new URL('dist/lib/types.js', pluginRoot));

test('the complete built plugin imports against Matterbridge 3.11.0', () => {
  assert.equal(typeof initializePlugin, 'function');
});

test('the actual plugin factory initializes with the 3.11.0 platform contract', async (t) => {
  const testRoot = fileURLToPath(new URL('../.test-data/', import.meta.url));
  mkdirSync(testRoot, { recursive: true });
  const storage = mkdtempSync(path.join(testRoot, 'initialization-'));
  t.mock.method(os, 'networkInterfaces', () => ({
    test: [{ internal: false, family: 'IPv4', address: '192.0.2.10', mac: '00:11:22:33:44:55' }],
  }));
  const timers = [];
  const realSetInterval = globalThis.setInterval;
  t.mock.method(globalThis, 'setInterval', (...args) => {
    const timer = realSetInterval(...args);
    timers.push(timer);
    return timer;
  });
  let platform;
  try {
    platform = initializePlugin({ matterbridgeVersion: '3.11.0', matterbridgeDirectory: storage },
      new AnsiLogger({ logName: 'WiZ compatibility test', logLevel: LogLevel.ERROR }),
      { name: 'matterbridge-wiz-lan-platform', debug: false });
    await platform.ready;
    assert.equal(platform.type, 'DynamicPlatform');
    assert.equal(platform.isReady, true);
    assert.ok(platform.lanComm instanceof LanComm);
  } finally {
    for (const timer of timers) clearInterval(timer);
    if (platform) {
      await platform.onShutdown('compatibility test');
      await platform.destroy();
    }
    // Only remove the dedicated test directory created immediately above.
    assert.equal(path.dirname(storage), path.resolve(testRoot));
    rmSync(storage, { recursive: true, force: true });
  }
});

// Exercise real endpoint construction without opening UDP sockets or registering
// devices on the user's Matterbridge instance.
function platformHarness() {
  const platform = Object.create(MatterbridgeWizLanPlatform.prototype);
  platform.config = { debug: false };
  platform.log = { info() {}, error() {} };
  platform.knownDevices = new Map();
  platform.lanComm = { setState() {} };
  platform.registerDevice = async () => {};
  platform.storeDevice = () => {};
  return platform;
}

for (const [moduleName, expectedType] of [
  ['ESP01_SHRGB_01', colorTemperatureLight],
  ['ESP01_MHWRGB_01', colorTemperatureLight],
  ['ESP01_DHRGB_01', colorTemperatureLight],
  ['ESP01_SHTW_01', colorTemperatureLight],
  ['ESP01_SHDW_01', dimmableLight],
  ['ESP01_SOCKET_01', onOffPlugInUnit],
]) {
  test(`creates ${moduleName} with the current endpoint API and stable id`, async () => {
    const platform = platformHarness();
    const deviceId = '001122334455';
    const data = LanComm.prototype.getDeviceType(moduleName, deviceId);
    assert.equal(data.type.code, expectedType.code);
    platform.addDevice(deviceId, {
      ...data,
      moduleName,
      fwVersion: '1.0.0',
      label: 'Test WiZ device',
      state: platform.translateFromWizState({ state: true, dimming: 50, temp: 4000 }),
    });
    const endpoint = platform.knownDevices.get(deviceId);
    try {
      assert.equal(endpoint.id, `wiz-${deviceId}`);
      assert.ok(endpoint.getDeviceTypes().some((type) => type.code === expectedType.code));
      assert.equal(endpoint.getClusterServerOptions(OnOff.Cluster.id).onOff, true);
      assert.equal(endpoint.getClusterServerOptions(BridgedDeviceBasicInformation.Cluster.id).nodeLabel, 'Test WiZ device');
      if (expectedType !== onOffPlugInUnit) {
        assert.equal(endpoint.getClusterServerOptions(LevelControl.Cluster.id).currentLevel, 127);
      }
      if (expectedType === colorTemperatureLight) {
        assert.equal(endpoint.getClusterServerOptions(ColorControl.Cluster.id).colorTemperatureMireds, 250);
      }
    } finally {
      await endpoint.close();
    }
  });
}

test('incoming WiZ updates retain Matter cluster ids and scaled values', () => {
  const state = MatterbridgeWizLanPlatform.prototype.translateFromWizState({ state: false, dimming: 50, temp: 4000 });
  assert.deepEqual(state.get(State.OnOff), { clusterId: OnOff.Cluster.id, attribute: 'onOff', value: false });
  assert.deepEqual(state.get(State.LightLevel), { clusterId: LevelControl.Cluster.id, attribute: 'currentLevel', value: 127 });
  assert.deepEqual(state.get(State.ColorTemperature), { clusterId: ColorControl.Cluster.id, attribute: 'colorTemperatureMireds', value: 250 });
  assert.equal(state.get(State.ColorMode).value, ColorControl.ColorMode.ColorTemperatureMireds);
});
