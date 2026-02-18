'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Region } from '@/lib/types';
import { photoUrl } from '@/lib/photoUrl';

interface AlbumGridProps {
  region: Region;
  locale: 'zh' | 'en';
}

export default function AlbumGrid({ region, locale }: AlbumGridProps) {
  return (
    <div>
      <h1 className="text-2xl font-light mb-8">{region.name[locale]}</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {region.albums.map(album => (
          <Link
            key={album.id}
            href={`/region/${region.id}/${album.id}`}
            className="group block"
          >
            {/* 封面图 */}
            <div className="aspect-[3/2] relative overflow-hidden rounded-lg bg-gray-100 mb-3">
              {album.cover ? (
                <Image
                  src={photoUrl(album.cover)}
                  alt={album.title[locale]}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 group-hover:scale-105 transition-transform duration-300" />
              )}
            </div>
            
            {/* 相册信息 */}
            <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
              {album.title[locale]}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {album.photos.length} {locale === 'zh' ? '张照片' : 'photos'} · {album.date}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
