'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { geoNaturalEarth1, geoPath, geoCentroid } from 'd3-geo';
import type { FeatureCollection, Feature, Geometry } from 'geojson';
import * as topojson from 'topojson-client';
import { regions } from '@/data';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { Photo } from '@/lib/types';
import { photoUrl } from '@/lib/photoUrl';

interface Location {
  id: string;
  name: { zh: string; en: string };
  coordinates: [number, number];
  photoCount: number;
  mapCode: string;
}

interface WorldMapProps {
  locations: Location[];
  onLocationClick: (locationId: string) => void;
  locale: 'zh' | 'en';
  visitedCountries?: string[];
  visitedProvinces?: number[];
}

const WORLD_GEO_URL = '/maps/world.json';
const CHINA_GEO_URL = '/maps/china.json';

// 深蓝色主题配色
const DARK_BG = '#050a15';
const UNVISITED_FILL = '#1a2035';
const UNVISITED_STROKE = '#2a3555'; // 国家边界淡一点
const VISITED_FILL = '#f59e0b';  // 暖黄色，和标记点一致
const VISITED_STROKE = '#2d3a55'; // 已访问区域边界用深蓝灰
const CHINA_PROVINCE_STROKE = '#3a4a70'; // 中国省份边界更亮一点凸显

// 基础线宽（zoom=1 时的线宽）
const BASE_STROKE_WIDTH = 0.5;
const BASE_CHINA_STROKE_WIDTH = 1.2;

// 8 个方向的锚点定义
type PopupDirection = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'right' | 'left' | 'bottom' | 'top';

const DIRECTION_OFFSETS: Record<PopupDirection, { x: number; y: number }> = {
  'bottom-right': { x: 1, y: 1 },
  'bottom-left': { x: -1, y: 1 },
  'top-right': { x: 1, y: -1 },
  'top-left': { x: -1, y: -1 },
  'right': { x: 1, y: 0 },
  'left': { x: -1, y: 0 },
  'bottom': { x: 0, y: 1 },
  'top': { x: 0, y: -1 },
};

// ISO 3166-2 中国省级代码 → adcode 映射
const mapCodeToAdcode = (mapCode: string): number | null => {
  const map: Record<string, number> = {
    'CN-11': 110000, 'CN-12': 120000, 'CN-13': 130000, 'CN-14': 140000, 'CN-15': 150000,
    'CN-21': 210000, 'CN-22': 220000, 'CN-23': 230000,
    'CN-31': 310000, 'CN-32': 320000, 'CN-33': 330000, 'CN-34': 340000, 'CN-35': 350000,
    'CN-36': 360000, 'CN-37': 370000,
    'CN-41': 410000, 'CN-42': 420000, 'CN-43': 430000, 'CN-44': 440000, 'CN-45': 450000, 'CN-46': 460000,
    'CN-50': 500000, 'CN-51': 510000, 'CN-52': 520000, 'CN-53': 530000, 'CN-54': 540000,
    'CN-61': 610000, 'CN-62': 620000, 'CN-63': 630000, 'CN-64': 640000, 'CN-65': 650000,
    'CN-HK': 810000, 'CN-MO': 820000, 'CN-TW': 710000,
  };
  return map[mapCode] ?? null;
};

export default function WorldMap({ locations, onLocationClick, locale, visitedProvinces = [], visitedCountries = [] }: WorldMapProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [worldGeo, setWorldGeo] = useState<FeatureCollection | null>(null);
  const [chinaGeo, setChinaGeo] = useState<FeatureCollection | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [popupKey, setPopupKey] = useState(0);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 灯箱状态（不再需要，改用页面跳转）
  // const [lightboxOpen, setLightboxOpen] = useState(false);
  // const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  // const [lightboxPhotos, setLightboxPhotos] = useState<Photo[]>([]);
  // const [lightboxRegionId, setLightboxRegionId] = useState<string | null>(null);

  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(1.7);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // 延迟隐藏气泡框，给鼠标移动到气泡框的时间
  const handleMouseEnterMarker = useCallback((id: string) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setHoveredId(id);
  }, []);

  const handleMouseLeaveMarker = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setHoveredId(null);
    }, 150); // 150ms 延迟，足够鼠标移动到气泡框
  }, []);

  const handleMouseEnterPopup = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const handleMouseLeavePopup = useCallback(() => {
    setHoveredId(null);
  }, []);

  const visitedCountriesSet = useMemo(() => new Set(visitedCountries || locations.map(l => l.mapCode)), [visitedCountries, locations]);
  const visitedProvincesSet = useMemo(() => new Set(visitedProvinces), [visitedProvinces]);

  // DEBUG: console.log('Country:', countryName);
  const countryNameToCode: Record<string, string> = {
    'China': 'CN',
    'Japan': 'JP',
    'Iceland': 'IS',
    'United States': 'US',
    'United States of America': 'US',
    'South Korea': 'KR',
    'Singapore': 'SG',
  };

  useEffect(() => {
    setMounted(true);

    // 添加超时处理
    const timeout = setTimeout(() => {
      if (!worldGeo) {
        console.warn('Map loading timeout, using fallback');
        setWorldGeo({ type: 'FeatureCollection', features: [] } as FeatureCollection);
      }
    }, 5000);

    fetch(WORLD_GEO_URL)
      .then(res => res.json())
      .then(data => {
        const countries = topojson.feature(data, data.objects.countries) as unknown as FeatureCollection;
        setWorldGeo(countries);
        clearTimeout(timeout);
      })
      .catch(err => {
        console.error('Failed to load world map:', err);
        setWorldGeo({ type: 'FeatureCollection', features: [] } as FeatureCollection);
        clearTimeout(timeout);
      });

    fetch(CHINA_GEO_URL)
      .then(res => res.json())
      .then(data => {
        if (data.objects) {
          const china = topojson.feature(data, data.objects.china) as unknown as FeatureCollection;
          setChinaGeo(china);
        } else {
          setChinaGeo(data as FeatureCollection);
        }
      })
      .catch(err => console.error('Failed to load China map:', err));

    return () => clearTimeout(timeout);
  }, []);

  // 视口尺寸
  const svgWidth = 1400;
  const svgHeight = 820;

  const mapAspectRatio = 0.6;
  const edgePaddingX = 80;
  const edgePaddingY = 80;
  const zoomScaleX = 1.0;
  const zoomScaleY = 1.4;

  const scaleByWidth = svgWidth / (2 * Math.PI);
  const scaleByHeight = svgHeight / (2 * Math.PI * mapAspectRatio);
  const baseScale = Math.min(scaleByWidth, scaleByHeight) * 0.8;

  const mapWidth = baseScale * 2 * Math.PI * zoom;
  const mapHeight = mapWidth * mapAspectRatio;

  const calcMaxPan = useCallback((mapSize: number, viewportSize: number, currentZoom: number, basePadding: number, zoomScale: number) => {
    const effectivePadding = basePadding * currentZoom * zoomScale;
    if (mapSize <= viewportSize) {
      return (viewportSize - mapSize) / 2 + effectivePadding;
    } else {
      return (mapSize - viewportSize) / 2 + effectivePadding;
    }
  }, []);

  const projection = useMemo(() => {
    return geoNaturalEarth1()
      .scale(baseScale * zoom)
      .rotate([-150, 0, 0]) // 以东经150°为中心，分割线在大西洋（西经30°），中国居中
      .translate([svgWidth / 2 + panX, svgHeight / 2 + panY]);
  }, [zoom, panX, panY, baseScale]);

  const pathGenerator = useMemo(() => geoPath().projection(projection), [projection]);

  const clampPan = useCallback((px: number, py: number, z: number) => {
    const mw = baseScale * 2 * Math.PI * z;
    const mh = mw * mapAspectRatio;
    const mpx = calcMaxPan(mw, svgWidth, z, edgePaddingX, zoomScaleX);
    const mpy = calcMaxPan(mh, svgHeight, z, edgePaddingY, zoomScaleY);
    return {
      x: Math.max(-mpx, Math.min(mpx, px)),
      y: Math.max(-mpy, Math.min(mpy, py))
    };
  }, [baseScale, calcMaxPan]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX, panY };
  }, [panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const clamped = clampPan(dragStart.current.panX + dx, dragStart.current.panY + dy, zoom);
    setPanX(clamped.x);
    setPanY(clamped.y);
  }, [isDragging, zoom, clampPan]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width * svgWidth;
    const mouseY = (e.clientY - rect.top) / rect.height * svgHeight;

    const offsetX = mouseX - svgWidth / 2 - panX;
    const offsetY = mouseY - svgHeight / 2 - panY;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(1.5, Math.min(10, zoom * delta));

    if (newZoom === zoom) return;

    const zoomRatio = newZoom / zoom;

    let newPanX = panX - offsetX * (zoomRatio - 1);
    let newPanY = panY - offsetY * (zoomRatio - 1);

    const clamped = clampPan(newPanX, newPanY, newZoom);

    setZoom(newZoom);
    setPanX(clamped.x);
    setPanY(clamped.y);
  }, [zoom, panX, panY, clampPan]);

  const handleChinaClick = useCallback(() => {
    if (zoom > 2.5) return;
    
    const newZoom = 5.5;
    // 计算需要的 pan 值使中国居中
    // 注意：projection 已经包含了当前的 panX/panY，需要重新计算
    const tempProjection = geoNaturalEarth1()
      .scale(baseScale * newZoom)
      .rotate([-150, 0, 0])
      .translate([svgWidth / 2, svgHeight / 2]);
    
    const chinaCenterNew = tempProjection([105, 35]);
    if (!chinaCenterNew) return;
    
    // 计算偏移量使中国居中
    const offsetX = svgWidth / 2 - chinaCenterNew[0];
    const offsetY = svgHeight / 2 - chinaCenterNew[1];
    
    setZoom(newZoom);
    setPanX(offsetX);
    setPanY(offsetY);
  }, [zoom, baseScale]);

  const handleChinaView = useCallback(() => {
    const newZoom = 7; // 放大更多
    // 计算需要的 pan 值使中国居中
    // 注意：projection 已经包含了当前的 panX/panY，需要重新计算
    const tempProjection = geoNaturalEarth1()
      .scale(baseScale * newZoom)
      .rotate([-150, 0, 0])
      .translate([svgWidth / 2, svgHeight / 2]);
    
    const chinaCenterNew = tempProjection([105, 35]);
    if (!chinaCenterNew) return;
    
    // 计算偏移量使中国居中
    const offsetX = svgWidth / 2 - chinaCenterNew[0];
    const offsetY = svgHeight / 2 - chinaCenterNew[1];
    
    setZoom(newZoom);
    setPanX(offsetX);
    setPanY(offsetY);
  }, [baseScale]);

  const handleResetView = useCallback(() => {
    setZoom(1.8);
    setPanX(0);
    setPanY(0);
  }, []);

  // 计算气泡框最佳位置
  // 核心原则：气泡框的某个角/边锚点紧贴标记点，保持固定间距，绝不遮挡
  const calculatePopupPosition = useCallback((markerX: number, markerY: number, popupWidth: number, popupHeight: number) => {
    // 动态间距：随缩放调整，确保视觉上间距一致
    const baseGap = 8;
    const gap = baseGap * Math.sqrt(zoom);
    
    // 定义8个锚点方案：[气泡框x, 气泡框y, 描述]
    // 每个方案确保气泡框不会遮挡标记点
    const anchors = [
      // 四个角落（优先）
      { x: markerX + gap, y: markerY + gap, name: 'bottom-right' },  // 气泡框在标记点右下
      { x: markerX + gap, y: markerY - gap - popupHeight, name: 'top-right' },  // 气泡框在标记点右上
      { x: markerX - gap - popupWidth, y: markerY + gap, name: 'bottom-left' },  // 气泡框在标记点左下
      { x: markerX - gap - popupWidth, y: markerY - gap - popupHeight, name: 'top-left' },  // 气泡框在标记点左上
      // 四个边（备选）
      { x: markerX + gap, y: markerY - popupHeight / 2, name: 'right' },  // 气泡框在标记点右侧
      { x: markerX - gap - popupWidth, y: markerY - popupHeight / 2, name: 'left' },  // 气泡框在标记点左侧
      { x: markerX - popupWidth / 2, y: markerY + gap, name: 'bottom' },  // 气泡框在标记点下方
      { x: markerX - popupWidth / 2, y: markerY - gap - popupHeight, name: 'top' },  // 气泡框在标记点上方
    ];
    
    // 根据标记点位置确定优先顺序
    const inLeftHalf = markerX < svgWidth / 2;
    const inTopHalf = markerY < svgHeight / 2;
    
    // 重新排序：优先选择对角方向
    let priorityOrder: number[];
    if (inLeftHalf && inTopHalf) {
      // 标记点在左上 → 优先右下
      priorityOrder = [0, 4, 1, 6, 2, 3, 5, 7];
    } else if (!inLeftHalf && inTopHalf) {
      // 标记点在右上 → 优先左下
      priorityOrder = [2, 5, 3, 6, 0, 1, 4, 7];
    } else if (inLeftHalf && !inTopHalf) {
      // 标记点在左下 → 优先右上
      priorityOrder = [1, 4, 0, 7, 2, 3, 5, 6];
    } else {
      // 标记点在右下 → 优先左上
      priorityOrder = [3, 5, 2, 7, 0, 1, 4, 6];
    }
    
    // 按优先顺序检查每个锚点，选择第一个完全在视窗内的
    for (const idx of priorityOrder) {
      const anchor = anchors[idx];
      const x = anchor.x;
      const y = anchor.y;
      
      // 检查是否完全在视窗内
      if (x >= 0 && x + popupWidth <= svgWidth && y >= 0 && y + popupHeight <= svgHeight) {
        return { x, y };
      }
    }
    
    // 如果所有锚点都超出视窗，选择第一优先的锚点并约束在视窗内
    // 但要确保不遮挡标记点
    const fallback = anchors[priorityOrder[0]];
    let x = Math.max(0, Math.min(svgWidth - popupWidth, fallback.x));
    let y = Math.max(0, Math.min(svgHeight - popupHeight, fallback.y));
    
    // 检查是否遮挡标记点，如果遮挡则微调
    const overlapsX = x < markerX + 15 && x + popupWidth > markerX - 15;
    const overlapsY = y < markerY + 15 && y + popupHeight > markerY - 15;
    
    if (overlapsX && overlapsY) {
      // 遮挡了，尝试推开
      if (inLeftHalf) {
        x = Math.min(markerX + gap, svgWidth - popupWidth);
      } else {
        x = Math.max(0, markerX - gap - popupWidth);
      }
    }
    
    return { x, y };
  }, [svgWidth, svgHeight, zoom]);

  // 处理 hover 变化，重置动画
  useEffect(() => {
    if (hoveredId) {
      setPopupKey(prev => prev + 1);
    }
  }, [hoveredId]);

  if (!mounted || !worldGeo) {
    return (
      <div className="w-full bg-[#0a0a0a] rounded-xl h-[820px] flex items-center justify-center">
        <span className="text-gray-600">加载地图中...</span>
      </div>
    );
  }

  const strokeWidth = Math.max(0.3, Math.min(1.5, BASE_STROKE_WIDTH * Math.sqrt(zoom)));
  const chinaStrokeWidth = Math.max(0.5, Math.min(2, BASE_CHINA_STROKE_WIDTH * Math.sqrt(zoom)));

  // 获取当前 hover 的地区数据
  const hoveredRegion = hoveredId ? regions.find(r => r.id === hoveredId) : null;

  return (
    <div className="w-full bg-[#0a0a0a] rounded-xl overflow-hidden">
      <div
        ref={containerRef}
        className="relative select-none"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg
          width="100%"
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ background: DARK_BG }}
        >
          {/* 世界地图 */}
          {worldGeo.features.map((feature: Feature, index: number) => {
            const props = feature.properties as any;
            const countryName = props?.name;
            console.log('Country:', countryName, '-> mapped:', countryNameToCode[countryName], 'isVisited:', countryNameToCode[countryName] ? visitedCountriesSet.has(countryNameToCode[countryName]) : false);
            const isChina = countryName === 'China';

            const mappedCode = countryNameToCode[countryName];
            const isVisited = mappedCode ? visitedCountriesSet.has(mappedCode) : false;

            if (isChina && chinaGeo) {
              return null;
            }

            if (isChina) {
              return (
                <path
                  key={`world-${index}`}
                  d={pathGenerator(feature as Feature<Geometry>) || ''}
                  fill={UNVISITED_FILL}
                  stroke='#60a5fa'
                  strokeWidth={chinaStrokeWidth}
                  style={{
                    cursor: 'pointer',
                    filter: 'drop-shadow(0 0 2px rgba(96, 165, 250, 0.3))'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleChinaClick();
                  }}
                />
              );
            }

            return (
              <path
                key={`world-${index}`}
                d={pathGenerator(feature as Feature<Geometry>) || ''}
                fill={isVisited ? VISITED_FILL : UNVISITED_FILL}
                stroke={isVisited ? VISITED_STROKE : UNVISITED_STROKE}
                strokeWidth={strokeWidth}
                style={{
                  filter: isVisited ? 'drop-shadow(0 0 10px rgba(251, 191, 36, 0.5))' : 'none'
                }}
              />
            );
          })}

          {/* 中国省份 */}
          {chinaGeo?.features.map((feature: Feature, index: number) => {
            const props = feature.properties as any;
            const adcode = props?.adcode;
            const isVisited = visitedProvincesSet.has(adcode);

            return (
              <path
                key={`china-prov-${adcode || index}`}
                d={pathGenerator(feature as Feature<Geometry>) || ''}
                fill={isVisited ? VISITED_FILL : UNVISITED_FILL}
                stroke={'#3a4a70'}
                strokeWidth={strokeWidth}
                style={{
                  filter: isVisited ? 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.5))' : 'none',
                  cursor: 'pointer'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleChinaClick();
                }}
              />
            );
          })}

          {/* 标记点 */}
          {locations.map((location) => {
            let coords = location.coordinates;
            const adcode = mapCodeToAdcode(location.mapCode);
            if (adcode && chinaGeo) {
              const provinceFeature = chinaGeo.features.find(
                f => f.properties?.adcode === adcode
              );
              if (provinceFeature) {
                const centroid = geoCentroid(provinceFeature as Feature<Geometry>);
                coords = centroid as [number, number];
              }
            }
            
            const projected = projection(coords);
            if (!projected) return null;

            const [x, y] = projected;
            const isHovered = hoveredId === location.id;
            // 标记点大小随缩放动态调整：缩小时变小，放大时变大
            const baseMarkerSize = 4;
            const baseHaloSize = 10;
            const scaleFactor = Math.sqrt(zoom) / Math.sqrt(1.8); // 以初始缩放1.8为基准
            const markerSize = baseMarkerSize * scaleFactor;
            const haloSize = baseHaloSize * scaleFactor;

            return (
              <g
                key={`marker-${location.id}`}
                transform={`translate(${x}, ${y})`}
                onMouseEnter={() => handleMouseEnterMarker(location.id)}
                onMouseLeave={handleMouseLeaveMarker}
                style={{ cursor: 'pointer' }}
              >
                <circle r={isHovered ? haloSize * 1.5 : haloSize} fill="#f59e0b" opacity={isHovered ? 0.4 : 0.25} />
                <circle r={isHovered ? markerSize * 1.3 : markerSize} fill="#fbbf24" stroke="#fff" strokeWidth={1} style={{ filter: 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.5))' }} />
              </g>
            );
          })}
        </svg>

        {/* Hover 气泡框 */}
        {hoveredRegion && hoveredId && containerRef.current && (() => {
          const location = locations.find(l => l.id === hoveredId);
          if (!location) return null;

          let coords = location.coordinates;
          const adcode = mapCodeToAdcode(location.mapCode);
          if (adcode && chinaGeo) {
            const provinceFeature = chinaGeo.features.find(
              f => f.properties?.adcode === adcode
            );
            if (provinceFeature) {
              const centroid = geoCentroid(provinceFeature as Feature<Geometry>);
              coords = centroid as [number, number];
            }
          }

          const projected = projection(coords);
          if (!projected) return null;

          // SVG 坐标
          const [svgX, svgY] = projected;
          
          // 获取容器实际尺寸，计算缩放比例
          const containerRect = containerRef.current.getBoundingClientRect();
          const scaleX = containerRect.width / svgWidth;
          const scaleY = containerRect.height / svgHeight;
          
          // 转换为实际像素坐标
          const markerX = svgX * scaleX;
          const markerY = svgY * scaleY;
          const W = containerRect.width;  // 容器宽度
          const H = containerRect.height; // 容器高度
          
          const hasMultipleAlbums = hoveredRegion.albums.length > 1;
          
          // 气泡框尺寸（像素）- 必须和实际 CSS 保持一致！
          // 宽度：min-w-[420px]
          const popupW = 420;
          // 高度：
          // - 多相册（3个相册，3列1行）：标题(60) + 1行图片(约140) + 按钮(40) + padding(48) = 288
          // - 单相册（6张照片，3列2行）：标题(60) + 2行图片(约280) + 按钮(40) + padding(48) = 428
          const popupH = hasMultipleAlbums ? 288 : 428;
          
          // 动态间距
          const gap = 10 * Math.sqrt(zoom);
          
          // ========== v9 核心逻辑 ==========
          // 1. 计算标记点到容器四边的空间
          const spaceRight = W - markerX;
          const spaceLeft = markerX;
          const spaceBottom = H - markerY;
          const spaceTop = markerY;
          
          // 2. 定义 8 个方向候选位置
          const candidates = [
            // 四角（优先）
            { name: 'bottom-right', x: markerX + gap, y: markerY + gap, needRight: popupW + gap, needBottom: popupH + gap },
            { name: 'top-right', x: markerX + gap, y: markerY - gap - popupH, needRight: popupW + gap, needTop: popupH + gap },
            { name: 'bottom-left', x: markerX - gap - popupW, y: markerY + gap, needLeft: popupW + gap, needBottom: popupH + gap },
            { name: 'top-left', x: markerX - gap - popupW, y: markerY - gap - popupH, needLeft: popupW + gap, needTop: popupH + gap },
            // 四边（备选）
            { name: 'right', x: markerX + gap, y: markerY - popupH / 2, needRight: popupW + gap, needTop: popupH / 2, needBottom: popupH / 2 },
            { name: 'left', x: markerX - gap - popupW, y: markerY - popupH / 2, needLeft: popupW + gap, needTop: popupH / 2, needBottom: popupH / 2 },
            { name: 'bottom', x: markerX - popupW / 2, y: markerY + gap, needLeft: popupW / 2, needRight: popupW / 2, needBottom: popupH + gap },
            { name: 'top', x: markerX - popupW / 2, y: markerY - gap - popupH, needLeft: popupW / 2, needRight: popupW / 2, needTop: popupH + gap },
          ];
          
          // 3. 每个方向判断是否能完整放下气泡框
          // 4. 选择第一个有效方向
          let chosen = candidates[0]; // 默认右下
          
          for (const c of candidates) {
            const fits = 
              (c.needRight === undefined || spaceRight >= c.needRight) &&
              (c.needLeft === undefined || spaceLeft >= c.needLeft) &&
              (c.needBottom === undefined || spaceBottom >= c.needBottom) &&
              (c.needTop === undefined || spaceTop >= c.needTop);
            
            if (fits) {
              chosen = c;
              break;
            }
          }
          
          // 5. 边界约束保底
          let x = Math.max(5, Math.min(W - popupW - 5, chosen.x));
          let y = Math.max(5, Math.min(H - popupH - 5, chosen.y));

          return (
            <div
              key={popupKey}
              className="absolute pointer-events-auto animate-popup"
              style={{
                left: `${x}px`,
                top: `${y}px`,
              }}
              onMouseEnter={handleMouseEnterPopup}
              onMouseLeave={handleMouseLeavePopup}
            >
              <div className="bg-black/80 backdrop-blur-xl rounded-xl border border-amber-500/50 shadow-2xl p-6 min-w-[420px] max-w-[630px]"
                   style={{ boxShadow: '0 0 20px rgba(234, 88, 12, 0.3)' }}>
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="text-xl font-semibold text-white">{hoveredRegion.name[locale]}</h3>
                  <span className="text-xs text-gray-400">
                    {hoveredRegion.albums.length} {locale === 'zh' ? '个相册' : 'albums'} · {hoveredRegion.albums.reduce((sum, album) => sum + (album.photos?.length || 0), 0)} {locale === 'zh' ? '张' : 'photos'}
                  </span>
                </div>
                
                {hasMultipleAlbums ? (
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {hoveredRegion.albums.slice(0, 3).map((album) => (
                      <div
                        key={album.id}
                        className="cursor-pointer group"
                        onClick={() => router.push(`/region/${hoveredRegion.id}/${album.id}`)}
                      >
                        <div className="relative aspect-square rounded-lg overflow-hidden mb-2 bg-gray-800">
                          <Image
                            src={photoUrl(album.cover)}
                            alt={album.title[locale]}
                            fill
                            className="object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                        </div>
                        <p className="text-sm text-gray-300 group-hover:text-amber-400 transition-colors line-clamp-1">
                          {album.title[locale]}
                        </p>
                        <p className="text-xs text-gray-500">{album.photos?.length || 0} {locale === 'zh' ? '张' : 'photos'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  hoveredRegion.albums[0].photos ? (
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {hoveredRegion.albums[0].photos.slice(0, 6).map((photo, idx) => (
                      <div
                        key={photo.id}
                        className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group bg-gray-800"
                        onClick={() => {
                          // 跳转到相册页面并打开该图片的灯箱
                          router.push(`/region/${hoveredRegion.id}?photo=${idx}`);
                        }}
                      >
                        <Image
                          src={photoUrl(photo.thumbnail)}
                          alt={photo.title?.[locale] || ''}
                          fill
                          className="object-cover group-hover:scale-110 transition-transform duration-300"
                        />
                      </div>
                    ))}
                  </div>
                  ) : hoveredRegion.albums.length > 0 ? (
                    <div className="text-center text-gray-500 py-6 mb-4">
                      {(hoveredRegion.albums[0].photos as Photo[] | undefined)?.length || 0} {locale === 'zh' ? '张照片' : 'photos'}
                    </div>
                  ) : null
                )}
                
                {/* 查看全部按钮 */}
                <button
                  onClick={() => {
                    if (hasMultipleAlbums) {
                      // 多相册：进入相册列表
                      router.push(`/region/${hoveredRegion.id}`);
                    } else {
                      // 单相册：进入瀑布流
                      router.push(`/region/${hoveredRegion.id}`);
                    }
                  }}
                  className="w-full py-1.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 hover:text-amber-300 rounded-lg text-xs font-medium transition-all duration-200 border border-amber-500/30 hover:border-amber-500/50"
                >
                  {locale === 'zh' ? '查看全部 →' : 'View All →'}
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="flex items-center justify-center gap-4 py-3 bg-[#0a0a0a] border-t border-gray-800">
        <button
          onClick={handleResetView}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {locale === 'zh' ? '🌍 世界视图' : '🌍 World View'}
        </button>
        <span className="text-gray-700">|</span>
        <button
          onClick={handleChinaView}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {locale === 'zh' ? '🇨🇳 中国视图' : '🇨🇳 China View'}
        </button>
        <span className="text-gray-700">|</span>
        <span className="text-xs text-gray-600">
          {locale === 'zh' ? '滚轮缩放 · 拖拽移动' : 'Scroll to zoom · Drag to pan'}
        </span>
      </div>

      <style jsx>{`
        @keyframes popup {
          0% {
            opacity: 0;
            transform: scale(0.8);
          }
          60% {
            transform: scale(1.05);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-popup {
          animation: popup 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
    </div>
  );
}
