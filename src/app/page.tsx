'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useLocale } from '@/components/LocaleProvider';
import { mapLocations, visitedProvinces, visitedCountries, visitedCountryCount, siteConfig } from '@/data';

// 禁用 SSR
const WorldMap = dynamic(() => import('@/components/WorldMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full max-w-5xl mx-auto bg-[#0a0f1a] rounded-2xl shadow-sm border border-white/10 h-96 flex items-center justify-center">
      <span className="text-gray-500">加载地图中...</span>
    </div>
  )
});

const totalPhotos = mapLocations.reduce((s, l) => s + l.photoCount, 0);

export default function Home() {
  const { locale } = useLocale();

  return (
    <div className="min-h-screen flex flex-col page-enter">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-4 flex flex-col">
        {/* 标题 */}
        <section className="mb-2">
          <h1 className="text-2xl font-light text-center mb-2 text-zinc-100">
            {locale === 'zh' ? siteConfig.siteName.zh : siteConfig.siteName.en}
          </h1>
          <p className="text-center text-zinc-500 text-sm">
            {locale === 'zh'
              ? `${visitedCountryCount} 个国家 · ${mapLocations.length} 个地区 · ${totalPhotos} 张照片`
              : `${visitedCountryCount} countries · ${mapLocations.length} regions · ${totalPhotos} photos`
            }
          </p>
          <p className="text-center mt-1">
            <Link href="/globe" className="text-xs text-zinc-600 hover:text-amber-400 transition-colors">
              {locale === 'zh' ? '试试 3D 地球版 →' : 'Try the 3D globe →'}
            </Link>
          </p>
        </section>

        {/* 地图 */}
        <section className="flex-1 min-h-0 relative">
          <WorldMap
            locations={mapLocations}
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
      </main>

      <Footer />
    </div>
  );
}
