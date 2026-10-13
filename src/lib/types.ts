// 照片数据类型定义

export interface Photo {
  id: string;
  /** 原图（可能很大，仅用于下载/兜底） */
  src: string;
  /** 瀑布流缩略图 */
  thumbnail: string;
  /** 灯箱用的中等尺寸图（约 2560px 宽），缺省时回退到 src */
  large?: string;
  title: {
    zh: string;
    en: string;
  };
  location: {
    zh: string;
    en: string;
  };
  caption?: {
    zh: string;
    en: string;
  } | null;
  exif?: {
    camera: string;
    lens: string;
    iso: number;
    aperture: string;
    shutter: string;
  };
  width: number;
  height: number;
  date: string;
}

export interface Album {
  id: string;
  title: {
    zh: string;
    en: string;
  };
  cover: string;
  date: string;
  photos: Photo[];
}

export interface Region {
  id: string;
  name: {
    zh: string;
    en: string;
  };
  coordinates: [number, number]; // [经度, 纬度]
  mapCode: string; // ISO 3166-2，如 "KR"、"US"、"CN-51"（四川）、"CN-HK"（香港）
  albums: Album[];
}

// 地图标记点
export interface MapLocation {
  id: string;
  name: { zh: string; en: string };
  coordinates: [number, number];
  photoCount: number;
  mapCode: string;
}
