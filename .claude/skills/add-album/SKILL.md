---
name: add-album
description: 把一个本地照片文件夹注册成本站的新相册或追加到已有相册：EXIF → 三档 WebP → 上传 R2 → region JSON → 看图写中英 caption → 本地验证 → 推 main 部署。用户说"把 XX 文件夹加到网站 / 注册相册 / 新增相册"时使用。
---

# 新增相册全流程

所有命令在仓库根目录执行。核心脚本 `scripts/import-album.mjs`（幂等，可重跑）。
下文的 CDN 域名来自 `src/data/config.json` 的 `photoBaseUrl`。

## 1. 收集信息（先看，不要问）

- `ls <文件夹>`，`exiftool -json -n -DateTimeOriginal -Model -ISO ... <文件夹>/*.jpg` 看拍摄日期范围。
- 查 `src/data/regions/*.json` 判断地区是否已存在（`python3 -c` 打印每个 region 的 id / mapCode / albums）。
- 命名约定：
  - region id 用省/国家拼音小写（`shandong`、`usa`），album id 用城市/景点拼音（`qingdao`），相册完整 id = `{region}-{album}`。
  - `mapCode`：中国省份 `CN-两位省码`（山东 CN-37、四川 CN-51…，表见 `src/data/index.ts` 的 `provinceAdcodeMap` 和 `docs/codes.md`），港澳 `CN-HK`/`CN-MO`，其它国家 ISO 两位码。
  - 新国家还要在 `src/components/GlobeMap.tsx` 的 `COUNTRY_NAME_TO_ISO` 里加一行（Natural Earth 的国家名 → ISO 码），否则地球上不点亮。
  - `coords` 是地图标记点 `[经度, 纬度]`，取该地区主要城市。
  - `location` 格式：中文 `"中国 青岛"`，英文 `"Qingdao, China"`。
  - `--album-date` 取行程首日（通常是文件名前缀日期），不填则取最早 EXIF 日期。
- 只能从文件名/照片内容推断的东西（景点名）自己推断，但在最后汇报里**明确列出哪些地名是推断的**，用户会纠正。

## 2. 生成 + 看图写 caption

```bash
node scripts/import-album.mjs --dir <文件夹> --region <r> --album <a> \
  --region-name "山东/Shandong" --album-title "青岛/Qingdao" \
  --location "中国 青岛/Qingdao, China" --map-code CN-37 --coords 120.4,36.1 \
  --album-date 2026-10-01 --no-upload
```

- 地区已存在时省略 `--region-name/--map-code/--coords`；相册已存在时省略 `--album-title`（会按 id 追加）。
- 生成的 WebP 缓存在 `.cache/import/{region}/{album}/`（gitignored）。
- 用 sharp 把 800px 缩略图拼成 contact sheet（每张 ≤7 图，存到临时目录），用 Read 看图，为**每一张**写 caption，格式与现有一致：一句话、中文 15–25 字、英文一句，描述画面主体 + 地点/光线，不写"这张照片"。写到 `.cache/import/{region}/<album>-captions.json`：`{"文件名.jpg": {"zh": "...", "en": "..."}}`。
- `rm src/data/regions/<r>.json`（仅当是本次新建的地区；已有地区则删掉本次新加的 photos 条目）后带 `--captions` 重跑上一条命令，这样 caption 写进 JSON。
- 选封面：挑一张最有地标感的横幅，把 `albums[].cover` 改成它的 thumbnail 路径（默认是第一张）。
- 竖幅照片的 width/height 脚本已按 Orientation 修正，不用手动改。

## 3. 上传

```bash
node scripts/import-album.mjs --dir <文件夹> --region <r> --album <a> --upload-only
```

- 需要 `.env.local` 里的 R2_* 变量。沙盒直连 R2 有时握手失败：失败就加 `--proxy <本机代理地址>`，再不行让用户在自己终端跑同一条命令。
- 只上传三档 WebP，**原图永远不上传**（策略：前端不暴露原片）。
- 验证用 curl（Python urllib 可能被 Cloudflare 403）：对 JSON 里每个 thumbnail/large/xlarge 拼 `<photoBaseUrl>/<urlencode 路径>` 做 HEAD，全部 200 才算完成。

## 4. 验证 + 部署

- `npx tsc --noEmit -p .`。
- 本地 `npm run dev`（通常在 :3000），用 playwright-core + 本机 Chrome 检查：首页统计（国家/地区/照片数）、"更新于"日期、中国视图里该省点亮且有标记、`/region/<r>/<r>-<a>` 页 `img` 数量等于照片数且无 naturalWidth=0。
- 更新 `docs/CHANGELOG.md`（日期 + 新增相册 + 张数）。
- 提交并推送 `main`，Vercel 自动部署；等 1–2 分钟后 curl 线上相册页确认。

## 5. 汇报

一段话：相册链接、地区/相册 id、张数、封面、哪些 caption 地名是推断的。不要贴 JSON。
