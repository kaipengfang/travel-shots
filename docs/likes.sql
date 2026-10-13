-- 点赞表（相册与单张照片共用），在 Supabase SQL Editor 中执行一次。
-- target_id 形如 'album:usa/usa-seattle' 或 'photo:usa/usa-seattle/seattle-001'
-- ip_hash 是加盐后的 IP 哈希，库中不保存明文 IP。

create table if not exists likes (
  id            bigserial primary key,
  target_id     text        not null,
  ip_hash       text        not null,
  country_code  text,
  created_at    timestamptz not null default now(),
  unique (target_id, ip_hash)
);

create index if not exists likes_target_idx on likes (target_id);

-- 开启 RLS 且不给 anon 任何策略：浏览器里的 anon key 无法直接读写此表，
-- 所有操作都经由 /api/likes，服务端使用 SUPABASE_SERVICE_ROLE_KEY。
alter table likes enable row level security;

-- 如果暂时没有配置 SUPABASE_SERVICE_ROLE_KEY，需要临时放开 anon（不推荐）：
-- create policy "anon read"   on likes for select to anon using (true);
-- create policy "anon insert" on likes for insert to anon with check (true);
-- create policy "anon delete" on likes for delete to anon using (true);

-- 旧表 album_likes / album_comments 可在确认迁移后删除：
-- drop table if exists album_comments;
-- drop table if exists album_likes;
