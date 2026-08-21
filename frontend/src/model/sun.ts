import type { SunSettings } from './types';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface SunPosition {
  elevation: number; // degrees above horizon (negative = night)
  azimuth: number; // degrees clockwise from true north
}

/** Approximate solar position (declination + hour angle). Good to ~1° — plenty for a shadow study. */
export function sunPosition(s: SunSettings): SunPosition {
  const cumulative = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const dayOfYear = cumulative[s.month - 1] + s.day;
  const declination = rad(23.44) * Math.sin(rad((360 / 365) * (dayOfYear - 81)));
  const hourAngle = rad(15 * (s.hour - 12));
  const lat = rad(s.latitude);

  const sinEl = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
  const el = Math.asin(sinEl);
  const cosAz = (Math.sin(declination) - Math.sin(el) * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat));
  let az = Math.acos(Math.min(1, Math.max(-1, cosAz)));
  if (hourAngle > 0) az = 2 * Math.PI - az; // afternoon: sun in the west
  return { elevation: deg(el), azimuth: deg(az) };
}

/** Direction vector toward the sun in world space (x = east, y = up, -z = plan north). */
export function sunDirection(s: SunSettings, distance = 100): [number, number, number] {
  const { elevation, azimuth } = sunPosition(s);
  const el = rad(Math.max(elevation, -5));
  const az = rad(azimuth - s.northOffset);
  const horiz = Math.cos(el) * distance;
  // azimuth 0 = north (-z), 90 = east (+x)
  return [Math.sin(az) * horiz, Math.sin(el) * distance, -Math.cos(az) * horiz];
}
