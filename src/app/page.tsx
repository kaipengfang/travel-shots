'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { regions, mapLocations, visitedProvinces, visitedCountries, siteConfig } from '@/data';

// 禁用 SSR
const WorldMap = dynamic(() => import('@/components/WorldMap'), { 
  ssr: false,
  loading: () => (
    <div className="w-full max-w-5xl mx-auto bg-[#0a0f1a] rounded-2xl shadow-sm border border-white/10 h-96 flex items-center justify-center">
      <span className="text-gray-500">加载地图中...</span>
    </div>
  )
});

export default function Home() {
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
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

  const currentRegion = regions.find(r => r.id === selectedRegion);
  
  // 统计唯一国家数量
  const uniqueCountries = new Set(regions.map(r => r.mapCode.split('-')[0])).size;
  const totalPhotos = mapLocations.reduce((s, l) => s + l.photoCount, 0);

  return (
    <div className="min-h-screen flex flex-col page-enter">
      <Header locale={locale} onLocaleChange={handleLocaleChange} />
      
      <main className="flex-1 container mx-auto px-4 py-4 flex flex-col">
        {/* 标题 */}
        <section className="mb-2">
          <h1 className="text-2xl font-light text-center mb-2 text-zinc-100">
            {locale === 'zh' ? siteConfig.siteName.zh : siteConfig.siteName.en}
          </h1>
          <p className="text-center text-zinc-500 text-sm">
            {locale === 'zh' 
              ? `${uniqueCountries} 个国家 · ${mapLocations.length} 个地区 · ${totalPhotos} 张照片`
              : `${uniqueCountries} countries · ${mapLocations.length} regions · ${totalPhotos} photos`
            }
          </p>
        </section>

        {/* 地图 */}
        <section className="flex-1 min-h-0 relative">
          <WorldMap 
            locations={mapLocations}
            onLocationClick={setSelectedRegion}
            locale={locale}
            visitedProvinces={visitedProvinces}
            visitedCountries={visitedCountries}
          />
          {/* 座右铭 - 地图下方居中 */}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center text-zinc-400 text-sm italic whitespace-nowrap">
            {locale === 'zh' 
              ? siteConfig.motto.zh
              : siteConfig.motto.en}
          </p>
        </section>

        {/* RegionPreview 已移除，改为在 WorldMap 中显示 hover 气泡框 */}
      </main>

      <Footer locale={locale} />
    </div>
  );
}
