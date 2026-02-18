import config from '@/data/config.json';

/**
 * 将相对路径拼接为完整图片 URL
 * 相对路径示例：gansu/lanzhou/xxx.jpg
 */
export function photoUrl(relativePath: string): string {
  if (!relativePath) return '';
  // 已经是完整 URL 则直接返回（兼容旧数据）
  if (relativePath.startsWith('http')) return relativePath;
  const base = config.photoBaseUrl.replace(/\/$/, '');
  return `${base}/${relativePath}`;
}
