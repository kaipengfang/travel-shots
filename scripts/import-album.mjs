#!/usr/bin/env node
/**
 * 一条命令把一个本地照片文件夹注册成网站相册（新建或追加）：
 *   1. 用 exiftool 读取 EXIF（相机 / 镜头 / ISO / 光圈 / 快门 / 拍摄日期 / 尺寸）
 *   2. 用 sharp 生成三档 WebP：thumbnail 800px q85、large 2048px q85、xlarge 3840px q85
 *      （原图不上传，与 generate-large / delete-originals 的策略一致）
 *   3. 上传到 R2 `photos/{region}/{album}/`（已存在的跳过）
 *   4. 写入 src/data/regions/{region}.json：地区不存在就新建，相册不存在就新建，
 *      已存在则按 id 追加；caption 从 --captions 指定的 JSON 读取（文件名 → {zh,en}）
 *
 * 用法：
 *   node scripts/import-album.mjs --dir ~/青岛 --region shandong --album qingdao \
 *     --region-name 山东/Shandong --album-title 青岛/Qingdao --location "中国 青岛/Qingdao, China" \
 *     --map-code CN-37 --coords 120.4,36.1 --captions scratch/captions.json
 *
 *   --out <dir>      生成的 WebP 放哪里（默认 .cache/import/{region}/{album}，可复用，已有的不重复生成）
 *   --no-upload      只生成文件 + 写 JSON，不碰 R2（可以先在没网的机器上跑，再 --upload-only）
 *   --upload-only    只上传 --out 里已有的 WebP，再写 JSON
 *   --album-date     相册日期（默认取照片里最早的拍摄日期）
 *   --dry-run        只打印计划
 *   --proxy URL      R2 走代理（或环境变量 HTTPS_PROXY / R2_PROXY）
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env.local') });
const DATA_DIR = join(ROOT, 'src/data/regions');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] ?? true) : def; };
const has = name => args.includes(`--${name}`);
const pair = (v, label) => {
  if (!v) return null;
  const [zh, en] = String(v).split('/');
  if (!zh || !en) throw new Error(`${label} 需要 "中文/English" 格式`);
  return { zh: zh.trim(), en: en.trim() };
};

const DIR = opt('dir', null);
const REGION = opt('region', null);
const ALBUM = opt('album', null);
if (!DIR || !REGION || !ALBUM) { console.error('缺少 --dir / --region / --album'); process.exit(1); }
const REGION_NAME = pair(opt('region-name', null), '--region-name');
const ALBUM_TITLE = pair(opt('album-title', null), '--album-title');
const LOCATION = pair(opt('location', null), '--location');
const MAP_CODE = opt('map-code', null);
const COORDS = opt('coords', null) ? opt('coords').split(',').map(Number) : null;
const CAPTIONS = opt('captions', null) ? JSON.parse(readFileSync(opt('captions'), 'utf-8')) : {};
const ALBUM_DATE = opt('album-date', null);
const OUT = opt('out', join(ROOT, '.cache/import', REGION, ALBUM));
const DRY = has('dry-run');
const NO_UPLOAD = has('no-upload');
const UPLOAD_ONLY = has('upload-only');
const PREFIX = `${REGION}/${ALBUM}`;
const VARIANTS = { thumbnail: [800, 85, ''], large: [2048, 85, '_2048'], xlarge: [3840, 85, '_3840'] };

const sanitize = f => f.replace(/\s+/g, '_');
const files = readdirSync(DIR).filter(f => /\.jpe?g$/i.test(f) && !f.startsWith('.')).sort();
if (!files.length) { console.error(`${DIR} 里没有 jpg`); process.exit(1); }
console.log(`📁 ${DIR}: ${files.length} 张 → ${PREFIX}`);

// ---------- 1. EXIF ----------
const exifRows = JSON.parse(execFileSync('exiftool', [
  '-json', '-n', '-DateTimeOriginal', '-Model', '-LensModel', '-ISO', '-FNumber', '-ExposureTime',
  '-ImageWidth', '-ImageHeight', '-Orientation', ...files.map(f => join(DIR, f)),
], { maxBuffer: 64 << 20 }).toString());
const exifByFile = Object.fromEntries(exifRows.map(r => [basename(r.SourceFile), r]));
const fmtShutter = t => (t == null ? '' : t >= 1 ? `${t}s` : `1/${Math.round(1 / t)}s`);
const fmtDate = s => (s ? s.slice(0, 10).replace(/:/g, '-') : '');

// ---------- 2. 生成 WebP ----------
mkdirSync(OUT, { recursive: true });
const outName = (f, suffix) => `${sanitize(f.replace(/\.jpe?g$/i, ''))}${suffix}.webp`;
if (!UPLOAD_ONLY) {
  for (const f of files) {
    const src = join(DIR, f);
    for (const [key, [width, quality, suffix]] of Object.entries(VARIANTS)) {
      const target = join(OUT, outName(f, suffix));
      if (existsSync(target)) continue;
      if (DRY) { console.log(`  [dry] ${key} ${target}`); continue; }
      await sharp(src).rotate().resize(width, null, { withoutEnlargement: true, fit: 'inside' }).webp({ quality }).toFile(target);
      console.log(`  🖼  ${key} ${basename(target)}`);
    }
  }
}

// ---------- 3. 上传 ----------
if (!NO_UPLOAD && !DRY) {
  const env = process.env;
  const PROXY = opt('proxy', null) || env.R2_PROXY || env.HTTPS_PROXY || env.https_proxy || null;
  if (PROXY) console.log(`🌐 R2 走代理 ${PROXY}`);
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    ...(PROXY ? { requestHandler: new NodeHttpHandler({ httpsAgent: new HttpsProxyAgent(PROXY) }) } : {}),
  });
  const BUCKET = env.R2_BUCKET_NAME;
  const exists = async key => { try { await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; } catch { return false; } };
  let up = 0, skip = 0;
  for (const f of files) for (const [, , suffix] of Object.values(VARIANTS)) {
    const name = outName(f, suffix);
    const key = `photos/${PREFIX}/${name}`;
    if (await exists(key)) { skip++; continue; }
    await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: readFileSync(join(OUT, name)), ContentType: 'image/webp' }));
    up++; console.log(`  ☁️  ${key}`);
  }
  console.log(`📤 上传 ${up}，已存在跳过 ${skip}`);
}

// ---------- 4. 写 region JSON ----------
const jsonPath = join(DATA_DIR, `${REGION}.json`);
let region;
if (existsSync(jsonPath)) {
  region = JSON.parse(readFileSync(jsonPath, 'utf-8'));
} else {
  if (!REGION_NAME || !MAP_CODE || !COORDS) { console.error('新地区需要 --region-name / --map-code / --coords'); process.exit(1); }
  region = { id: REGION, name: REGION_NAME, coordinates: COORDS, albums: [], mapCode: MAP_CODE };
  console.log(`🆕 新地区 ${REGION} (${MAP_CODE})`);
}
const albumId = `${REGION}-${ALBUM}`;
let album = region.albums.find(a => a.id === albumId);
const allIds = region.albums.flatMap(a => a.photos.map(p => parseInt(p.id.replace(`${REGION}-`, ''), 10) || 0));
let nextId = Math.max(0, ...allIds) + 1;
const existingThumbs = new Set(region.albums.flatMap(a => a.photos.map(p => p.thumbnail)));

const photos = files.flatMap(f => {
  const thumb = `${PREFIX}/${outName(f, '')}`;
  if (existingThumbs.has(thumb)) { console.log(`  ⏭ 已在 JSON 中: ${f}`); return []; }
  const e = exifByFile[f] || {};
  const rotated = e.Orientation >= 5;
  const cap = CAPTIONS[f] || CAPTIONS[f.replace(/\.jpe?g$/i, '')] || null;
  if (!cap) console.warn(`  ⚠️ 无 caption: ${f}`);
  return [{
    id: `${REGION}-${String(nextId++).padStart(3, '0')}`,
    thumbnail: thumb,
    title: { zh: '', en: '' },
    location: LOCATION || (album?.photos[0]?.location) || { zh: '', en: '' },
    caption: cap,
    exif: {
      camera: e.Model || '', lens: e.LensModel || '', iso: e.ISO || 0,
      aperture: e.FNumber ? `f/${e.FNumber}` : '', shutter: fmtShutter(e.ExposureTime),
    },
    width: rotated ? e.ImageHeight : e.ImageWidth,
    height: rotated ? e.ImageWidth : e.ImageHeight,
    date: fmtDate(e.DateTimeOriginal),
    large: `${PREFIX}/${outName(f, '_2048')}`,
    xlarge: `${PREFIX}/${outName(f, '_3840')}`,
  }];
});

if (!album) {
  if (!ALBUM_TITLE) { console.error('新相册需要 --album-title'); process.exit(1); }
  const dates = photos.map(p => p.date).filter(Boolean).sort();
  album = { id: albumId, title: ALBUM_TITLE, cover: photos[0]?.thumbnail || '', date: ALBUM_DATE || dates[0] || '', photos: [] };
  region.albums.push(album);
  console.log(`🆕 新相册 ${albumId}`);
}
album.photos.push(...photos);
if (DRY) { console.log(JSON.stringify(region, null, 2).slice(0, 1500)); process.exit(0); }
writeFileSync(jsonPath, JSON.stringify(region, null, 2) + '\n', 'utf-8');
console.log(`✅ ${basename(jsonPath)}：${albumId} 新增 ${photos.length} 张，共 ${album.photos.length} 张`);
