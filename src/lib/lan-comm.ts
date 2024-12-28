import EventEmitter from 'events';
import dgram, { RemoteInfo } from 'dgram';
import { AnsiLogger } from 'matterbridge/logger';
import { ColorControl, LevelControl, OnOff, PlatformConfig } from 'matterbridge';
import { setTimeout as asyncTimeout } from 'timers/promises';
import { Dict } from './types.js';
import { getNetworks } from './utils.js';

const INCOMING_PORT = 38900;
const OUTGOING_PORT = 38899;

export class LanComm extends EventEmitter {
  readonly #sockets: Map<number, dgram.Socket> = new Map();
  readonly #log: AnsiLogger;
  #running: boolean = false;
  readonly #discovered: Map<string, Dict> = new Map();
  readonly #mac: string;
  readonly #address: string;

  constructor(config: PlatformConfig, log: AnsiLogger) {
    super();

    const networks = getNetworks();

    this.#address = networks[0].address;
    this.#mac = networks[0].mac;

    if (config.bindTo) {
      for (const network of networks) {
        if (network.address === config.bindTo) {
          this.#address = network.address;
          this.#mac = network.mac;
          break;
        }
      }
    }

    this.#log = log;

    this.#log.info('[LanComm] Initialized on network: ' + this.#address + ' (' + this.#mac + ')');

    setInterval(() => {
      this.#sendRegistration();
    }, 24000);
  }

  async start(options: { clear?: boolean } = {}) {
    if (options.clear) {
      this.removeAllListeners();
      this.#discovered.clear();
    }

    this.#running = true;
    this.#start(INCOMING_PORT);
    await this.#onDgramBind(INCOMING_PORT);

    this.#start(OUTGOING_PORT);

    return this;
  }

  stop() {
    this.#running = false;

    this.#stop(OUTGOING_PORT);
    this.#stop(INCOMING_PORT);

    return this;
  }

  end() {
    this.stop();

    process.nextTick(() => {
      this.removeAllListeners();
      this.#discovered.clear();
      this.#log.info('[LanComm] Ended.');
      this.emit('end');
    });

    return this;
  }

  setState(mac: string, params: Dict) {
    const device = this.#discovered.get(mac);
    if (!device?.address) return;

    this.#send({
      method: 'setPilot',
      env: 'pro',
      params: {
        src: 'mb',
        ...params,
      },
    }, device.address);
  }

  getState(mac: string) {
    return this.#discovered.get(mac)?.state;

  }

  #start(port: number) {
    this.#stop(port);

    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    this.#sockets.set(port, socket);

    socket.on('error', this.#onDgramError.bind(this, port));
    socket.on('close', this.#onDgramClose.bind(this, port));
    socket.on('message', this.#onDgramMessage.bind(this, port));

    socket.bind(port, () => {
      if (!socket) return;

      this.#log.debug(`[${(new Date()).toLocaleTimeString('en-US')}] [LanComm] Socket created on port ${port}`);

      if (port === OUTGOING_PORT) {
        socket.setBroadcast(true);
        this.#sendRegistration(true);
      }
    });
  }

  #stop(port: number) {
    this.#sockets.get(port)?.removeAllListeners();
    this.#sockets.get(port)?.close();
    this.#sockets.delete(port);
  }

  #send(payload: any, destination?: string) {
    const socket = this.#sockets.get(OUTGOING_PORT);
    if (!socket) {
      this.#log.error('[LanComm] No socket to send.');
      return;
    }

    if (destination) {
      this.#log.debug(`[${(new Date()).toLocaleTimeString('en-US')}] [LanComm] Sending UDP to ${destination} > ${JSON.stringify(payload)}`);
    } else {
      this.#log.debug(`[${(new Date()).toLocaleTimeString('en-US')}] [LanComm] Broadcasting UDP > ${JSON.stringify(payload)}`);
    }
    socket.send(JSON.stringify(payload), OUTGOING_PORT, destination || '255.255.255.255');
  }

  #sendRegistration(register: boolean = true) {
    if (!this.#running) return;

    this.#send({
      method: 'registration',
      params: {
        register,
        phoneMac: this.#mac,
        phoneIp: this.#address,
      },
    });
  }

  #onDgramError(port: number, err: any) {
    this.#stop(port);

    if (err && err.code === 'EADDRINUSE') {
      this.#log.error(`[LanComm] Port ${port} is in use. Will retry in 15 seconds.`);

      setTimeout(() => {
        this.#start(port);
      }, 15000);
    } else {
      this.#log.error(`[LanComm] Port ${port} failed:\n${err.stack}`);
    }
  }

  #onDgramClose(port: number) {
    this.#stop(port);

    this.#log.warn(`[${(new Date()).toLocaleTimeString('en-US')}] [LanComm] Port ${port} closed.${this.#running ? ' Restarting...' : ''}`);
    if (this.#running)
      setTimeout(() => {
        this.#start(port);
      }, 1000);
  }

  #onDgramMessage(port: number, msg: Buffer, info: RemoteInfo) {
    if (info.address === this.#address) return;
    let data: any;
    const _msg = msg.toString('utf8');
    this.#log.debug(`[${(new Date()).toLocaleTimeString('en-US')}] [LanComm] UDP from ${info.address}:${port} > ${msg}`);

    try {
      data = JSON.parse(_msg);
    } catch (ex) {
      this.#log.warn('Failed to parse JSON from UDP message.');
      return;
    }

    const payload: Dict = data.result || data.params;
    const mac = payload?.mac;
    const discoveredDevice: Dict = mac && this.#discovered.get(mac);

    if (!discoveredDevice) {
      switch (data.method) {
        case 'registration':
          this.#send({
              method: 'getSystemConfig',
              params: {},
            }, info.address,
          );
          break;

        case 'getSystemConfig':
          if (!payload?.moduleName) return;

          this.#discovered.set(mac, {
            address: info.address,
            moduleName: payload.moduleName,
            fwVersion: payload.fwVersion,
            ...this.#getDeviceType(data.result.moduleName),
          });
          this.#send({ method: 'getPilot', params: {} }, info.address);
          break;
      }
    } else if (data.method === 'syncPilot' || data.method === 'getPilot') {
      if (!payload) return;

      delete payload.mac;
      delete payload.rssi;
      delete payload.src;
      delete payload.sceneId;
      delete payload.mqttCd;
      delete payload.ts;

      if (!discoveredDevice.created) {
        discoveredDevice.created = true;
        discoveredDevice.state = payload;
        this.emit('discover', mac, discoveredDevice);
      } else {
        const changes = this.#getChanges(discoveredDevice.state, payload);
        if (changes) {
          discoveredDevice.state = payload;
          this.emit('stateChange', mac, changes, payload);
        }
      }
    }
  }

  async #onDgramBind(port: number) {
    do {
      try {
        // @ts-ignore
        this.#sockets.get(port).address();
        return;
      } catch (ex: any) {
      }

      await asyncTimeout(1000);
    } while (true);
  }

  #getDeviceType(moduleName: string) {
    if (moduleName.includes('SHRGB')) return {
      name: 'Wiz RGB Bulb',
      features: [OnOff.Feature.Lighting, LevelControl.Feature.Lighting, ColorControl.Feature.HueSaturation, ColorControl.Feature.ColorTemperature],
    };
    if (moduleName.includes('MHWRGB')) return {
      name: 'Wiz LED Strip',
      features: [OnOff.Feature.Lighting, LevelControl.Feature.Lighting, ColorControl.Feature.HueSaturation, ColorControl.Feature.ColorTemperature],
    };
    if (moduleName.includes('DHRGB')) return {
      name: 'Wiz Floor Lamp',
      features: [OnOff.Feature.Lighting, LevelControl.Feature.Lighting, ColorControl.Feature.HueSaturation, ColorControl.Feature.ColorTemperature],
    };
    if (moduleName.includes('SHTW')) return {
      name: 'Wiz Tunable White Bulb',
      features: [OnOff.Feature.Lighting, LevelControl.Feature.Lighting, ColorControl.Feature.ColorTemperature],
    };
    if (moduleName.includes('SHDW')) return {
      name: 'Wiz Dimmable White Bulb',
      features: [OnOff.Feature.Lighting, LevelControl.Feature.Lighting],
    };
    if (moduleName.includes('SOCKET')) return { name: 'Wiz Outlet', features: [OnOff.Feature.Lighting] };
    return {};
  }

  #areDifferent(obj1: Dict, obj2: Dict) {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return true;
    if (keys1.length === 0) return false;

    for (const key of keys1)
      if (obj1[key] !== obj2[key]) return true;

    return false;
  }

  #getChanges(obj1: Dict, obj2: Dict): Dict | undefined {
    const changes: Dict = {};
    let hasChanges = false;

    for (const key in obj2) {
      if (!(key in obj1) || obj1[key] !== obj2[key]) {
        changes[key] = obj2[key];
        hasChanges = true;
      }
    }

    if ('r' in changes || 'g' in changes || 'b' in changes || 'w' in changes) {
      changes.r = obj2.r;
      changes.g = obj2.g;
      changes.b = obj2.b;
      changes.w = obj2.w;
    }

    /*
    for (const key in obj1) {
      if (!(key in obj2)) {
        changes[key] = undefined;
        hasChanges = true;
      }
    }
     */

    return hasChanges ? changes : undefined;
  }
}
