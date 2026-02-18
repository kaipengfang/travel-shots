const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Configure R2 client
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

// Find all webp files recursively
function findWebpFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findWebpFiles(filePath, fileList);
    } else if (file.endsWith('.webp')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Upload a single file to R2
async function uploadFile(localPath) {
  // Convert local path to R2 key
  // /Users/.../public/photos/usa/seattle/image.webp -> photos/usa/seattle/image.webp
  const key = localPath.includes('public/photos/') 
    ? localPath.split('public/')[1]
    : localPath.replace(/^public\//, '');
  
  try {
    const fileContent = await readFile(localPath);
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: 'image/webp',
    });
    
    await r2Client.send(command);
    return { success: true, key, localPath };
  } catch (error) {
    return { success: false, key, localPath, error: error.message };
  }
}

// Main upload function
async function uploadAllWebp() {
  console.log('🔍 Finding all webp files...');
  const photosDir = path.join(__dirname, '../public/photos');
  const webpFiles = findWebpFiles(photosDir);
  
  console.log(`📦 Found ${webpFiles.length} webp files`);
  console.log(`🚀 Starting upload to R2 bucket: ${BUCKET_NAME}\n`);
  
  const results = {
    total: webpFiles.length,
    success: 0,
    failed: 0,
    errors: [],
  };
  
  // Upload files with progress
  for (let i = 0; i < webpFiles.length; i++) {
    const file = webpFiles[i];
    const result = await uploadFile(file);
    
    if (result.success) {
      results.success++;
      console.log(`✅ [${i + 1}/${webpFiles.length}] ${result.key}`);
    } else {
      results.failed++;
      results.errors.push(result);
      console.log(`❌ [${i + 1}/${webpFiles.length}] ${result.key} - ${result.error}`);
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Upload Summary:');
  console.log('='.repeat(60));
  console.log(`Total files:    ${results.total}`);
  console.log(`✅ Successful:  ${results.success}`);
  console.log(`❌ Failed:      ${results.failed}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Failed uploads:');
    results.errors.forEach(err => {
      console.log(`  - ${err.key}: ${err.error}`);
    });
  }
  
  console.log('\n✨ Upload complete!');
  console.log(`🌐 Files accessible at: https://photos.fangkaipeng.com/photos/{region}/{album}/*.webp`);
}

// Run the upload
uploadAllWebp().catch(console.error);
