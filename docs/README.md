# 摄影作品展示网站

> 个人风光摄影作品展示，以地图为核心交互，点亮去过的地方。

---

## 目录

- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [核心组件](#核心组件)
  - [世界地图](#1-世界地图-worldmaptsx)
  - [气泡框](#2-气泡框定位算法)
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
| 地图 | d3-geo | 灵活度高，支持自定义投影 |
| 后端 | Supabase | 点赞/评论，免费 500MB |
| 图片处理 | Gemini Vision API | 自动生成 caption |
| 部署 | Vercel | 免费、全球 CDN |
| 图片存储 | Cloudflare R2 | 流量免费，成本最低 |

---

## 项目结构

```
photography-website/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # 首页（地图）
│   │   ├── region/[regionId]/        # 地区页
│   │   └── region/[regionId]/[albumId]/  # 相册页
│   ├── components/
│   │   ├── WorldMap.tsx              # 核心地图组件
│   │   ├── PhotoGallery.tsx          # 瀑布流画廊
│   │   ├── PhotoLightbox.tsx         # 灯箱详情页
│   │   └── AlbumInteraction.tsx      # 点赞评论
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

### 1. 世界地图 (`WorldMap.tsx`)

**功能：**
- 世界地图展示（Natural Earth 投影）
- 中国省份边界叠加
- 去过的国家/省份「点亮」效果（琥珀色 + 发光滤镜）
- 地图拖拽平移、滚轮缩放
- 「世界视图」「中国视图」快捷切换
- 标记点 + Hover 气泡预览

**配置：**
```typescript
// 地图尺寸
const svgWidth = 1400;
const svgHeight = 820;

// 颜色配置
const VISITED_FILL = '#f59e0b';      // 已访问：琥珀色
const UNVISITED_FILL = '#1a2035';    // 未访问：深蓝灰
```

### 2. 气泡框定位算法

**核心逻辑（v9）：**
1. 计算标记点到容器四边的空间
2. 定义 8 个方向候选位置（四角 + 四边）
3. 每个方向判断是否能完整放下气泡框
4. 选择第一个有效方向
5. 边界约束保底

**优先级：** 右下 > 右上 > 左下 > 左上 > 右 > 左 > 下 > 上

**气泡框尺寸：**
- 多相册（3 个）：420 × 288 px
- 单相册（6 张图）：420 × 428 px

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
- 省份：缺少 provinceCode
- 国家：countryNameToCode 映射缺失

**解决：**
- 省份：在对应地区的 JSON 文件中添加 `provinceCode`
- 国家：在 WorldMap.tsx 添加映射

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
| 域名 | photo.fangkaipeng.com | 子域名 |

---

*最后更新：2026-02-17*
