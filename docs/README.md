# 摄影作品展示网站

> 个人风光摄影作品展示，以地图为核心交互，点亮去过的地方。

---

## 目录

- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [核心组件](#核心组件)
  - [3D 地球](#1-3d-地球-globemaptsx)
  - [相册面板与照片流](#2-相册面板与亮点照片)
  - [瀑布流画廊](#3-瀑布流画廊-photogallerytsx)
  - [灯箱详情页](#4-灯箱详情页-photolightboxtsx)
  - [CLIP 智能排序](#5-clip-智能排序)
- [数据结构](#数据结构)
- [部署流程](#部署流程)
- [常见问题](#常见问题)
- [配置信息](#配置信息)

---

## 技术栈

| 组件 | 选择 | 理由 |
|------|------|------|
| 前端框架 | Next.js 16 + TypeScript | SSR、App Router |
| 样式 | Tailwind CSS | 快速开发、深色模式 |
| 地图 | MapLibre GL（球面投影） | 3D 地球，OpenFreeMap 底图无需 key |
| 后端 | Supabase | 点赞，免费 500MB |
| 图片处理 | Gemini Vision API | 自动生成 caption |
| 部署 | Vercel | 免费、全球 CDN |
| 图片存储 | Cloudflare R2 | 流量免费，成本最低 |

---

## 项目结构

```
travel-shots/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # 首页（地球 + 照片流）
│   │   ├── region/[regionId]/        # 地区页
│   │   └── region/[regionId]/[albumId]/  # 相册页
│   ├── components/
│   │   ├── GlobeMap.tsx              # 3D 地球
│   │   ├── PhotoRiver.tsx            # 时间照片流
│   │   ├── PhotoGallery.tsx          # 瀑布流画廊
│   │   ├── PhotoLightbox.tsx         # 灯箱详情页
│   │   ├── LikesProvider.tsx         # 点赞状态（IP 凭证）
│   │   └── LikeButton.tsx            # 爱心按钮
│   ├── data/
│   │   ├── index.ts                  # 自动聚合，动态计算派生数据
│   │   ├── config.json               # 全局配置（图床URL、网站名等）
│   │   └── regions/                  # 各地区数据（每个地区一个 JSON）
│   └── lib/
│       └── types.ts                  # 类型定义
├── public/
│   ├── maps/                         # 地图 JSON
│   │   ├── world.json
│   │   └── china.json
│   └── photos/                       # 照片文件
│       └── {region}/{album}/
├── scripts/
│   ├── clip_sort_tsp_breakpoint.py   # CLIP 排序
│   ├── apply-clip-sort.ts            # 应用排序
│   ├── gen-data.py                   # 生成数据
│   └── batch-thumbnails.sh           # 生成缩略图
└── docs/
    ├── README.md                     # 本文档
    └── CHANGELOG.md                  # 开发日志
```

---

## 核心组件

### 1. 3D 地球 (`GlobeMap.tsx`)

**功能：**
- MapLibre GL 球面投影，底图为 OpenFreeMap dark 样式（无需 API key，拉不到时退回纯色背景）
- 国家轮廓来自 `public/maps/world.json`（Natural Earth 110m），省份来自 `public/maps/china.json`（adcode），110m 缺失的小国放 `public/maps/extra-countries.json`
- 去过的国家 / 省份「点亮」（琥珀色填充）；跨 180° 经线的环会被剔除，避免在球面上拉成扇形
- 标签只保留国家 / 省 / 城市三级，按缩放级别渐进显示，语言跟随站点 locale
- 照片标记按屏幕距离聚合；点击地区取景到其轮廓，并在标记旁打开相册面板
- 「世界」「中国」按钮：中国按当前画布尺寸自适应取景（只统计纬度 17° 以北的省级要素）
- 离开页面前把视角存到 sessionStorage，从相册返回时恢复

**配置：**
```typescript
const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';
const COUNTRY_NAME_TO_ISO = { China: 'CN', 'South Korea': 'KR', ... }; // 新去一个国家在这里加一行
const MIN_ZOOM = 2; const MIN_ZOOM_NARROW = 1.2; const MAX_ZOOM = 9;
const PANEL_W = 480; const PANEL_H_MOBILE = 230; const WIDE_BREAKPOINT = 768;
```

### 2. 相册面板与亮点照片

- 宽屏：面板固定在地区轮廓一侧（480px）；窄屏：底部面板（230px），相册卡片横向滑动
- 每张相册卡片展示三张亮点照片，由 `src/lib/highlights.ts` 挑选：优先 `album.highlights` 指定的 id；否则只取横幅、按地点去重、在相册顺序上均匀分散（CLIP 排序后相邻照片相似，分散取样能避免三张同一地方）
- 面板缩略图使用 eager 加载，因为打开面板后它们就是 LCP

### 2.5 照片流 (`PhotoRiver.tsx`)

- 所有有拍摄日期的横幅照片，每个相册均匀取样最多 6 张，总数上限 54 张（约 3 MB 缩略图），超出时按时间均匀抽样
- 轮流分配到三行，每行内部按时间顺序，CSS 动画无限滚动，三行速度略有不同
- 点击跳转 `/region/.../?photo=N&from=home`，灯箱关闭后回到首页

### 3. 瀑布流画廊 (`PhotoGallery.tsx`)

**技术方案：** CSS Columns + 贪心预排序

**为什么选择这个方案？**
- ✅ 无空白（Columns 自动填充）
- ✅ 接近水平顺序（贪心算法优化）
- ✅ 保持照片原始比例
- ✅ 性能好（纯 CSS 渲染）

**贪心预排序算法：**

```javascript
// 1. 初始化每列
const columns = [
  { height: 0, photos: [] },
  { height: 0, photos: [] },
  { height: 0, photos: [] }
];

// 2. 遍历照片，放入最短的列
photos.forEach((photo, index) => {
  const photoHeight = columnWidth * (photo.height / photo.width);
  
  // 找最短列
  let shortestCol = 0;
  for (let i = 1; i < cols; i++) {
    if (columns[i].height < columns[shortestCol].height) {
      shortestCol = i;
    }
  }
  
  columns[shortestCol].photos.push(photo);
  columns[shortestCol].height += photoHeight;
});

// 3. 按列顺序输出
const result = columns.flatMap(col => col.photos);
```

**SSR/CSR 兼容：**
```javascript
const [reorderedPhotos, setReorderedPhotos] = useState(photos);

useEffect(() => {
  // 客户端渲染后应用预排序
  const cols = window.innerWidth >= 768 ? 3 : 2;
  // ... 贪心算法
  setReorderedPhotos(result);
}, [photos]);
```

### 4. 灯箱详情页 (`PhotoLightbox.tsx`)

**功能：**
- 全屏大图浏览
- 毛玻璃背景（backdrop-blur 40px）
- React Portal 渲染（避免定位问题）
- 键盘导航（方向键 / Escape）
- 滚轮切换图片
- EXIF 信息显示
- 底部信息栏（标题、地点、日期、描述）

### 5. CLIP 智能排序

**核心算法：** TSP (Traveling Salesman Problem) + 最佳断点

**原理：**
1. 使用 CLIP 模型提取照片特征向量（768 维）
2. 计算相似度矩阵（余弦相似度）
3. TSP 最近邻算法求解环形路径
4. 2-opt 局部优化
5. 找最佳断点（相似度最低的边）
6. 从断点处断开，得到线性序列

**使用流程：**

```bash
# 1. 运行 CLIP 排序（生成 clip_sorted.json）
.venv/bin/python scripts/clip_sort_tsp_breakpoint.py

# 2. 应用排序到数据文件
npx ts-node scripts/apply-clip-sort.ts
```

**效果指标：**
- 平均相邻相似度：0.45-0.65（越高越好）
- 首尾相似度：0.02-0.10（越低越好）

---

## 数据结构

### 三层结构

```
Region (地区/国家)
    │
    ├── id: "sichuan"
    ├── name: { zh: "四川", en: "Sichuan" }
    ├── coordinates: [104.0, 31.0]
    ├── countryCode: "CN"
    ├── provinceCode: 510000
    │
    ▼
    Album (相册)
    │
    ├── id: "sichuan-bipengou"
    ├── title: { zh: "毕棚沟", en: "Bipengou" }
    ├── cover: "/photos/.../xxx.webp"
    │
    ▼
    Photo (照片)
    │
    ├── src: "/photos/.../xxx.jpg"
    ├── thumbnail: "/photos/.../xxx.webp"
    ├── caption: { zh: "...", en: "..." }
    ├── location: { zh: "...", en: "..." }
    ├── exif: { camera, lens, iso, aperture, shutter }
    ├── width, height
    └── date: "2024-10-28"
```

### 当前统计

| 层级 | 数量 |
|------|------|
| Region | 9 |
| Album | 13 |
| Photo | 252 |

---

## 部署流程

### 新增相册（一条命令）

```bash
node scripts/import-album.mjs --dir ~/photos/qingdao \
  --region shandong --album qingdao \
  --region-name "山东/Shandong" --album-title "青岛/Qingdao" \
  --location "中国 青岛/Qingdao, China" \
  --map-code CN-37 --coords 120.4,36.1 \
  --album-date 2026-10-01 \
  --captions captions.json          # {"文件名.jpg": {"zh": "...", "en": "..."}}
```

脚本会：读 EXIF（exiftool）→ 生成 800 / 2048 / 3840 三档 WebP（sharp，原图不上传）→ 上传 R2
`photos/{region}/{album}/` → 写入 `src/data/regions/{region}.json`（地区 / 相册不存在则新建，存在则追加）。
地区已存在时 `--region-name / --map-code / --coords` 可省略；相册已存在时 `--album-title` 可省略。
`--no-upload` 只生成 + 写 JSON，`--upload-only` 只上传缓存里的 WebP（`.cache/import/`），
`--proxy` 让 R2 走代理。生成后 `npm run dev` 检查，再 push `main` 自动部署。

### 旧流程（photo-annotator + gen-data.py）

### 完整步骤

```
1. 准备照片文件夹（桌面）
       ↓
2. 使用 photo-annotator 处理（生成 processed.json）
       ↓
3. 生成缩略图
   ./scripts/batch-thumbnails.sh /path/to/photos
       ↓
4. 上传图片到图床（Cloudflare R2）
   路径格式：{region}/{album}/{filename}
       ↓
5. 配置映射（scripts/gen-data.py）
   FOLDER_TO_JSON[("region", "album")] = "xxx-processed.json"
       ↓
6. 生成地区 JSON
   python3 scripts/gen-data.py
   → 输出到 src/data/regions/{region}.json
       ↓
7. CLIP 排序（可选）
   .venv/bin/python scripts/clip_sort_tsp_breakpoint.py
   npx ts-node scripts/apply-clip-sort.ts
       ↓
8. 验证
   npm run dev
```

### 文件要求

| 用途 | 格式 | 说明 |
|------|------|------|
| 瀑布流预览 | .webp | 缩略图，800px 宽 |
| 大图查看 | .jpg | 原图，高清 |

**⚠️ 两个格式都必须有！**

### 快捷命令

```bash
# 启动开发服务器
npm run dev

# 生成缩略图
./scripts/batch-thumbnails.sh /path/to/photos

# 生成数据
python3 scripts/gen-data.py

# CLIP 排序
.venv/bin/python scripts/clip_sort_tsp_breakpoint.py
npx ts-node scripts/apply-clip-sort.ts
```

---

## 常见问题

### ❌ 大图 404

**原因：** 缺少 jpg 原图文件

**解决：**
```bash
cp "源文件夹"/*.jpg public/photos/{region}/{album}/
```

### ❌ 大图不显示详细信息

**原因：** gen-data.py 没读取到原始 JSON

**解决：**
1. 确认 `FOLDER_TO_JSON` 配置正确
2. 重新运行 `python3 scripts/gen-data.py`

### ❌ 地图不点亮

**原因：**
- 省份：`mapCode` 不是 `CN-xx` 格式
- 国家：`COUNTRY_NAME_TO_ISO` 映射缺失（名字要和 Natural Earth 一致）

**解决：**
- 省份：在对应地区的 JSON 文件中设置 `mapCode`（见 docs/codes.md）
- 国家：在 GlobeMap.tsx 的 `COUNTRY_NAME_TO_ISO` 添加映射；110m 没有的小国补到 `extra-countries.json`

### ❌ Hydration 错误

**原因：** 预排序算法在服务端和客户端结果不同

**解决：** 使用 `useState` + `useEffect`，确保初始状态一致

---

## 配置信息

### 环境变量 (.env.local)

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 原图下载 | 提供（带水印） | 保护版权 |
| 图片排列 | 三列瀑布流 | 保持原比例不裁切 |
| 色彩模式 | 深色背景 | 突出照片 |
| EXIF 信息 | 只在大图显示 | 减少干扰 |
| 双语 | UI + 图片信息 | 国际化 |
| 域名 | 自定义子域名 | 子域名 |

---

*最后更新：2026-10-13*
