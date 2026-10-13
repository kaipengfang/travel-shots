'use client';

import { useEffect, useState } from 'react';

/**
 * 访客计数，使用 Vercount（和个人主页同一个服务）。
 * 接口按站点去重统计独立访客（site_uv）；每个浏览器会话只请求一次，结果缓存在 sessionStorage。
 */
const API = 'https://events.vercount.one/api/v2/log';
const CACHE_KEY = 'vercount_site_uv';
/** 与 Vercount 官方脚本一致：按站点存一个一年期 cookie，没有它的访问才计为新访客 */
const uvCookieName = () => 'vercount_uv_' + window.location.host.replace(/[^a-zA-Z0-9_-]/g, '_');
const hasUvCookie = () => document.cookie.split('; ').some(c => c === `${uvCookieName()}=1`);
const setUvCookie = () => { document.cookie = `${uvCookieName()}=1; path=/; max-age=31536000; samesite=lax`; };

export default function VisitorCounter({ locale }: { locale: 'zh' | 'en' }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // 本地开发不上报，否则所有人的 localhost 会混在同一个计数里
    if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return;

    let cached: string | null = null;
    try { cached = sessionStorage.getItem(CACHE_KEY); } catch { /* storage unavailable */ }

    const load = cached
      ? Promise.resolve(Number(cached))
      : (() => {
          const isNewUv = !hasUvCookie();
          if (isNewUv) setUvCookie();
          return fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: `${window.location.origin}/`, isNewUv }),
          });
        })()
          .then(r => r.json())
          .then(data => {
            const uv = Number(data?.data?.site_uv);
            if (Number.isFinite(uv) && uv > 0) {
              try { sessionStorage.setItem(CACHE_KEY, String(uv)); } catch { /* ignore */ }
              return uv;
            }
            return null;
          });

    load
      .then(uv => { if (!cancelled && uv) setCount(uv); })
      .catch(() => { /* 服务不可用时不显示 */ });
    return () => { cancelled = true; };
  }, []);

  if (count === null) return null;
  const n = count.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US');
  return (
    <>
      <span className="text-zinc-700 hidden sm:inline">·</span>
      <span className="whitespace-nowrap">
        {locale === 'zh'
          ? <>欢迎，第 <span className="text-amber-400 tabular-nums">{n}</span> 位来访的地球人</>
          : <>Welcome, Earthling No. <span className="text-amber-400 tabular-nums">{n}</span></>}
      </span>
    </>
  );
}
