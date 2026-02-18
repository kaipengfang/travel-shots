import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MODERATOR_PASSWORD = process.env.MODERATOR_PASSWORD || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

// 免费 IP 查询 API
async function getIpInfo(ip: string) {
  if (!ip || ip === 'unknown' || ip === '::1' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { country_code: 'LOCAL', country_emoji: '🌍', country_name: 'Local' };
  }
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode,country`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
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

// 验证版主密码
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, album_id, content, username, user_id, parent_id, password } = body;

    // 获取 IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] 
      || request.headers.get('x-real-ip') 
      || 'unknown';
    
    const ipInfo = await getIpInfo(ip);

    // 版主验证
    if (action === 'verify_moderator') {
      if (password === MODERATOR_PASSWORD) {
        return NextResponse.json({ 
          success: true, 
          is_moderator: true 
        });
      }
      return NextResponse.json({ 
        success: false, 
        error: '密码错误' 
      }, { status: 401 });
    }

    // 评论
    if (action === 'comment') {
      if (!album_id || !content || !username || !user_id) {
        return NextResponse.json({ 
          success: false, 
          error: '缺少必要参数' 
        }, { status: 400 });
      }

      // 检查是否是版主（密码正确的话）
      const isModerator = password === MODERATOR_PASSWORD;

      // 获取被回复人的昵称
      let parentUsername = null;
      if (parent_id) {
        const { data: parentComment } = await supabase
          .from('album_comments')
          .select('username')
          .eq('id', parent_id)
          .single();
        parentUsername = parentComment?.username || null;
      }

      const { data, error } = await supabase
        .from('album_comments')
        .insert({
          album_id,
          content: content.trim(),
          username: isModerator ? (request.headers.get('accept-language')?.includes('zh') ? '版主' : 'Moderator') : username.trim(),
          user_id,
          ip_address: ip,
          country_code: ipInfo.country_code,
          country_emoji: ipInfo.country_emoji,
          parent_id: parent_id || null,
          parent_username: parentUsername,
          is_moderator: isModerator
        })
        .select()
        .single();

      if (error) throw error;

      // 发送邮件提醒
      if (RESEND_API_KEY && ADMIN_EMAIL && data) {
        try {
          const resend = new Resend(RESEND_API_KEY);
          const isReply = !!parent_id;
          
          await resend.emails.send({
            from: 'Photo Website <onboarding@resend.dev>',
            to: ADMIN_EMAIL,
            subject: isReply 
              ? `🔔 ${username} 回复了你的评论` 
              : `💬 ${username} 在相册发表了评论`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #f59e0b;">${isReply ? '收到新回复' : '收到新评论'}</h2>
                <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin: 16px 0;">
                  <p><strong>${data.country_emoji} ${username}</strong> 说：</p>
                  <p style="font-size: 18px; color: #333;">${data.content}</p>
                </div>
                <p style="color: #666; font-size: 14px;">
                  相册 ID: ${album_id}<br>
                  IP: ${ip} (${ipInfo.country_code})<br>
                  时间: ${new Date().toLocaleString('zh-CN')}
                </p>
              </div>
            `
          });
        } catch (emailError) {
          console.error('Email send failed:', emailError);
        }
      }

      return NextResponse.json({ success: true, data });
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

// 获取评论列表
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

    const { data, error } = await supabase
      .from('album_comments')
      .select('*')
      .eq('album_id', album_id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, data: data || [] });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: '服务器错误' 
    }, { status: 500 });
  }
}
