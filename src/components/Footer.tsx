import { siteConfig } from '@/data/index';

interface FooterProps {
  locale: 'zh' | 'en';
}

export default function Footer({ locale }: FooterProps) {
  return (
    <footer className="border-t border-gray-100 dark:border-white/10 py-6">
      <div className="container mx-auto px-4 text-center text-sm text-gray-500 dark:text-zinc-400">
        <p>
          {locale === 'zh' ? `© 2026 ${siteConfig.author.name}` : `© 2026 ${siteConfig.author.name}`}
        </p>
        <p className="mt-1">
          <a 
            href={`mailto:${siteConfig.author.email}`}
            className="hover:text-gray-700 dark:hover:text-white transition-colors"
          >
            {siteConfig.author.email}
          </a>
        </p>
      </div>
    </footer>
  );
}
