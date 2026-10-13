'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * 以 IP 为凭证的点赞状态。一个 Provider 负责一个相册页：挂载时一次性拉取
 * 相册本身和所有照片的点赞数，之后各个 LikeButton 共享这份状态。
 */
interface LikesState {
  counts: Record<string, number>;
  liked: Set<string>;
  pending: Set<string>;
  available: boolean;
  toggle: (target: string) => void;
}

const LikesContext = createContext<LikesState | null>(null);

export const albumTarget = (regionId: string, albumId: string) => `album:${regionId}/${albumId}`;
export const photoTarget = (regionId: string, albumId: string, photoId: string) =>
  `photo:${regionId}/${albumId}/${photoId}`;

export function LikesProvider({ targets, children }: { targets: string[]; children: React.ReactNode }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [available, setAvailable] = useState(true);
  const targetsKey = targets.join(',');
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    if (!targetsKey) return;
    const controller = new AbortController();
    fetch(`/api/likes?targets=${encodeURIComponent(targetsKey)}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (!data.success) { setAvailable(false); return; }
        setCounts(data.counts || {});
        setLiked(new Set<string>(data.liked || []));
      })
      .catch(err => { if (err?.name !== 'AbortError') setAvailable(false); });
    return () => controller.abort();
  }, [targetsKey]);

  const toggle = useCallback(async (target: string) => {
    if (pendingRef.current.has(target)) return;
    setPending(prev => new Set(prev).add(target));

    const wasLiked = liked.has(target);
    // 乐观更新
    setLiked(prev => { const next = new Set(prev); if (wasLiked) next.delete(target); else next.add(target); return next; });
    setCounts(prev => ({ ...prev, [target]: Math.max(0, (prev[target] || 0) + (wasLiked ? -1 : 1)) }));

    try {
      const res = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: target }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      // 以服务端结果为准
      setLiked(prev => { const next = new Set(prev); if (data.liked) next.add(target); else next.delete(target); return next; });
      setCounts(prev => ({ ...prev, [target]: data.count }));
    } catch {
      // 回滚
      setLiked(prev => { const next = new Set(prev); if (wasLiked) next.add(target); else next.delete(target); return next; });
      setCounts(prev => ({ ...prev, [target]: Math.max(0, (prev[target] || 0) + (wasLiked ? 1 : -1)) }));
    } finally {
      setPending(prev => { const next = new Set(prev); next.delete(target); return next; });
    }
  }, [liked]);

  const value = useMemo(() => ({ counts, liked, pending, available, toggle }), [counts, liked, pending, available, toggle]);
  return <LikesContext.Provider value={value}>{children}</LikesContext.Provider>;
}

export function useLikes() {
  return useContext(LikesContext);
}
