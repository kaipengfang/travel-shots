'use client';

import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Photo } from '@/lib/types';
import { photoUrl } from '@/lib/photoUrl';

interface PhotoLightboxProps {
  photos: Photo[];
  currentIndex: number;
  locale: 'zh' | 'en';
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function PhotoLightbox({
  photos,
  currentIndex,
  locale,
  onClose,
  onNavigate
}: PhotoLightboxProps) {
  const photo = photos[currentIndex];
  const [mounted, setMounted] = useState(false);
  
  const goNext = useCallback(() => {
    if (currentIndex < photos.length - 1) {
      onNavigate(currentIndex + 1);
    }
  }, [currentIndex, photos.length, onNavigate]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      onNavigate(currentIndex - 1);
    }
  }, [currentIndex, onNavigate]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goNext, goPrev]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY > 0) goNext();
      else if (e.deltaY < 0) goPrev();
    };
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [goNext, goPrev]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const lightboxContent = (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ height: '100vh', width: '100vw' }}>
      {/* 毛玻璃背景层 - 强模糊 + 半透明深色遮罩 */}
      <div 
        className="absolute inset-0 z-0"
        style={{ 
          backdropFilter: 'blur(40px) saturate(120%)',
          WebkitBackdropFilter: 'blur(40px) saturate(120%)',
          backgroundColor: 'rgba(0, 0, 0, 0.5)' 
        }}
      />
      
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-[60] text-white/80 hover:text-white w-14 h-14 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition-all"
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* 左箭头 */}
      {currentIndex > 0 && (
        <button
          onClick={goPrev}
          className="absolute left-6 top-1/2 -translate-y-1/2 z-[60] text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all w-14 h-14 flex items-center justify-center"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* 右箭头 */}
      {currentIndex < photos.length - 1 && (
        <button
          onClick={goNext}
          className="absolute right-6 top-1/2 -translate-y-1/2 z-[60] text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all w-14 h-14 flex items-center justify-center"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* 图片区域 - 居中显示，最大化且不超出边界 */}
      <div 
        className="relative flex-1 flex items-center justify-center p-4 z-10 overflow-hidden"
      >
        <img
          src={photoUrl(photo.src)}
          alt={photo.title?.[locale] || ''}
          title="© Copyright 2026 途影"
          className="max-w-[95%] max-h-[calc(100vh-200px)] object-contain rounded-lg cursor-context-menu"
          onContextMenu={(e) => {
            e.preventDefault();
            // 显示右键提示气泡在鼠标位置
            const toast = document.getElementById('right-click-toast');
            if (toast) {
              // 气泡显示在鼠标旁边
              const x = Math.min(e.clientX + 15, window.innerWidth - 150);
              const y = Math.min(e.clientY + 15, window.innerHeight - 50);
              toast.style.left = x + 'px';
              toast.style.top = y + 'px';
              toast.style.transform = 'none';
              toast.classList.remove('opacity-0', 'pointer-events-none');
              toast.classList.add('opacity-100');
              setTimeout(() => {
                toast.classList.add('opacity-0', 'pointer-events-none');
                toast.classList.remove('opacity-100');
              }, 2000);
            }
          }}
        />
        {/* 右键提示气泡 - 初始隐藏 */}
        <div 
          id="right-click-toast"
          className="fixed px-4 py-2 bg-black/80 text-white text-sm rounded-lg opacity-0 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-[10000]"
        >
          © Copyright 2026 途影
        </div>
      </div>

      {/* 底部信息栏 - 固定高度，参与 flex 布局 */}
      <div className="relative z-20 p-4 pt-3 text-center bg-black/70 shrink-0">
        {/* 标题 */}
        {photo.title?.[locale] && (
          <h2 className="text-lg font-light text-white mb-1">
            {photo.title[locale]}
          </h2>
        )}
        
        {/* 地点 · 时间 */}
        <div className="flex items-center justify-center flex-wrap gap-x-3 gap-y-1 text-sm text-gray-400 mb-2">
          {photo.location?.[locale] && (
            <span>📍 {photo.location[locale]}</span>
          )}
          {photo.date && (
            <span>📅 {new Date(photo.date).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
              year: 'numeric', month: 'short', day: 'numeric'
            })}</span>
          )}
        </div>
        
        {/* EXIF */}
        {photo.exif && (
          <div className="flex items-center justify-center flex-wrap gap-2 text-xs text-gray-500 mb-2">
            {photo.exif.camera && <span className="bg-white/10 px-2 py-0.5 rounded">{photo.exif.camera}</span>}
            {photo.exif.lens && <span className="bg-white/10 px-2 py-0.5 rounded">{photo.exif.lens}</span>}
            {photo.exif.aperture && <span className="bg-white/10 px-2 py-0.5 rounded">{photo.exif.aperture}</span>}
            {photo.exif.shutter && <span className="bg-white/10 px-2 py-0.5 rounded">{photo.exif.shutter}</span>}
            {photo.exif.iso && <span className="bg-white/10 px-2 py-0.5 rounded">ISO {photo.exif.iso}</span>}
          </div>
        )}
        
        {/* 描述 */}
        {photo.caption?.[locale] && (
          <p className="text-sm text-gray-300 italic mb-2 max-w-2xl mx-auto">"{photo.caption[locale]}"</p>
        )}
        
        {/* 页码 */}
        <p className="text-xs text-gray-600">{currentIndex + 1} / {photos.length}</p>
      </div>
    </div>
  );

  // 使用 Portal 渲染到 body，避免父元素 transform 影响 fixed 定位
  if (!mounted) return null;
  return createPortal(lightboxContent, document.body);
}
