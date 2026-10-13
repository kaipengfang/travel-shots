import { NextRequest, NextResponse } from 'next/server';
import { getLikesClient, getClientIp, hashIp, getCountryCode, isValidTarget } from '@/lib/likesServer';

const MAX_TARGETS = 200;

/**
 * GET /api/likes?targets=album:a,photo:b,...
 * 返回每个 target 的点赞数，以及当前 IP 已点赞的 target 列表。
 */
export async function GET(request: NextRequest) {
  const supabase = getLikesClient();
  if (!supabase) return NextResponse.json({ success: false, error: 'likes not configured' }, { status: 503 });

  const raw = request.nextUrl.searchParams.get('targets') || '';
  const targets = raw.split(',').filter(isValidTarget).slice(0, MAX_TARGETS);
  if (targets.length === 0) {
    return NextResponse.json({ success: false, error: 'missing targets' }, { status: 400 });
  }

  const ipHash = hashIp(getClientIp(request));

  let data: { target_id: string; ip_hash: string }[] | null = null;
  let error: { message: string } | null = null;
  try {
    ({ data, error } = await supabase.from('likes').select('target_id, ip_hash').in('target_id', targets));
  } catch (e) {
    error = { message: e instanceof Error ? e.message : String(e) };
  }

  if (error) {
    // 表未创建或 Supabase 不可达：前端会隐藏爱心，这里不当作错误报警
    console.warn('likes unavailable:', error.message);
    // 用 200 返回，避免浏览器把它记成资源加载错误
    return NextResponse.json({ success: false, error: 'likes unavailable' });
  }

  const counts: Record<string, number> = {};
  const liked: string[] = [];
  for (const row of data ?? []) {
    counts[row.target_id] = (counts[row.target_id] || 0) + 1;
    if (row.ip_hash === ipHash) liked.push(row.target_id);
  }

  return NextResponse.json({ success: true, counts, liked }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

/**
 * POST /api/likes  { target_id }
 * 以 IP 为凭证切换点赞状态，返回最新状态与计数。
 * 依赖表上的 unique(target_id, ip_hash) 约束避免并发重复插入。
 */
export async function POST(request: NextRequest) {
  const supabase = getLikesClient();
  if (!supabase) return NextResponse.json({ success: false, error: 'likes not configured' }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 });
  }
  const targetId = (body as { target_id?: unknown })?.target_id;
  if (!isValidTarget(targetId)) {
    return NextResponse.json({ success: false, error: 'invalid target_id' }, { status: 400 });
  }

  const ipHash = hashIp(getClientIp(request));

  // 先尝试删除；删到了说明原本已点赞，这次是取消
  const { data: removed, error: delError } = await supabase
    .from('likes')
    .delete()
    .eq('target_id', targetId)
    .eq('ip_hash', ipHash)
    .select('id');

  if (delError) {
    console.error('likes unlike failed:', delError.message);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }

  let liked = false;
  if (!removed || removed.length === 0) {
    const { error: insError } = await supabase
      .from('likes')
      .insert({ target_id: targetId, ip_hash: ipHash, country_code: getCountryCode(request) });
    // 23505 = unique violation：并发下已被另一请求插入，视为已点赞
    if (insError && insError.code !== '23505') {
      console.error('likes like failed:', insError.message);
      return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
    }
    liked = true;
  }

  const { count } = await supabase
    .from('likes')
    .select('id', { count: 'exact', head: true })
    .eq('target_id', targetId);

  return NextResponse.json({ success: true, liked, count: count ?? 0 });
}
