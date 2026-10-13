'use client';

import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useLocale } from '@/components/LocaleProvider';
import PhotoRiver from '@/components/PhotoRiver';
import { mapLocations, visitedCountryCount, siteConfig, latestPhotoDate } from '@/data';

const GlobeMap = dynamic(() => import('@/components/GlobeMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[70vh] md:h-[75vh] bg-[#0a0f1a] rounded-2xl border border-white/10 flex items-center justify-center">
      <span className="text-gray-500">加载地球中...</span>
    </div>
  ),
});

const totalPhotos = mapLocations.reduce((s, l) => s + l.photoCount, 0);

// 'YYYY-MM-DD' 按本地日期构造，避免被当作 UTC 后在西半球少显示一天
const localDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export default function Home() {
  const { locale } = useLocale();

  return (
    <div className="min-h-screen flex flex-col page-enter">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-4 flex flex-col gap-6">
        <section>
          <h1 className="text-2xl font-light text-center mb-2 text-zinc-100">
            {locale === 'zh' ? siteConfig.siteName.zh : siteConfig.siteName.en}
          </h1>
          <p className="text-center text-zinc-500 text-sm">
            {locale === 'zh'
              ? `${visitedCountryCount} 个国家 · ${mapLocations.length} 个地区 · ${totalPhotos} 张照片`
              : `${visitedCountryCount} countries · ${mapLocations.length} regions · ${totalPhotos} photos`}
          </p>
        </section>

        <section>
          <GlobeMap locale={locale} />
        </section>

        <div className="mt-6 md:mt-10">
          <PhotoRiver locale={locale} />
        </div>

        {/* 座右铭 + 最近更新：一行，日期淡色接在句尾 */}
        <p className="text-center text-sm text-zinc-400 italic">
          {locale === 'zh' ? siteConfig.motto.zh : siteConfig.motto.en}
          {latestPhotoDate && (
            <span className="not-italic text-zinc-600 block sm:inline whitespace-nowrap mt-1 sm:mt-0">
              <span className="hidden sm:inline">{' '}· </span>{locale === 'zh' ? '更新于 ' : 'updated '}
              {localDate(latestPhotoDate).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          )}
        </p>
      </main>

      <Footer />
    </div>
  );
}
