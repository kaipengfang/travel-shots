'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AlbumGrid from '@/components/AlbumGrid';
import PhotoGallery from '@/components/PhotoGallery';
import AlbumInteraction from '@/components/AlbumInteraction';
import { regions } from '@/data';

export default function RegionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const regionId = params.regionId as string;
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  
  // 读取 URL 参数 ?photo=N
  const photoParam = searchParams.get('photo');
  const initialPhotoIndex = photoParam !== null ? parseInt(photoParam, 10) : null;

  // 从 localStorage 读取语言偏好
  useEffect(() => {
    const saved = localStorage.getItem('photo_locale') as 'zh' | 'en';
    if (saved) setLocale(saved);
  }, []);

  // 保存语言偏好
  const handleLocaleChange = (newLocale: 'zh' | 'en') => {
    setLocale(newLocale);
    localStorage.setItem('photo_locale', newLocale);
  };

  const region = regions.find(r => r.id === regionId);

  if (!region) {
    return (
      <div className="min-h-screen flex flex-col page-enter">
        <Header locale={locale} onLocaleChange={handleLocaleChange} />
        <main className="flex-1 container mx-auto px-4 py-8 flex items-center justify-center">
          <p className="text-zinc-400">
            {locale === 'zh' ? '地区不存在' : 'Region not found'}
          </p>
        </main>
        <Footer locale={locale} />
      </div>
    );
  }

  const hasMultipleAlbums = region.albums.length > 1;

  return (
    <div className="min-h-screen flex flex-col page-enter">
      <Header locale={locale} onLocaleChange={handleLocaleChange} />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        {/* 面包屑导航 */}
        <nav className="flex items-center gap-2 text-sm text-zinc-500 mb-6">
          <Link href="/" className="hover:text-emerald-400 transition-colors">
            {locale === 'zh' ? '← 返回地图' : '← Back to Map'}
          </Link>
          <span>·</span>
          <span className="flex items-center gap-1">
            <span>📍</span>{region.name[locale]}
          </span>
        </nav>

        {/* 相册标题 */}
        <div className="mb-8">
          <h1 className="text-2xl font-light text-zinc-100">{region.name[locale]}</h1>
          <p className="text-zinc-500 mt-1">
            {locale === 'zh' ? `${region.albums.length} 个相册` : `${region.albums.length} albums`}
          </p>
        </div>

        {/* 相册网格或照片瀑布流 */}
        {hasMultipleAlbums ? (
          <AlbumGrid region={region} locale={locale} />
        ) : (
          <>
            <PhotoGallery 
              photos={region.albums[0]?.photos || []} 
              locale={locale}
              title={region.albums[0]?.title[locale]}
              initialPhotoIndex={initialPhotoIndex}
            />
            <AlbumInteraction 
              albumId={`${regionId}-${region.albums[0]?.id}`} 
              locale={locale} 
            />
          </>
        )}
      </main>

      <Footer locale={locale} />
    </div>
  );
}
