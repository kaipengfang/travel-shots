'use client';

import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useLocale } from '@/components/LocaleProvider';
import PhotoRiver from '@/components/PhotoRiver';
import { mapLocations, visitedCountryCount, siteConfig } from '@/data';

const GlobeMap = dynamic(() => import('@/components/GlobeMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[70vh] md:h-[75vh] bg-[#0a0f1a] rounded-2xl border border-white/10 flex items-center justify-center">
      <span className="text-gray-500">加载地球中...</span>
    </div>
  ),
});

const totalPhotos = mapLocations.reduce((s, l) => s + l.photoCount, 0);

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

        <p className="text-center text-zinc-400 text-sm italic">
          {locale === 'zh' ? siteConfig.motto.zh : siteConfig.motto.en}
        </p>
      </main>

      <Footer />
    </div>
  );
}
