#!/usr/bin/env node
/**
 * 批量上传 WebP 到 R2 - 使用并发上传
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);

require('dotenv').config({ path: '.env.local' });

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;

// 查找所有 webp 文件
function findWebpFiles(dir, list = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findWebpFiles(fullPath, list);
    } else if (file.endsWith('.webp')) {
      list.push(fullPath);
    }
  }
  return list;
}

// 上传单个文件
async function upload(key, filePath) {
  const content = await readFile(filePath);
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: content,
    ContentType: 'image/webp',
  }));
  return key;
}

async function main() {
  const photosDir = path.join(__dirname, '../public/photos');
  const files = findWebpFiles(photosDir);
  
  console.log(`找到 ${files.length} 个 WebP 文件`);
  
  const uploads = files.map(async (file, i) => {
    // 从完整路径提取相对路径: /xxx/public/photos/region/album/xxx.webp -> photos/region/album/xxx.webp
    const relativePath = path.relative(path.join(__dirname, '../public'), file);
    const key = relativePath.replace(/^\\/, ''); // 移除前导斜杠
    
    await upload(key, file);
    console.log(`✅ [${i+1}/${files.length}] ${key}`);
    return key;
  });
  
  await Promise.all(uploads);
  console.log('\n🎉 全部完成！');
}

main().catch(console.error);
