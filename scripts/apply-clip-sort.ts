#!/usr/bin/env ts-node
/**
 * 应用 CLIP 排序到现有数据文件（JSON 格式）
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
    // 文件名空格转下划线，与 R2 路径保持一致
    return data.map(item => item.filename.replace('.webp', '.jpg').replace(/ /g, '_'));
  } catch (e) {
    console.log(`  警告: 读取 ${sortedFile} 失败:`, e);
    return null;
  }
}

function applyClipSort(regionId: string) {
  const regionFile = path.join(REGIONS_DIR, `${regionId}.json`);
  
  if (!fs.existsSync(regionFile)) {
    console.log(`未找到: ${regionFile}`);
    return;
  }
  
  console.log(`\n处理: ${regionId}`);
  
  const region: Region = JSON.parse(fs.readFileSync(regionFile, 'utf-8'));
  
  let modified = false;
  
  for (const album of region.albums) {
    const albumIdParts = album.id.split('-');
    if (albumIdParts.length < 2) continue;
    
    const albumPath = path.join(PHOTOS_DIR, albumIdParts[0], albumIdParts.slice(1).join('-'));
    
    const clipOrder = loadClipSortedOrder(albumPath);
    if (!clipOrder) continue;
    
    console.log(`  ✨ 重新排序: ${album.id} (${album.photos.length} 张)`);
    
    const photoMap = new Map<string, Photo>();
    for (const photo of album.photos) {
      const filename = path.basename(photo.src);
      photoMap.set(filename, photo);
    }
    
    const orderedPhotos: Photo[] = [];
    for (const filename of clipOrder) {
      const photo = photoMap.get(filename);
      if (photo) {
        orderedPhotos.push(photo);
        photoMap.delete(filename);
      }
    }
    
    // 添加未在排序中的照片（旧照片保持原位）
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
    fs.writeFileSync(regionFile, JSON.stringify(region, null, 2), 'utf-8');
    console.log(`✅ 已更新: ${regionFile}`);
  } else {
    console.log(`  无需更新`);
  }
}

// 主程序 - 自动扫描所有 JSON region 文件
console.log('🔄 应用 CLIP 排序到数据文件...');

const regions = fs.readdirSync(REGIONS_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace('.json', ''));

for (const regionId of regions) {
  applyClipSort(regionId);
}

console.log('\n🎉 完成!');
