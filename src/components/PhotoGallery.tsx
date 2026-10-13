'use client';

import { useState, useCallback, useMemo, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Photo } from '@/lib/types';
import PhotoLightbox from '@/components/PhotoLightbox';
import LikeButton from '@/components/LikeButton';
import { LikesProvider, albumTarget, photoTarget } from '@/components/LikesProvider';
import { photoUrl } from '@/lib/photoUrl';

interface PhotoGalleryProps {
  photos: Photo[];
  locale: 'zh' | 'en';
  title?: string;
  initialPhotoIndex?: number | null;
  /** 用于点赞 target 与 URL 定位 */
  regionId: string;
  albumId: string;
  /** 从别处（如首页照片流）直接进入大图时，关闭大图要回到的路径 */
  closeTo?: string | null;
}

// 与 CSS 的 md:columns-3 断点保持一致
const COLUMNS_QUERY = '(min-width: 768px)';
const subscribeColumns = (cb: () => void) => {
  const mq = window.matchMedia(COLUMNS_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const getColumns = () => (window.matchMedia(COLUMNS_QUERY).matches ? 3 : 2);
const getServerColumns = () => 3;

export default function PhotoGallery({ photos, locale, title, initialPhotoIndex = null, regionId, albumId, closeTo = null }: PhotoGalleryProps) {
  const router = useRouter();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(initialPhotoIndex);
  // 列数跟随断点变化（旋转屏幕、缩放窗口）
  const cols = useSyncExternalStore(subscribeColumns, getColumns, getServerColumns);

  const likeTargets = [albumTarget(regionId, albumId), ...photos.map(p => photoTarget(regionId, albumId, p.id))];

  // URL 的 ?photo=N 变化时同步打开灯箱（在渲染期间调整 state，避免 effect 里 setState）
  const [prevInitial, setPrevInitial] = useState(initialPhotoIndex);
  if (initialPhotoIndex !== prevInitial) {
    setPrevInitial(initialPhotoIndex);
    if (initialPhotoIndex !== null && initialPhotoIndex >= 0 && initialPhotoIndex < photos.length) {
      setLightboxIndex(initialPhotoIndex);
    }
  }

  // 灯箱打开时把 ?photo=N 写进 URL，方便分享定位到具体照片
  const openLightbox = useCallback((index: number | null) => {
    if (index === null && closeTo) {
      // 从首页照片流进来的：关闭即返回首页
      router.push(closeTo);
      return;
    }
    setLightboxIndex(index);
    const url = new URL(window.location.href);
    if (index === null) url.searchParams.delete('photo');
    else url.searchParams.set('photo', String(index));
    window.history.replaceState(window.history.state, '', url);
  }, [closeTo, router]);

  // 🎯 贪心预排序：把照片按列高均衡分配，再按列顺序交给 CSS columns
  const reorderedPhotos = useMemo(() => {
    const columnWidth = 400;
    
    // 初始化每列的高度和照片列表
    const columns: { height: number; photos: (Photo & { originalIndex: number })[] }[] = [];
    for (let i = 0; i < cols; i++) {
      columns.push({ height: 0, photos: [] });
    }
    
    // 贪心算法：每次将照片放到当前最短的列
    photos.forEach((photo, index) => {
      const aspectRatio = photo.height / photo.width;
      const photoHeight = columnWidth * aspectRatio;
      
      // 找到当前最短的列
      let shortestCol = 0;
      let minHeight = columns[0].height;
      for (let i = 1; i < cols; i++) {
        if (columns[i].height < minHeight) {
          minHeight = columns[i].height;
          shortestCol = i;
        }
      }
      
      // 将照片添加到最短的列
      columns[shortestCol].photos.push({ ...photo, originalIndex: index });
      columns[shortestCol].height += photoHeight + 8;
    });
    
    // 按列顺序合并照片
    const result: (Photo & { originalIndex: number })[] = [];
    for (let col = 0; col < cols; col++) {
      result.push(...columns[col].photos);
    }
    
    return result;
  }, [photos, cols]);

  return (
    <LikesProvider targets={likeTargets}>
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        {title ? <h1 className="text-2xl font-light text-zinc-100">{title}</h1> : <span />}
        <LikeButton target={albumTarget(regionId, albumId)} locale={locale} />
      </div>

      {/* 瀑布流三列布局 - 使用 CSS Columns + 贪心预排序 */}
      <div className="columns-2 md:columns-3 gap-2">
        {reorderedPhotos.map((photo) => (
          <div
            key={photo.id}
            className="relative overflow-hidden rounded-lg bg-gray-800 cursor-pointer group break-inside-avoid mb-2"
            style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
            onClick={() => openLightbox(photo.originalIndex)}
          >
            {/* 真实图片 */}
            <Image
              src={photoUrl(photo.thumbnail)}
              alt={photo.title?.[locale] || ''}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 768px) 50vw, 33vw"
            />
            
            {/* Hover 遮罩 */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />

            {/* 单张照片点赞：hover 或已点赞时显示 */}
            <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 has-[[aria-pressed=true]]:opacity-100 transition-opacity">
              <LikeButton target={photoTarget(regionId, albumId, photo.id)} locale={locale} size="sm" overlay />
            </div>
          </div>
        ))}
      </div>

      {/* 灯箱 */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          currentIndex={lightboxIndex}
          locale={locale}
          onClose={() => openLightbox(null)}
          onNavigate={openLightbox}
          likeTarget={(p) => photoTarget(regionId, albumId, p.id)}
        />
      )}
    </div>
    </LikesProvider>
  );
}
