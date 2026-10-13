'use client';

import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { geoNaturalEarth1, geoPath, geoCentroid } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';
import * as topojson from 'topojson-client';
import { regions } from '@/data';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { Photo } from '@/lib/types';
import { photoUrl } from '@/lib/photoUrl';

interface Location {
  id: string;
  name: { zh: string; en: string };
  coordinates?: [number, number];
  photoCount: number;
  mapCode: string;
}

interface WorldMapProps {
  locations: Location[];
  locale: 'zh' | 'en';
  visitedCountries?: string[];
  visitedProvinces?: number[];
}

// GeoJSON 属性类型
interface WorldFeatureProps {
  name?: string;
}
interface ChinaFeatureProps {
  adcode?: number;
  name?: string;
}
type WorldCollection = FeatureCollection<Geometry, WorldFeatureProps>;
type ChinaCollection = FeatureCollection<Geometry, ChinaFeatureProps>;

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

const MIN_ZOOM = 1.5;
const MAX_ZOOM = 10;

// 视口尺寸（SVG 坐标系）
const svgWidth = 1400;
const svgHeight = 820;

// 气泡框测量前的估计尺寸（宽度须与 CSS min-w 一致）
const DEFAULT_POPUP_W = 420;
const DEFAULT_POPUP_H = 300;

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

const countryNameToCode: Record<string, string> = {
  'China': 'CN',
  'Japan': 'JP',
  'Iceland': 'IS',
  'United States': 'US',
  'United States of America': 'US',
  'South Korea': 'KR',
  'Singapore': 'SG',
};

// 标记点坐标：优先使用 region JSON 中配置的 coordinates，缺失时回退到省份质心
const resolveCoordinates = (location: Location, chinaGeo: ChinaCollection | null): [number, number] | null => {
  if (location.coordinates) return location.coordinates;
  const adcode = mapCodeToAdcode(location.mapCode);
  if (adcode && chinaGeo) {
    const provinceFeature = chinaGeo.features.find(f => f.properties?.adcode === adcode);
    if (provinceFeature) {
      return geoCentroid(provinceFeature) as [number, number];
    }
  }
  return null;
};

interface PointerPos { x: number; y: number }

export default function WorldMap({ locations, locale, visitedProvinces = [], visitedCountries = [] }: WorldMapProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [worldGeo, setWorldGeo] = useState<WorldCollection | null>(null);
  const [chinaGeo, setChinaGeo] = useState<ChinaCollection | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 容器实际像素尺寸（由 ResizeObserver 维护，避免渲染期间读取 DOM）
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  // 气泡框实际尺寸（渲染后测量）
  const [popupSize, setPopupSize] = useState({ width: DEFAULT_POPUP_W, height: DEFAULT_POPUP_H });

  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(1.7);
  const [isDragging, setIsDragging] = useState(false);

  // 指针状态（鼠标 / 触摸 / 笔统一处理）
  const pointersRef = useRef<Map<number, PointerPos>>(new Map());
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const dragMovedRef = useRef(false);
  const pinchStart = useRef<{ dist: number; mid: PointerPos; zoom: number; panX: number; panY: number } | null>(null);
  const lastPointerTypeRef = useRef<string>('mouse');

  // 延迟隐藏气泡框，给鼠标移动到气泡框的时间（仅鼠标 hover；触摸设备用点击切换）
  const handleMouseEnterMarker = useCallback((e: React.PointerEvent, id: string) => {
    if (e.pointerType !== 'mouse') return;
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setHoveredId(id);
  }, []);

  const handleMouseLeaveMarker = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    hideTimeoutRef.current = setTimeout(() => {
      setHoveredId(null);
    }, 150); // 150ms 延迟，足够鼠标移动到气泡框
  }, []);

  const handleMouseEnterPopup = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const handleMouseLeavePopup = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    setHoveredId(null);
  }, []);

  // 触摸设备：点击标记点切换气泡框
  const handleMarkerClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (lastPointerTypeRef.current === 'mouse') return; // 桌面端由 hover 控制
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setHoveredId(prev => (prev === id ? null : id));
  }, []);

  const visitedCountriesSet = useMemo(() => new Set(visitedCountries || locations.map(l => l.mapCode)), [visitedCountries, locations]);
  const visitedProvincesSet = useMemo(() => new Set(visitedProvinces), [visitedProvinces]);

  useEffect(() => {
    // 添加超时处理
    const timeout = setTimeout(() => {
      setWorldGeo(prev => {
        if (prev) return prev;
        console.warn('Map loading timeout, using fallback');
        return { type: 'FeatureCollection', features: [] };
      });
    }, 5000);

    fetch(WORLD_GEO_URL)
      .then(res => res.json())
      .then(data => {
        const countries = topojson.feature(data, data.objects.countries) as unknown as WorldCollection;
        setWorldGeo(countries);
        clearTimeout(timeout);
      })
      .catch(err => {
        console.error('Failed to load world map:', err);
        setWorldGeo({ type: 'FeatureCollection', features: [] });
        clearTimeout(timeout);
      });

    fetch(CHINA_GEO_URL)
      .then(res => res.json())
      .then(data => {
        if (data.objects) {
          const china = topojson.feature(data, data.objects.china) as unknown as ChinaCollection;
          setChinaGeo(china);
        } else {
          setChinaGeo(data as ChinaCollection);
        }
      })
      .catch(err => console.error('Failed to load China map:', err));

    return () => clearTimeout(timeout);
  }, []);

  // 监听容器尺寸变化（容器在地图加载完成后才挂载，所以依赖 worldGeo）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize(prev =>
        prev.width === rect.width && prev.height === rect.height ? prev : { width: rect.width, height: rect.height }
      );
    };
    // ResizeObserver 在 observe() 时会立即回调一次初始尺寸
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [worldGeo]);

  // 测量气泡框实际尺寸，用于定位
  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!el) return;
    const { offsetWidth, offsetHeight } = el;
    setPopupSize(prev =>
      prev.width === offsetWidth && prev.height === offsetHeight ? prev : { width: offsetWidth, height: offsetHeight }
    );
  }, [hoveredId, locale]);

  const mapAspectRatio = 0.6;
  const edgePaddingX = 80;
  const edgePaddingY = 80;
  const zoomScaleX = 1.0;
  const zoomScaleY = 1.4;

  const scaleByWidth = svgWidth / (2 * Math.PI);
  const scaleByHeight = svgHeight / (2 * Math.PI * mapAspectRatio);
  const baseScale = Math.min(scaleByWidth, scaleByHeight) * 0.8;

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

  // 客户端像素坐标 → SVG 坐标
  const clientToSvg = useCallback((clientX: number, clientY: number): PointerPos => {
    const el = containerRef.current;
    if (!el) return { x: clientX, y: clientY };
    const rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width * svgWidth,
      y: (clientY - rect.top) / rect.height * svgHeight,
    };
  }, []);

  // 以某个 SVG 点为中心缩放（可附加平移量）
  const zoomAround = useCallback((point: PointerPos, newZoom: number, fromZoom: number, fromPanX: number, fromPanY: number, extraDx = 0, extraDy = 0) => {
    const offsetX = point.x - svgWidth / 2 - fromPanX;
    const offsetY = point.y - svgHeight / 2 - fromPanY;
    const zoomRatio = newZoom / fromZoom;
    const newPanX = fromPanX - offsetX * (zoomRatio - 1) + extraDx;
    const newPanY = fromPanY - offsetY * (zoomRatio - 1) + extraDy;
    const clamped = clampPan(newPanX, newPanY, newZoom);
    setZoom(newZoom);
    setPanX(clamped.x);
    setPanY(clamped.y);
  }, [clampPan]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    lastPointerTypeRef.current = e.pointerType;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pointers = Array.from(pointersRef.current.values());
    if (pointers.length === 1) {
      setIsDragging(true);
      dragMovedRef.current = false;
      dragStart.current = { x: e.clientX, y: e.clientY, panX, panY };
      pinchStart.current = null;
    } else if (pointers.length === 2) {
      const [a, b] = pointers;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const mid = clientToSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchStart.current = { dist: Math.max(dist, 1), mid, zoom, panX, panY };
      setIsDragging(false);
    }
  }, [panX, panY, zoom, clientToSvg]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pointers = Array.from(pointersRef.current.values());

    if (pointers.length >= 2 && pinchStart.current) {
      // 双指缩放：围绕两指中点缩放，并跟随中点移动
      const [a, b] = pointers;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const mid = clientToSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
      const start = pinchStart.current;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, start.zoom * (dist / start.dist)));
      zoomAround(start.mid, newZoom, start.zoom, start.panX, start.panY, mid.x - start.mid.x, mid.y - start.mid.y);
      dragMovedRef.current = true;
      return;
    }

    if (!isDragging || pointers.length !== 1) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMovedRef.current = true;
    // 拖拽距离按容器实际尺寸换算到 SVG 坐标
    const el = containerRef.current;
    const scale = el ? svgWidth / el.getBoundingClientRect().width : 1;
    const clamped = clampPan(dragStart.current.panX + dx * scale, dragStart.current.panY + dy * scale, zoom);
    setPanX(clamped.x);
    setPanY(clamped.y);
  }, [isDragging, zoom, clampPan, clientToSvg, zoomAround]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const wasTracked = pointersRef.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    // 触摸设备：在地图空白处轻点关闭气泡框（标记点和气泡框自行处理）
    const target = e.target as Element | null;
    const onMarker = !!target?.closest?.('[data-marker]');
    const onPopup = !!target?.closest?.('[data-popup]');
    if (wasTracked && e.pointerType !== 'mouse' && !dragMovedRef.current && !pinchStart.current && !onMarker && !onPopup) {
      setHoveredId(null);
    }

    if (pointersRef.current.size === 0) {
      setIsDragging(false);
      pinchStart.current = null;
    } else if (pointersRef.current.size === 1) {
      // 从双指回到单指：重新开始拖拽
      const [remaining] = Array.from(pointersRef.current.values());
      pinchStart.current = null;
      dragStart.current = { x: remaining.x, y: remaining.y, panX, panY };
      setIsDragging(true);
    }
  }, [panX, panY]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const point = clientToSvg(e.clientX, e.clientY);
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * delta));
    if (newZoom === zoom) return;
    zoomAround(point, newZoom, zoom, panX, panY);
  }, [zoom, panX, panY, clientToSvg, zoomAround]);

  // 将中国居中到指定缩放级别
  const focusChina = useCallback((newZoom: number) => {
    // 注意：projection 已经包含了当前的 panX/panY，需要重新计算
    const tempProjection = geoNaturalEarth1()
      .scale(baseScale * newZoom)
      .rotate([-150, 0, 0])
      .translate([svgWidth / 2, svgHeight / 2]);

    const chinaCenterNew = tempProjection([105, 35]);
    if (!chinaCenterNew) return;

    // 计算偏移量使中国居中
    setZoom(newZoom);
    setPanX(svgWidth / 2 - chinaCenterNew[0]);
    setPanY(svgHeight / 2 - chinaCenterNew[1]);
  }, [baseScale]);

  const handleChinaClick = useCallback(() => {
    if (zoom > 2.5) return;
    focusChina(5.5);
  }, [zoom, focusChina]);

  const handleChinaView = useCallback(() => {
    focusChina(7);
  }, [focusChina]);

  const handleResetView = useCallback(() => {
    setZoom(1.8);
    setPanX(0);
    setPanY(0);
  }, []);

  if (!worldGeo) {
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

  // 计算气泡框位置（8 方向锚点，优先四角，其次四边，最后边界约束）
  const computePopupPosition = (): { x: number; y: number } | null => {
    if (!hoveredRegion || !hoveredId || containerSize.width === 0) return null;
    const location = locations.find(l => l.id === hoveredId);
    if (!location) return null;

    const coords = resolveCoordinates(location, chinaGeo);
    if (!coords) return null;
    const projected = projection(coords);
    if (!projected) return null;

    // SVG 坐标 → 容器像素坐标
    const [svgX, svgY] = projected;
    const W = containerSize.width;
    const H = containerSize.height;
    const markerX = svgX * (W / svgWidth);
    const markerY = svgY * (H / svgHeight);

    const popupW = popupSize.width;
    const popupH = popupSize.height;

    // 动态间距
    const gap = 10 * Math.sqrt(zoom);

    // 1. 标记点到容器四边的空间
    const spaceRight = W - markerX;
    const spaceLeft = markerX;
    const spaceBottom = H - markerY;
    const spaceTop = markerY;

    // 2. 8 个方向候选位置
    const candidates: Array<{ x: number; y: number; needRight?: number; needLeft?: number; needTop?: number; needBottom?: number }> = [
      // 四角（优先）
      { x: markerX + gap, y: markerY + gap, needRight: popupW + gap, needBottom: popupH + gap },
      { x: markerX + gap, y: markerY - gap - popupH, needRight: popupW + gap, needTop: popupH + gap },
      { x: markerX - gap - popupW, y: markerY + gap, needLeft: popupW + gap, needBottom: popupH + gap },
      { x: markerX - gap - popupW, y: markerY - gap - popupH, needLeft: popupW + gap, needTop: popupH + gap },
      // 四边（备选）
      { x: markerX + gap, y: markerY - popupH / 2, needRight: popupW + gap, needTop: popupH / 2, needBottom: popupH / 2 },
      { x: markerX - gap - popupW, y: markerY - popupH / 2, needLeft: popupW + gap, needTop: popupH / 2, needBottom: popupH / 2 },
      { x: markerX - popupW / 2, y: markerY + gap, needLeft: popupW / 2, needRight: popupW / 2, needBottom: popupH + gap },
      { x: markerX - popupW / 2, y: markerY - gap - popupH, needLeft: popupW / 2, needRight: popupW / 2, needTop: popupH + gap },
    ];

    // 3. 选择第一个能完整放下气泡框的方向
    const chosen = candidates.find(c =>
      (c.needRight === undefined || spaceRight >= c.needRight) &&
      (c.needLeft === undefined || spaceLeft >= c.needLeft) &&
      (c.needBottom === undefined || spaceBottom >= c.needBottom) &&
      (c.needTop === undefined || spaceTop >= c.needTop)
    ) ?? candidates[0];

    // 4. 边界约束保底
    return {
      x: Math.max(5, Math.min(W - popupW - 5, chosen.x)),
      y: Math.max(5, Math.min(H - popupH - 5, chosen.y)),
    };
  };

  const popupPosition = computePopupPosition();
  const hasMultipleAlbums = !!hoveredRegion && hoveredRegion.albums.length > 1;

  return (
    <div className="w-full bg-[#0a0a0a] rounded-xl overflow-hidden">
      <div
        ref={containerRef}
        className="relative select-none"
        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <svg
          width="100%"
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ background: DARK_BG }}
        >
          {/* 世界地图 */}
          {worldGeo.features.map((feature, index) => {
            const countryName = feature.properties?.name ?? '';
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
                  d={pathGenerator(feature) || ''}
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
                d={pathGenerator(feature) || ''}
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
          {chinaGeo?.features.map((feature, index) => {
            const adcode = feature.properties?.adcode;
            const isVisited = adcode !== undefined && visitedProvincesSet.has(adcode);

            return (
              <path
                key={`china-prov-${adcode || index}`}
                d={pathGenerator(feature) || ''}
                fill={isVisited ? VISITED_FILL : UNVISITED_FILL}
                stroke={CHINA_PROVINCE_STROKE}
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
            const coords = resolveCoordinates(location, chinaGeo);
            if (!coords) return null;
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
                data-marker={location.id}
                transform={`translate(${x}, ${y})`}
                onPointerEnter={(e) => handleMouseEnterMarker(e, location.id)}
                onPointerLeave={handleMouseLeaveMarker}
                onClick={(e) => handleMarkerClick(e, location.id)}
                style={{ cursor: 'pointer' }}
              >
                <circle r={isHovered ? haloSize * 1.5 : haloSize} fill="#f59e0b" opacity={isHovered ? 0.4 : 0.25} />
                <circle r={isHovered ? markerSize * 1.3 : markerSize} fill="#fbbf24" stroke="#fff" strokeWidth={1} style={{ filter: 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.5))' }} />
              </g>
            );
          })}
        </svg>

        {/* Hover / 点击 气泡框 */}
        {hoveredRegion && popupPosition && (
          <div
            key={hoveredId}
            ref={popupRef}
            data-popup
            className="absolute pointer-events-auto animate-popup"
            style={{
              left: `${popupPosition.x}px`,
              top: `${popupPosition.y}px`,
            }}
            onPointerEnter={handleMouseEnterPopup}
            onPointerLeave={handleMouseLeavePopup}
            onPointerDown={(e) => e.stopPropagation()}
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
                onClick={() => router.push(`/region/${hoveredRegion.id}`)}
                className="w-full py-1.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 hover:text-amber-300 rounded-lg text-xs font-medium transition-all duration-200 border border-amber-500/30 hover:border-amber-500/50"
              >
                {locale === 'zh' ? '查看全部 →' : 'View All →'}
              </button>
            </div>
          </div>
        )}
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
          {locale === 'zh' ? '滚轮 / 双指缩放 · 拖拽移动' : 'Scroll or pinch to zoom · Drag to pan'}
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
