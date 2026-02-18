'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Region } from '@/lib/types';

interface RegionPreviewProps {
  region: Region;
  locale: 'zh' | 'en';
  onClose: () => void;
}

export default function RegionPreview({ region, locale, onClose }: RegionPreviewProps) {
  // 获取点赞最多的照片（暂时取前4张）
  const previewPhotos = region.albums
    .flatMap(album => album.photos)
    .slice(0, 4);

  const hasMultipleAlbums = region.albums.length > 1;
  const targetUrl = hasMultipleAlbums 
    ? `/region/${region.id}` 
    : `/region/${region.id}/${region.albums[0]?.id}`;

  return (
    <section className="border-t border-gray-100 pt-8 animate-in slide-in-from-bottom duration-300">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="text-lg">📍</span>
          <h2 className="text-xl font-light">
            {region.name[locale]}
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <Link 
            href={targetUrl}
            className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            {locale === 'zh' ? '查看全部 →' : 'View All →'}
          </Link>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 预览图片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {previewPhotos.map(photo => (
          <div 
            key={photo.id} 
            className="aspect-[3/2] relative overflow-hidden rounded-lg bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity"
          >
            {/* 暂时用占位色块 */}
            <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-400 text-sm">
              {photo.title[locale]}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
