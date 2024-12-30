import type { ClusterId } from 'matterbridge';

export type Dict = { [key: string]: any };
export type StateMap = Map<string, { clusterId: ClusterId, attribute: string, value: any }>;

export enum State {
  OnOff = 'OnOff',
  LightLevel = 'LightLevel',
  ColorTemperature = 'ColorTemperature',
  ColorHue = 'ColorHue',
  ColorSaturation = 'ColorSaturation',
}