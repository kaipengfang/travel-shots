# TravelShots · 途影

> A personal photography showcase built around an interactive 3D globe. Light up every place you've been.

**[Live Demo →](https://gallery.fangkaipeng.com)** · [中文文档 →](./README.zh.md)

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- 🌍 **3D Globe** — MapLibre globe with visited countries and Chinese provinces lit up, clustered photo markers, and an album panel that opens next to the region you click (OpenFreeMap tiles, no API key)
- 🌊 **Photo River** — Three slowly scrolling rows of photos under the globe, ordered by shooting date; click one to open it in the lightbox
- 📸 **Masonry Gallery** — Preserves original aspect ratios with greedy pre-sorting for natural visual flow
- 🔍 **Lightbox** — Full-screen view with EXIF info; serves a 2048px or 3840px WebP depending on the screen, originals never reach the browser
- ❤️ **Likes** — Albums and individual photos, keyed by a salted IP hash, stored in Supabase (no accounts, no comments)
- 👋 **Visitor counter** — "Welcome, Earthling No. N" in the footer via Vercount
- 🌐 **Bilingual** — Chinese/English for the UI, map labels and photo metadata
- 📦 **One-command import** — EXIF → three WebP sizes → R2 upload → region JSON, plus a Claude Code skill that also writes the captions
- 🤖 **CLIP Smart Sorting** — Auto-sort album photos by visual similarity (optional)

---

## Quick Start

### Requirements

- Node.js 20+
- [exiftool](https://exiftool.org/) (only for `import-album.mjs`)
- Python 3.10+ (only for CLIP sorting scripts)

### Install

```bash
git clone https://github.com/kaipengfang/travel-shots.git
cd travel-shots
npm install
```

### Configure

Copy the environment file:

```bash
cp .env.example .env.local
```

Fill in Supabase (likes) and, if you use the upload scripts, Cloudflare R2:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # server only, never shipped to the browser
LIKES_SALT=random_string        # optional; changing it resets everyone's likes

R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
```

Edit `src/data/config.json` with your own info:

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

Also add your CDN host to `remotePatterns` in `next.config.ts`.

### Run

```bash
npm run dev
# Open http://localhost:3000
```

---

## Adding Albums

### The fast way: `import-album.mjs`

One command takes a folder of JPGs and does everything:

```bash
node scripts/import-album.mjs --dir ~/photos/qingdao \
  --region shandong --album qingdao \
  --region-name "山东/Shandong" --album-title "青岛/Qingdao" \
  --location "中国 青岛/Qingdao, China" \
  --map-code CN-37 --coords 120.4,36.1 \
  --captions captions.json        # optional: {"file.jpg": {"zh": "...", "en": "..."}}
```

1. Reads EXIF with exiftool (camera, lens, ISO, aperture, shutter, date, size)
2. Generates three WebP sizes with sharp: 800px thumbnail, 2048px `large`, 3840px `xlarge` — the original is **not** uploaded
3. Uploads to R2 under `photos/{region}/{album}/` (existing files are skipped)
4. Writes `src/data/regions/{region}.json` — creates the region/album if missing, appends otherwise

`--region-name / --map-code / --coords` can be omitted when the region already exists, `--album-title` when the album exists.
Useful flags: `--dry-run`, `--no-upload` (generate + write JSON only), `--upload-only` (push the cached WebPs in `.cache/import/`), `--proxy URL`.

### With Claude Code: `/add-album`

The repo ships an agent skill in `.claude/skills/` (`add-album` in Chinese, `add-album-en` in English). Open the project in [Claude Code](https://claude.com/claude-code) and say "add the folder ~/photos/qingdao as a new album": the agent reads EXIF, runs `import-album.mjs`, looks at contact sheets to write a zh/en caption for every photo, picks a cover, uploads to R2, verifies the pages locally and pushes `main`. It reports which place names it guessed so you can correct them.

### By hand: edit JSON

**Only edit JSON — no code changes needed.**

```
Region → Album → Photo
```

Each region is a single JSON file under `src/data/regions/`. The site auto-discovers all files in that directory.

```jsonc
{
  "id": "yunnan",                          // unique id, used in URL: /region/yunnan
  "name": { "zh": "云南", "en": "Yunnan" },
  "coordinates": [102.7, 25.0],            // [longitude, latitude] — marker position on the globe
  "mapCode": "CN-53",                      // which outline to light up, see docs/codes.md
  "albums": [
    {
      "id": "yunnan-dali",                 // unique id, used in URL: /region/yunnan/yunnan-dali
      "title": { "zh": "大理", "en": "Dali" },
      "date": "2024-05-01",
      "cover": "yunnan/dali/cover.webp",   // album cover on region page, relative to photoBaseUrl
      "highlights": ["yunnan-003"],        // optional: photo ids shown on the globe's album card (auto-picked otherwise)
      "photos": [
        {
          "id": "yunnan-001",                     // unique within the site, used for likes and highlights
          "thumbnail": "yunnan/dali/001.webp",    // 800px WebP for masonry and the photo river
          "large": "yunnan/dali/001_2048.webp",   // lightbox, 2K screens (optional, falls back to thumbnail)
          "xlarge": "yunnan/dali/001_3840.webp",  // lightbox, 4K screens (optional)
          "width": 4000,                          // actual pixel dimensions — wrong values break layout
          "height": 2667,
          "title": { "zh": "", "en": "" },
          "caption": { "zh": "洱海日落", "en": "Sunset over Erhai Lake" },
          "location": { "zh": "大理，云南", "en": "Dali, Yunnan" },
          "date": "2024-05-01",                   // also drives the photo river and "last updated"
          "exif": {                               // optional
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

`src` (the original file) may still be present in older data; the data layer strips it so originals are never exposed. Run `scripts/generate-large.mjs` to create `large`/`xlarge` for existing albums, and `scripts/delete-originals.mjs --yes` to remove originals from R2 afterwards.

### mapCode Reference

| Type | Format | Example |
|------|--------|---------|
| Country | ISO 3166-1 Alpha-2 | `KR` (Korea), `US` (USA) |
| Chinese Province | `CN-` + subdivision code | `CN-51` (Sichuan), `CN-44` (Guangdong) |

Full reference: [`docs/codes.md`](./docs/codes.md)

> **Globe outlines.** Countries are drawn from Natural Earth 110m (`public/maps/world.json`). The names the globe recognises are listed in `COUNTRY_NAME_TO_ISO` at the top of `src/components/GlobeMap.tsx` — add a line there for each new country you visit. Tiny countries that 110m omits (e.g. Singapore) go in `public/maps/extra-countries.json`.

### Image Paths

All paths in JSON are relative. The actual URL is `photoBaseUrl` + path.

e.g. `photoBaseUrl = "https://cdn.example.com/photos"` + `yunnan/dali/001.webp`
→ `https://cdn.example.com/photos/yunnan/dali/001.webp`

---

## Deployment

### 1. Image Storage (Cloudflare R2 recommended)

R2 free tier: 10GB storage + 10M requests/month, egress is free. Put the R2 credentials in `.env.local`; `import-album.mjs` uploads for you. Then point `photoBaseUrl` in `config.json` at your R2 public domain.

> Any S3-compatible storage works (AWS S3, Aliyun OSS, etc.) — just change the endpoint in the scripts and `photoBaseUrl`.

### 2. Likes (Supabase)

1. Create a free project at [supabase.com](https://supabase.com)
2. Run [`docs/likes.sql`](./docs/likes.sql) in the SQL Editor. It creates the `likes` table with RLS enabled and **no** anon policy — the browser can't touch the table directly.
3. Copy `URL`, `anon key` and `service_role key` from Settings → API into `.env.local`

All reads and writes go through `/api/likes` on the server. The like "identity" is a salted hash of the visitor IP; no plain IPs, no personal data, no comments.
If you don't want likes at all, leave the Supabase variables empty — the hearts are simply hidden.

### 3. Visitor counter (Vercount)

`VisitorCounter.tsx` posts to the public [Vercount](https://vercount.one) API; nothing to configure. It does not report from `localhost`. Delete the component from `Footer.tsx` if you don't want it.

### 4. Deploy to Vercel

Import your GitHub repo at [vercel.com](https://vercel.com) and add the environment variables, or use the CLI:

```bash
npm install -g vercel
vercel
```

Every push to `main` triggers an automatic redeploy. The likes API uses Vercel's `x-vercel-ip-country` header for an optional country column.

---

## CLIP Smart Sorting (Optional)

Automatically sorts photos within each album by visual similarity for smoother visual transitions. The globe's album cards pick three highlights spread across that order, so they end up showing different places.

### Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install torch timm pillow numpy scikit-learn boto3 python-dotenv
```

### Usage

Place WebP thumbnails under `public/photos/{region}/{album}/`, then run:

```bash
python3 scripts/clip_sort_tsp_breakpoint.py
```

This will:
1. Scan all albums under `public/photos/`
2. For albums with existing photos in the region JSON, **automatically download missing WebP thumbnails from R2**
3. Run CLIP feature extraction + TSP optimization on all photos together
4. Write the sorted order directly back to `src/data/regions/{region}.json`

> Requires R2 credentials in `.env.local` for downloading existing thumbnails.

---

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Home: globe + photo river + motto
│   ├── region/[regionId]/  # Region page and album page
│   └── api/likes/          # Likes API (server-side Supabase)
├── components/
│   ├── GlobeMap.tsx        # 3D globe, markers, album panel
│   ├── PhotoRiver.tsx      # Time-ordered scrolling photo rows
│   ├── PhotoGallery.tsx    # Masonry gallery
│   ├── PhotoLightbox.tsx   # Lightbox with srcset (large/xlarge)
│   ├── LikesProvider.tsx   # Like state, one request per page
│   ├── LikeButton.tsx
│   ├── VisitorCounter.tsx
│   └── LocaleProvider.tsx  # zh/en context
├── data/
│   ├── config.json         # Site config ← customize here
│   ├── index.ts            # Auto-aggregates all region data
│   └── regions/            # One JSON per region ← add albums here
└── lib/
    ├── types.ts
    ├── photoUrl.ts
    ├── highlights.ts       # Picks album highlight photos
    └── likesServer.ts      # Supabase client, IP hashing
public/maps/
├── world.json              # Natural Earth 110m countries (TopoJSON)
├── china.json              # Chinese provinces (GeoJSON, adcode)
└── extra-countries.json    # Outlines missing from 110m
.claude/skills/               # Claude Code skills: add-album (zh), add-album-en (en)
scripts/
├── import-album.mjs                # ★ One-command album import
├── generate-large.mjs              # Create 2048/3840 WebP for existing albums
├── delete-originals.mjs            # Remove originals from R2 (dry-run by default)
├── upload-photos.mjs               # Older generic upload (R2 + region JSON)
├── upload-to-r2.mjs                # Plain R2 upload
├── clip_sort_tsp_breakpoint.py     # CLIP + TSP sorting (writes to region JSON)
└── apply-clip-sort.ts              # Apply an existing clip_sorted.json
```

---

## Notes

- **Image formats:** Masonry and the river use 800px `.webp` thumbnails; the lightbox uses `large`/`xlarge` WebP via `srcset` and falls back to the thumbnail if they are missing.
- **Globe tiles:** The base map is OpenFreeMap's dark style, fetched at runtime. If it can't be reached the globe still renders with a plain dark background and your outlines.
- **Chinese filenames:** `next.config.ts` sets `unoptimized: true` to avoid issues with non-ASCII paths.
- **Hydration:** Masonry pre-sorting runs client-side only to avoid SSR/CSR mismatch; the globe is loaded with `ssr: false`.
- **Copyright:** Originals are never served; display images are protected via CSS `pointer-events: none` + `user-select: none` with a copyright notice in the lightbox.
- **Supabase free tier:** 500MB database + 2M API requests/month — more than enough for personal use.

Changelog: [`docs/CHANGELOG.md`](./docs/CHANGELOG.md)

---

## License

[MIT](./LICENSE)

---

*If this project helps you, a ⭐ is appreciated!*
