'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { regions } from '@/data';
import { photoUrl } from '@/lib/photoUrl';
import type { Photo } from '@/lib/types';

interface RiverItem {
  photo: Photo;
  href: string;
  regionName: { zh: string; en: string };
}

const ROWS = 3;
/** 每个相册最多贡献的张数，保证不同地方交替出现 */
const PER_ALBUM = 6;
/** 总张数上限：每张缩略图约 60 KB，54 张约 3 MB */
const TOTAL = 54;
/** 一行滚完一圈的时长（秒），越长越慢 */
const ROW_DURATION = [95, 110, 100];

/** 按拍摄时间排序的照片流：所有有日期的照片，按相册限量后截取 */
function buildRiver(): RiverItem[][] {
  const all: (RiverItem & { date: string; albumId: string })[] = [];
  regions.forEach(region => {
    const single = region.albums.length === 1;
    region.albums.forEach(album => {
      const landscape = album.photos
        .map((photo, index) => ({ photo, index }))
        .filter(({ photo }) => photo.date && photo.width >= photo.height);
      // 相册内均匀取样，而不是只取前几张
      const step = Math.max(1, Math.floor(landscape.length / PER_ALBUM));
      landscape
        .filter((_, i) => i % step === 0)
        .slice(0, PER_ALBUM)
        .forEach(({ photo, index }) => {
          all.push({
            photo,
            date: photo.date,
            albumId: album.id,
            regionName: region.name,
            // from=home：关闭大图后回到首页，而不是留在相册页
            href: `${single ? `/region/${region.id}` : `/region/${region.id}/${album.id}`}?photo=${index}&from=home`,
          });
        });
    });
  });
  all.sort((a, b) => a.date.localeCompare(b.date));
  // 超出上限时按时间均匀抽样，保持整条时间线
  const items = all.length > TOTAL
    ? all.filter((_, i) => Math.floor((i * TOTAL) / all.length) !== Math.floor(((i - 1) * TOTAL) / all.length)).slice(0, TOTAL)
    : all;
  // 轮流分配到各行，每行内部仍按时间顺序
  const rows: RiverItem[][] = Array.from({ length: ROWS }, () => []);
  items.forEach((item, i) => rows[i % ROWS].push(item));
  return rows;
}

export default function PhotoRiver({ locale }: { locale: 'zh' | 'en' }) {
  const rows = useMemo(buildRiver, []);
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short' });

  return (
    <section className="photo-river" aria-label={locale === 'zh' ? '照片时间线' : 'Photo timeline'}>
      {rows.map((row, r) => (
        <div key={r} className="photo-river-row">
          <div
            className={`photo-river-track ${r % 2 === 1 ? 'reverse' : ''}`}
            style={{ animationDuration: `${ROW_DURATION[r % ROW_DURATION.length]}s` }}
          >
            {/* 内容重复两遍，位移 50% 即可无缝循环 */}
            {[0, 1].map(copy => (
              <div key={copy} className="photo-river-group" aria-hidden={copy === 1}>
                {row.map(({ photo, href, regionName }) => (
                  <Link
                    key={`${copy}-${photo.id}`}
                    href={href}
                    className="photo-river-item"
                    style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
                    tabIndex={copy === 1 ? -1 : 0}
                  >
                    <img src={photoUrl(photo.thumbnail || photo.src)} alt={photo.title?.[locale] || regionName[locale]} loading="lazy" />
                    <span className="photo-river-caption">
                      <b>{photo.location?.[locale] || regionName[locale]}</b>
                      <i>{fmt(photo.date)}</i>
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}

      <style jsx global>{`
        .photo-river { display: flex; flex-direction: column; gap: 8px; }
        .photo-river-row {
          overflow: hidden;
          -webkit-mask-image: linear-gradient(to right, transparent, #000 6%, #000 94%, transparent);
          mask-image: linear-gradient(to right, transparent, #000 6%, #000 94%, transparent);
        }
        .photo-river-track {
          display: flex; width: max-content;
          animation-name: photo-river-scroll; animation-timing-function: linear; animation-iteration-count: infinite;
        }
        .photo-river-track.reverse { animation-direction: reverse; }
        .photo-river-row:hover .photo-river-track { animation-play-state: paused; }
        .photo-river-group { display: flex; gap: 8px; padding-right: 8px; }
        .photo-river-item {
          position: relative; display: block; height: 104px; flex: none; border-radius: 8px; overflow: hidden; background: #27272a;
          outline: none;
        }
        @media (min-width: 768px) { .photo-river-item { height: 128px; } }
        .photo-river-item img {
          width: 100%; height: 100%; object-fit: cover; display: block;
          filter: brightness(0.82) saturate(0.95); transition: filter 0.35s, transform 0.5s;
        }
        .photo-river-item:hover img, .photo-river-item:focus-visible img { filter: brightness(1) saturate(1); transform: scale(1.04); }
        .photo-river-item:focus-visible { box-shadow: 0 0 0 2px #f59e0b; }
        .photo-river-caption {
          position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 8px 6px;
          display: flex; align-items: baseline; justify-content: space-between; gap: 6px;
          font-size: 11px; color: #fff; opacity: 0; transition: opacity 0.25s; pointer-events: none;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0));
        }
        .photo-river-caption b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .photo-river-caption i { font-style: normal; color: #d4d4d8; white-space: nowrap; }
        .photo-river-item:hover .photo-river-caption { opacity: 1; }
        @keyframes photo-river-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) {
          .photo-river-track { animation: none; }
          .photo-river-row { overflow-x: auto; }
        }
      `}</style>
    </section>
  );
}
