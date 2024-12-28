import os from 'os';

export const getNetworks = () => {
  const records: Record<'address' | 'mac' | 'name', string>[] = [];
  const networkInterfaces = os.networkInterfaces();

  for (const name of Object.keys(networkInterfaces)) {
    if (!Array.isArray(networkInterfaces[name])) continue;

    for (const network of networkInterfaces[name]) {
      if (!network.internal && network.family === 'IPv4') {
        records.push({ address: network.address, mac: network.mac.toUpperCase().replace(/:+/g, ''), name });
      }
    }
  }

  return records;
};

export const hsColorToRgbw = (h: number, s: number): { r: number, g: number, b: number, w: number } => {
  const rawHsl = hsColorToHsl(h, s);
  if (rawHsl.l > 72.5) return { ...hslToRgb(h, rawHsl.s, 100 - rawHsl.l, true), w: 140 };

  const w = Math.round((rawHsl.l - 50) / 22.5 * 140);
  return { ...hslToRgb(rawHsl.h, rawHsl.s, rawHsl.l, true), w };
};

export const rgbwToHsColor = (r: number, g: number, b: number, w: number = 0): { h: number, s: number } => {
  const hsl = rgbToHsl(r, g, b);
  const adjustedLightness = w < 140
    ? 50 + (w / 140 * 22.5)
    : 100 - hsl.l;
  return hslToHsColor(hsl.h, hsl.s, adjustedLightness);
};

const hsColorToHsl = (h: number, s: number): { h: number, s: number, l: number } => {
  return {
    h: Math.max(0, Math.min(360, 360 * h / 254)),
    s: 100,
    l: 100 - (Math.max(0, Math.min(254, s)) / 254 * 50),
  };
};

const hslToHsColor = (h: number, s: number, l: number): { h: number, s: number } => {
  return {
    h: Math.max(0, Math.min(254, Math.round(254 * h / 360))),
    s: Math.round((100 - Math.max(50, Math.min(100, l))) / 50 * 254),
  };
};

const hue2rgb = (p: number, q: number, t: number) => {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
};

const hslToRgb = (h: number, s: number, l: number, round: boolean = false): { r: number, g: number, b: number } => {
  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return round ? {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  } : {
    r: r * 255,
    g: g * 255,
    b: b * 255,
  };
};

const rgbToHsl = (r: number, g: number, b: number, round: boolean = false): { h: number, s: number, l: number } => {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h! /= 6;
  }

  return round ? {
    h: Math.round(h! * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  } : {
    h: h! * 360,
    s: s * 100,
    l: l * 100,
  };
};