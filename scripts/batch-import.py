#!/usr/bin/env python3
"""
批量处理所有照片文件夹：
1. 生成缩略图
2. 复制到网站目录
3. 转换 JSON 为网站格式
"""

import os
import json
import shutil
import re
from pathlib import Path

THUMBNAIL_WIDTH = 800
WEBP_QUALITY = 85

DESKTOP = Path.home() / "Desktop"
WEBSITE = Path("/Users/fkp/clawd/projects/photography-website")
PHOTOS_DIR = WEBSITE / "public" / "photos"
DATA_DIR = WEBSITE / "src" / "data"

# 地区配置（手动定义，避免 API 调用）
REGION_CONFIG = {
    "2024.02.04昆明三日游": {
        "id": "kunming",
        "name": {"zh": "昆明", "en": "Kunming"},
        "coordinates": [102.9395, 25.0920],
        "countryCode": "CN",
        "country": "china"
    },
    "2024.02.08 临海紫阳街_府城墙": {
        "id": "linhai",
        "name": {"zh": "临海", "en": "Linhai"},
        "coordinates": [121.1438, 28.8584],
        "countryCode": "CN",
        "country": "china"
    },
    "2024.03.29宣邦楼": {
        "id": "xuanbang",
        "name": {"zh": "宣邦楼", "en": "Xuanbang Lou"},
        "coordinates": [116.4, 39.9],  # 默认北京
        "countryCode": "CN",
        "country": "china"
    },
    "2024.04.05 都江堰": {
        "id": "dujiangyan",
        "name": {"zh": "都江堰", "en": "Dujiangyan"},
        "coordinates": [103.6117, 30.9988],
        "countryCode": "CN",
        "country": "china"
    },
    "2024.04.12 天津": {
        "id": "tianjin",
        "name": {"zh": "天津", "en": "Tianjin"},
        "coordinates": [117.2010, 39.0842],
        "countryCode": "CN",
        "country": "china"
    },
    "2024.05.01 香港": {
        "id": "hong-kong",
        "name": {"zh": "香港", "en": "Hong Kong"},
        "coordinates": [114.1694, 22.3193],
        "countryCode": "HK",
        "country": "china"
    },
    "2024.06.18 西雅图CVPR": {
        "id": "seattle",
        "name": {"zh": "西雅图", "en": "Seattle"},
        "coordinates": [-122.3321, 47.6062],
        "countryCode": "US",
        "country": "usa"
    },
    "2024.07.06兰州之行": {
        "id": "lanzhou",
        "name": {"zh": "兰州", "en": "Lanzhou"},
        "coordinates": [103.8343, 36.0611],
        "countryCode": "CN",
        "country": "china"
    },
    "2024.09.17 中秋烧烤大会": {
        "id": "chengdu",
        "name": {"zh": "成都", "en": "Chengdu"},
        "coordinates": [104.0668, 30.5728],
        "countryCode": "CN",
        "country": "china"
    },
    "2024.10.28毕棚沟之行": {
        "id": "bipengou",
        "name": {"zh": "毕棚沟", "en": "Bipengou"},
        "coordinates": [102.8, 31.9],  # 四川理县
        "countryCode": "CN",
        "country": "china"
    },
    "2024.12.27 新加坡之行": {
        "id": "singapore",
        "name": {"zh": "新加坡", "en": "Singapore"},
        "coordinates": [103.8198, 1.3521],
        "countryCode": "SG",
        "country": "singapore"
    },
    "2025.09.26 韩国之行": {
        "id": "korea",
        "name": {"zh": "韩国", "en": "South Korea"},
        "coordinates": [126.9780, 37.5665],  # 首尔
        "countryCode": "KR",
        "country": "korea"
    },
    "2025.11.11 JJ专辑 with Optimus": {
        "id": "chengdu",
        "name": {"zh": "成都", "en": "Chengdu"},
        "coordinates": [104.0668, 30.5728],
        "countryCode": "CN",
        "country": "china"
    }
}

def slugify(name: str) -> str:
    """转换为 URL 友好的 slug"""
    name = re.sub(r'[\s\-]+', '-', name)
    name = re.sub(r'[^\w\-]', '', name)
    return name.lower()

def extract_folder_id(folder_name: str) -> str:
    """从文件夹名提取 ID"""
    # 移除日期前缀
    name = re.sub(r'^\d{4}\.\d{2}\.\d{2}\s*', '', folder_name)
    # 移除后缀
    name = re.sub(r'(_|-)(之行|三日游|CVPR|之旅|with.*)?$', '', name)
    return slugify(name)

def process_folder(folder_path: Path):
    """处理单个文件夹"""
    folder_name = folder_path.name
    print(f"\n📁 {folder_name}")
    
    # 获取配置
    config = REGION_CONFIG.get(folder_name, {})
    if not config:
        print(f"   ⚠️  无配置信息，跳过")
        return None
    
    # 1. 查找 JSON 文件
    json_files = list(folder_path.glob("*-processed.json"))
    if not json_files:
        print(f"   ❌ 未找到 JSON 文件")
        return None
    
    json_file = json_files[0]
    print(f"   📄 找到 JSON: {json_file.name}")
    
    # 读取 JSON
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    photos = data.get('photos', [])
    print(f"   📷 共 {len(photos)} 张照片")
    
    if not photos:
        return None
    
    # 2. 创建目标目录（使用 folder_id 作为目录名）
    folder_id = extract_folder_id(folder_name)
    target_dir = PHOTOS_DIR / folder_id
    thumbs_dir = target_dir / "thumbs"
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    
    # 3. 复制原图
    for photo in photos:
        src_file = folder_path / photo['filename']
        if src_file.exists():
            dst_file = target_dir / photo['filename']
            if not dst_file.exists():
                shutil.copy2(src_file, dst_file)
    
    # 4. 复制/生成缩略图
    thumbs_source = folder_path / "thumbs"
    if thumbs_source.exists():
        for thumb in thumbs_source.glob("*.webp"):
            dst_thumb = thumbs_dir / thumb.name
            if not dst_thumb.exists():
                shutil.copy2(thumb, dst_thumb)
        print(f"   ✅ 缩略图已复制")
    else:
        print(f"   ⚠️  无缩略图")
    
    # 5. 生成网站数据（使用 folder_id 构建路径）
    album_id = f"{folder_id}-2024-{folder_name[:7].replace('.', '')}"
    
    region_data = {
        "id": config["id"],
        "name": config["name"],
        "coordinates": config["coordinates"],
        "countryCode": config["countryCode"],
        "country": config["country"],
        "albums": [{
            "id": album_id,
            "title": {"zh": folder_name, "en": folder_name},
            "cover": f"/photos/{folder_id}/thumbs/{photos[0]['thumbnail'].split('/')[-1]}",
            "date": photos[0].get('date', ''),
            "photos": []
        }]
    }
    
    # 转换照片数据（使用 folder_id 路径）
    for i, photo in enumerate(photos):
        filename = photo['filename']
        
        # 从原始 thumbnail 路径提取文件名
        original_thumb_name = photo.get('thumbnail', '').split('/')[-1]
        
        photo_data = {
            "id": f"{region_data['id']}-{i+1:03d}",
            "src": f"/photos/{folder_id}/{filename}",
            "thumbnail": f"/photos/{folder_id}/thumbs/{original_thumb_name}",
            "title": {"zh": "", "en": ""},
            "location": photo.get('location', {}),
            "caption": photo.get('caption'),
            "exif": {
                "camera": photo.get('exif', {}).get('camera', ''),
                "lens": photo.get('exif', {}).get('lens', ''),
                "iso": int(photo.get('exif', {}).get('iso', 0)) if photo.get('exif', {}).get('iso') and str(photo.get('exif', {}).get('iso')).isdigit() else 0,
                "aperture": photo.get('exif', {}).get('aperture', ''),
                "shutter": photo.get('exif', {}).get('shutter', '')
            },
            "width": photo.get('width', 0),
            "height": photo.get('height', 0),
            "date": photo.get('date', '')
        }
        
        region_data["albums"][0]["photos"].append(photo_data)
    
    print(f"   ✅ 转换完成: {len(region_data['albums'][0]['photos'])} 张照片")
    
    return region_data

def main():
    # 获取所有文件夹
    folders = [f for f in DESKTOP.iterdir() 
               if f.is_dir() and f.name.startswith('202') and f.name != 'test-extract']
    
    print(f"🔍 找到 {len(folders)} 个文件夹\n")
    
    all_regions = []
    
    for folder in sorted(folders):
        region = process_folder(folder)
        if region:
            all_regions.append(region)
    
    # 生成 data/regions.ts
    print(f"\n📝 生成网站数据文件...")
    
    ts_content = """// 摄影作品数据（自动生成）

import { Region } from '@/lib/types';
"""
    
    for region in all_regions:
        # 变量名不能有连字符，替换为下划线
        var_name = f"{region['id'].replace('-', '_')}Region"
        ts_content += f"""
export const {var_name}: Region = {json.dumps(region, ensure_ascii=False, indent=2)};
"""
    
    ts_content += """
export const regions: Region[] = [
"""
    
    for region in all_regions:
        var_name = f"{region['id'].replace('-', '_')}Region"
        ts_content += f"  {var_name},\n"
    
    ts_content += """];

// 已访问的国家代码列表
export const visitedCountries: string[] = Array.from(
  new Set(regions.map(r => r.countryCode))
);

// 已访问的中国省份 adcode 列表
export const visitedProvinces: number[] = regions
  .filter(r => r.countryCode === 'CN' && r.provinceCode)
  .map(r => r.provinceCode!);

// 地图标记点
import { MapLocation } from '@/lib/types';
export const mapLocations: MapLocation[] = regions.map(region => ({
  id: region.id,
  name: region.name,
  coordinates: region.coordinates,
  photoCount: region.albums.reduce((sum, album) => sum + album.photos.length, 0),
  countryCode: region.countryCode,
  provinceCode: region.provinceCode
}));
"""
    
    # 写入文件
    data_file = DATA_DIR / "photos.ts"
    with open(data_file, 'w', encoding='utf-8') as f:
        f.write(ts_content)
    
    print(f"\n✅ 完成！")
    print(f"   处理了 {len(all_regions)} 个地区")
    print(f"   数据文件: {data_file}")

if __name__ == "__main__":
    main()
