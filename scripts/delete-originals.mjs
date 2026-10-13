#!/usr/bin/env node
/**
 * 删除 R2 桶里的原图（photos[].src 指向的 .jpg），只处理已经生成了
 * large(2048) 和 xlarge(3840) 两档展示图的照片，并先核对两档文件都在桶里。
 *
 * ⚠️ 不可逆。R2 没有回收站。请先确认本地有原片备份。
 *
 * 用法：
 *   node scripts/delete-originals.mjs            # 只列清单，不删除（默认 dry-run）
 *   node scripts/delete-originals.mjs --yes      # 真正删除，并把 src 字段从 JSON 移除
 *   --region usa                                  # 只处理一个地区
 *   --proxy http://127.0.0.1:7897                 # 需要时走代理
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { S3Client, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env.local') });
const DATA_DIR = join(ROOT, 'src/data/regions');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] ?? true) : def; };
const YES = args.includes('--yes');
const ONLY_REGION = opt('region', null);
const env = process.env;
const PROXY = opt('proxy', null) || env.R2_PROXY || env.HTTPS_PROXY || null;

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  ...(PROXY ? { requestHandler: new NodeHttpHandler({ httpsAgent: new HttpsProxyAgent(PROXY) }) } : {}),
});
const BUCKET = env.R2_BUCKET_NAME;

async function head(key) {
  try { const r = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return r.ContentLength ?? 0; } catch { return null; }
}

async function main() {
  let candidates = 0, skippedNoVariants = 0, skippedMissingOnR2 = 0, deleted = 0, bytes = 0;
  for (const file of readdirSync(DATA_DIR).filter(f => f.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf-8'));
    if (ONLY_REGION && data.id !== ONLY_REGION) continue;
    let changed = 0;
    for (const album of data.albums) {
      for (const photo of album.photos) {
        if (!photo.src) continue;
        if (!photo.large || !photo.xlarge) { skippedNoVariants++; console.log(`  ⛔ 未生成两档，跳过 ${photo.src}`); continue; }
        // 两档展示图必须真的在桶里
        const [l, x] = await Promise.all([head(`photos/${photo.large}`), head(`photos/${photo.xlarge}`)]);
        if (!l || !x) { skippedMissingOnR2++; console.log(`  ⛔ 展示图不在桶里，跳过 ${photo.src}`); continue; }
        const key = `photos/${photo.src}`;
        const size = await head(key);
        if (size === null) { console.log(`  ⏭ 原图已不存在 ${key}`); delete photo.src; changed++; continue; }
        candidates++; bytes += size;
        if (!YES) { console.log(`  🗑 将删除 ${key} (${(size / 1048576).toFixed(1)} MB)`); continue; }
        await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
        delete photo.src; changed++; deleted++;
        console.log(`  ✅ 已删除 ${key}`);
      }
    }
    if (changed && YES) { writeFileSync(join(DATA_DIR, file), JSON.stringify(data, null, 2) + '\n'); console.log(`💾 写回 ${file}`); }
  }
  console.log(`\n${YES ? '已删除' : '待删除'} ${YES ? deleted : candidates} 张原图，共 ${(bytes / 1073741824).toFixed(2)} GB；跳过：未生成两档 ${skippedNoVariants}，展示图缺失 ${skippedMissingOnR2}`);
  if (!YES) console.log('这是 dry-run，加 --yes 才会真正删除。');
}
main().catch(e => { console.error(e); process.exit(1); });
