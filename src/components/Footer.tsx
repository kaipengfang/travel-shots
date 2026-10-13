'use client';

import { siteConfig } from '@/data/index';
import { useLocale } from '@/components/LocaleProvider';
import VisitorCounter from '@/components/VisitorCounter';

export default function Footer() {
  const { locale } = useLocale();

  return (
    <footer className="border-t border-white/10 py-5">
      <div className="container mx-auto px-4 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-zinc-500">
        <span>© 2026 {siteConfig.author.name}</span>
        <span className="text-zinc-700 hidden sm:inline">·</span>
        <a href={`mailto:${siteConfig.author.email}`} className="hover:text-zinc-300 transition-colors">
          {siteConfig.author.email}
        </a>
        <VisitorCounter locale={locale} />
      </div>
    </footer>
  );
}
