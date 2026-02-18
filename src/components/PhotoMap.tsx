'use client';

import { useState } from 'react';
import WorldMap from 'react-svg-worldmap';

interface Location {
  id: string;
  name: { zh: string; en: string };
  coordinates: [number, number];
  photoCount: number;
  countryCode: string; // ISO 3166-1 alpha-2
}

interface MapProps {
  locations: Location[];
  onLocationClick: (locationId: string) => void;
  locale: 'zh' | 'en';
}

export default function PhotoMap({ locations, onLocationClick, locale }: MapProps) {
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);

  // 转换为 react-svg-worldmap 需要的格式
  const data = locations.map(loc => ({
    country: loc.countryCode,
    value: loc.photoCount,
  }));

  // 自定义样式
  const stylingFunction = (context: { countryCode: string; countryValue?: number; color: string }) => {
    const isHovered = hoveredCountry === context.countryCode;
    const hasPhotos = context.countryValue && context.countryValue > 0;
    
    return {
      fill: hasPhotos 
        ? (isHovered ? '#93c5fd' : '#3b82f6')
        : (isHovered ? '#e5e7eb' : '#f3f4f6'),
      stroke: '#d1d5db',
      strokeWidth: 0.5,
      cursor: hasPhotos ? 'pointer' : 'default',
    };
  };

  // 点击处理
  const handleClick = (context: { countryCode: string; countryValue?: number }) => {
    const location = locations.find(loc => loc.countryCode === context.countryCode);
    if (location) {
      onLocationClick(location.id);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-4">
      <WorldMap
        color="#3b82f6"
        backgroundColor="white"
        borderColor="#d1d5db"
        size="responsive"
        data={data}
        styleFunction={stylingFunction}
        onClickFunction={handleClick}
        tooltipTextFunction={(context: { countryCode: string; countryValue?: number }) => {
          const location = locations.find(loc => loc.countryCode === context.countryCode);
          if (location) {
            return `${location.name[locale]}: ${context.countryValue} ${locale === 'zh' ? '张照片' : 'photos'}`;
          }
          return '';
        }}
      />
      
      <div className="text-center text-xs text-gray-400 mt-2">
        {locale === 'zh' ? '点击高亮国家查看照片' : 'Click highlighted countries to view photos'}
      </div>
    </div>
  );
}
