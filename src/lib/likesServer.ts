import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';

/**
 * 服务端点赞存储。
 *
 * 表结构见 docs/likes.sql。优先使用 SUPABASE_SERVICE_ROLE_KEY（只在服务端使用，
 * 不会进浏览器包），RLS 可以完全关闭 anon 的写权限。未配置时回退到 anon key，
 * 此时需要为 anon 开放 insert/delete 策略。
 */
let client: SupabaseClient | null = null;

export function getLikesClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/** 从请求头取真实 IP（Vercel / 反向代理） */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/** IP 经加盐哈希后作为点赞凭证，库里不存明文 IP */
export function hashIp(ip: string): string {
  const salt = process.env.LIKES_SALT || process.env.NEXT_PUBLIC_SUPABASE_URL || 'travelshots';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

/** Vercel 自带的地理头，不需要第三方 IP 查询服务 */
export function getCountryCode(request: NextRequest): string {
  return request.headers.get('x-vercel-ip-country') || 'XX';
}

/** target_id 形如 album:usa/usa-seattle 或 photo:usa/usa-seattle/seattle-001 */
const TARGET_RE = /^(album|photo):[A-Za-z0-9_\-/]{1,120}$/;
export function isValidTarget(id: unknown): id is string {
  return typeof id === 'string' && TARGET_RE.test(id);
}
