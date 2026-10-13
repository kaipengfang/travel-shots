# 途影 · TravelShots

> 以 3D 地球为核心的个人摄影作品展示网站。点亮你去过的每一个地方。

**[在线演示 →](https://gallery.fangkaipeng.com)** · [English →](./README.md)

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 功能特性

- 🌍 **3D 地球** — MapLibre 球面地图，点亮去过的国家和中国省份；照片标记按屏幕距离聚合，点击地区在旁边弹出相册面板（OpenFreeMap 底图，无需 API key）
- 🌊 **照片流** — 地球下方三行缓慢滚动的照片，按拍摄时间排序，点击直接打开大图
- 📸 **瀑布流画廊** — 保持原始比例，贪心预排序算法优化视觉顺序
- 🔍 **灯箱详情** — 全屏大图 + EXIF 信息；按屏幕自动选择 2048px 或 3840px WebP，原图永不进浏览器
- ❤️ **点赞** — 相册和单张照片均可点赞，以加盐 IP 哈希为凭证，存储在 Supabase（无账号、无评论）
- 👋 **访客计数** — 页脚"欢迎，第 N 位来访的地球人"，基于 Vercount
- 🌐 **中英双语** — UI、地图标签和图片信息均支持
- 📦 **一条命令导入相册** — EXIF → 三档 WebP → 上传 R2 → 写入地区 JSON，另附 Claude Code skill 连 caption 一起写
- 🤖 **CLIP 智能排序** — 用视觉相似度对相册照片自动排序（可选）

---

## 快速开始

### 环境要求

- Node.js 20+
- [exiftool](https://exiftool.org/)（仅 `import-album.mjs` 需要）
- Python 3.10+（仅 CLIP 排序脚本需要）

### 安装

```bash
git clone https://github.com/kaipengfang/travel-shots.git
cd travel-shots
npm install
```

### 配置

复制环境变量文件：

```bash
cp .env.example .env.local
```

填入 Supabase（点赞）凭证；如果使用上传脚本，再填 Cloudflare R2：

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # 仅服务端使用，不会进浏览器
LIKES_SALT=random_string        # 可选，改动后所有人的点赞状态会重置

R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
```

编辑 `src/data/config.json` 填入你的信息：

```json
{
  "photoBaseUrl": "https://your-cdn.com/photos",
  "siteName": { "zh": "我的足迹", "en": "My Footprints" },
  "motto": { "zh": "...", "en": "..." },
  "author": {
    "name": "Your Name",
    "email": "your@email.com",
    "website": "https://your-website.com"
  }
}
```

同时把你的 CDN 域名加到 `next.config.ts` 的 `remotePatterns` 里。

### 运行

```bash
npm run dev
# 打开 http://localhost:3000
```

---

## 添加相册

### 推荐：`import-album.mjs` 一条命令

给一个 JPG 文件夹，剩下的全自动：

```bash
node scripts/import-album.mjs --dir ~/photos/qingdao \
  --region shandong --album qingdao \
  --region-name "山东/Shandong" --album-title "青岛/Qingdao" \
  --location "中国 青岛/Qingdao, China" \
  --map-code CN-37 --coords 120.4,36.1 \
  --captions captions.json        # 可选：{"文件名.jpg": {"zh": "...", "en": "..."}}
```

1. 用 exiftool 读取 EXIF（相机 / 镜头 / ISO / 光圈 / 快门 / 拍摄日期 / 尺寸）
2. 用 sharp 生成三档 WebP：800px 缩略图、2048px `large`、3840px `xlarge` —— **原图不上传**
3. 上传到 R2 `photos/{region}/{album}/`（已存在的跳过）
4. 写入 `src/data/regions/{region}.json`：地区 / 相册不存在则新建，存在则追加

地区已存在时 `--region-name / --map-code / --coords` 可省略，相册已存在时 `--album-title` 可省略。
常用参数：`--dry-run` 只打印计划，`--no-upload` 只生成 + 写 JSON，`--upload-only` 只上传 `.cache/import/` 里已有的 WebP，`--proxy URL` 让 R2 走代理。

### 用 Claude Code：`/add-album`

仓库自带一个 agent skill：`.claude/skills/add-album/SKILL.md`。在 [Claude Code](https://claude.com/claude-code) 里打开项目，说"把 ~/photos/qingdao 加成新相册"即可：agent 会读 EXIF、运行 `import-album.mjs`、拼 contact sheet 看图为每张照片写中英 caption、选封面、上传 R2、本地验证页面并推送 `main`，最后汇报哪些地名是推断的，方便你纠正。

### 手动：编辑 JSON

**只需编辑 JSON 文件，无需改代码。**

```
Region（地区）→ Album（相册）→ Photo（照片）
```

每个地区一个 JSON 文件，放在 `src/data/regions/`，网站自动扫描该目录。

```jsonc
{
  "id": "yunnan",                          // 唯一标识，用于 URL：/region/yunnan
  "name": { "zh": "云南", "en": "Yunnan" },
  "coordinates": [102.7, 25.0],            // [经度, 纬度]，地球上标记的位置
  "mapCode": "CN-53",                      // 点亮哪块轮廓，见 docs/codes.md
  "albums": [
    {
      "id": "yunnan-dali",                 // 唯一标识，用于 URL：/region/yunnan/yunnan-dali
      "title": { "zh": "大理", "en": "Dali" },
      "date": "2024-05-01",
      "cover": "yunnan/dali/cover.webp",   // 地区页封面，相对 photoBaseUrl
      "highlights": ["yunnan-003"],        // 可选：地球相册卡片展示的照片 id，不填自动挑选
      "photos": [
        {
          "id": "yunnan-001",                     // 全站唯一，点赞和 highlights 用它
          "thumbnail": "yunnan/dali/001.webp",    // 800px WebP，瀑布流和照片流使用
          "large": "yunnan/dali/001_2048.webp",   // 灯箱 2K 屏（可选，缺失时退回缩略图）
          "xlarge": "yunnan/dali/001_3840.webp",  // 灯箱 4K 屏（可选）
          "width": 4000,                          // 实际像素尺寸，填错会导致布局错乱
          "height": 2667,
          "title": { "zh": "", "en": "" },
          "caption": { "zh": "洱海日落", "en": "Sunset over Erhai Lake" },
          "location": { "zh": "大理，云南", "en": "Dali, Yunnan" },
          "date": "2024-05-01",                   // 照片流排序和"更新于"日期都用它
          "exif": {                               // 可选
            "camera": "Sony A7C",
            "lens": "24-70mm f/2.8",
            "iso": 100,
            "aperture": "f/8",
            "shutter": "1/250s"
          }
        }
      ]
    }
  ]
}
```

旧数据里可能还有 `src`（原图路径），数据层会把它剥掉，原图不会暴露。已有相册可用 `scripts/generate-large.mjs` 补生成 `large`/`xlarge`，之后用 `scripts/delete-originals.mjs --yes` 把 R2 上的原图删掉。

### mapCode 对照

| 类型 | 格式 | 示例 |
|------|------|------|
| 国家 | ISO 3166-1 两位字母 | `KR`（韩国）、`US`（美国） |
| 中国省份 | `CN-` + 行政区代码 | `CN-51`（四川）、`CN-44`（广东） |

完整对照表：[`docs/codes.md`](./docs/codes.md)

> **地球轮廓。** 国家轮廓来自 Natural Earth 110m（`public/maps/world.json`）。地球识别的国家名列在 `src/components/GlobeMap.tsx` 顶部的 `COUNTRY_NAME_TO_ISO`，每去一个新国家在那里加一行。110m 没有的小国（如新加坡）放在 `public/maps/extra-countries.json`。

### 图片路径

JSON 里的路径都是相对路径，实际 URL = `photoBaseUrl` + 路径。

例如 `photoBaseUrl = "https://cdn.example.com/photos"` + `yunnan/dali/001.webp`
→ `https://cdn.example.com/photos/yunnan/dali/001.webp`

---

## 部署

### 1. 图片存储（推荐 Cloudflare R2）

R2 免费额度：10GB 存储 + 每月 1000 万次请求，流量免费。把 R2 凭证写进 `.env.local`，`import-album.mjs` 会自动上传。然后把 `config.json` 的 `photoBaseUrl` 指向 R2 公开域名。

> 任何 S3 兼容存储都可以（AWS S3、阿里云 OSS 等），改脚本里的 endpoint 和 `photoBaseUrl` 即可。

### 2. 点赞（Supabase）

1. 在 [supabase.com](https://supabase.com) 创建免费项目
2. 在 SQL Editor 中执行 [`docs/likes.sql`](./docs/likes.sql)：建 `likes` 表，开启 RLS 且**不给 anon 任何策略**，浏览器无法直接读写
3. 在 Settings → API 复制 `URL`、`anon key`、`service_role key` 到 `.env.local`

所有读写都经由服务端 `/api/likes`。点赞凭证是访客 IP 加盐后的哈希，不存明文 IP，不存个人数据，不存评论。
不想要点赞功能就把 Supabase 变量留空，爱心会自动隐藏。

### 3. 访客计数（Vercount）

`VisitorCounter.tsx` 调用 [Vercount](https://vercount.one) 公开接口，无需配置，本地开发不上报。不需要的话从 `Footer.tsx` 里删掉即可。

### 4. 部署到 Vercel

在 [vercel.com](https://vercel.com) 导入 GitHub 仓库并添加环境变量，或使用命令行：

```bash
npm install -g vercel
vercel
```

每次推送到 `main` 自动重新部署。点赞接口会读取 Vercel 的 `x-vercel-ip-country` 头记录国家（可选字段）。

---

## CLIP 智能排序（可选）

对每个相册内的照片按视觉相似度自动排序，让浏览时的视觉过渡更自然。地球相册卡片会在这个顺序上分散取三张亮点，保证不是同一个地方。

### 安装

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install torch timm pillow numpy scikit-learn boto3 python-dotenv
```

### 使用

将 WebP 缩略图放到 `public/photos/{region}/{album}/`，然后运行：

```bash
python3 scripts/clip_sort_tsp_breakpoint.py
```

脚本会自动：
1. 扫描 `public/photos/` 下的所有相册
2. 对于 region JSON 中已有的旧照片，**自动从 R2 下载缺失的 WebP 缩略图**
3. 对所有照片统一进行 CLIP 特征提取 + TSP 优化排序
4. 将排序结果直接写回 `src/data/regions/{region}.json`

> 需要在 `.env.local` 中配置 R2 凭证，用于下载已有照片的缩略图。

---

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx            # 首页：地球 + 照片流 + 座右铭
│   ├── region/[regionId]/  # 地区页、相册页
│   └── api/likes/          # 点赞接口（服务端 Supabase）
├── components/
│   ├── GlobeMap.tsx        # 3D 地球、标记、相册面板
│   ├── PhotoRiver.tsx      # 按时间排序的滚动照片流
│   ├── PhotoGallery.tsx    # 瀑布流画廊
│   ├── PhotoLightbox.tsx   # 灯箱，srcset 选择 large/xlarge
│   ├── LikesProvider.tsx   # 点赞状态，每页一次请求
│   ├── LikeButton.tsx
│   ├── VisitorCounter.tsx
│   └── LocaleProvider.tsx  # 中英文 context
├── data/
│   ├── config.json         # 网站配置 ← 在这里自定义
│   ├── index.ts            # 自动聚合所有地区数据
│   └── regions/            # 每个地区一个 JSON ← 在这里添加相册
└── lib/
    ├── types.ts
    ├── photoUrl.ts
    ├── highlights.ts       # 挑选相册亮点照片
    └── likesServer.ts      # Supabase 客户端、IP 哈希
public/maps/
├── world.json              # Natural Earth 110m 国家（TopoJSON）
├── china.json              # 中国省份（GeoJSON，adcode）
└── extra-countries.json    # 110m 缺失的小国轮廓
.claude/skills/add-album/     # Claude Code skill: full add-album workflow
scripts/
├── import-album.mjs                # ★ 一条命令导入相册
├── generate-large.mjs              # 为已有相册生成 2048/3840 WebP
├── delete-originals.mjs            # 删除 R2 原图（默认 dry-run）
├── upload-photos.mjs               # 旧的通用上传脚本（R2 + region JSON）
├── upload-to-r2.mjs                # 纯 R2 上传
├── clip_sort_tsp_breakpoint.py     # CLIP + TSP 排序（直接写回 region JSON）
└── apply-clip-sort.ts              # 应用已有 clip_sorted.json
```

---

## 注意事项

- **图片格式**：瀑布流和照片流用 800px `.webp` 缩略图；灯箱通过 `srcset` 使用 `large`/`xlarge`，缺失时退回缩略图。
- **地球底图**：运行时从 OpenFreeMap 拉取 dark 样式；拉不到时地球仍会渲染为纯深色背景 + 你的轮廓。
- **中文文件名**：`next.config.ts` 设置了 `unoptimized: true`，避免非 ASCII 路径问题。
- **Hydration**：瀑布流预排序只在客户端运行，避免 SSR/CSR 不一致；地球组件 `ssr: false`。
- **版权保护**：原图不对外提供；展示图通过 CSS `pointer-events: none` + `user-select: none` 保护，灯箱中有版权提示。
- **Supabase 免费额度**：500MB 数据库 + 每月 200 万次 API 请求，个人使用绰绰有余。

更新日志：[`docs/CHANGELOG.md`](./docs/CHANGELOG.md)

---

## 许可证

[MIT](./LICENSE)

---

*如果这个项目对你有帮助，欢迎 ⭐*
