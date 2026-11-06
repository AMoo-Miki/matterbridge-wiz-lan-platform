import type { PlatformMatterbridge, PlatformConfig } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { MatterbridgeWizLanPlatform } from './platform.js';

export default function initializePlugin(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: PlatformConfig): MatterbridgeWizLanPlatform {
  return new MatterbridgeWizLanPlatform(matterbridge, log, config);
}
