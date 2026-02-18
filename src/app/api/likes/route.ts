import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 免费 IP 查询 API
async function getIpInfo(ip: string) {
  if (!ip || ip === 'unknown' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { country_code: 'LOCAL', country_emoji: '🌍', country_name: 'Local' };
  }
  
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode,country`);
    const data = await res.json();
    
    if (data.status === 'success') {
      const emojiMap: Record<string, string> = {
        CN: '🇨🇳', US: '🇺🇸', JP: '🇯🇵', KR: '🇰🇷', GB: '🇬🇧', FR: '🇫🇷', DE: '🇩🇪',
        CA: '🇨🇦', AU: '🇦🇺', IN: '🇮🇳', RU: '🇷🇺', BR: '🇧🇷', IT: '🇮🇹', ES: '🇪🇸',
        TH: '🇹🇭', VN: '🇻🇳', MY: '🇲🇾', SG: '🇸🇬', HK: '🇭🇰', TW: '🇹🇼',
      };
      return {
        country_code: data.countryCode || 'XX',
        country_emoji: emojiMap[data.countryCode] || '🌍',
        country_name: data.country || 'Unknown'
      };
    }
  } catch (e) {
    console.error('IP lookup failed:', e);
  }
  
  return { country_code: 'XX', country_emoji: '🌍', country_name: 'Unknown' };
}

// 点赞 API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { album_id, user_id, action } = body;

    // 获取 IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] 
      || request.headers.get('x-real-ip') 
      || 'unknown';
    
    const ipInfo = await getIpInfo(ip);

    if (!album_id || !user_id) {
      return NextResponse.json({ 
        success: false, 
        error: '缺少必要参数' 
      }, { status: 400 });
    }

    if (action === 'like') {
      // 检查是否已点赞
      const { data: existing } = await supabase
        .from('album_likes')
        .select('*')
        .eq('album_id', album_id)
        .eq('user_id', user_id)
        .single();

      if (existing) {
        return NextResponse.json({ 
          success: false, 
          error: '已经点赞过了' 
        }, { status: 400 });
      }

      // 添加点赞
      const { data, error } = await supabase
        .from('album_likes')
        .insert({
          album_id,
          user_id,
          ip_address: ip,
          country_code: ipInfo.country_code,
          country_emoji: ipInfo.country_emoji
        })
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({ success: true, data });
    }

    if (action === 'unlike') {
      const { error } = await supabase
        .from('album_likes')
        .delete()
        .eq('album_id', album_id)
        .eq('user_id', user_id);

      if (error) throw error;

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ 
      success: false, 
      error: '未知操作' 
    }, { status: 400 });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: '服务器错误' 
    }, { status: 500 });
  }
}

// 获取点赞数
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const album_id = searchParams.get('album_id');

    if (!album_id) {
      return NextResponse.json({ 
        success: false, 
        error: '缺少 album_id' 
      }, { status: 400 });
    }

    // 获取点赞数
    const { count, error: countError } = await supabase
      .from('album_likes')
      .select('*', { count: 'exact', head: true })
      .eq('album_id', album_id);

    if (countError) throw countError;

    return NextResponse.json({ 
      success: true, 
      count: count || 0 
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: '服务器错误' 
    }, { status: 500 });
  }
}
