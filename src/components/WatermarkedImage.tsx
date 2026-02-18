'use client';

interface WatermarkedImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function WatermarkedImage({
  src,
  alt,
  className = '',
  style = {}
}: WatermarkedImageProps) {
  
  return (
    <div 
      className="photo-without-watermark"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <img
        src={src}
        alt={alt}
        title="© Copyright 2026 途影"
        className={className}
        style={style}
        draggable={false}
      />
    </div>
  );
}
