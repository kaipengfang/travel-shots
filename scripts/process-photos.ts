#!/usr/bin/env npx ts-node

/**
 * 图片处理脚本
 * 1. 读取 EXIF 信息
 * 2. 调用 Gemini Vision 生成描述
 * 3. 生成缩略图
 * 4. 输出 JSON 数据
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

// 代理配置
const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7897';
const proxyAgent = new HttpsProxyAgent(PROXY_URL);

// ============ 配置 ============
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.0-flash';
const THUMBNAIL_WIDTH = 800;

// ============ 类型定义 ============
interface ExifData {
  camera: string;
  lens: string;
  iso: number;
  aperture: string;
  shutter: string;
  focalLength: string;
  dateTime: string;
  width: number;
  height: number;
}

interface CaptionResult {
  caption_zh: string;
  caption_en: string;
  suggest_story: boolean;
  story_zh?: string;
  story_en?: string;
}

interface PhotoData {
  id: string;
  filename: string;
  src: string;
  thumbnail: string;
  caption: { zh: string; en: string };
  location: { zh: string; en: string };
  story?: { zh: string; en: string };
  suggest_story: boolean;
  exif: ExifData;
  width: number;
  height: number;
  date: string;
}

// ============ EXIF 读取 ============
function readExif(filePath: string): ExifData {
  try {
    const result = execSync(`mdls -plist - "${filePath}"`, { encoding: 'utf-8' });
    
    // 解析 plist 输出
    const getValue = (key: string): string => {
      const regex = new RegExp(`<key>${key}</key>\\s*<[^>]+>([^<]*)<`, 'm');
      const match = result.match(regex);
      return match ? match[1].trim() : '';
    };
    
    const getNumber = (key: string): number => {
      const val = getValue(key);
      return val ? parseFloat(val) : 0;
    };

    // 格式化快门速度
    const exposureTime = getNumber('kMDItemExposureTimeSeconds');
    let shutter = '';
    if (exposureTime > 0) {
      if (exposureTime >= 1) {
        shutter = `${exposureTime}s`;
      } else {
        shutter = `1/${Math.round(1 / exposureTime)}s`;
      }
    }

    // 格式化光圈
    const fNumber = getNumber('kMDItemFNumber');
    const aperture = fNumber > 0 ? `f/${fNumber}` : '';

    // 格式化焦距
    const focalLength = getNumber('kMDItemFocalLength');
    const focalLengthStr = focalLength > 0 ? `${Math.round(focalLength)}mm` : '';

    // 解析日期
    const dateStr = getValue('kMDItemContentCreationDate');
    let dateTime = '';
    if (dateStr) {
      const date = new Date(dateStr);
      dateTime = date.toISOString().split('T')[0];
    }

    return {
      camera: getValue('kMDItemAcquisitionModel') || 'Unknown',
      lens: getValue('kMDItemLensModel') || '',
      iso: getNumber('kMDItemISOSpeed'),
      aperture,
      shutter,
      focalLength: focalLengthStr,
      dateTime,
      width: getNumber('kMDItemPixelWidth'),
      height: getNumber('kMDItemPixelHeight'),
    };
  } catch (error) {
    console.error(`读取 EXIF 失败: ${filePath}`, error);
    return {
      camera: 'Unknown',
      lens: '',
      iso: 0,
      aperture: '',
      shutter: '',
      focalLength: '',
      dateTime: '',
      width: 0,
      height: 0,
    };
  }
}

// ============ Gemini Vision API ============
async function generateCaption(
  imagePath: string,
  folderName: string,
  exif: ExifData
): Promise<CaptionResult> {
  const prompt = `你是一位摄影师的私人助理，为摄影作品撰写简短描述。

## 风格要求
- Caption 只描述画面内容/情绪/氛围，不包含地名
- 克制、留白，不堆砌形容词
- 中英双语输出

## 输入信息
- 拍摄时间：${exif.dateTime}
- 相机/镜头：${exif.camera} + ${exif.lens}
- 文件夹名：${folderName}

## 输出格式（纯 JSON，不要 markdown）
{
  "caption_zh": "简短描述（不含地名）",
  "caption_en": "Brief description (no location)",
  "suggest_story": true/false,
  "story_zh": "背景说明（如有）",
  "story_en": "Background (if any)"
}

## 注意
- 不要在 caption 中包含地名
- 不要编造不确定的信息
- suggest_story = true 表示图片有人物互动、特殊事件、极端天气等值得讲述的内容
- 普通风景照 suggest_story = false，caption 简洁即可
- 只输出 JSON，不要其他内容`;

  // 读取图片并转为 base64
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/jpeg';

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 500,
    },
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        agent: proxyAgent,
      }
    );

    const data = await response.json() as any;
    
    // 调试输出
    if (!data.candidates) {
      console.error('API 响应:', JSON.stringify(data, null, 2));
      throw new Error('API 返回无效响应');
    }
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // 提取 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    console.error('无法解析的文本:', text);
    throw new Error('无法解析 Gemini 响应');
  } catch (error) {
    console.error(`生成描述失败: ${imagePath}`, error);
    return {
      caption_zh: '待补充',
      caption_en: 'To be added',
      suggest_story: false,
    };
  }
}

// ============ 解析文件夹名获取地点 ============
function parseLocation(folderName: string): { zh: string; en: string } {
  // 格式: "2024.05.01 香港" 或 "2024.06.18 西雅图CVPR"
  const match = folderName.match(/^\d{4}\.\d{2}\.\d{2}\s*(.+)$/);
  const locationZh = match ? match[1].trim() : folderName;
  
  // 简单的中英文映射（可扩展）
  const locationMap: Record<string, string> = {
    '香港': 'Hong Kong',
    '昆明': 'Kunming',
    '临海紫阳街_府城墙': 'Linhai Ancient Town',
    '宣邦楼': 'Xuanbang Tower',
    '都江堰': 'Dujiangyan',
    '天津': 'Tianjin',
    '西雅图CVPR': 'Seattle CVPR',
    '兰州之行': 'Lanzhou',
    '中秋烧烤大会': 'Mid-Autumn BBQ',
    '毕棚沟之行': 'Bipenggou Valley',
    '新加坡之行': 'Singapore',
    '韩国之行': 'South Korea',
    'JJ专辑 with Optimus': 'JJ Album with Optimus',
    '调酒': 'Cocktails',
  };

  return {
    zh: locationZh,
    en: locationMap[locationZh] || locationZh,
  };
}

// ============ 主函数 ============
async function processFolder(folderPath: string, outputPath: string) {
  const folderName = path.basename(folderPath);
  const location = parseLocation(folderName);
  
  console.log(`\n📁 处理文件夹: ${folderName}`);
  console.log(`📍 地点: ${location.zh} / ${location.en}`);

  // 获取所有图片
  const files = fs.readdirSync(folderPath).filter((f) => 
    /\.(jpg|jpeg|png|webp)$/i.test(f)
  );

  console.log(`📷 找到 ${files.length} 张图片\n`);

  const photos: PhotoData[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(folderPath, file);
    const id = `${folderName.replace(/[^a-zA-Z0-9]/g, '-')}-${i + 1}`.toLowerCase();

    console.log(`[${i + 1}/${files.length}] ${file}`);

    // 1. 读取 EXIF
    const exif = readExif(filePath);
    console.log(`  📊 EXIF: ${exif.camera}, ${exif.aperture}, ${exif.shutter}, ISO${exif.iso}`);

    // 2. 生成描述
    console.log(`  🤖 生成描述...`);
    const caption = await generateCaption(filePath, folderName, exif);
    console.log(`  ✅ ${caption.caption_zh}`);
    if (caption.suggest_story) {
      console.log(`  📖 建议故事: ${caption.story_zh}`);
    }

    // 3. 构建数据
    const photo: PhotoData = {
      id,
      filename: file,
      src: `/photos/${folderName}/${file}`,
      thumbnail: `/photos/${folderName}/thumbs/${file.replace(/\.[^.]+$/, '.webp')}`,
      caption: {
        zh: caption.caption_zh,
        en: caption.caption_en,
      },
      location,
      suggest_story: caption.suggest_story,
      exif: {
        camera: exif.camera,
        lens: exif.lens,
        iso: exif.iso,
        aperture: exif.aperture,
        shutter: exif.shutter,
        focalLength: exif.focalLength,
        dateTime: exif.dateTime,
        width: exif.width,
        height: exif.height,
      },
      width: exif.width,
      height: exif.height,
      date: exif.dateTime,
    };

    if (caption.suggest_story && caption.story_zh) {
      photo.story = {
        zh: caption.story_zh,
        en: caption.story_en || '',
      };
    }

    photos.push(photo);

    // 避免 API 限流
    await new Promise((r) => setTimeout(r, 1000));
  }

  // 输出结果
  const output = {
    folder: folderName,
    location,
    processedAt: new Date().toISOString(),
    photos,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n✅ 完成！输出: ${outputPath}`);
  console.log(`📊 共 ${photos.length} 张，${photos.filter(p => p.suggest_story).length} 张建议添加故事`);
}

// ============ 入口 ============
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('用法: npx ts-node process-photos.ts <文件夹路径> [输出路径]');
  console.log('示例: npx ts-node process-photos.ts "/Users/fkp/Desktop/2024.05.01 香港"');
  process.exit(1);
}

const folderPath = args[0];
const outputPath = args[1] || path.join(
  path.dirname(folderPath),
  `${path.basename(folderPath)}-processed.json`
);

if (!GEMINI_API_KEY) {
  console.error('❌ 请设置 GEMINI_API_KEY 环境变量');
  process.exit(1);
}

processFolder(folderPath, outputPath);
