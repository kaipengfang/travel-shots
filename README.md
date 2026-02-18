# TravelShots · 途影

> A personal photography showcase website centered around an interactive world map. Light up every place you've been.

**[Live Demo →](https://gallery.fangkaipeng.com)** · [中文文档 →](./README.zh.md)

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- 🗺️ **Interactive World Map** — Highlight visited countries and Chinese provinces (d3-geo, Natural Earth projection)
- 📸 **Masonry Gallery** — Preserves original aspect ratios with greedy pre-sorting for natural visual flow
- 🔍 **Lightbox** — Full-screen view with EXIF info and frosted glass background
- 💬 **Likes & Comments** — Powered by Supabase, no self-hosted backend needed
- 🌙 **Dark Mode** — Follows system preference automatically
- 🌐 **Bilingual** — Full Chinese/English support for both UI and photo metadata
- 🤖 **CLIP Smart Sorting** — Auto-sort album photos by visual similarity (optional)

---

## Quick Start

### Requirements

- Node.js 18+
- Python 3.10+ (only needed for CLIP sorting scripts)

### Install

```bash
git clone https://github.com/your-username/photography-website.git
cd photography-website
npm install
```

### Configure

Copy the environment file:

```bash
cp .env.example .env.local
```

Fill in your Supabase credentials (see [Deployment](#deployment)):

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
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

### Run

```bash
npm run dev
# Open http://localhost:3000
```

---

## Adding Albums

**Only edit JSON — no code changes needed.**

### Data Structure

```
Region → Album → Photo
```

Each region is a single JSON file under `src/data/regions/`. The site auto-discovers all files in that directory.

### Add a New Region

Create `src/data/regions/{region-id}.json`:

```jsonc
{
  "id": "yunnan",                          // unique id, used in URL: /region/yunnan
  "name": { "zh": "云南", "en": "Yunnan" },
  "coordinates": [102.7, 25.0],            // [longitude, latitude] — reverse of Google Maps order
  "mapCode": "CN-53",                      // used to highlight on map, see docs/codes.md
  "albums": [
    {
      "id": "yunnan-dali",                 // unique id, used in URL: /region/yunnan/yunnan-dali
      "title": { "zh": "大理", "en": "Dali" },
      "date": "2024-05-01",
      "cover": "yunnan/dali/cover.webp",   // album cover on region page, relative to photoBaseUrl
      "photos": [
        {
          "src": "yunnan/dali/001.jpg",        // full-res image shown in lightbox
          "thumbnail": "yunnan/dali/001.webp", // compressed thumbnail (800px wide) for masonry
          "width": 4000,                       // actual pixel dimensions — required, wrong values break layout
          "height": 2667,
          "caption": { "zh": "洱海日落", "en": "Sunset over Erhai Lake" },
          "location": { "zh": "大理，云南", "en": "Dali, Yunnan" },
          "date": "2024-05-01",
          "exif": {                            // optional, all subfields can be omitted
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

### mapCode Reference

| Type | Format | Example |
|------|--------|---------|
| Country | ISO 3166-1 Alpha-2 | `KR` (Korea), `US` (USA) |
| Chinese Province | `CN-` + subdivision code | `CN-51` (Sichuan), `CN-44` (Guangdong) |

Full reference: [`docs/codes.md`](./docs/codes.md)

### Image Paths

All paths in JSON are relative. The actual URL is `photoBaseUrl` + path.

e.g. `photoBaseUrl = "https://cdn.example.com/photos"` + `yunnan/dali/001.jpg`  
→ `https://cdn.example.com/photos/yunnan/dali/001.jpg`

---

## Deployment

### 1. Image Storage (Cloudflare R2 recommended)

R2 free tier: 10GB storage + 10M requests/month, egress is free.

```bash
node scripts/upload-to-r2.mjs
```

Then update `photoBaseUrl` in `config.json` to your R2 public domain.

> Any S3-compatible storage works (AWS S3, Aliyun OSS, etc.) — just change `photoBaseUrl`.

### 2. Likes & Comments (Supabase)

1. Create a free project at [supabase.com](https://supabase.com)
2. Run the following SQL in the SQL Editor:

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

3. Copy the `URL` and `anon key` from Settings → API into `.env.local`

### 3. Deploy to Vercel

Import your GitHub repo at [vercel.com](https://vercel.com) and add the environment variables, or use the CLI:

```bash
npm install -g vercel
vercel
```

Every push to `main` triggers an automatic redeploy.

---

## CLIP Smart Sorting (Optional)

Automatically sorts photos within each album by visual similarity for smoother transitions.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install torch transformers pillow numpy

# Generate sorted order
python3 scripts/clip_sort_tsp_breakpoint.py

# Apply to regions/*.json
npx ts-node scripts/apply-clip-sort.ts
```

---

## Project Structure

```
src/
├── app/                    # Next.js App Router
├── components/             # UI components
├── data/
│   ├── config.json         # Site config ← customize here
│   ├── index.ts            # Auto-aggregates all region data
│   └── regions/            # One JSON per region ← add albums here
└── lib/
    ├── types.ts
    └── photoUrl.ts
scripts/
├── gen-data.py             # Generate JSON from photo folders
├── batch-thumbnails.sh     # Batch generate WebP thumbnails
├── clip_sort_tsp_breakpoint.py
└── upload-to-r2.mjs
```

---

## Notes

- **Image formats:** Masonry uses `.webp` thumbnails (800px wide); lightbox uses original `.jpg`. Both are required.
- **Chinese filenames:** `next.config.ts` sets `unoptimized: true` to avoid issues with non-ASCII paths.
- **Hydration:** Masonry pre-sorting runs client-side only to avoid SSR/CSR mismatch.
- **Copyright:** Images are protected via CSS `pointer-events: none` + `user-select: none` with copyright notice in the lightbox.
- **Supabase free tier:** 500MB database + 2M API requests/month — more than enough for personal use.

---

## License

[MIT](./LICENSE)

---

*If this project helps you, a ⭐ is appreciated!*
