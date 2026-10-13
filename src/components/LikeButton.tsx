'use client';

import { useLikes } from '@/components/LikesProvider';

interface LikeButtonProps {
  target: string;
  locale: 'zh' | 'en';
  size?: 'sm' | 'md';
  /** 覆盖在图片上时用更强的阴影 */
  overlay?: boolean;
  className?: string;
}

/** 一个爱心 + 计数。没有 Provider 或服务不可用时不渲染。 */
export default function LikeButton({ target, locale, size = 'md', overlay = false, className = '' }: LikeButtonProps) {
  const likes = useLikes();
  if (!likes || !likes.available) return null;

  const isLiked = likes.liked.has(target);
  const count = likes.counts[target] || 0;
  const isPending = likes.pending.has(target);
  const icon = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const text = size === 'sm' ? 'text-sm' : 'text-base';

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); likes.toggle(target); }}
      disabled={isPending}
      aria-pressed={isLiked}
      aria-label={isLiked ? (locale === 'zh' ? '取消点赞' : 'Unlike') : (locale === 'zh' ? '点赞' : 'Like')}
      className={`inline-flex items-center gap-1.5 cursor-pointer select-none transition-colors
        ${isLiked ? 'text-red-500' : 'text-zinc-400 hover:text-red-400'}
        ${overlay ? 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''}
        ${className}`}
    >
      <svg
        className={`${icon} transition-transform duration-200 ${isLiked ? 'scale-110 fill-current' : 'fill-none'}`}
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
      <span className={`${text} tabular-nums`}>{count}</span>
    </button>
  );
}
