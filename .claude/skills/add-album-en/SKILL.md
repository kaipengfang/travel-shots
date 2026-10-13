---
name: add-album-en
description: Register a local photo folder as a new album on this site, or append it to an existing one: EXIF → three WebP sizes → R2 upload → region JSON → look at the photos and write zh/en captions → local checks → push main to deploy. Use when the user says "add folder X as an album / register an album / new album". English twin of `add-album`.
---

# Add an album, end to end

Run every command from the repo root. The core script is `scripts/import-album.mjs` (idempotent, safe to rerun).
The CDN host below comes from `photoBaseUrl` in `src/data/config.json`.

## 1. Gather facts (look first, don't ask)

- `ls <folder>` and `exiftool -json -n -DateTimeOriginal -Model -ISO ... <folder>/*.jpg` to see the date range.
- Read `src/data/regions/*.json` to tell whether the region already exists (e.g. `python3 -c` printing each region's id / mapCode / albums).
- Naming conventions:
  - region id = lowercase romanised province/country (`shandong`, `usa`); album id = city/sight (`qingdao`); full album id = `{region}-{album}`.
  - `mapCode`: Chinese provinces `CN-<two-digit code>` (Shandong CN-37, Sichuan CN-51…; table in `provinceAdcodeMap` in `src/data/index.ts` and `docs/codes.md`), Hong Kong/Macau `CN-HK`/`CN-MO`, other countries ISO alpha-2.
  - A new country also needs a line in `COUNTRY_NAME_TO_ISO` in `src/components/GlobeMap.tsx` (Natural Earth name → ISO), otherwise the globe won't light it up.
  - `coords` is the marker position `[longitude, latitude]`, use the region's main city.
  - `location` format: zh `"中国 青岛"`, en `"Qingdao, China"`.
  - `--album-date` is the first day of the trip (usually the filename prefix); if omitted the earliest EXIF date is used.
- Infer what can only be inferred from filenames or photo content (sight names), but **list every guessed place name explicitly** in the final report so the user can correct it.

## 2. Generate files and write captions

```bash
node scripts/import-album.mjs --dir <folder> --region <r> --album <a> \
  --region-name "山东/Shandong" --album-title "青岛/Qingdao" \
  --location "中国 青岛/Qingdao, China" --map-code CN-37 --coords 120.4,36.1 \
  --album-date 2026-10-01 --no-upload
```

- Omit `--region-name/--map-code/--coords` when the region exists; omit `--album-title` when the album exists (photos are appended by id).
- Generated WebPs are cached in `.cache/import/{region}/{album}/` (gitignored).
- Use sharp to tile the 800px thumbnails into contact sheets (≤7 images each, saved to a temp dir), view them with Read, and write a caption for **every** photo in the existing style: one sentence, Chinese 15–25 characters, one English sentence, describing the subject plus place/light, never "this photo". Save to `.cache/import/{region}/<album>-captions.json` as `{"file.jpg": {"zh": "...", "en": "..."}}`.
- `rm src/data/regions/<r>.json` (only if the region was created in this run; for an existing region delete just the photo entries added this run), then rerun the command above with `--captions` so the captions land in the JSON.
- Pick a cover: the most landmark-like landscape photo; set `albums[].cover` to its thumbnail path (default is the first photo).
- Portrait width/height are already corrected for EXIF Orientation by the script.

## 3. Upload

```bash
node scripts/import-album.mjs --dir <folder> --region <r> --album <a> --upload-only
```

- Needs the `R2_*` variables in `.env.local`. A sandboxed direct connection to R2 sometimes fails the TLS handshake: retry with `--proxy <local proxy URL>`; if that still fails, ask the user to run the same command in their own terminal.
- Only the three WebP sizes are uploaded, **never the originals** (policy: originals are not exposed to the browser).
- Verify with curl (Python urllib may get a Cloudflare 403): HEAD `<photoBaseUrl>/<url-encoded path>` for every thumbnail/large/xlarge in the JSON; done only when all return 200.

## 4. Verify and deploy

- `npx tsc --noEmit -p .`.
- With `npm run dev` running (usually :3000), check with playwright-core and the local Chrome: homepage counts (countries/regions/photos), the "updated" date, the province lit with a marker in the China view, and `/region/<r>/<r>-<a>` showing as many `img` elements as photos with none at naturalWidth=0.
- Update `docs/CHANGELOG.md` (date, new album, photo count).
- Commit and push `main`; Vercel deploys automatically. After 1–2 minutes curl the live album page to confirm.

## 5. Report

One paragraph: album link, region/album ids, photo count, cover, and which caption place names were guessed. Don't paste JSON.
