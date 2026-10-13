'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import Link from 'next/link';
import { regions, visitedCountries, visitedProvinces, provinceAdcodeMap } from '@/data';
import { photoUrl } from '@/lib/photoUrl';
import { pickHighlights } from '@/lib/highlights';
import type { Region } from '@/lib/types';

type Locale = 'zh' | 'en';

interface GlobeMapProps {
  locale: Locale;
}

// Preferred style: OpenFreeMap dark (no API key). Falls back to a minimal
// tile-less dark style if the remote style can't be fetched.
const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';
const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0a0f1a' } }],
};

// world.json uses Natural Earth names; map the visited ones to ISO alpha-2.
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  China: 'CN',
  Japan: 'JP',
  'United States of America': 'US',
  'South Korea': 'KR',
  Singapore: 'SG',
  Iceland: 'IS',
};

const WORLD_VIEW = { center: [105, 30] as [number, number], zoom: 2.1 };
const CHINA_VIEW = { center: [104, 34] as [number, number], zoom: 4.2 };

const t = {
  world: { zh: '🌍 世界', en: '🌍 World' },
  china: { zh: '🇨🇳 中国', en: '🇨🇳 China' },
  albums: { zh: '个相册', en: 'albums' },
  photos: { zh: '张', en: 'photos' },
  loading: { zh: '加载地球中...', en: 'Loading globe...' },
  viewAll: { zh: '查看全部 →', en: 'View all →' },
};

/** 渐进式披露：只保留国家、省/州、城市三级标签；镇、村、路名、水名等一律隐藏 */
const LABEL_MIN_ZOOM: Array<[RegExp, number]> = [
  [/place_country/, 0],
  [/place_state/, 4.5],
  [/place_city/, 5.5],
];
function applyLabelZooms(map: maplibregl.Map) {
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue;
    const rule = LABEL_MIN_ZOOM.find(([re]) => re.test(layer.id));
    if (!rule) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
      continue;
    }
    const current = layer.minzoom ?? 0;
    if (rule[1] > current) map.setLayerZoomRange(layer.id, rule[1], layer.maxzoom ?? 24);
  }
}

/** 缩放范围：桌面 2 是整球视角；窄屏地球更小，允许到 1.2 才能看全。9 已到城市街区级 */
const MIN_ZOOM = 2;
const MIN_ZOOM_NARROW = 1.2;
const MAX_ZOOM = 9;
const NARROW_INITIAL_ZOOM = 1.35;

/** 离开页面前记住视角，从相册返回时恢复到同样的位置和缩放 */
const VIEW_STORAGE_KEY = 'globe_view';
interface SavedView { center: [number, number]; zoom: number; bearing: number; pitch: number }
function loadSavedView(): SavedView | null {
  try {
    const raw = sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as SavedView;
    if (!Array.isArray(v.center) || typeof v.zoom !== 'number') return null;
    return v;
  } catch { return null; }
}
function saveView(map: maplibregl.Map) {
  try {
    const c = map.getCenter();
    const v: SavedView = { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
    sessionStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(v));
  } catch { /* storage unavailable */ }
}

/** 右侧相册面板宽度（px）；窄屏时改为底部面板 */
const PANEL_W = 480;
const PANEL_H_MOBILE = 230;
const WIDE_BREAKPOINT = 768;

/** 取几何体的经纬度范围，跳过跨 180° 的环 */
function geometryBounds(geom: Geometry): [[number, number], [number, number]] | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const addRing = (ring: number[][]) => {
    let rMin = Infinity, rMax = -Infinity;
    for (const [lng] of ring) { if (lng < rMin) rMin = lng; if (lng > rMax) rMax = lng; }
    if (rMax - rMin > 180) return;
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    }
  };
  if (geom.type === 'Polygon') addRing(geom.coordinates[0]);
  else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => addRing(poly[0]));
  else return null;
  if (!Number.isFinite(minLng)) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}

/** 两个标记在屏幕上的距离小于此像素值时合并为一个聚合标记 */
const CLUSTER_PX = 56;

/** 底图标签跟随站点语言（OpenMapTiles 字段 name:zh / name:en，缺省回退 name） */
function applyLabelLanguage(map: maplibregl.Map, locale: Locale) {
  // 中文：只用简体。name:zh-Hans 是干净的简体；name:zh 常见“简体 / 繁体”并列写法
  // （如“俄罗斯 / 俄羅斯”、“泰国;泰國”），这种情况退回英文而不是显示繁体。
  const zhPlain: maplibregl.ExpressionSpecification = [
    'case',
    ['all', ['has', 'name:zh'], ['!', ['in', '/', ['get', 'name:zh']]], ['!', ['in', ';', ['get', 'name:zh']]]],
    ['get', 'name:zh'],
    ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']],
  ];
  const field: maplibregl.ExpressionSpecification = locale === 'zh'
    ? ['coalesce', ['get', 'name:zh-Hans'], zhPlain]
    : ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue;
    if (!layer.layout || !('text-field' in layer.layout)) continue;
    map.setLayoutProperty(layer.id, 'text-field', field);
  }
}

export default function GlobeMap({ locale }: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const localeRef = useRef(locale);
  const [ready, setReady] = useState(false);
  const [activeRegion, setActiveRegion] = useState<Region | null>(null);
  const activeRegionRef = useRef<Region | null>(null);
  activeRegionRef.current = activeRegion;
  // 面板锚点：被点击地区标记的屏幕坐标，随地图移动更新
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [zoomLevel, setZoomLevel] = useState(WORLD_VIEW.zoom);
  const [minZoom, setMinZoom] = useState(MIN_ZOOM);
  const userInteractedRef = useRef<(() => void) | null>(null);
  const updateAnchorRef = useRef<(() => void) | null>(null);
  const [usedFallbackStyle, setUsedFallbackStyle] = useState(false);
  localeRef.current = locale;

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let userInteracted = false;
    let rafId = 0;

    const visitedSet = new Set(visitedCountries);
    const provinceSet = new Set(visitedProvinces);

    const init = async () => {
      // Resolve style (remote dark style, or local fallback).
      let style: string | maplibregl.StyleSpecification = OPENFREEMAP_DARK;
      try {
        const res = await fetch(OPENFREEMAP_DARK, { method: 'GET' });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        style = FALLBACK_STYLE;
        setUsedFallbackStyle(true);
      }
      if (cancelled || !containerRef.current) return;

      const saved = loadSavedView();
      const narrow = containerRef.current.clientWidth < WIDE_BREAKPOINT;
      const effectiveMin = narrow ? MIN_ZOOM_NARROW : MIN_ZOOM;
      setMinZoom(effectiveMin);
      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: saved?.center ?? WORLD_VIEW.center,
        zoom: saved?.zoom ?? (narrow ? NARROW_INITIAL_ZOOM : WORLD_VIEW.zoom),
        bearing: saved?.bearing ?? 0,
        pitch: saved?.pitch ?? 0,
        attributionControl: { compact: true },
        canvasContextAttributes: { antialias: true },
        minZoom: effectiveMin,
        maxZoom: MAX_ZOOM,
      });
      mapRef.current = map;
      // 球面模式下拖动跨纬度时 maplibre 会微调内部 zoom 以保持视觉比例，
      // 这不是用户的缩放操作，滑杆忽略拖动期间的变化。
      let dragging = false;
      map.on('dragstart', () => { dragging = true; });
      map.on('dragend', () => { dragging = false; });
      map.on('zoom', () => { if (!dragging) setZoomLevel(map.getZoom()); });
      setZoomLevel(map.getZoom());

      const stopRotation = () => { userInteracted = true; };
      userInteractedRef.current = stopRotation;
      // 恢复了上次视角就不再自转，否则会把用户刚看的地方转走
      if (saved) userInteracted = true;
      map.on('moveend', () => saveView(map));
      ['mousedown', 'touchstart', 'wheel', 'dragstart'].forEach(ev => map.on(ev as 'mousedown', stopRotation));

      // OpenFreeMap 样式引用了个别不存在的雪碧图，补一个空图避免控制台告警
      map.on('styleimagemissing', e => {
        if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
      });
      map.on('style.load', () => {
        map.setProjection({ type: 'globe' });
        applyLabelLanguage(map, localeRef.current);
        applyLabelZooms(map);
        try {
          map.setSky({
            'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
          });
        } catch { /* sky not supported */ }
      });

      map.on('load', async () => {
        // Load GeoJSON data.
        const [worldTopo, china, extra] = await Promise.all([
          fetch('/maps/world.json').then(r => r.json() as Promise<Parameters<typeof feature>[0]>),
          fetch('/maps/china.json').then(r => r.json() as Promise<FeatureCollection<Geometry, { adcode: number }>>),
          // Natural Earth 110m 没有新加坡这类小国，补充的轮廓放在这里
          fetch('/maps/extra-countries.json').then(r => r.json() as Promise<FeatureCollection<Geometry, { name: string; iso: string }>>),
        ]);
        if (cancelled) return;

        const world = feature(worldTopo, worldTopo.objects.countries as Parameters<typeof feature>[1]) as unknown as FeatureCollection<Geometry, { name: string }>;
        // 跨越 180° 经线的环（阿留申群岛、俄罗斯东端等）在球面上会被拉成穿过极点的扇形，剔除
        const spansAntimeridian = (ring: number[][]) => {
          let min = Infinity, max = -Infinity;
          for (const [lng] of ring) { if (lng < min) min = lng; if (lng > max) max = lng; }
          return max - min > 180;
        };
        const dropCrossingRings = (geom: Geometry): Geometry => {
          if (geom.type === 'Polygon') {
            return spansAntimeridian(geom.coordinates[0]) ? { type: 'Polygon', coordinates: [] } : geom;
          }
          if (geom.type === 'MultiPolygon') {
            return { type: 'MultiPolygon', coordinates: geom.coordinates.filter(poly => !spansAntimeridian(poly[0])) };
          }
          return geom;
        };
        const worldFeatures: FeatureCollection = {
          type: 'FeatureCollection',
          features: [
            ...world.features
              .filter(f => COUNTRY_NAME_TO_ISO[f.properties.name] && COUNTRY_NAME_TO_ISO[f.properties.name] !== 'CN')
              .map(f => {
                const iso = COUNTRY_NAME_TO_ISO[f.properties.name];
                return { ...f, geometry: dropCrossingRings(f.geometry), properties: { ...f.properties, iso, visited: visitedSet.has(iso) } };
              }),
            ...extra.features.map(f => ({ ...f, properties: { ...f.properties, visited: visitedSet.has(f.properties.iso) } })),
          ],
        };
        const chinaFeatures: FeatureCollection = {
          type: 'FeatureCollection',
          features: china.features.map(f => ({
            ...f,
            properties: { ...f.properties, visited: provinceSet.has(f.properties.adcode) },
          })),
        };

        // 地区 → 轮廓范围索引，用于点击后把该地区放大到合适尺寸
        const regionBounds = new Map<string, [[number, number], [number, number]]>();
        regions.forEach(r => {
          const adcode = provinceAdcodeMap[r.mapCode];
          const feat = adcode
            ? china.features.find(f => f.properties.adcode === adcode)
            : worldFeatures.features.find(f => (f.properties as { iso?: string }).iso === r.mapCode);
          const b = feat ? geometryBounds(feat.geometry) : null;
          if (b) regionBounds.set(r.id, b);
        });

        map.addSource('world', { type: 'geojson', data: worldFeatures });
        map.addSource('china', { type: 'geojson', data: chinaFeatures });

        // 不再给未访问国家叠半透明填充：Natural Earth 里跨极点/180° 经线的大多边形
        // （俄罗斯、加拿大、南极洲）在球面投影下三角化出错，会画出白色同心圆虚影；
        // 底图本身已有陆地和国界，这层没有信息量。
        // Visited countries: amber.
        map.addLayer({
          id: 'world-visited',
          type: 'fill',
          source: 'world',
          filter: ['get', 'visited'],
          paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.45 },
        });
        map.addLayer({
          id: 'world-visited-outline',
          type: 'line',
          source: 'world',
          filter: ['get', 'visited'],
          paint: { 'line-color': '#fbbf24', 'line-width': 1, 'line-opacity': 0.8 },
        });
        // China provinces (the China polygon of the world layer is hidden).
        map.addLayer({
          id: 'china-unvisited',
          type: 'fill',
          source: 'china',
          filter: ['!', ['get', 'visited']],
          paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.08 },
        });
        map.addLayer({
          id: 'china-visited',
          type: 'fill',
          source: 'china',
          filter: ['get', 'visited'],
          paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.45 },
        });
        map.addLayer({
          id: 'china-visited-outline',
          type: 'line',
          source: 'china',
          filter: ['get', 'visited'],
          paint: { 'line-color': '#fbbf24', 'line-width': 1, 'line-opacity': 0.8 },
        });
        map.addLayer({
          id: 'china-borders',
          type: 'line',
          source: 'china',
          paint: { 'line-color': '#ffffff', 'line-width': 0.4, 'line-opacity': 0.15 },
        });

        // ── 标记：按屏幕距离动态聚合 ─────────────────────────────
        // 每次视图变化后把地区投影到屏幕，彼此距离小于 CLUSTER_PX 的合并成一个聚合标记
        // （显示照片最多那个地区的封面 + 地区数角标）；孤立的地区永远单独显示。
        // 点击地区：按轮廓范围放大，给面板留出空间，让地区在剩余画面里居中偏大地显示
        const focusRegion = (region: Region) => {
          const wide = map.getContainer().clientWidth >= WIDE_BREAKPOINT;
          const padding = wide
            ? { top: 60, bottom: 60, left: 60, right: PANEL_W + 60 }
            : { top: 40, bottom: PANEL_H_MOBILE + 40, left: 30, right: 30 };
          const b = regionBounds.get(region.id);
          if (b) {
            map.fitBounds(b, { padding, maxZoom: 8.5, curve: 1.4, speed: 0.9, essential: true });
          } else {
            map.flyTo({ center: region.coordinates, zoom: 6, padding, curve: 1.4, speed: 0.9, essential: true });
          }
          setActiveRegion(region);
        };
        map.on('click', () => setActiveRegion(null));
        const updateAnchor = () => {
          const r = activeRegionRef.current;
          if (!r) return;
          // 锚点就是被点击的标记，面板贴在它旁边
          const p = map.project(r.coordinates);
          setAnchor({ x: p.x, y: p.y });
          const c = map.getContainer();
          setContainerSize({ w: c.clientWidth, h: c.clientHeight });
        };
        map.on('move', updateAnchor);
        map.on('resize', updateAnchor);
        updateAnchorRef.current = updateAnchor;

        const makeMarkerEl = (cover: string | undefined, label: string, badge?: string) => {
          const el = document.createElement('button');
          el.className = 'globe-marker';
          el.type = 'button';
          el.setAttribute('aria-label', label);
          if (cover) {
            const img = document.createElement('img');
            img.src = photoUrl(cover);
            img.alt = '';
            el.appendChild(img);
          }
          if (badge) {
            const b = document.createElement('span');
            b.className = 'globe-marker-badge';
            b.textContent = badge;
            el.appendChild(b);
          }
          return el;
        };

        const photoCount = (r: Region) => r.albums.reduce((n, a) => n + a.photos.length, 0);

        // 地区标记：常驻，按需显示/隐藏
        const regionMarkers = regions.map(region => {
          const el = makeMarkerEl(region.albums[0]?.cover, region.name.en);
          el.addEventListener('click', e => {
            e.stopPropagation();
            userInteracted = true;
            focusRegion(region);
          });
          return new maplibregl.Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' })
            .setLngLat(region.coordinates)
            .addTo(map);
        });

        // 聚合标记：按成员集合复用，避免每帧重建
        const clusterMarkers = new Map<string, maplibregl.Marker>();

        const applyClusters = () => {
          const pts = regions.map((r, i) => ({ i, r, p: map.project(r.coordinates) }));
          // 照片多的优先成为聚合中心
          const order = [...pts].sort((a, b) => photoCount(b.r) - photoCount(a.r));
          const assigned = new Set<number>();
          const clusters: { members: typeof pts }[] = [];
          for (const seed of order) {
            if (assigned.has(seed.i)) continue;
            const members = [seed];
            assigned.add(seed.i);
            // 单轮凝聚：把所有离种子足够近的未分配点收进来
            for (const other of order) {
              if (assigned.has(other.i)) continue;
              if (seed.p.dist(other.p) < CLUSTER_PX) { members.push(other); assigned.add(other.i); }
            }
            clusters.push({ members });
          }

          const activeKeys = new Set<string>();
          for (const { members } of clusters) {
            if (members.length === 1) {
              regionMarkers[members[0].i].getElement().style.display = '';
              continue;
            }
            members.forEach(m => { regionMarkers[m.i].getElement().style.display = 'none'; });
            const key = members.map(m => m.i).sort((a, b) => a - b).join('-');
            activeKeys.add(key);
            const lng = members.reduce((n, m) => n + m.r.coordinates[0], 0) / members.length;
            const lat = members.reduce((n, m) => n + m.r.coordinates[1], 0) / members.length;
            let marker = clusterMarkers.get(key);
            if (!marker) {
              const lead = members[0].r;
              const el = makeMarkerEl(lead.albums[0]?.cover, members.map(m => m.r.name.en).join(', '), String(members.length));
              el.classList.add('globe-marker-cluster');
              el.addEventListener('click', e => {
                e.stopPropagation();
                userInteracted = true;
                setActiveRegion(null);
                const lngs = members.map(m => m.r.coordinates[0]);
                const lats = members.map(m => m.r.coordinates[1]);
                map.fitBounds(
                  [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
                  { padding: 140, maxZoom: Math.min(MAX_ZOOM, map.getZoom() + 3), curve: 1.4, speed: 0.9, essential: true }
                );
              });
              marker = new maplibregl.Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' }).setLngLat([lng, lat]).addTo(map);
              clusterMarkers.set(key, marker);
            } else {
              marker.setLngLat([lng, lat]);
            }
          }
          clusterMarkers.forEach((marker, key) => {
            if (!activeKeys.has(key)) { marker.remove(); clusterMarkers.delete(key); }
          });
        };

        applyClusters();
        map.on('move', applyClusters);
        map.on('zoom', applyClusters);

        setReady(true);

        // Gentle auto-rotation while idle.
        let last = performance.now();
        const spin = (now: number) => {
          if (cancelled) return;
          const dt = now - last;
          last = now;
          if (!userInteracted && map.getZoom() < 3 && !map.isMoving()) {
            const c = map.getCenter();
            map.jumpTo({ center: [c.lng + dt * 0.004, c.lat] });
          }
          rafId = requestAnimationFrame(spin);
        };
        rafId = requestAnimationFrame(spin);
      });
    };

    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // 选中地区变化时立刻刷新面板锚点
  useEffect(() => {
    if (activeRegion) updateAnchorRef.current?.();
  }, [activeRegion]);

  // 语言切换时更新底图标签
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) applyLabelLanguage(map, locale);
  }, [locale]);

  // 滑杆按相对量作用在当前真实 zoom 上，这样滑杆与内部 zoom 有偏差时也不会跳变
  const setZoom = (z: number) => {
    const map = mapRef.current;
    if (!map) return;
    userInteractedRef.current?.();
    const target = Math.max(minZoom, Math.min(MAX_ZOOM, map.getZoom() + (z - zoomLevel)));
    map.jumpTo({ zoom: target });
    setZoomLevel(z);
  };

  const goWorld = () => {
    setActiveRegion(null);
    const narrow = (mapRef.current?.getContainer().clientWidth ?? 0) < WIDE_BREAKPOINT;
    mapRef.current?.flyTo({ ...WORLD_VIEW, zoom: narrow ? NARROW_INITIAL_ZOOM : WORLD_VIEW.zoom, curve: 1.4, speed: 0.8, essential: true });
  };
  const goChina = () => {
    setActiveRegion(null);
    mapRef.current?.flyTo({ ...CHINA_VIEW, curve: 1.4, speed: 0.8, essential: true });
  };

  return (
    <div className="relative w-full h-[70vh] md:h-[75vh] rounded-2xl overflow-hidden border border-white/10 bg-[#0a0f1a]">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" style={{ position: 'absolute' }} />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none">
          {t.loading[locale]}
        </div>
      )}
      <div className="absolute top-3 left-3 flex gap-2 z-10">
        <button onClick={goWorld} className="globe-btn">{t.world[locale]}</button>
        <button onClick={goChina} className="globe-btn">{t.china[locale]}</button>
      </div>
      {/* 相册面板：宽屏在右侧，窄屏在底部 */}
      {activeRegion && (() => {
        const single = activeRegion.albums.length === 1;
        const total = activeRegion.albums.reduce((n, a) => n + (a.photos?.length || 0), 0);
        const allHref = `/region/${activeRegion.id}`;
        // 宽屏：面板贴在标记旁边，优先右侧，放不下翻到左侧；上下居中于标记并限制在容器内（右侧避开滑杆）
        const wide = containerSize.w >= WIDE_BREAKPOINT;
        const GAP = 32, MARGIN = 12, SLIDER_W = 56;
        const panelH = 44 + activeRegion.albums.length * 160;
        let style: React.CSSProperties | undefined;
        if (wide && anchor) {
          const fitsRight = anchor.x + GAP + PANEL_W <= containerSize.w - SLIDER_W - MARGIN;
          const left = fitsRight ? anchor.x + GAP : Math.max(MARGIN, anchor.x - GAP - PANEL_W);
          const top = Math.min(Math.max(MARGIN, anchor.y - panelH / 2), Math.max(MARGIN, containerSize.h - panelH - MARGIN));
          style = { left, top, right: 'auto' };
        }
        return (
          <aside className="globe-panel" style={style} onClick={e => e.stopPropagation()}>
            <div className="globe-panel-head">
              <h3>{activeRegion.name[locale]}</h3>
              <span>{activeRegion.albums.length} {t.albums[locale]} · {total} {t.photos[locale]}</span>
              <Link href={allHref} className="globe-panel-all">{t.viewAll[locale]}</Link>
              <button type="button" className="globe-panel-close" onClick={() => setActiveRegion(null)} aria-label="Close">×</button>
            </div>
            <div className="globe-panel-list">
              {activeRegion.albums.map(album => (
                <Link
                  key={album.id}
                  href={single ? allHref : `/region/${activeRegion.id}/${album.id}`}
                  className="globe-panel-card"
                >
                  {pickHighlights(album, 2).map(photo => (
                    <div key={photo.id} className="globe-panel-thumb">
                      <img src={photoUrl(photo.thumbnail || photo.src)} alt={photo.title?.[locale] || ''} />
                    </div>
                  ))}
                  <div className="globe-panel-caption">
                    <span className="globe-panel-title">{album.title[locale]}</span>
                    <span className="globe-panel-count">{album.photos?.length || 0} {t.photos[locale]}</span>
                  </div>
                </Link>
              ))}
            </div>
          </aside>
        );
      })()}

      {/* 缩放滑杆 */}
      <div className="absolute top-3 right-3 z-10 flex flex-col items-center gap-2 globe-zoom">
        <button type="button" onClick={() => setZoom(Math.min(MAX_ZOOM, zoomLevel + 0.5))} className="globe-zoom-btn" aria-label="Zoom in">+</button>
        <input
          type="range"
          min={minZoom}
          max={MAX_ZOOM}
          step={0.05}
          value={zoomLevel}
          onChange={e => setZoom(Number(e.target.value))}
          aria-label="Zoom"
          className="globe-zoom-slider"
        />
        <button type="button" onClick={() => setZoom(Math.max(minZoom, zoomLevel - 0.5))} className="globe-zoom-btn" aria-label="Zoom out">−</button>
        <span className="globe-zoom-value">{zoomLevel.toFixed(1)}×</span>
      </div>
      {usedFallbackStyle && (
        <span className="absolute bottom-2 left-3 text-[10px] text-zinc-600">offline style</span>
      )}
      <style jsx global>{`
        .globe-btn {
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(245, 158, 11, 0.4);
          color: #e4e4e7;
          border-radius: 9999px;
          padding: 6px 14px;
          font-size: 13px;
          cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
        }
        .globe-btn:hover { border-color: #f59e0b; color: #fbbf24; }
        .globe-zoom {
          background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 9999px; padding: 8px 6px;
        }
        .globe-zoom-btn {
          width: 24px; height: 24px; border-radius: 9999px; border: 0; background: transparent;
          color: #a1a1aa; font-size: 16px; line-height: 1; cursor: pointer;
        }
        .globe-zoom-btn:hover { color: #fbbf24; }
        .globe-zoom-slider {
          -webkit-appearance: none; appearance: none;
          writing-mode: vertical-lr; direction: rtl;
          width: 4px; height: 140px; background: rgba(255,255,255,0.15); border-radius: 2px; outline: none; cursor: pointer;
        }
        .globe-zoom-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 9999px;
          background: #f59e0b; border: 2px solid #18181b; box-shadow: 0 0 8px rgba(245,158,11,0.6);
        }
        .globe-zoom-slider::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 9999px; background: #f59e0b; border: 2px solid #18181b;
        }
        .globe-zoom-value { font-size: 10px; color: #a1a1aa; font-variant-numeric: tabular-nums; }
        .globe-marker {
          width: 32px; height: 32px; border-radius: 9999px; padding: 0;
          border: 2px solid #f59e0b; overflow: hidden; cursor: pointer;
          background: #27272a;
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.25), 0 0 18px rgba(245, 158, 11, 0.6);
          /* 不要在 transform 上做过渡：maplibre 用同一元素的 transform 定位，过渡会让标记拖动时滞后 */
          transition: box-shadow 0.2s;
        }
        .globe-marker:hover { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.35), 0 0 28px rgba(245, 158, 11, 0.9); }
        .globe-marker img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.2s; }
        .globe-marker:hover img { transform: scale(1.15); }
        .globe-marker { overflow: visible; }
        .globe-marker img { border-radius: 9999px; }
        .globe-marker-cluster { width: 44px; height: 44px; }
        .globe-marker-badge {
          position: absolute; top: -6px; right: -8px; min-width: 20px; height: 20px; padding: 0 6px;
          border-radius: 9999px; background: #f59e0b; color: #18181b; font-size: 11px; font-weight: 700;
          display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px #0a0f1a;
        }
        .globe-panel {
          position: absolute; top: 12px; right: 12px; width: ${PANEL_W}px; max-height: calc(100% - 24px);
          display: flex; flex-direction: column; z-index: 20;
          background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(16px);
          border: 1px solid rgba(245, 158, 11, 0.5); border-radius: 14px;
          box-shadow: 0 0 24px rgba(234, 88, 12, 0.3); color: #e4e4e7; overflow: hidden;
        }
        @media (max-width: ${WIDE_BREAKPOINT - 1}px) {
          .globe-panel { top: auto; left: 12px; right: 12px; bottom: 12px; width: auto; max-height: ${PANEL_H_MOBILE}px; }
        }
        .globe-panel-head { display: flex; align-items: baseline; gap: 10px; padding: 12px 14px 8px; }
        .globe-panel-head h3 { margin: 0; font-size: 17px; font-weight: 600; color: #fff; line-height: 1.2; }
        .globe-panel-head > span { font-size: 11px; color: #a1a1aa; flex: 1; }
        .globe-panel-all { font-size: 12px; color: #fbbf24; text-decoration: none; white-space: nowrap; }
        .globe-panel-all:hover { text-decoration: underline; }
        .globe-panel-close { background: transparent; border: 0; color: #a1a1aa; font-size: 20px; line-height: 1; cursor: pointer; padding: 0 0 0 4px; align-self: center; }
        .globe-panel-close:hover { color: #fbbf24; }
        .globe-panel-list { overflow-y: auto; padding: 0 10px 10px; display: flex; flex-direction: column; gap: 8px; }
        .globe-panel-card {
          position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 3px;
          border-radius: 10px; overflow: hidden; text-decoration: none; color: inherit; outline: none; background: #27272a;
        }
        .globe-panel-card:focus-visible { box-shadow: 0 0 0 2px #f59e0b; }
        .globe-panel-thumb { aspect-ratio: 3 / 2; overflow: hidden; background: #27272a; }
        .globe-panel-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s, filter 0.3s; filter: brightness(0.92); }
        .globe-panel-card:hover .globe-panel-thumb img { transform: scale(1.04); filter: brightness(1); }
        .globe-panel-caption {
          position: absolute; left: 0; right: 0; bottom: 0; padding: 22px 10px 8px;
          display: flex; align-items: baseline; justify-content: space-between; gap: 8px; pointer-events: none;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.75), rgba(0, 0, 0, 0));
        }
        .globe-panel-title { font-size: 14px; font-weight: 500; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .globe-panel-card:hover .globe-panel-title { color: #fbbf24; }
        .globe-panel-count { font-size: 11px; color: #d4d4d8; white-space: nowrap; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
        .maplibregl-ctrl-group { background: rgba(0, 0, 0, 0.7) !important; border: 1px solid rgba(255,255,255,0.1); }
        .maplibregl-ctrl-group button + button { border-top-color: rgba(255,255,255,0.1) !important; }
        .maplibregl-ctrl-group button .maplibregl-ctrl-icon { filter: invert(1) opacity(0.8); }
        .maplibregl-ctrl-attrib { background: rgba(0,0,0,0.5) !important; color: #71717a; font-size: 10px; }
        .maplibregl-ctrl-attrib a { color: #a1a1aa; }
      `}</style>
    </div>
  );
}
