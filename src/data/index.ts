import { Region, Album, MapLocation } from '@/lib/types';
import siteConfig from './config.json';

// 自动扫描 regions/ 目录下所有 JSON，新增文件无需改此文件
const regionFiles = (require as any).context('./regions', false, /\.json$/);
const allRegions: Region[] = regionFiles.keys().map((k: string) => regionFiles(k));

export { siteConfig };

export const regions: Region[] = allRegions;

export const mapLocations: MapLocation[] = allRegions.map(r => ({
  id: r.id,
  name: r.name,
  coordinates: r.coordinates,
  mapCode: r.mapCode,
  photoCount: r.albums.reduce((sum: number, a: Album) => sum + a.photos.length, 0),
}));

// 已访问的国家（mapCode 不含 "-" 的，如 "KR"、"US"）
export const visitedCountries: string[] = [
  ...new Set(
    allRegions
      .map(r => r.mapCode)
      .filter(code => !code.includes('-'))
  )
];

// 已访问的中国省份（mapCode 以 "CN-" 开头的，转为 adcode）
const provinceAdcodeMap: Record<string, number> = {
  'CN-11': 110000, 'CN-12': 120000, 'CN-13': 130000, 'CN-14': 140000, 'CN-15': 150000,
  'CN-21': 210000, 'CN-22': 220000, 'CN-23': 230000,
  'CN-31': 310000, 'CN-32': 320000, 'CN-33': 330000, 'CN-34': 340000, 'CN-35': 350000,
  'CN-36': 360000, 'CN-37': 370000,
  'CN-41': 410000, 'CN-42': 420000, 'CN-43': 430000, 'CN-44': 440000, 'CN-45': 450000, 'CN-46': 460000,
  'CN-50': 500000, 'CN-51': 510000, 'CN-52': 520000, 'CN-53': 530000, 'CN-54': 540000,
  'CN-61': 610000, 'CN-62': 620000, 'CN-63': 630000, 'CN-64': 640000, 'CN-65': 650000,
  'CN-HK': 810000, 'CN-MO': 820000, 'CN-TW': 710000,
};

export const visitedProvinces: number[] = allRegions
  .map(r => r.mapCode)
  .filter(code => code.startsWith('CN-'))
  .map(code => provinceAdcodeMap[code])
  .filter(Boolean) as number[];
