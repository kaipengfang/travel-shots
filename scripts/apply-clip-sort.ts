#!/usr/bin/env ts-node
/**
 * 应用 CLIP 排序到现有数据文件
 * 只调整照片顺序，保留所有原有信息
 */
import * as fs from 'fs';
import * as path from 'path';

const REGIONS_DIR = './src/data/regions';
const PHOTOS_DIR = './public/photos';

interface ClipSortItem {
  filename: string;
  path: string;
}

interface Photo {
  id: string;
  src: string;
  [key: string]: any;
}

interface Album {
  id: string;
  photos: Photo[];
  [key: string]: any;
}

interface Region {
  id: string;
  albums: Album[];
  [key: string]: any;
}

function loadClipSortedOrder(albumPath: string): string[] | null {
  const sortedFile = path.join(albumPath, 'clip_sorted.json');
  if (!fs.existsSync(sortedFile)) {
    return null;
  }
  
  try {
    const data: ClipSortItem[] = JSON.parse(fs.readFileSync(sortedFile, 'utf-8'));
    return data.map(item => item.filename.replace('.webp', '.jpg'));
  } catch (e) {
    console.log(`  警告: 读取 ${sortedFile} 失败:`, e);
    return null;
  }
}

function applyClipSort(regionId: string) {
  const regionFile = path.join(REGIONS_DIR, `${regionId}.ts`);
  
  if (!fs.existsSync(regionFile)) {
    console.log(`未找到: ${regionFile}`);
    return;
  }
  
  console.log(`\n处理: ${regionId}`);
  
  // 读取文件内容
  let content = fs.readFileSync(regionFile, 'utf-8');
  
  // 提取 export 的对象
  const exportMatch = content.match(/export const \w+Region: Region = ({[\s\S]+});/);
  if (!exportMatch) {
    console.log('  无法解析文件');
    return;
  }
  
  // 解析 JSON（移除尾部分号和注释）
  const jsonStr = exportMatch[1];
  const region: Region = eval(`(${jsonStr})`);
  
  let modified = false;
  
  // 处理每个相册
  for (const album of region.albums) {
    const albumIdParts = album.id.split('-');
    if (albumIdParts.length < 2) continue;
    
    const albumPath = path.join(PHOTOS_DIR, albumIdParts[0], albumIdParts.slice(1).join('-'));
    
    // 加载 CLIP 排序
    const clipOrder = loadClipSortedOrder(albumPath);
    if (!clipOrder) continue;
    
    console.log(`  ✨ 重新排序: ${album.id} (${album.photos.length} 张)`);
    
    // 建立 filename -> photo 映射
    const photoMap = new Map<string, Photo>();
    for (const photo of album.photos) {
      const filename = path.basename(photo.src);
      photoMap.set(filename, photo);
    }
    
    // 按照 clipOrder 重新排列
    const orderedPhotos: Photo[] = [];
    for (const filename of clipOrder) {
      const photo = photoMap.get(filename);
      if (photo) {
        orderedPhotos.push(photo);
        photoMap.delete(filename);
      }
    }
    
    // 添加未在排序中的照片
    for (const photo of photoMap.values()) {
      orderedPhotos.push(photo);
    }
    
    if (orderedPhotos.length !== album.photos.length) {
      console.log(`    警告: 照片数量不匹配 (${orderedPhotos.length} vs ${album.photos.length})`);
      continue;
    }
    
    album.photos = orderedPhotos;
    modified = true;
  }
  
  if (modified) {
    // 重新生成文件
    const newContent = `import { Region } from '@/lib/types';\n\nexport const ${regionId}Region: Region = ${JSON.stringify(region, null, 2)};\n`;
    fs.writeFileSync(regionFile, newContent, 'utf-8');
    console.log(`✅ 已更新: ${regionFile}`);
  } else {
    console.log(`  无需更新`);
  }
}

// 主程序
console.log('🔄 应用 CLIP 排序到数据文件...');

// 处理所有地区
const regions = ['usa', 'yunnan', 'zhejiang', 'sichuan', 'tianjin', 'gansu', 'hongkong', 'singapore', 'korea'];

for (const regionId of regions) {
  applyClipSort(regionId);
}

console.log('\n🎉 完成!');
