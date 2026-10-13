// 照片数据类型定义

export interface Photo {
  id: string;
  /**
   * 原图路径。只在数据生成阶段使用；一旦生成了 large/xlarge，
   * 前端数据层会把它剥掉，避免把无水印原片暴露给浏览器。
   */
  src?: string;
  /** 瀑布流缩略图（800px webp） */
  thumbnail: string;
  /** 灯箱 2048px webp */
  large?: string;
  /** 灯箱 3840px webp，4K 屏使用 */
  xlarge?: string;
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
  /** 可选：手动指定用于缩略展示的照片 id（通常 3 张），不填则自动挑选 */
  highlights?: string[];
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
