#!/usr/bin/env python3
"""
将 photos.ts 拆分为各地区 JSON 文件
使用 json.JSONDecoder.raw_decode 直接解析，无需字符串转换
"""
import json
import os

root = os.path.join(os.path.dirname(__file__), '..')
src = os.path.join(root, 'src/data/photos.ts')
out_dir = os.path.join(root, 'src/data/regions')
os.makedirs(out_dir, exist_ok=True)

BASE_URL = 'https://your-cdn.com/photos/'

with open(src, 'r', encoding='utf-8') as f:
    content = f.read()

region_ids = ['gansu', 'hongkong', 'korea', 'sichuan', 'singapore', 'tianjin', 'usa', 'yunnan', 'zhejiang']
decoder = json.JSONDecoder()

def strip_base_url(obj):
    if isinstance(obj, str):
        return obj[len(BASE_URL):] if obj.startswith(BASE_URL) else obj
    if isinstance(obj, list):
        return [strip_base_url(i) for i in obj]
    if isinstance(obj, dict):
        return {k: strip_base_url(v) for k, v in obj.items()}
    return obj

for rid in region_ids:
    var_name = f'{rid}Region'
    marker = f'export const {var_name}: Region = '
    start = content.find(marker)
    if start == -1:
        print(f'❌ {rid}: marker not found')
        continue
    try:
        brace_start = content.index('{', start)
        data, _ = decoder.raw_decode(content, brace_start)
        data = strip_base_url(data)
        out_path = os.path.join(out_dir, f'{rid}.json')
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        photo_count = sum(len(a['photos']) for a in data['albums'])
        print(f'✅ {rid}.json — {len(data["albums"])} albums, {photo_count} photos')
    except Exception as e:
        print(f'❌ {rid}: {e}')

print('\nDone!')
