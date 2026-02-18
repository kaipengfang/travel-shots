'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Photo } from '@/lib/types';
import PhotoLightbox from '@/components/PhotoLightbox';
import { photoUrl } from '@/lib/photoUrl';

interface PhotoGalleryProps {
  photos: Photo[];
  locale: 'zh' | 'en';
  title?: string;
  initialPhotoIndex?: number | null;
}

export default function PhotoGallery({ photos, locale, title, initialPhotoIndex = null }: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(initialPhotoIndex);
  const [reorderedPhotos, setReorderedPhotos] = useState<(Photo & { originalIndex: number })[]>(
    photos.map((photo, index) => ({ ...photo, originalIndex: index }))
  );

  useEffect(() => {
    if (initialPhotoIndex !== null && initialPhotoIndex >= 0 && initialPhotoIndex < photos.length) {
      setLightboxIndex(initialPhotoIndex);
    }
  }, [initialPhotoIndex, photos.length]);

  // 🎯 客户端渲染后应用预排序算法
  useEffect(() => {
    const cols = window.innerWidth >= 768 ? 3 : 2;
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
    
    setReorderedPhotos(result);
  }, [photos]);

  return (
    <div>
      {title && (
        <h1 className="text-2xl font-light mb-6 text-zinc-100">{title}</h1>
      )}

      {/* 瀑布流三列布局 - 使用 CSS Columns + 贪心预排序 */}
      <div className="columns-2 md:columns-3 gap-2">
        {reorderedPhotos.map((photo) => (
          <div
            key={photo.id}
            className="relative overflow-hidden rounded-lg bg-gray-800 cursor-pointer group break-inside-avoid mb-2"
            style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
            onClick={() => setLightboxIndex(photo.originalIndex)}
          >
            {/* 真实图片 */}
            <Image
              src={photoUrl(photo.thumbnail || photo.src)}
              alt={photo.title?.[locale] || ''}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 768px) 50vw, 33vw"
            />
            
            {/* Hover 遮罩 */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
          </div>
        ))}
      </div>

      {/* 灯箱 */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          currentIndex={lightboxIndex}
          locale={locale}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}
