import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 如果没有配置 Supabase，导出一个 mock 对象
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// 相册点赞评论类型
export interface AlbumLike {
  id: string;
  album_id: string;
  created_at: string;
}

export interface AlbumComment {
  id: string;
  album_id: string;
  content: string;
  created_at: string;
}
