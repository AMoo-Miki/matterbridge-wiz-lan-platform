import path from 'node:path';
import * as fs from 'node:fs/promises';
import { setTimeout, clearTimeout } from 'node:timers';
import {
  bridgedNode,
  OnOff,
  ColorControl,
  LevelControl,
  Matterbridge,
  MatterbridgeDynamicPlatform,
  MatterbridgeEndpoint,
  PlatformConfig,
  powerSource,
  BridgedDeviceBasicInformation,
} from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { NodeStorage, NodeStorageManager } from 'matterbridge/storage';
import { LanComm } from './lib/lan-comm.js';
import { Dict, State, StateMap } from './lib/types.js';
import { hsColorToRgbw, rgbwToHsColor } from './lib/utils.js';

interface StoredDevice {
  id: string;
  data: Omit<Dict, 'state'>;
}

export class MatterbridgeWizLanPlatform extends MatterbridgeDynamicPlatform {
  readonly lanComm: LanComm;
  readonly knownDevices: Map<string, MatterbridgeEndpoint> = new Map();
  readonly storedDevices: Map<string, StoredDevice> = new Map();

  private nodeStorageManager?: NodeStorageManager;
  private nodeStorage?: NodeStorage;
  private saveTimer?: ReturnType<typeof setTimeout>;

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('2.1.5')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "2.1.5". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend.`,
      );
    }

    this.log.info('Initializing platform:', this.config.name);

    this.lanComm = new LanComm(config, log);
    this.lanComm.on('discover', (deviceId: string, { state, ...data }: Dict) => {
      this.addDevice(deviceId, { state: this.translateFromWizState(state), ...data });
    });
    this.lanComm.on('stateChange', (deviceId: string, changes: Dict, state: Dict) => {
      this.changeState(deviceId, this.translateFromWizState(changes), state);
    });
  }

  override async onStart(reason?: string) {
    this.log.info('onStart called with reason:', reason ?? 'none');

    // create NodeStorageManager
    this.nodeStorageManager = new NodeStorageManager({
      dir: path.join(this.matterbridge.matterbridgeDirectory, 'matterbridge-wiz-lan-platform'),
      writeQueue: false,
      expiredInterval: undefined,
      logging: false,
      forgiveParseErrors: true,
    });
    this.nodeStorage = await this.nodeStorageManager.createStorage('devices');

    // Reset the storage if requested or load the stored devices
    if (this.config.resetDeviceCacheOnStartup === true) {
      this.config.resetDeviceCacheOnStartup = false;

      this.log.info('Resetting cache...');
      const storedDevices = await this.nodeStorage.get<StoredDevice[]>('DeviceIdentifiers', []);
      for (const device of storedDevices) {
        const fileName = path.join(this.matterbridge.matterbridgePluginDirectory, 'matterbridge-wiz-lan-platform', `${device.id}.json`);
        try {
          this.log.debug(`Deleting cache file: ${fileName}`);
          await fs.unlink(fileName);
          this.log.debug(`Deleted cache file: ${fileName}`);
        } catch (error) {
          this.log.error(`Failed to delete cache for device ${device.id} file ${fileName} error: ${error}`);
        }
      }

      this.log.info('Resetting storage...');
      await this.nodeStorage.clear();
      this.storedDevices.clear();
      await this.saveStoredDevices();
      this.log.info('Reset of Shellies storage done!');
    } else {
      await this.loadStoredDevices();
    }

    //enableCachedDevices
    if (this.config.enableCachedDevices === true) {
      this.log.info(`Loading ${this.storedDevices.size} previously discovered device${this.storedDevices.size === 1 ? '' : 's'} from storage...`);
      for (const storedDevice of this.storedDevices.values()) {
        if (storedDevice.id === undefined) {
          this.log.error(`Stored device ${storedDevice.id} is not valid; enable resetDeviceCacheOnStartup in plugin config and restart.`);
          continue;
        }

        this.addDevice(storedDevice.id, {
          state: new Map(),
          ...storedDevice.data,
          ...this.lanComm.getDeviceType(storedDevice.data.moduleName, storedDevice.id),
        });
      }
    }

    await this.lanComm.start();
  }

  override async onShutdown(reason?: string) {
    this.log.info('onShutdown called with reason:', reason ?? 'none');

    this.lanComm.end();
  }

  private storeDevice(deviceId: string, data: Dict) {
    this.storedDevices.set(deviceId, {
      id: deviceId,
      data: {
        address: data.address,
        moduleName: data.moduleName,
        fwVersion: data.fwVersion,
        name: data.name,
        label: data.label?.trim?.() || undefined,
      },
    });
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      await this.saveStoredDevices();
    }, 10000);
  }

  private async saveStoredDevices(): Promise<boolean> {
    if (!this.nodeStorage) {
      this.log.error('NodeStorage is not initialized');
      return false;
    }
    this.log.debug(`Saving ${this.storedDevices.size} discovered devices to the storage...`);
    await this.nodeStorage.set<StoredDevice[]>('DeviceIdentifiers', Array.from(this.storedDevices.values()));
    return true;
  }

  private async loadStoredDevices(): Promise<boolean> {
    if (!this.nodeStorage) {
      this.log.error('NodeStorage is not initialized');
      return false;
    }
    const storedDevices = await this.nodeStorage.get<StoredDevice[]>('DeviceIdentifiers', []);
    for (const device of storedDevices) this.storedDevices.set(device.id, device);
    this.log.info(`Storage contains ${this.storedDevices.size} previously discovered device${this.storedDevices.size === 1 ? '' : 's'}`);
    return true;
  }

  private addDevice(deviceId: string, { state, ...data }: { state: StateMap } & Omit<Dict, 'state'>) {
    if (this.knownDevices.has(deviceId)) {
      this.changeState(deviceId, state, state);
      return;
    }

    this.log.info('Adding device:', deviceId, JSON.stringify(data));

    const matterbridgeDevice = new MatterbridgeEndpoint([data.type, bridgedNode, powerSource], { uniqueStorageKey: `wiz-${deviceId}` }, this.config.debug as boolean);
    matterbridgeDevice.log.logName = `Wiz:${deviceId}`;
    matterbridgeDevice
      .createDefaultIdentifyClusterServer()
      .createDefaultGroupsClusterServer()
      .createDefaultBridgedDeviceBasicInformationClusterServer(data.name, deviceId, 0xfff1, 'Wiz', data.moduleName, undefined, data.fwVersion);

    if (data.label?.trim?.()) {
      const informationOptions = matterbridgeDevice.getClusterServerOptions(BridgedDeviceBasicInformation.Cluster.id);
      informationOptions!.nodeLabel = data.label;
    }

    if (Array.isArray(data.features)) {
      if (data.features.includes(OnOff.Feature.Lighting)) {
        matterbridgeDevice.createDefaultOnOffClusterServer(state.get(State.OnOff)?.value);
        matterbridgeDevice.createDefaultPowerSourceWiredClusterServer();

        matterbridgeDevice.addCommandHandler('on', async () => {
          this.lanComm.setState(deviceId, { state: true });
        });

        matterbridgeDevice.addCommandHandler('off', async () => {
          this.lanComm.setState(deviceId, { state: false });
        });
      }

      if (data.features.includes(LevelControl.Feature.Lighting)) {
        matterbridgeDevice.createDefaultLevelControlClusterServer(state.get(State.LightLevel)?.value);

        matterbridgeDevice.addCommandHandler('moveToLevel', async ({ request }) => {
          this.lanComm.setState(deviceId, { dimming: request.level });
        });

        matterbridgeDevice.addCommandHandler('moveToLevelWithOnOff', async ({ request }) => {
          const level = Math.round((100 * request.level) / 254);
          this.lanComm.setState(deviceId, { state: level > 0, dimming: level });
        });
      }

      if (data.features.includes(ColorControl.Feature.HueSaturation)) {
        matterbridgeDevice.createHsColorControlClusterServer(
          state.get(State.ColorSaturation)?.value,
          state.get(State.ColorSaturation)?.value,
          state.get(State.ColorTemperature)?.value,
        );

        matterbridgeDevice.addCommandHandler('moveToHueAndSaturation', ({ request }) => {
          const { r, g, b, w } = hsColorToRgbw(request.hue, request.saturation);
          this.lanComm.setState(deviceId, { state: true, r, g, b, w });
        });

        matterbridgeDevice.addCommandHandler('moveToHue', ({ request }) => {
          const { r: _r, g: _g, b: _b, w: _w } = this.lanComm.getState(deviceId);
          const { s } = rgbwToHsColor(_r, _g, _b, _w);
          const { r, g, b, w } = hsColorToRgbw(request.hue, s);
          this.lanComm.setState(deviceId, { state: true, r, g, b, w });
        });

        matterbridgeDevice.addCommandHandler('moveToSaturation', ({ request }) => {
          const { r: _r, g: _g, b: _b, w: _w } = this.lanComm.getState(deviceId);
          const { h } = rgbwToHsColor(_r, _g, _b, _w);
          const { r, g, b, w } = hsColorToRgbw(h, request.saturation);
          this.lanComm.setState(deviceId, { state: true, r, g, b, w });
        });
      } else if (data.features.includes(ColorControl.Feature.ColorTemperature)) {
        matterbridgeDevice.createCtColorControlClusterServer(state.get(State.ColorTemperature)?.value);
      }

      if (data.features.includes(ColorControl.Feature.ColorTemperature)) {
        matterbridgeDevice.addCommandHandler('moveToColorTemperature', async ({ request }) => {
          const temp = Math.max(2200, Math.min(6500, Math.round(1e6 / request.colorTemperatureMireds)));
          this.lanComm.setState(deviceId, { state: true, temp });
        });
      }
    }

    this.registerDevice(matterbridgeDevice);
    this.knownDevices.set(deviceId, matterbridgeDevice);
    this.storeDevice(deviceId, data);
  }

  // eslint-disable-next-line no-unused-vars
  changeState(deviceId: string, changes: StateMap, state: Dict) {
    const device = this.knownDevices.get(deviceId);
    if (!device) {
      this.log.error(`Failed to change state: device not found for id: ${deviceId}`);
      return;
    }

    for (const { clusterId, attribute, value } of changes.values()) {
      device.updateAttribute(clusterId, attribute, value, this.log);
    }
  }

  translateFromWizState(wizState: Dict) {
    const state: StateMap = new Map();

    if ('state' in wizState) {
      state.set(State.OnOff, { clusterId: OnOff.Cluster.id, attribute: 'onOff', value: wizState.state });
    }

    if ('dimming' in wizState) {
      state.set(State.LightLevel, {
        clusterId: LevelControl.Cluster.id,
        attribute: 'currentLevel',
        value: Math.round((254 * wizState.dimming) / 100),
      });
    }

    if ('temp' in wizState) {
      state.set(State.ColorTemperature, {
        clusterId: ColorControl.Cluster.id,
        attribute: 'colorTemperatureMireds',
        value: Math.max(147, Math.min(500, Math.round(1e6 / wizState.temp))),
      });
    }

    if ('r' in wizState && 'g' in wizState && 'b' in wizState) {
      const { h, s } = rgbwToHsColor(wizState.r, wizState.g, wizState.b, wizState.w);
      state.set(State.ColorHue, {
        clusterId: ColorControl.Cluster.id,
        attribute: 'currentHue',
        value: h,
      });
      state.set(State.ColorSaturation, {
        clusterId: ColorControl.Cluster.id,
        attribute: 'currentSaturation',
        value: s,
      });
    }

    return state;
  }
}
