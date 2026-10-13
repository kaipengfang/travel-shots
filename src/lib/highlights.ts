import type { Album, Photo } from '@/lib/types';

/**
 * 为相册挑选 n 张适合做缩略展示的照片。
 *
 * 规则：优先手动指定的 album.highlights（照片 id）；否则只取横幅照片，
 * 按拍摄地点去重，并在相册顺序上均匀分散（相册经 CLIP 排序后相邻照片风格相近，
 * 分散取样能保证三张不是同一个地方、同一个角度）。
 */
export function pickHighlights(album: Album, n = 3): Photo[] {
  const photos = album.photos;
  if (photos.length <= n) return photos;

  if (album.highlights?.length) {
    const byId = new Map(photos.map(p => [p.id, p]));
    const manual = album.highlights.map(id => byId.get(id)).filter((p): p is Photo => !!p);
    if (manual.length >= n) return manual.slice(0, n);
  }

  const landscape = photos.filter(p => p.width > p.height);
  const pool = landscape.length >= n ? landscape : photos;

  // 在 pool 上取 n 个均匀分布的位置作为起点，各自向外找最近的、地点未重复的照片
  const picked: Photo[] = [];
  const usedLoc = new Set<string>();
  const locKey = (p: Photo) => (p.location?.zh || p.location?.en || '').trim();
  const taken = new Set<number>();
  for (let k = 0; k < n; k++) {
    const target = Math.floor(((k + 0.5) / n) * pool.length);
    let choice = -1;
    for (let d = 0; d < pool.length && choice < 0; d++) {
      for (const idx of [target - d, target + d]) {
        if (idx < 0 || idx >= pool.length || taken.has(idx)) continue;
        const loc = locKey(pool[idx]);
        if (loc && usedLoc.has(loc)) continue;
        choice = idx; break;
      }
    }
    if (choice < 0) {
      // 地点都重复了，放宽地点限制
      for (let d = 0; d < pool.length && choice < 0; d++) {
        for (const idx of [target - d, target + d]) {
          if (idx >= 0 && idx < pool.length && !taken.has(idx)) { choice = idx; break; }
        }
      }
    }
    if (choice < 0) break;
    taken.add(choice);
    const loc = locKey(pool[choice]);
    if (loc) usedLoc.add(loc);
    picked.push(pool[choice]);
  }
  return picked;
}
