'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useLocale } from '@/components/LocaleProvider';
import { regions, siteConfig } from '@/data';
import { photoUrl } from '@/lib/photoUrl';

const GlobeMap = dynamic(() => import('@/components/GlobeMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[70vh] md:h-[75vh] bg-[#0a0f1a] rounded-2xl border border-white/10 flex items-center justify-center">
      <span className="text-gray-500">加载地球中...</span>
    </div>
  ),
});

export default function GlobePage() {
  const { locale } = useLocale();

  // All albums across regions, newest first; albums without a date go last.
  const recentAlbums = useMemo(() => {
    return regions
      .flatMap(region =>
        region.albums.map(album => ({
          album,
          region,
          href: region.albums.length === 1 ? `/region/${region.id}` : `/region/${region.id}/${album.id}`,
        }))
      )
      .sort((a, b) => {
        if (!a.album.date && !b.album.date) return 0;
        if (!a.album.date) return 1;
        if (!b.album.date) return -1;
        return b.album.date.localeCompare(a.album.date);
      });
  }, []);

  return (
    <div className="min-h-screen flex flex-col page-enter">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-4 flex flex-col gap-6">
        <section>
          <h1 className="text-2xl font-light text-center mb-2 text-zinc-100">
            {locale === 'zh' ? siteConfig.siteName.zh : siteConfig.siteName.en}
          </h1>
          <p className="text-center text-zinc-500 text-sm">
            {locale === 'zh' ? '3D 地球演示版 · ' : '3D globe demo · '}
            <Link href="/" className="hover:text-amber-400 transition-colors">
              {locale === 'zh' ? '← 返回平面地图' : '← Back to flat map'}
            </Link>
          </p>
        </section>

        <section>
          <GlobeMap locale={locale} />
        </section>

        <section>
          <h2 className="text-lg font-light text-zinc-200 mb-3">
            {locale === 'zh' ? '最近相册' : 'Recent albums'}
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 snap-x">
            {recentAlbums.map(({ album, region, href }, index) => (
              <Link
                key={`${region.id}-${album.id}`}
                href={href}
                className="group shrink-0 w-[220px] snap-start rounded-xl overflow-hidden bg-black/40 border border-white/10 hover:border-amber-500/50 transition-colors"
              >
                <div className="relative aspect-[3/2] bg-zinc-800">
                  {album.cover && (
                    <Image
                      src={photoUrl(album.cover)}
                      alt={album.title[locale]}
                      fill
                      sizes="220px"
                      priority={index < 4}
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm text-zinc-200 group-hover:text-amber-400 transition-colors truncate">
                    {album.title[locale]}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {region.name[locale]}
                    {album.date ? ` · ${album.date}` : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
