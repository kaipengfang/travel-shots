'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PhotoGallery from '@/components/PhotoGallery';
import AlbumInteraction from '@/components/AlbumInteraction';
import { regions } from '@/data';

export default function AlbumPage() {
  const params = useParams();
  const regionId = params.regionId as string;
  const albumId = params.albumId as string;
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');

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
  const album = region?.albums.find(a => a.id === albumId);

  if (!region || !album) {
    return (
      <div className="min-h-screen flex flex-col page-enter">
        <Header locale={locale} onLocaleChange={handleLocaleChange} />
        <main className="flex-1 container mx-auto px-4 py-8 flex items-center justify-center">
          <p className="text-zinc-400">
            {locale === 'zh' ? '相册不存在' : 'Album not found'}
          </p>
        </main>
        <Footer locale={locale} />
      </div>
    );
  }

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
          <Link href={`/region/${regionId}`} className="hover:text-emerald-400 transition-colors">
            {region.name[locale]}
          </Link>
          <span>·</span>
          <span className="text-zinc-300">{album.title[locale]}</span>
        </nav>

        {/* 照片瀑布流 */}
        <PhotoGallery 
          photos={album.photos} 
          locale={locale}
          title={album.title[locale]}
        />

        {/* 点赞评论 */}
        <AlbumInteraction 
          albumId={`${regionId}-${albumId}`} 
          locale={locale} 
        />
      </main>

      <Footer locale={locale} />
    </div>
  );
}
