#!/usr/bin/env python3
"""
从原始 processed.json 文件生成照片数据
保留完整的 EXIF、caption、location 等信息
"""
import os
import json
import re
from PIL import Image

PHOTOS_DIR = "./public/photos"
DATA_FILE = "./src/data/photos.ts"
ANNOTATOR_DIR = "../photo-annotator"

# ========== CDN 配置 ==========
PHOTO_CDN_BASE = "https://your-cdn.com"
USE_CDN = True  # True=云端路径，False=本地路径
# ==============================

# 原始文件夹到 processed.json 的映射
FOLDER_TO_JSON = {
    ("yunnan", "kunming"): "2024.02.04昆明三日游-processed.json",
    ("zhejiang", "linhai"): "2024.02.08 临海紫阳街_府城墙-processed.json",
    ("sichuan", "dujiangyan"): "2024.04.05 都江堰-processed.json",
    ("sichuan", "bipengou"): "2024.10.28毕棚沟之行-processed.json",
    ("sichuan", "chengdu_barbecue"): "2024.09.17 中秋烧烤大会-processed.json",
    ("tianjin", "tianjin"): "2024.04.12 天津-processed.json",
    ("gansu", "lanzhou"): "2024.07.06兰州之行-processed.json",
    ("hongkong", "hongkong"): "2024.05.01 香港-processed.json",
    ("usa", "seattle"): "2024.06.18 西雅图CVPR-processed.json",
    ("singapore", "singapore"): "2024.12.27 新加坡之行-processed.json",
    ("korea", "korea"): "2025.09.26 韩国之行-processed.json",
}

REGION_CONFIG = {
    "yunnan": {"name": {"zh": "云南", "en": "Yunnan"}, "coordinates": [101.0, 25.0], "countryCode": "CN"},
    "zhejiang": {"name": {"zh": "浙江", "en": "Zhejiang"}, "coordinates": [120.0, 30.0], "countryCode": "CN"},
    "sichuan": {"name": {"zh": "四川", "en": "Sichuan"}, "coordinates": [104.0, 31.0], "countryCode": "CN"},
    "tianjin": {"name": {"zh": "天津", "en": "Tianjin"}, "coordinates": [117.2, 39.1], "countryCode": "CN"},
    "gansu": {"name": {"zh": "甘肃", "en": "Gansu"}, "coordinates": [103.8, 36.1], "countryCode": "CN"},
    "hongkong": {"name": {"zh": "香港", "en": "Hong Kong"}, "coordinates": [114.2, 22.3], "countryCode": "CN"},
    "usa": {"name": {"zh": "美国", "en": "United States"}, "coordinates": [-122.3, 47.6], "countryCode": "US"},
    "singapore": {"name": {"zh": "新加坡", "en": "Singapore"}, "coordinates": [103.8, 1.4], "countryCode": "SG"},
    "korea": {"name": {"zh": "韩国", "en": "South Korea"}, "coordinates": [127.0, 37.6], "countryCode": "KR"},
}

ALBUM_NAMES = {
    ("yunnan", "kunming"): {"zh": "昆明", "en": "Kunming"},
    ("zhejiang", "linhai"): {"zh": "临海", "en": "Linhai"},
    ("sichuan", "dujiangyan"): {"zh": "都江堰", "en": "Dujiangyan"},
    ("sichuan", "bipengou"): {"zh": "毕棚沟", "en": "Bipengou"},
    ("sichuan", "chengdu_barbecue"): {"zh": "中秋烧烤", "en": "Mid-Autumn BBQ"},
    ("tianjin", "tianjin"): {"zh": "天津", "en": "Tianjin"},
    ("gansu", "lanzhou"): {"zh": "兰州", "en": "Lanzhou"},
    ("hongkong", "hongkong"): {"zh": "香港", "en": "Hong Kong"},
    ("usa", "seattle"): {"zh": "西雅图", "en": "Seattle"},
    ("usa", "rainier"): {"zh": "雷尼尔山", "en": "Mount Rainier"},
    ("usa", "washington"): {"zh": "华盛顿州", "en": "Washington State"},
    ("singapore", "singapore"): {"zh": "新加坡", "en": "Singapore"},
    ("korea", "korea"): {"zh": "韩国", "en": "South Korea"},
}

def load_original_json(region_id, album_id):
    """从原始 processed.json 加载照片元数据"""
    json_file = FOLDER_TO_JSON.get((region_id, album_id))
    if not json_file:
        return {}
    
    # 尝试多个可能的路径
    folder_name = json_file.replace('-processed.json', '')
    possible_paths = [
        os.path.join(ANNOTATOR_DIR, json_file),
        os.path.join(ANNOTATOR_DIR, f"../{folder_name}/{json_file}"),
        os.path.join(os.path.expanduser("~/Desktop"), folder_name, json_file),
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # 建立 filename -> photo 映射
                    photo_map = {}
                    for photo in data.get('photos', []):
                        filename = photo.get('filename', '')
                        photo_map[filename] = photo
                    return photo_map
            except Exception as e:
                print(f"  警告: 读取 {path} 失败: {e}")
                return {}
    
    print(f"  警告: 未找到 {json_file}")
    return {}

def load_clip_sorted_order(album_path):
    """加载 CLIP 排序结果"""
    sorted_file = os.path.join(album_path, "clip_sorted.json")
    if not os.path.exists(sorted_file):
        return None
    
    try:
        with open(sorted_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # 返回文件名列表（按排序顺序）
            return [item['filename'] for item in data]
    except Exception as e:
        print(f"  警告: 读取 {sorted_file} 失败: {e}")
        return None

def extract_exif(exif_dict):
    """提取 EXIF 数据"""
    if not exif_dict:
        return {"camera": "", "lens": "", "iso": 0, "aperture": "", "shutter": ""}
    
    iso = exif_dict.get('iso', 0)
    if isinstance(iso, str):
        try:
            iso = int(iso)
        except:
            iso = 0
    
    return {
        "camera": exif_dict.get('camera', ''),
        "lens": exif_dict.get('lens', ''),
        "iso": iso,
        "aperture": exif_dict.get('aperture', ''),
        "shutter": exif_dict.get('shutter', ''),
    }

regions = []

for region_id in sorted(os.listdir(PHOTOS_DIR)):
    region_path = os.path.join(PHOTOS_DIR, region_id)
    if not os.path.isdir(region_path):
        continue
    cfg = REGION_CONFIG.get(region_id)
    if not cfg:
        continue
    
    albums = []
    for album_id in sorted(os.listdir(region_path)):
        album_path = os.path.join(region_path, album_id)
        if not os.path.isdir(album_path):
            continue
        
        # 获取 webp 文件列表
        webp_photos = sorted([f for f in os.listdir(album_path) if f.endswith('.webp')])
        # 获取 jpg 文件列表
        jpg_photos = sorted([f for f in os.listdir(album_path) if f.endswith('.jpg')])
        
        # 尝试加载 CLIP 排序结果
        clip_order = load_clip_sorted_order(album_path)
        
        # 合并两种格式，使用 webp 作为基准
        all_photos = webp_photos
        if not webp_photos:
            all_photos = jpg_photos
        
        # 如果有 CLIP 排序结果，按照排序顺序重新排列
        if clip_order:
            print(f"  ✨ 使用 CLIP 排序")
            # 按照 clip_order 重新排列
            ordered_photos = []
            for filename in clip_order:
                if filename in all_photos:
                    ordered_photos.append(filename)
            # 添加未在排序中的照片（如果有）
            for photo in all_photos:
                if photo not in ordered_photos:
                    ordered_photos.append(photo)
            all_photos = ordered_photos
        
        if not all_photos:
            continue
        
        album_name = ALBUM_NAMES.get((region_id, album_id), {"zh": album_id, "en": album_id})
        print(f"{cfg['name']['zh']} > {album_name['zh']}: {len(all_photos)} 张")
        
        # 加载原始 JSON 数据
        original_data = load_original_json(region_id, album_id)
        
        album_photos = []
        for i, photo in enumerate(all_photos):
            # 从原始 JSON 获取元数据
            # 尝试匹配文件名
            jpg_name = photo.replace('.webp', '.jpg')
            
            original_photo = original_data.get(jpg_name) or original_data.get(photo)
            
            if original_photo:
                caption = original_photo.get('caption')
                location = original_photo.get('location')
                exif = extract_exif(original_photo.get('exif'))
                date = original_photo.get('date', '')
                width = original_photo.get('width', 800)
                height = original_photo.get('height', 600)
            else:
                caption = None
                location = album_name
                exif = {"camera": "", "lens": "", "iso": 0, "aperture": "", "shutter": ""}
                date = ""
                # 尝试读取实际图片尺寸
                try:
                    img_path = os.path.join(album_path, photo)
                    with Image.open(img_path) as img:
                        width, height = img.size
                except:
                    width = 800
                    height = 600
            
            # 根据配置选择路径前缀
            photo_base = f"{PHOTO_CDN_BASE}/photos" if USE_CDN else "/photos"
            
            album_photos.append({
                "id": f"{album_id}-{i+1:03d}",
                "src": f"{photo_base}/{region_id}/{album_id}/{jpg_name}",
                "thumbnail": f"{photo_base}/{region_id}/{album_id}/{photo}" if photo.endswith('.webp') else f"{photo_base}/{region_id}/{album_id}/{photo}",
                "title": {"zh": "", "en": ""},
                "location": location if location else album_name,
                "caption": caption,
                "exif": exif,
                "width": width,
                "height": height,
                "date": date
            })
        
        # 使用第一张照片作为封面
        first_photo = all_photos[0]
        photo_base = f"{PHOTO_CDN_BASE}/photos" if USE_CDN else "/photos"
        cover = f"{photo_base}/{region_id}/{album_id}/{first_photo}"
        
        albums.append({
            "id": f"{region_id}-{album_id}",
            "title": album_name,
            "cover": cover,
            "date": "",
            "photos": album_photos
        })
    
    if albums:
        regions.append({
            "id": region_id,
            "name": cfg['name'],
            "coordinates": cfg['coordinates'],
            "countryCode": cfg['countryCode'],
            "country": "china" if cfg['countryCode'] == 'CN' else "overseas",
            "albums": albums
        })

# 生成 TypeScript 文件
output = """// 摄影作品数据

import { Region, MapLocation } from '@/lib/types';

"""

for region in regions:
    output += f"export const {region['id']}Region: Region = {json.dumps(region, ensure_ascii=False, indent=2)};\n\n"

output += "export const regions: Region[] = [\n"
for region in regions:
    output += f"  {region['id']}Region,\n"
output += "];\n\n"

# 生成 mapLocations
output += "export const mapLocations: MapLocation[] = [\n"
for region in regions:
    total_photos = sum(len(album['photos']) for album in region['albums'])
    output += f"  {{ id: '{region['id']}', name: {json.dumps(region['name'])}, coordinates: {json.dumps(region['coordinates'])}, photoCount: {total_photos}, countryCode: '{region['countryCode']}' }},\n"
output += "];\n\n"

# 生成 visitedCountries 和 visitedProvinces
all_countries = set(r['countryCode'] for r in regions)
output += f"export const visitedCountries: string[] = {json.dumps(sorted(all_countries))};\n"

# 省份 adcode（需要手动维护或从 region 配置中读取）
# 中国省份 adcode
PROVINCE_CODES = {
    "yunnan": 530000,
    "zhejiang": 330000,
    "sichuan": 510000,
    "tianjin": 120000,
    "gansu": 620000,
    "hongkong": 810000,
}

province_codes = [PROVINCE_CODES[r["id"]] for r in regions if r["id"] in PROVINCE_CODES]
output += f"export const visitedProvinces: number[] = {province_codes};\n"

with open(DATA_FILE, 'w', encoding='utf-8') as f:
    f.write(output)

print(f"\n完成! {len(regions)} 个地区")
