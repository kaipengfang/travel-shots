#!/usr/bin/env node

/**
 * 上传照片到 Cloudflare R2
 * 
 * 使用前配置环境变量：
 * export R2_ACCOUNT_ID="你的账户ID"
 * export R2_ACCESS_KEY_ID="你的Access Key"
 * export R2_SECRET_ACCESS_KEY="你的Secret Key"
 * export R2_BUCKET_NAME="photography-images"
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { lookup } from 'mime-types';

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'photography-images';

if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
  console.error('❌ 缺少环境变量，请设置：');
  console.error('   R2_ACCOUNT_ID');
  console.error('   R2_ACCESS_KEY_ID');
  console.error('   R2_SECRET_ACCESS_KEY');
  process.exit(1);
}

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

const PHOTOS_DIR = join(process.cwd(), 'public/photos');

// 递归获取所有 jpg 文件
function getAllJpgFiles(dir, fileList = []) {
  const files = readdirSync(dir);
  
  files.forEach(file => {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    
    if (stat.isDirectory()) {
      getAllJpgFiles(filePath, fileList);
    } else if (file.endsWith('.jpg')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

async function uploadFile(filePath) {
  const relativePath = relative(PHOTOS_DIR, filePath);
  const key = `photos/${relativePath}`;
  
  try {
    // 先检查是否已存在（断点续传）
    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      }));
      console.log(`⏭️  ${key} (已存在，跳过)`);
      return { success: true, key, size: 0, skipped: true };
    } catch (headError) {
      // 文件不存在，继续上传
    }
    
    const fileContent = readFileSync(filePath);
    const contentType = lookup(filePath) || 'image/jpeg';
    
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    
    const sizeMB = (fileContent.length / 1024 / 1024).toFixed(2);
    console.log(`✅ ${key} (${sizeMB} MB)`);
    
    return { success: true, key, size: fileContent.length };
  } catch (error) {
    console.error(`❌ ${relativePath}: ${error.message}`);
    return { success: false, key, error: error.message };
  }
}

async function main() {
  console.log('🔍 扫描照片目录...');
  const jpgFiles = getAllJpgFiles(PHOTOS_DIR);
  
  console.log(`📸 找到 ${jpgFiles.length} 张 JPG 照片\n`);
  
  const results = [];
  let uploaded = 0;
  let skipped = 0;
  let totalSize = 0;
  
  for (const file of jpgFiles) {
    const result = await uploadFile(file);
    results.push(result);
    
    if (result.success) {
      if (result.skipped) {
        skipped++;
      } else {
        uploaded++;
        totalSize += result.size;
      }
    }
  }
  
  console.log('\n📊 上传完成：');
  console.log(`   新上传：${uploaded} 张`);
  console.log(`   已存在：${skipped} 张`);
  console.log(`   总计：${uploaded + skipped} / ${jpgFiles.length}`);
  console.log(`   新增大小：${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
  
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    console.log('\n❌ 失败列表：');
    failed.forEach(f => console.log(`   ${f.key}: ${f.error}`));
  }
}

main().catch(console.error);
