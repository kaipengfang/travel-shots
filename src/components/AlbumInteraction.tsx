'use client';

import { useState, useEffect, useRef } from 'react';

interface Comment {
  id: number;
  album_id: string;
  parent_id: number | null;
  parent_username: string | null;
  user_id: string;
  username: string;
  ip_address: string;
  country_code: string;
  country_emoji: string;
  content: string;
  is_moderator: boolean;
  created_at: string;
}

interface AlbumInteractionProps {
  albumId: string;
  locale: 'zh' | 'en';
}

export default function AlbumInteraction({ albumId, locale }: AlbumInteractionProps) {
  const [likes, setLikes] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [replyText, setReplyText] = useState('');
  const [username, setUsername] = useState('');
  const [isModerator, setIsModerator] = useState(false);
  const [showModeratorLogin, setShowModeratorLogin] = useState(false);
  const [moderatorPassword, setModeratorPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userId, setUserId] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  const prevReplyToId = useRef<number | null>(null);

  useEffect(() => {
    if (replyTo && replyTo.id !== prevReplyToId.current) {
      setTimeout(() => replyInputRef.current?.focus(), 50);
    }
    prevReplyToId.current = replyTo?.id ?? null;
  }, [replyTo]);

  useEffect(() => {
    let id = localStorage.getItem('photo_user_id');
    if (!id) {
      id = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now();
      localStorage.setItem('photo_user_id', id);
    }
    setUserId(id);

    const modStatus = localStorage.getItem('photo_is_moderator');
    const modUsername = localStorage.getItem('photo_username');
    if (modStatus === 'true' && modUsername) {
      setIsModerator(true);
      setUsername(modUsername);
    } else {
      const savedUsername = localStorage.getItem('photo_username');
      if (savedUsername) setUsername(savedUsername);
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const [likesRes, commentsRes] = await Promise.all([
          fetch(`/api/likes?album_id=${albumId}`),
          fetch(`/api/comments?album_id=${albumId}`)
        ]);
        const likesData = await likesRes.json();
        const commentsData = await commentsRes.json();
        if (likesData.success) setLikes(likesData.count);
        if (commentsData.success) setComments(commentsData.data);
      } catch (e) {
        console.error('Failed to fetch data:', e);
      }

      const likedAlbums = JSON.parse(localStorage.getItem('likedAlbums') || '[]');
      if (likedAlbums.includes(albumId)) setIsLiked(true);
    }
    fetchData();
  }, [albumId]);

  useEffect(() => {
    const savedPassword = localStorage.getItem('photo_moderator_password');
    if (savedPassword) setModeratorPassword(savedPassword);
  }, []);

  const handleLike = async () => {
    if (isSubmitting || !userId) return;
    setIsSubmitting(true);
    const wasLiked = isLiked;
    const prevLikes = likes;
    
    setLikes(prev => wasLiked ? prev - 1 : prev + 1);
    setIsLiked(!wasLiked);
    
    const likedAlbums = JSON.parse(localStorage.getItem('likedAlbums') || '[]');
    localStorage.setItem('likedAlbums', JSON.stringify(
      wasLiked ? likedAlbums.filter((id: string) => id !== albumId) : [...likedAlbums, albumId]
    ));

    try {
      const res = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: albumId, user_id: userId, action: wasLiked ? 'unlike' : 'like' })
      });
      if (!(await res.json()).success) throw new Error();
    } catch {
      setLikes(prevLikes);
      setIsLiked(wasLiked);
      localStorage.setItem('likedAlbums', JSON.stringify(likedAlbums));
    }
    setIsSubmitting(false);
  };

  const submitComment = async (content: string, parentId: number | null, parentUsername: string | null) => {
    if (!content.trim() || (!username.trim() && !isModerator) || isSubmitting || !userId) return false;
    setIsSubmitting(true);

    const displayUsername = isModerator ? (locale === 'zh' ? '版主' : 'Moderator') : username.trim();
    const tempId = -Date.now();
    
    const optimisticComment: Comment = {
      id: tempId, album_id: albumId, parent_id: parentId, parent_username: parentUsername,
      user_id: userId, username: displayUsername, ip_address: '',
      country_code: 'XX', country_emoji: '🌍', content: content.trim(),
      is_moderator: isModerator, created_at: new Date().toISOString()
    };
    
    setComments(prev => [...prev, optimisticComment]);
    if (!isModerator) localStorage.setItem('photo_username', username.trim());

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'comment', album_id: albumId, content: content.trim(),
          username: displayUsername, user_id: userId, parent_id: parentId,
          password: isModerator ? moderatorPassword : ''
        })
      });
      const data = await res.json();
      if (data.success) {
        setComments(prev => prev.map(c => c.id === tempId ? data.data : c));
        setIsSubmitting(false);
        return true;
      }
      throw new Error();
    } catch {
      setComments(prev => prev.filter(c => c.id !== tempId));
      setIsSubmitting(false);
      return false;
    }
  };

  const handleComment = async () => {
    if (await submitComment(newComment, null, null)) {
      setNewComment('');
    }
  };

  const handleReply = async () => {
    if (!replyTo) return;
    if (await submitComment(replyText, replyTo.id, replyTo.username)) {
      setReplyText('');
      setReplyTo(null);
    }
  };

  const handleModeratorVerify = async () => {
    if (!moderatorPassword.trim()) return;
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_moderator', password: moderatorPassword })
      });
      const data = await res.json();
      if (data.success && data.is_moderator) {
        setIsModerator(true);
        setShowModeratorLogin(false);
        const modName = locale === 'zh' ? '版主' : 'Moderator';
        setUsername(modName);
        localStorage.setItem('photo_is_moderator', 'true');
        localStorage.setItem('photo_moderator_password', moderatorPassword);
        localStorage.setItem('photo_username', modName);
      } else {
        alert(locale === 'zh' ? '密码错误' : 'Wrong password');
      }
    } catch (e) {
      console.error('Verify failed:', e);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return locale === 'zh' ? '刚刚' : 'now';
    if (minutes < 60) return `${minutes} ${locale === 'zh' ? '分钟前' : 'min ago'}`;
    if (hours < 24) return `${hours} ${locale === 'zh' ? '小时前' : 'hr ago'}`;
    if (days < 7) return `${days} ${locale === 'zh' ? '天前' : 'd ago'}`;
    return date.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
  };

  const sortedComments = [...comments].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const getAllReplies = (parentId: number, allComments: Comment[]): Comment[] => {
    const directReplies = allComments.filter(c => c.parent_id === parentId);
    const nestedReplies = directReplies.flatMap(reply => getAllReplies(reply.id, allComments));
    return [...directReplies, ...nestedReplies].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  };

  const commentThreads = sortedComments
    .filter(c => c.parent_id === null)
    .map(mainComment => ({
      main: mainComment,
      replies: getAllReplies(mainComment.id, sortedComments)
    }));

  // 渲染回复输入框
  const ReplyInput = ({ target }: { target: Comment }) => (
    <div className="mt-4">
      <div className="text-sm text-orange-400 mb-2">
        {locale === 'zh' ? '回复' : 'Reply to'} @{target.username || (locale === 'zh' ? '匿名' : 'Anonymous')}
      </div>
      <textarea
        ref={replyInputRef}
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); }
          if (e.key === 'Escape') setReplyTo(null);
        }}
        placeholder={locale === 'zh' ? '写下你的想法...' : 'Write a reply...'}
        rows={2}
        className="w-full px-3 py-2 text-base bg-white/5 border-0 rounded-lg text-zinc-100 placeholder-zinc-500 resize-none focus:ring-0 focus:outline-none transition-colors"
      />
      <div className="flex justify-end gap-2 mt-2">
        <button
          onClick={() => setReplyTo(null)}
          className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-300 transition-colors cursor-pointer"
        >
          {locale === 'zh' ? '取消' : 'Cancel'}
        </button>
        <button
          onClick={handleReply}
          disabled={!replyText.trim() || isSubmitting}
          className="px-4 py-1.5 text-sm text-white bg-orange-500 rounded-md hover:bg-orange-600 disabled:bg-zinc-600 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {locale === 'zh' ? '发送' : 'Send'}
        </button>
      </div>
    </div>
  );

  return (
    <section className="mt-20 max-w-5xl mx-auto px-4">
      {/* 互动统计 */}
      <div className="flex items-center gap-8 pb-6">
        <button
          onClick={handleLike}
          disabled={isSubmitting}
          className="flex items-center gap-2 text-gray-600 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
        >
          <svg 
            className={`w-5 h-5 transition-colors ${isLiked ? 'text-red-500 fill-red-500' : 'fill-none'}`}
            viewBox="0 0 24 24" 
            stroke="currentColor" 
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
          <span className="text-base font-medium">{likes}</span>
        </button>
        
        <div className="flex items-center gap-2 text-gray-500 dark:text-zinc-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
          </svg>
          <span className="text-base">{comments.length}</span>
        </div>

        {!isModerator && (
          <button
            onClick={() => setShowModeratorLogin(!showModeratorLogin)}
            className="ml-auto text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
          >
            {locale === 'zh' ? '管理' : 'Admin'}
          </button>
        )}
      </div>

      {/* 版主登录 */}
      {showModeratorLogin && !isModerator && (
        <div className="py-4">
          <div className="flex gap-2">
            <input
              type="password"
              value={moderatorPassword}
              onChange={(e) => setModeratorPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleModeratorVerify()}
              placeholder={locale === 'zh' ? '管理员密码' : 'Admin password'}
              className="flex-1 px-3 py-2 text-base border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-gray-800 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
            <button
              onClick={handleModeratorVerify}
              className="px-4 py-2 text-base text-white bg-emerald-600 dark:bg-emerald-500 rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-400 transition-colors cursor-pointer"
            >
              {locale === 'zh' ? '验证' : 'Verify'}
            </button>
          </div>
        </div>
      )}

      {/* 发表评论 - 深色毛玻璃 + 暖色调 */}
      <div className="bg-black/60 backdrop-blur-xl rounded-xl p-5 border border-white/10 mb-6">
        {!isModerator ? (
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={locale === 'zh' ? '昵称' : 'Name'}
            className="w-full mb-3 px-0 py-1 text-base text-zinc-100 bg-transparent border-b border-white/10 focus:outline-none focus:border-orange-500/50 transition-colors"
          />
        ) : (
          <div className="mb-3 text-sm text-orange-400 font-medium">
            ✦ {locale === 'zh' ? '管理员身份' : 'Admin'}
          </div>
        )}
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={locale === 'zh' ? '写下你的想法...' : 'Share your thoughts...'}
          rows={3}
          className="w-full px-3 py-2 text-base bg-white/5 border-0 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none transition-colors"
        />
        <div className="flex justify-end mt-3">
          <button
            onClick={handleComment}
            disabled={!newComment.trim() || (!username.trim() && !isModerator) || isSubmitting}
            className="px-5 py-2 text-base text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:bg-zinc-600 disabled:cursor-not-allowed transition-colors cursor-pointer font-medium"
          >
            {locale === 'zh' ? '发布' : 'Post'}
          </button>
        </div>
      </div>

      {/* 评论列表 - 深色毛玻璃 + 暖色调 */}
      {comments.length === 0 ? (
        <p className="py-16 text-center text-base text-zinc-400">
          {locale === 'zh' ? '还没有留言' : 'No comments yet'}
        </p>
      ) : (
        <div className="space-y-4">
          {commentThreads.map(thread => (
            // 整个评论+回复在同一个深色毛玻璃卡片内
            <div key={thread.main.id} className="bg-black/60 backdrop-blur-xl rounded-xl p-5 border border-white/10">
              {/* 主评论 */}
              {/* 第一行：头像 + 昵称 + 时间 + 地区 */}
              <div className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                <span className="w-7 h-7 bg-white/10 rounded-full flex items-center justify-center text-base">
                  {thread.main.country_emoji || '🌍'}
                </span>
                <span className={`font-medium ${thread.main.is_moderator ? 'text-orange-400' : 'text-zinc-200'}`}>
                  {thread.main.username || (locale === 'zh' ? '匿名' : 'Anonymous')}
                </span>
                {thread.main.is_moderator && (
                  <span className="text-orange-400">✦</span>
                )}
                <span className="text-zinc-600">·</span>
                <span>{formatDate(thread.main.created_at)}</span>
              </div>
              {/* 第二行：评论内容 */}
              <p className="text-base text-zinc-200 mb-3 leading-relaxed">
                {thread.main.content}
              </p>
              {/* 回复按钮 */}
              <button
                onClick={() => { 
                  if (replyTo?.id === thread.main.id) {
                    setReplyTo(null);
                  } else {
                    setReplyTo(thread.main); 
                    setReplyText('');
                  }
                }}
                className={`text-sm transition-colors cursor-pointer ${replyTo?.id === thread.main.id ? 'text-red-400' : 'text-zinc-400 hover:text-orange-400'}`}
              >
                {replyTo?.id === thread.main.id 
                  ? (locale === 'zh' ? '取消回复' : 'Cancel') 
                  : (locale === 'zh' ? '回复' : 'Reply')}
              </button>
              
              {replyTo?.id === thread.main.id && <ReplyInput target={thread.main} />}

              {/* 嵌套回复 - 左边框分隔 */}
              {thread.replies.length > 0 && (
                <div className="mt-4 pl-4 border-l-2 border-orange-500/30 space-y-3">
                  {thread.replies.map(reply => (
                    <div key={reply.id} className="group">
                      {/* 回复内容 - 背景稍浅 */}
                      <div className="bg-white/5 rounded-lg p-3">
                        {/* 第一行：头像 + 昵称 + 时间 + 被回复人 */}
                        <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
                          <span className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-base">
                            {reply.country_emoji || '🌍'}
                          </span>
                          <span className={`font-medium ${reply.is_moderator ? 'text-orange-400' : 'text-zinc-200'}`}>
                            {reply.username || (locale === 'zh' ? '匿名' : 'Anonymous')}
                          </span>
                          {reply.is_moderator && (
                            <span className="text-orange-400">✦</span>
                          )}
                          {reply.parent_username && (
                            <>
                              <span className="text-zinc-600">→</span>
                              <span className="text-orange-400">@{reply.parent_username}</span>
                            </>
                          )}
                          <span className="text-zinc-600">·</span>
                          <span>{formatDate(reply.created_at)}</span>
                        </div>
                        {/* 第二行：回复内容 */}
                        <p className="text-[15px] text-zinc-300 leading-relaxed">
                          {reply.content}
                        </p>
                      </div>
                      {/* 回复按钮 */}
                      <button
                        onClick={() => { 
                          if (replyTo?.id === reply.id) {
                            setReplyTo(null);
                          } else {
                            setReplyTo(reply); 
                            setReplyText('');
                          }
                        }}
                        className={`mt-2 text-sm transition-colors cursor-pointer ${replyTo?.id === reply.id ? 'text-red-400' : 'text-zinc-400 hover:text-orange-400'}`}
                      >
                        {replyTo?.id === reply.id 
                          ? (locale === 'zh' ? '取消回复' : 'Cancel') 
                          : (locale === 'zh' ? '回复' : 'Reply')}
                      </button>
                      
                      {replyTo?.id === reply.id && <ReplyInput target={reply} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
