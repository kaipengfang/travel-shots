#!/usr/bin/env node
/**
 * 通用照片上传脚本
 *
 * 用法：
 *   node upload-photos.mjs \
 *     --dir "/path/to/photos" \
 *     --region hongkong \
 *     --album hongkong \
 *     --processed "/path/to/processed.json" \
 *     [--new-region] \
 *     [--region-name-zh "香港"] \
 *     [--region-name-en "Hong Kong"] \
 *     [--coordinates "114.2,22.3"] \
 *     [--map-code "CN-HK"] \
 *     [--album-title-zh "香港"] \
 *     [--album-title-en "Hong Kong"] \
 *     [--album-date "2026-02-07"]
 *
 * 参数说明：
 *   --dir           本地照片目录（含 jpg 原图，thumbs/ 子目录含 webp 缩略图）
 *   --region        地区 ID（如 hongkong、macau）
 *   --album         相册 ID（如 hongkong、2026）→ 最终 album.id = {region}-{album}
 *   --processed     photo-annotator 导出的 processed.json 路径
 *   --new-region    新建 region（region JSON 不存在时必须加此参数）
 *   --region-name-zh/en  新 region 的中英文名（--new-region 时必填）
 *   --coordinates   新 region 坐标，格式 "lng,lat"（--new-region 时必填）
 *   --map-code      新 region 地图代码（--new-region 时必填）
 *   --album-title-zh/en  相册标题（默认同 region 名）
 *   --album-date    相册日期（默认取照片中最早日期）
 *
 * 示例（已有相册追加）：
 *   node upload-photos.mjs \
 *     --dir ~/Desktop/20260207香港之行 \
 *     --region hongkong --album hongkong \
 *     --processed ~/Desktop/20260207香港之行/processed.json
 *
 * 示例（新建 region + 相册）：
 *   node upload-photos.mjs \
 *     --dir ~/Desktop/20260210澳门之行 \
 *     --region macau --album macau \
 *     --processed ~/Desktop/20260210澳门之行/processed.json \
 *     --new-region \
 *     --region-name-zh 澳门 --region-name-en Macau \
 *     --coordinates "113.5,22.2" --map-code CN-MO
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, basename, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 读取 .env.local ──────────────────────────────────────────
const envPath = join(__dirname, '..', '.env.local');
const env = readFileSync(envPath, 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = env.R2_BUCKET_NAME;
const DATA_DIR = join(__dirname, '..', 'src', 'data', 'regions');

// ── 解析命令行参数 ────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        opts[key] = args[++i];
      } else {
        opts[key] = true; // flag
      }
    }
  }
  return opts;
}

// ── 工具函数 ─────────────────────────────────────────────────
function sanitize(filename) {
  return filename.replace(/\s+/g, '_');
}

async function fileExistsOnR2(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch { return false; }
}

async function uploadFile(localPath, r2Key, contentType) {
  if (await fileExistsOnR2(r2Key)) {
    console.log(`  ⏭ 已存在: ${r2Key}`);
    return false;
  }
  const body = readFileSync(localPath);
  await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: r2Key, Body: body, ContentType: contentType }));
  console.log(`  ✅ 上传: ${r2Key}`);
  return true;
}

// ── 上传目录下的原图和缩略图 ──────────────────────────────────
async function uploadFolder(localDir, r2Prefix) {
  const files = readdirSync(localDir).filter(f =>
    !f.startsWith('.') && !f.endsWith('.json') && f !== 'thumbs'
  );
  let uploaded = 0, skipped = 0;

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue;
    const contentType = ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const result = await uploadFile(join(localDir, file), `${r2Prefix}/${sanitize(file)}`, contentType);
    result ? uploaded++ : skipped++;
  }

  // 上传 thumbs/ 子目录的 webp
  const thumbsDir = join(localDir, 'thumbs');
  if (existsSync(thumbsDir)) {
    for (const file of readdirSync(thumbsDir).filter(f => f.endsWith('.webp'))) {
      const result = await uploadFile(join(thumbsDir, file), `${r2Prefix}/${sanitize(file)}`, 'image/webp');
      result ? uploaded++ : skipped++;
    }
  }

  return { uploaded, skipped };
}

// ── 生成 photo 对象 ───────────────────────────────────────────
function makePhoto(id, photo, r2Prefix) {
  const sanitizedBase = sanitize(photo.filename.replace(/\.(jpg|jpeg|png)$/i, ''));
  return {
    id,
    src: `${r2Prefix}/${sanitize(photo.filename)}`,
    thumbnail: `${r2Prefix}/${sanitizedBase}.webp`,
    title: { zh: '', en: '' },
    location: photo.location || { zh: '', en: '' },
    caption: photo.caption || null,
    exif: {
      camera: photo.exif?.camera || '',
      lens: photo.exif?.lens || '',
      iso: parseInt(photo.exif?.iso) || 0,
      aperture: photo.exif?.aperture || '',
      shutter: photo.exif?.shutter || '',
    },
    width: photo.width || 0,
    height: photo.height || 0,
    date: photo.date || '',
  };
}

// ── 主流程 ────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();

  // 必填参数校验
  const required = ['dir', 'region', 'album', 'processed'];
  for (const k of required) {
    if (!opts[k]) { console.error(`❌ 缺少参数: --${k}`); process.exit(1); }
  }

  const { dir, region, album } = opts;
  const r2Prefix = `photos/${region}/${album}`;
  const albumId = `${region}-${album}`;
  const regionJsonPath = join(DATA_DIR, `${region}.json`);
  const processedPhotos = JSON.parse(readFileSync(opts.processed, 'utf-8')).photos || [];

  // 1. 上传图片到 R2
  console.log(`\n📤 上传照片: ${dir} → ${r2Prefix}`);
  const stats = await uploadFolder(dir, r2Prefix);
  console.log(`\n📊 上传统计: 新上传 ${stats.uploaded}，跳过 ${stats.skipped}`);

  // 2. 更新 region JSON
  let regionData;

  if (!existsSync(regionJsonPath)) {
    // 新建 region
    if (!opts['new-region']) {
      console.error(`❌ ${regionJsonPath} 不存在，新建 region 请加 --new-region 参数`);
      process.exit(1);
    }
    const [lng, lat] = (opts.coordinates || '0,0').split(',').map(Number);
    regionData = {
      id: region,
      name: {
        zh: opts['region-name-zh'] || region,
        en: opts['region-name-en'] || region,
      },
      coordinates: [lng, lat],
      albums: [],
      mapCode: opts['map-code'] || '',
    };
    console.log(`\n🆕 新建 region: ${region}`);
  } else {
    regionData = JSON.parse(readFileSync(regionJsonPath, 'utf-8'));
  }

  // 找到或新建相册
  let albumData = regionData.albums.find(a => a.id === albumId);

  if (!albumData) {
    // 新建相册
    const albumDate = opts['album-date'] ||
      processedPhotos.map(p => p.date).filter(Boolean).sort()[0] || '';
    albumData = {
      id: albumId,
      title: {
        zh: opts['album-title-zh'] || opts['region-name-zh'] || album,
        en: opts['album-title-en'] || opts['region-name-en'] || album,
      },
      cover: `${r2Prefix}/${sanitize(processedPhotos[0]?.filename.replace(/\.(jpg|jpeg)$/i, '') || '')}.webp`,
      date: albumDate,
      photos: [],
    };
    regionData.albums.push(albumData);
    console.log(`\n🆕 新建相册: ${albumId}`);
  } else {
    console.log(`\n➕ 追加到已有相册: ${albumId}（当前 ${albumData.photos.length} 张）`);
  }

  // 获取当前最大 ID 序号
  const prefix = `${region}-`;
  const maxId = albumData.photos.reduce((max, p) => {
    const n = parseInt(p.id.replace(prefix, '')) || 0;
    return n > max ? n : max;
  }, 0);

  // 追加新照片
  const newPhotos = processedPhotos.map((p, i) =>
    makePhoto(`${prefix}${String(maxId + i + 1).padStart(3, '0')}`, p, r2Prefix)
  );
  albumData.photos.push(...newPhotos);

  writeFileSync(regionJsonPath, JSON.stringify(regionData, null, 2), 'utf-8');
  console.log(`✅ ${region}.json 更新完成，追加 ${newPhotos.length} 张（ID: ${prefix}${String(maxId + 1).padStart(3, '0')} ~ ${prefix}${String(maxId + newPhotos.length).padStart(3, '0')}）`);
  console.log('\n🎉 完成！接下来可以运行 CLIP 排序脚本。');
}

main().catch(console.error);
