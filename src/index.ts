import { Matterbridge, PlatformConfig } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { MatterbridgeWizLanPlatform } from './platform.js';

export default function initializePlugin(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig): MatterbridgeWizLanPlatform {
  return new MatterbridgeWizLanPlatform(matterbridge, log, config);
}
