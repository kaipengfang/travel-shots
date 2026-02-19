#!/usr/bin/env python3
"""
CLIP 照片排序 - TSP + 最佳断点
1. TSP 求解得到环
2. 找相似度最低的边作为断点
3. 从断点开始排序，避免首尾割裂

流程：
- 扫描 public/photos/{region}/{album}/ 下的 webp 缩略图
- 若 region JSON 中有旧照片但本地没有 webp，从 R2 下载
- 所有照片统一 CLIP 排序后写回 region JSON
"""
import os
import json
import urllib.request
import urllib.parse
import boto3
import numpy as np
import torch
from PIL import Image
from sklearn.metrics.pairwise import cosine_similarity
import timm
from timm.data import resolve_data_config
from timm.data.transforms_factory import create_transform
from dotenv import load_dotenv

load_dotenv(".env.local")

MODEL_NAME = "vit_large_patch14_clip_336"

# R2 客户端（直接从 R2 下载，绕过 CDN 限制）
def get_r2_client():
    return boto3.client(
        's3',
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
        region_name='auto',
    )

def load_model():
    """加载 CLIP 模型"""
    print(f"📥 加载模型: {MODEL_NAME}")
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"   设备: {device}")
    
    model = timm.create_model(MODEL_NAME, pretrained=True, num_classes=0)
    model = model.to(device)
    model.eval()
    transform = create_transform(**resolve_data_config({}, model=model))
    
    print("✅ 模型加载完成")
    return model, transform, device

def extract_embeddings(model, transform, device, image_paths, batch_size=8):
    """提取图片特征向量"""
    embeddings = []
    total = len(image_paths)
    
    print(f"🔄 提取特征向量: {total} 张照片")
    
    for i in range(0, total, batch_size):
        batch_paths = image_paths[i:i+batch_size]
        batch_tensors = []
        
        for path in batch_paths:
            try:
                img = Image.open(path).convert('RGB')
                img_tensor = transform(img)
                batch_tensors.append(img_tensor)
            except:
                batch_tensors.append(None)
        
        valid_tensors = [t for t in batch_tensors if t is not None]
        
        if valid_tensors:
            batch = torch.stack(valid_tensors).to(device)
            with torch.no_grad():
                features = model(batch)
                features = features / features.norm(dim=-1, keepdim=True)
            
            idx = 0
            for t in batch_tensors:
                if t is not None:
                    embeddings.append(features[idx].cpu().numpy())
                    idx += 1
                else:
                    embeddings.append(np.zeros(768))
        else:
            for _ in batch_tensors:
                embeddings.append(np.zeros(768))
        
        if (i + batch_size) % 32 == 0 or (i + batch_size) >= total:
            print(f"  已处理 {min(i+batch_size, total)}/{total}")
    
    print("✅ 特征提取完成")
    return np.array(embeddings)

def tsp_nearest_neighbor(distance_matrix, start=0):
    """TSP 最近邻启发式算法"""
    n = len(distance_matrix)
    visited = [False] * n
    path = [start]
    visited[start] = True
    current = start
    
    while len(path) < n:
        min_dist = float('inf')
        next_node = -1
        
        for j in range(n):
            if not visited[j] and distance_matrix[current][j] < min_dist:
                min_dist = distance_matrix[current][j]
                next_node = j
        
        if next_node == -1:
            break
        
        visited[next_node] = True
        path.append(next_node)
        current = next_node
    
    return path

def two_opt(path, distance_matrix, max_iterations=100):
    """2-opt 局部优化"""
    n = len(path)
    improved = True
    iteration = 0
    
    while improved and iteration < max_iterations:
        improved = False
        
        for i in range(1, n - 1):
            for j in range(i + 1, n):
                current_dist = (
                    distance_matrix[path[i-1]][path[i]] +
                    distance_matrix[path[j]][path[(j+1) % n]]
                )
                
                new_dist = (
                    distance_matrix[path[i-1]][path[j]] +
                    distance_matrix[path[i]][path[(j+1) % n]]
                )
                
                if new_dist < current_dist:
                    path[i:j+1] = reversed(path[i:j+1])
                    improved = True
        
        iteration += 1
    
    return path

def find_best_breakpoint(path, distance_matrix):
    """
    找最佳断点：相似度最低的边
    从这里断开，避免首尾割裂
    """
    n = len(path)
    max_dist = -1
    best_breakpoint = 0
    
    print("🔄 寻找最佳断点...")
    
    # 遍历所有边（包括首尾连接）
    for i in range(n):
        j = (i + 1) % n
        dist = distance_matrix[path[i]][path[j]]
        
        if dist > max_dist:
            max_dist = dist
            best_breakpoint = j  # 从下一个位置开始
    
    similarity = 1 - max_dist
    print(f"  最佳断点: 位置 {best_breakpoint} (相似度 {similarity:.3f})")
    
    # 从断点重新排列
    new_path = path[best_breakpoint:] + path[:best_breakpoint]
    
    return new_path

def tsp_with_breakpoint(embeddings, image_paths):
    """
    TSP + 最佳断点
    """
    n = len(embeddings)
    
    # 1. 计算相似度矩阵
    print("🔄 计算相似度矩阵...")
    sim_matrix = cosine_similarity(embeddings)
    distance_matrix = 1 - sim_matrix
    
    # 2. 找最相似的一对作为起点
    max_sim = -1
    start = 0
    for i in range(n):
        for j in range(i+1, n):
            if sim_matrix[i][j] > max_sim:
                max_sim = sim_matrix[i][j]
                start = i
    
    print(f"  起点: 照片 {start} (最高相似度 {max_sim:.3f})")
    
    # 3. TSP 最近邻
    print(f"🔄 TSP 最近邻算法...")
    path = tsp_nearest_neighbor(distance_matrix, start)
    
    if len(path) % 10 == 0:
        print(f"  已访问 {len(path)}/{n}")
    
    # 4. 2-opt 优化
    print(f"🔄 2-opt 局部优化...")
    path = two_opt(path, distance_matrix)
    print(f"✅ 优化完成")
    
    # 5. 找最佳断点
    path = find_best_breakpoint(path, distance_matrix)
    
    # 6. 计算统计
    total_dist = sum(distance_matrix[path[i]][path[i+1]] for i in range(len(path)-1))
    avg_dist = total_dist / (len(path) - 1)
    avg_sim = 1 - avg_dist
    
    # 首尾相似度
    first_last_sim = sim_matrix[path[0]][path[-1]]
    
    print(f"✅ TSP 完成")
    print(f"  平均相邻相似度: {avg_sim:.3f}")
    print(f"  首尾相似度: {first_last_sim:.3f}")
    
    return [image_paths[i] for i in path]

def download_webp_if_missing(photo, local_dir, r2_client):
    """如果本地没有 webp 缩略图，从 R2 直接下载"""
    thumbnail = photo.get('thumbnail', '')
    if not thumbnail:
        return None
    filename = os.path.basename(thumbnail).replace(' ', '_')
    local_path = os.path.join(local_dir, filename)
    if os.path.exists(local_path):
        return local_path
    # R2 key = photos/{thumbnail}（thumbnail 已是相对路径如 hongkong/hongkong/xxx.webp）
    r2_key = f"photos/{thumbnail}"
    try:
        r2_client.download_file(os.environ['R2_BUCKET_NAME'], r2_key, local_path)
        print(f"  ⬇️ 下载: {filename}")
        return local_path
    except Exception as e:
        print(f"  ⚠️ 下载失败 {filename}: {e}")
        return None


def apply_sort_to_region(region_id, album_id, local_dir, model, transform, device, r2_client):
    """
    下载旧照片 webp（如缺失），对所有照片统一 CLIP 排序后写回 region JSON。

    两种情况：
    1. 新建相册：region JSON 或相册不存在，跳过（数据由上传脚本负责写入）
    2. 已有相册：下载缺失的旧照片 webp，与新照片一起统一排序
    """
    region_file = os.path.join("./src/data/regions", f"{region_id}.json")
    if not os.path.exists(region_file):
        print(f"  ℹ️ {region_file} 不存在，跳过（新 region 请先用上传脚本生成 JSON）")
        return

    with open(region_file, 'r', encoding='utf-8') as f:
        region = json.load(f)

    album = next((a for a in region['albums'] if a['id'] == f"{region_id}-{album_id}"), None)
    if not album:
        print(f"  ℹ️ 相册 {region_id}-{album_id} 不存在，跳过（新相册请先用上传脚本生成 JSON）")
        return

    # 下载旧照片缺失的 webp
    print(f"  🔍 检查旧照片缩略图（共 {len(album['photos'])} 张）...")
    for photo in album['photos']:
        download_webp_if_missing(photo, local_dir, r2_client)

    # 重新扫描本地所有 webp
    all_webp = sorted([f for f in os.listdir(local_dir) if f.endswith('.webp')])
    if not all_webp:
        print(f"  ⚠️ 没有可用的 webp 文件，跳过")
        return

    print(f"  📊 共 {len(all_webp)} 张参与排序")
    image_paths = [os.path.join(local_dir, f) for f in all_webp]

    # 提取特征 + TSP 排序
    embeddings = extract_embeddings(model, transform, device, image_paths)
    sorted_paths = tsp_with_breakpoint(embeddings, image_paths)
    sorted_filenames = [os.path.basename(p).replace('.webp', '.jpg') for p in sorted_paths]

    # 按排序重排 album photos
    photo_map = {os.path.basename(p['src']).replace(' ', '_'): p for p in album['photos']}
    ordered = []
    for fname in sorted_filenames:
        fname_normalized = fname.replace(' ', '_')
        if fname_normalized in photo_map:
            ordered.append(photo_map.pop(fname_normalized))
    # 未匹配的追加（理论上不应有）
    ordered.extend(photo_map.values())

    album['photos'] = ordered

    with open(region_file, 'w', encoding='utf-8') as f:
        json.dump(region, f, ensure_ascii=False, indent=2)

    print(f"✅ 已更新: {region_file}")


def main():
    PHOTOS_DIR = "./public/photos"
    
    # 所有相册
    albums = []
    
    # 遍历所有地区和相册
    for region_id in sorted(os.listdir(PHOTOS_DIR)):
        region_path = os.path.join(PHOTOS_DIR, region_id)
        if not os.path.isdir(region_path):
            continue
        
        for album_id in sorted(os.listdir(region_path)):
            album_path = os.path.join(region_path, album_id)
            if not os.path.isdir(album_path):
                continue
            
            # 检查是否有 webp 文件
            webp_files = [f for f in os.listdir(album_path) if f.endswith('.webp')]
            if webp_files:
                albums.append((region_id, album_id, f"{region_id}/{album_id}"))
    
    print(f"发现 {len(albums)} 个相册\n")
    
    # 加载模型 + R2 客户端
    model, transform, device = load_model()
    r2_client = get_r2_client()
    
    for region_id, album_id, album_path in albums:
        full_path = os.path.join(PHOTOS_DIR, album_path)
        if not os.path.exists(full_path):
            continue
        
        print(f"\n🖼️ 处理: {region_id} - {album_id}")
        apply_sort_to_region(region_id, album_id, full_path, model, transform, device, r2_client)
    
    print("\n🎉 全部完成!")

if __name__ == "__main__":
    main()
