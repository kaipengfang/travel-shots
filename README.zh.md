# 途影 · TravelShots

> 以地图为核心的个人摄影作品展示网站。点亮你去过的每一个地方。

**[在线演示 →](https://gallery.fangkaipeng.com)** · [English →](./README.md)

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 功能特性

- 🗺️ **世界地图** — 点亮去过的国家和中国省份（d3-geo，Natural Earth 投影）
- 📸 **瀑布流画廊** — 保持原始比例，贪心预排序算法优化视觉顺序
- 🔍 **灯箱详情** — 全屏大图 + EXIF 信息 + 毛玻璃背景
- 💬 **点赞评论** — 基于 Supabase，无需自建后端
- 🌙 **深色模式** — 自动跟随系统
- 🌐 **中英双语** — UI 和图片信息均支持
- 🤖 **CLIP 智能排序** — 用视觉相似度对相册照片自动排序（可选）

---

## 快速开始

### 环境要求

- Node.js 18+
- Python 3.10+（仅 CLIP 排序脚本需要）

### 安装

```bash
git clone https://github.com/your-username/photography-website.git
cd photography-website
npm install
```

### 配置

复制环境变量文件：

```bash
cp .env.example .env.local
```

编辑 `.env.local`，填入你的 Supabase 配置（见下方部署章节）：

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

编辑 `src/data/config.json`，修改为你自己的信息：

```json
{
  "photoBaseUrl": "https://your-cdn.com/photos",
  "siteName": { "zh": "我的足迹", "en": "My Footprints" },
  "motto": { "zh": "你的座右铭", "en": "Your motto" },
  "author": {
    "name": "Your Name",
    "email": "your@email.com",
    "website": "https://your-website.com"
  }
}
```

### 启动开发服务器

```bash
npm run dev
# 访问 http://localhost:3000
```

---

## 如何添加相册

**只需编辑 JSON，无需改动任何代码。**

### 数据结构

```
Region（地区）→ Album（相册）→ Photo（照片）
```

每个地区对应 `src/data/regions/` 下的一个 JSON 文件，网站自动扫描该目录。

### 新增地区

在 `src/data/regions/` 下新建 `{region-id}.json`：

```jsonc
{
  "id": "yunnan",                          // 唯一标识，用于 URL：/region/yunnan
  "name": { "zh": "云南", "en": "Yunnan" },
  "coordinates": [102.7, 25.0],            // [经度, 纬度]，注意与 Google Maps 顺序相反
  "mapCode": "CN-53",                      // 地图点亮用，参考 docs/codes.md
  "albums": [
    {
      "id": "yunnan-dali",                 // 唯一标识，用于 URL：/region/yunnan/yunnan-dali
      "title": { "zh": "大理", "en": "Dali" },
      "date": "2024-05-01",
      "cover": "yunnan/dali/cover.webp",   // 地区页相册封面，相对于 photoBaseUrl
      "photos": [
        {
          "src": "yunnan/dali/001.jpg",        // 灯箱大图
          "thumbnail": "yunnan/dali/001.webp", // 瀑布流缩略图（800px 宽）
          "width": 4000,                       // 原图实际像素，必填，填错会导致布局错乱
          "height": 2667,
          "caption": { "zh": "洱海日落", "en": "Sunset over Erhai Lake" },
          "location": { "zh": "大理，云南", "en": "Dali, Yunnan" },
          "date": "2024-05-01",
          "exif": {                            // 可选，所有子字段均可省略
            "camera": "Sony A7C",
            "lens": "24-70mm f/2.8",
            "iso": "100",
            "aperture": "f/8",
            "shutter": "1/250s"
          }
        }
      ]
    }
  ]
}
```

### mapCode 说明

| 类型 | 格式 | 示例 |
|------|------|------|
| 国家 | ISO 3166-1 Alpha-2 | `KR`（韩国）、`US`（美国） |
| 中国省份 | `CN-` + 行政区划代码后两位 | `CN-51`（四川）、`CN-44`（广东） |

完整代码参考：[`docs/codes.md`](./docs/codes.md)

### 图片路径

所有路径均为相对路径，实际 URL = `config.json` 中的 `photoBaseUrl` + 路径。

例如：`photoBaseUrl = "https://cdn.example.com/photos"`，路径 `yunnan/dali/001.jpg`  
→ 实际访问 `https://cdn.example.com/photos/yunnan/dali/001.jpg`

---

## 部署

### 1. 图片存储（推荐 Cloudflare R2）

R2 免费额度：10GB 存储 + 每月 1000 万次请求，出口流量免费。

```bash
node scripts/upload-to-r2.mjs
```

上传后在 `config.json` 中将 `photoBaseUrl` 改为你的 R2 公开域名。

> 也可以使用任何支持公开访问的对象存储（AWS S3、阿里云 OSS 等），只需修改 `photoBaseUrl`。

### 2. 评论点赞（Supabase）

1. 在 [supabase.com](https://supabase.com) 创建项目（免费）
2. 在 SQL Editor 中执行以下建表语句：

```sql
create table likes (
  id uuid default gen_random_uuid() primary key,
  album_id text not null,
  created_at timestamp with time zone default now()
);

create table comments (
  id uuid default gen_random_uuid() primary key,
  album_id text not null,
  nickname text not null,
  content text not null,
  created_at timestamp with time zone default now()
);

alter table likes enable row level security;
alter table comments enable row level security;

create policy "allow all" on likes for all using (true) with check (true);
create policy "allow all" on comments for all using (true) with check (true);
```

3. 在项目 Settings → API 中获取 `URL` 和 `anon key`，填入 `.env.local`

### 3. 部署到 Vercel

在 [vercel.com](https://vercel.com) 导入 GitHub 仓库，在 Environment Variables 中添加环境变量，或使用 CLI：

```bash
npm install -g vercel
vercel
```

每次推送到 `main` 分支，Vercel 会自动重新部署。

---

## CLIP 智能排序（可选）

使用 CLIP 视觉模型对相册照片按视觉相似度自动排序，让相邻照片过渡更自然。

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install torch transformers pillow numpy

# 运行排序（生成 clip_sorted.json）
python3 scripts/clip_sort_tsp_breakpoint.py

# 将排序结果写入 regions/*.json
npx ts-node scripts/apply-clip-sort.ts
```

---

## 项目结构

```
src/
├── app/                    # Next.js App Router
├── components/             # UI 组件
├── data/
│   ├── config.json         # 全局配置 ← 改这里自定义网站
│   ├── index.ts            # 自动聚合所有地区数据
│   └── regions/            # 每个地区一个 JSON ← 改这里添加相册
└── lib/
    ├── types.ts
    └── photoUrl.ts
scripts/
├── gen-data.py             # 从照片文件夹生成 JSON 数据
├── batch-thumbnails.sh     # 批量生成 WebP 缩略图
├── clip_sort_tsp_breakpoint.py
└── upload-to-r2.mjs
```

---

## 注意事项

- **图片格式：** 瀑布流使用 `.webp` 缩略图（800px 宽），灯箱使用原始 `.jpg`，两者都需要提供
- **中文路径：** `next.config.ts` 中已设置 `unoptimized: true` 以避免中文文件名问题
- **Hydration：** 瀑布流预排序在客户端执行，SSR 初始状态保持原始顺序以避免 Hydration 错误
- **版权保护：** 图片通过 CSS `pointer-events: none` + `user-select: none` 防止右键下载，并在灯箱显示版权信息
- **Supabase 免费额度：** 500MB 数据库，每月 200 万次 API 请求，个人使用完全够用

---

## License

[MIT](./LICENSE)

---

*如果这个项目对你有帮助，欢迎 Star ⭐*
