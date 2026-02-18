'use client';

import Link from 'next/link';
import { siteConfig } from '@/data/index';

interface HeaderProps {
  locale: 'zh' | 'en';
  onLocaleChange: (locale: 'zh' | 'en') => void;
}

export default function Header({ locale, onLocaleChange }: HeaderProps) {
  return (
    <header className="border-b border-gray-100 dark:border-white/10">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="text-xl font-light tracking-wide dark:text-white">
          {locale === 'zh' ? '途影' : 'TravelShots'}
        </Link>

        {/* 导航 */}
        <nav className="flex items-center gap-6">
          <a 
            href={siteConfig.author.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            {locale === 'zh' ? '关于' : 'About'}
          </a>
          
          {/* 语言切换 */}
          <button
            onClick={() => onLocaleChange(locale === 'zh' ? 'en' : 'zh')}
            className="text-sm text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            {locale === 'zh' ? 'EN' : '中'}
          </button>
        </nav>
      </div>
    </header>
  );
}
