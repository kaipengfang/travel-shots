#!/usr/bin/env node
/**
 * 为灯箱生成中等尺寸图（默认 2560px 宽 WebP），上传到 R2，并把 `large` 字段写回 region JSON。
 *
 * 背景：photos[].src 是 8256×5504 的原始 JPG（平均 25 MB），灯箱直接加载原图太慢。
 *
 * 用法：
 *   node scripts/generate-large.mjs                 # 处理所有地区，原图从 CDN 下载
 *   node scripts/generate-large.mjs --region usa    # 只处理一个地区
 *   node scripts/generate-large.mjs --dir ~/photos/usa/seattle --region usa --album usa-seattle
 *                                                   # 原图在本地目录时直接读本地，不下载
 *   --width 2560 --quality 85 --dry-run
 *
 * 需要 .env.local 里的 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env.local') });

const DATA_DIR = join(ROOT, 'src/data/regions');
const config = JSON.parse(readFileSync(join(ROOT, 'src/data/config.json'), 'utf-8'));
const BASE_URL = config.photoBaseUrl.replace(/\/$/, '');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] ?? true) : def; };
const WIDTH = Number(opt('width', 2560));
const QUALITY = Number(opt('quality', 85));
const DRY = args.includes('--dry-run');
const ONLY_REGION = opt('region', null);
const ONLY_ALBUM = opt('album', null);
const LOCAL_DIR = opt('dir', null);

const env = process.env;
const client = DRY ? null : new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});
const BUCKET = env.R2_BUCKET_NAME;

async function existsOnR2(key) {
  try { await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; } catch { return false; }
}

async function getSource(relPath) {
  // 本地目录优先
  if (LOCAL_DIR) {
    const name = basename(relPath);
    const candidates = readdirSync(LOCAL_DIR).filter(f => f.replace(/\s+/g, '_') === name || f === name);
    if (candidates.length) return readFileSync(join(LOCAL_DIR, candidates[0]));
  }
  const res = await fetch(`${BASE_URL}/${encodeURI(relPath)}`);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${relPath}`);
  return Buffer.from(await res.arrayBuffer());
}

async function processAlbum(regionData, album) {
  let changed = 0;
  for (const photo of album.photos) {
    const key = photo.src.replace(/\.(jpg|jpeg|png)$/i, '') + `_${WIDTH}.webp`;
    if (photo.large === key) continue;
    const r2Key = `photos/${key}`;
    if (!DRY && await existsOnR2(r2Key)) {
      photo.large = key; changed++;
      console.log(`  ⏭ 已存在 ${key}`);
      continue;
    }
    console.log(`  ⚙ ${photo.src} → ${key}`);
    if (DRY) continue;
    const input = await getSource(photo.src);
    const out = await sharp(input).rotate().resize(WIDTH, null, { withoutEnlargement: true, fit: 'inside' }).webp({ quality: QUALITY }).toBuffer();
    await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: r2Key, Body: out, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));
    photo.large = key; changed++;
    console.log(`  ✅ ${(out.length / 1024).toFixed(0)} KB`);
  }
  return changed;
}

async function main() {
  const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const regionData = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf-8'));
    if (ONLY_REGION && regionData.id !== ONLY_REGION) continue;
    let changed = 0;
    for (const album of regionData.albums) {
      if (ONLY_ALBUM && album.id !== ONLY_ALBUM) continue;
      console.log(`\n📁 ${regionData.id} / ${album.id} (${album.photos.length})`);
      changed += await processAlbum(regionData, album);
    }
    if (changed && !DRY) {
      writeFileSync(join(DATA_DIR, file), JSON.stringify(regionData, null, 2) + '\n');
      console.log(`💾 写回 ${file}（${changed} 张）`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
