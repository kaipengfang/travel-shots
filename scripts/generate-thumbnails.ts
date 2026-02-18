#!/usr/bin/env npx ts-node

/**
 * 批量生成缩略图
 * 使用 sharp 将 JPG 转为 800px 宽的 WebP
 */

import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

const THUMBNAIL_WIDTH = 800;
const WEBP_QUALITY = 85;

async function generateThumbnail(inputPath: string, outputPath: string) {
  try {
    await sharp(inputPath)
      .resize(THUMBNAIL_WIDTH, null, { 
        withoutEnlargement: true,
        fit: 'inside'
      })
      .webp({ quality: WEBP_QUALITY })
      .toFile(outputPath);
    
    return true;
  } catch (error) {
    console.error(`❌ 处理失败 ${path.basename(inputPath)}:`, error);
    return false;
  }
}

async function processFolder(folderPath: string) {
  const thumbsDir = path.join(folderPath, 'thumbs');
  
  // 创建 thumbs 目录
  if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir, { recursive: true });
  }
  
  // 获取所有 JPG 文件
  const files = fs.readdirSync(folderPath)
    .filter(f => /\.(jpg|jpeg)$/i.test(f))
    .sort();
  
  console.log(`\n📁 ${path.basename(folderPath)}`);
  console.log(`   找到 ${files.length} 张照片\n`);
  
  let success = 0;
  let skipped = 0;
  
  for (const file of files) {
    const inputPath = path.join(folderPath, file);
    const outputFilename = file.replace(/\.(jpg|jpeg)$/i, '.webp');
    const outputPath = path.join(thumbsDir, outputFilename);
    
    // 跳过已存在的缩略图
    if (fs.existsSync(outputPath)) {
      console.log(`   ⏭️  ${file} (已存在)`);
      skipped++;
      continue;
    }
    
    const result = await generateThumbnail(inputPath, outputPath);
    
    if (result) {
      const inputSize = fs.statSync(inputPath).size;
      const outputSize = fs.statSync(outputPath).size;
      const ratio = ((1 - outputSize / inputSize) * 100).toFixed(1);
      
      console.log(`   ✅ ${file} → ${outputFilename} (压缩 ${ratio}%)`);
      success++;
    }
  }
  
  console.log(`\n   完成: ${success} 张, 跳过: ${skipped} 张\n`);
  
  return { success, skipped, total: files.length };
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('用法: npx ts-node generate-thumbnails.ts <文件夹路径>');
    console.log('示例: npx ts-node generate-thumbnails.ts ~/Desktop/2024.05.01\\ 香港');
    process.exit(1);
  }
  
  const folderPath = args[0];
  
  if (!fs.existsSync(folderPath)) {
    console.error(`❌ 文件夹不存在: ${folderPath}`);
    process.exit(1);
  }
  
  console.log('🖼️  开始生成缩略图...\n');
  console.log(`配置: ${THUMBNAIL_WIDTH}px 宽, WebP 质量 ${WEBP_QUALITY}`);
  
  const stats = await processFolder(folderPath);
  
  console.log('✨ 全部完成！');
  console.log(`   总计: ${stats.total} 张`);
  console.log(`   成功: ${stats.success} 张`);
  console.log(`   跳过: ${stats.skipped} 张`);
}

main().catch(console.error);
