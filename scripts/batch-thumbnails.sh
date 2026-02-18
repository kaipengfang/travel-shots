#!/bin/bash
# 批量生成所有文件夹的缩略图

DESKTOP=~/Desktop
WEBSITE=/Users/fkp/clawd/projects/photography-website

# 需要处理的文件夹列表
FOLDERS=(
    "2024.02.04昆明三日游"
    "2024.02.08 临海紫阳街_府城墙"
    "2024.03.29宣邦楼"
    "2024.04.05 都江堰"
    "2024.04.12 天津"
    "2024.05.01 香港"
    "2024.06.18 西雅图CVPR"
    "2024.07.06兰州之行"
    "2024.09.17 中秋烧烤大会"
    "2024.10.28毕棚沟之行"
    "2024.12.27 新加坡之行"
    "2025.09.26 韩国之行"
)

cd $WEBSITE

for folder in "${FOLDERS[@]}"; do
    echo ""
    echo "========================================"
    echo "处理: $folder"
    echo "========================================"
    npx ts-node scripts/generate-thumbnails.ts "$DESKTOP/$folder"
done

echo ""
echo "========================================"
echo "✅ 全部完成！"
echo "========================================"
