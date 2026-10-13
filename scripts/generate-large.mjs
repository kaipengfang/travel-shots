#!/usr/bin/env node
/**
 * 为灯箱生成两档展示图并上传到 R2，把路径写回 region JSON：
 *   large   2048px 宽 WebP q85（笔记本 / 2K 屏）
 *   xlarge  3840px 宽 WebP q85（4K 屏）
 * 灯箱用 srcset 让浏览器按屏幕选档；原图继续留在 R2，不再出现在前端数据里。
 *
 * 背景：photos[].src 是 8256×5504 的原始 JPG（平均 25 MB），灯箱直接加载原图太慢，
 * 也等于把无水印原片公开。
 *
 * 用法：
 *   node scripts/generate-large.mjs                 # 处理所有地区，原图从 CDN 下载
 *   node scripts/generate-large.mjs --region usa    # 只处理一个地区
 *   node scripts/generate-large.mjs --dir ~/photos/usa/seattle --region usa --album usa-seattle
 *                                                   # 原图在本地目录时直接读本地，不下载
 *   --dry-run                                       # 只列出要处理的，不下载不上传
 *   --force                                         # 已存在的也重新生成并覆盖（调整质量参数后用）
 *   --proxy http://127.0.0.1:7897                   # R2 接口走代理（国内直连 r2.cloudflarestorage.com 会握手失败）
 *                                                   # 也可用环境变量 HTTPS_PROXY / R2_PROXY；原图下载仍直连 CDN
 *
 * 需要 .env.local 里的 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env.local') });

const DATA_DIR = join(ROOT, 'src/data/regions');
const config = JSON.parse(readFileSync(join(ROOT, 'src/data/config.json'), 'utf-8'));
const BASE_URL = config.photoBaseUrl.replace(/\/$/, '');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] ?? true) : def; };
/** 两档尺寸：字段名 → [宽度, 质量] */
const VARIANTS = { large: [2048, 85], xlarge: [3840, 85] };
const DRY = args.includes('--dry-run');
const FORCE = args.includes('--force');
const ONLY_REGION = opt('region', null);
const ONLY_ALBUM = opt('album', null);
const LOCAL_DIR = opt('dir', null);

const env = process.env;
const PROXY = opt('proxy', null) || env.R2_PROXY || env.HTTPS_PROXY || env.https_proxy || null;
if (PROXY) console.log(`🌐 R2 走代理 ${PROXY}`);
const client = DRY ? null : new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  ...(PROXY ? { requestHandler: new NodeHttpHandler({ httpsAgent: new HttpsProxyAgent(PROXY) }) } : {}),
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

const failures = [];

async function processAlbum(regionData, album) {
  let changed = 0;
  for (const photo of album.photos) {
    try {
      changed += await processPhoto(photo);
    } catch (e) {
      // 单张失败（常见：桶里没有原图，只有缩略图）不中断整体，最后汇总
      failures.push(`${photo.src}: ${e.message}`);
      console.log(`  ❌ ${photo.src}: ${e.message}`);
    }
  }
  return changed;
}

async function processPhoto(photo) {
  let changed = 0;
  {
    if (!photo.src) return 0; // 原图路径已被移除，说明早已处理过
    const base = photo.src.replace(/\.(jpg|jpeg|png)$/i, '');
    const todo = Object.entries(VARIANTS).filter(([field, [w]]) => FORCE || photo[field] !== `${base}_${w}.webp`);
    if (todo.length === 0) return 0;

    let input = null;
    for (const [field, [w, q]] of todo) {
      const key = `${base}_${w}.webp`;
      const r2Key = `photos/${key}`;
      if (!DRY && !FORCE && await existsOnR2(r2Key)) {
        photo[field] = key; changed++;
        console.log(`  ⏭ 已存在 ${key}`);
        continue;
      }
      console.log(`  ⚙ ${photo.src} → ${key}`);
      if (DRY) continue;
      input ??= await getSource(photo.src);
      const out = await sharp(input).rotate().resize(w, null, { withoutEnlargement: true, fit: 'inside' }).webp({ quality: q }).toBuffer();
      await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: r2Key, Body: out, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));
      photo[field] = key; changed++;
      console.log(`  ✅ ${(out.length / 1024).toFixed(0)} KB`);
    }
  }
  return changed;
}

async function main() {
  const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const regionData = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf-8'));
    if (ONLY_REGION && regionData.id !== ONLY_REGION) continue;
    for (const album of regionData.albums) {
      if (ONLY_ALBUM && album.id !== ONLY_ALBUM) continue;
      console.log(`\n📁 ${regionData.id} / ${album.id} (${album.photos.length})`);
      const changed = await processAlbum(regionData, album);
      // 每个相册处理完立刻写回，中途中断也不丢进度
      if (changed && !DRY) {
        writeFileSync(join(DATA_DIR, file), JSON.stringify(regionData, null, 2) + '\n');
        console.log(`💾 写回 ${file}（${album.id} ${changed} 张）`);
      }
    }
  }
  if (failures.length) {
    console.log(`\n⚠️ ${failures.length} 张未能生成（通常是桶里缺原图，可用 --dir 指向本地原图目录重跑）：`);
    failures.forEach(f => console.log('  - ' + f));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
