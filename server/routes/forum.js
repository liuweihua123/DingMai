const express = require('express');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../auth');
const level = require('../level');

const router = express.Router();

// ═══════════════════════════════════════════════
// 帖子
// ═══════════════════════════════════════════════

// GET /api/forum/posts — 帖子列表
router.get('/posts', optionalAuth, (req, res) => {
  const { sort = 'newest', keyword, page = 1, limit = 20 } = req.query;
  const safeLimit = Math.min(parseInt(limit) || 20, 50);
  const offset = (parseInt(page) - 1) * safeLimit;

  let where = ["p.status = 'normal'"];
  let params = [];

  if (keyword) {
    where.push("(p.title LIKE ? OR p.content LIKE ?)");
    const kw = `%${keyword}%`;
    params.push(kw, kw);
  }

  const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
  let order;
  switch (sort) {
    case 'hot': order = 'ORDER BY p.likes_count DESC, p.replies_count DESC'; break;
    case 'replies': order = 'ORDER BY p.replies_count DESC'; break;
    default: order = 'ORDER BY p.created_at DESC';
  }

  const total = db.prepare(`SELECT COUNT(*) as c FROM posts p ${wc}`).get(...params).c;

  const posts = db.prepare(`
    SELECT p.*, u.username, u.level, u.avatar
    FROM posts p
    JOIN users u ON u.id = p.user_id
    ${wc} ${order}
    LIMIT ? OFFSET ?
  `).all(...params, safeLimit, offset);

  // 检查当前用户是否点赞
  let likedIds = new Set();
  if (req.user) {
    const postIds = posts.map(p => p.id);
    if (postIds.length) {
      const placeholders = postIds.map(() => '?').join(',');
      const liked = db.prepare(
        `SELECT post_id FROM post_likes WHERE user_id = ? AND post_id IN (${placeholders})`
      ).all(req.user.id, ...postIds);
      likedIds = new Set(liked.map(l => l.post_id));
    }
  }

  res.json({
    posts: posts.map(p => ({
      id: p.id, title: p.title,
      content: p.content.substring(0, 200),
      image: p.image || '',
      tags: JSON.parse(p.tags || '[]'),
      likesCount: p.likes_count, repliesCount: p.replies_count, viewsCount: p.views_count || 0,
      author: p.username, authorId: p.user_id,
      authorAvatar: p.avatar || '',
      authorLevel: p.level,
      authorLevelTitle: level.getLevelTitle(p.level),
      authorLevelColor: level.getLevelColor(p.level),
      liked: likedIds.has(p.id),
      createdAt: p.created_at,
    })),
    total, page: parseInt(page), limit: safeLimit,
  });
});

// GET /api/forum/posts/:id — 帖子详情
router.get('/posts/:id', optionalAuth, (req, res) => {
  const post = db.prepare(`
    SELECT p.*, u.username, u.level, u.exp, u.avatar FROM posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ? AND p.status = 'normal'
  `).get(req.params.id);

  if (!post) return res.status(404).json({ error: '帖子不存在' });

  // 增加浏览量
  db.prepare('UPDATE posts SET views_count = views_count + 1 WHERE id = ?').run(post.id);

  let liked = false;
  if (req.user) {
    liked = !!db.prepare('SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?').get(post.id, req.user.id);
  }

  res.json({
    id: post.id, title: post.title, content: post.content,
    image: post.image || '',
    tags: JSON.parse(post.tags || '[]'),
    likesCount: post.likes_count, repliesCount: post.replies_count,
    viewsCount: (post.views_count || 0) + 1,
    author: post.username, authorId: post.user_id,
    authorAvatar: post.avatar || '',
    authorLevel: post.level, authorLevelTitle: level.getLevelTitle(post.level),
    authorLevelColor: level.getLevelColor(post.level),
    liked, createdAt: post.created_at,
  });
});

// POST /api/forum/posts — 发帖
router.post('/posts', requireAuth, (req, res) => {
  const { title, content, image, tags } = req.body;
  if (!title || !content) return res.status(400).json({ error: '标题和内容不能为空' });

  const result = db.prepare(
    'INSERT INTO posts (user_id, title, content, image, tags) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, title.trim(), content.trim(), image || '', JSON.stringify(tags || []));

  // 增加经验值
  level.addExp(req.user.id, level.EXP.POST, '发帖');

  res.json({ success: true, id: result.lastInsertRowid });
});

// PUT /api/forum/posts/:id — 编辑帖子
router.put('/posts/:id', requireAuth, (req, res) => {
  const { title, content, image } = req.body;
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: '帖子不存在或无权编辑' });

  db.prepare('UPDATE posts SET title=?, content=?, image=? WHERE id=?')
    .run(title || post.title, content || post.content, image !== undefined ? image : post.image, post.id);
  res.json({ success: true });
});

// DELETE /api/forum/posts/:id — 删除帖子
router.delete('/posts/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: '帖子不存在或无权删除' });

  db.prepare("UPDATE posts SET status = 'deleted' WHERE id = ?").run(post.id);
  res.json({ success: true });
});

// POST /api/forum/posts/:id/like — 点赞/取消点赞
router.post('/posts/:id/like', requireAuth, (req, res) => {
  const postId = parseInt(req.params.id);
  const existing = db.prepare('SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?').get(postId, req.user.id);

  if (existing) {
    db.prepare('DELETE FROM post_likes WHERE id = ?').run(existing.id);
    db.prepare('UPDATE posts SET likes_count = likes_count - 1 WHERE id = ?').run(postId);
    res.json({ success: true, liked: false });
  } else {
    db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)').run(postId, req.user.id);
    db.prepare('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?').run(postId);
    // 被点赞者加经验
    const post = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(postId);
    if (post && post.user_id !== req.user.id) {
      level.addExp(post.user_id, level.EXP.POST_LIKE, '帖子被点赞');
    }
    res.json({ success: true, liked: true });
  }
});

// ═══════════════════════════════════════════════
// 回复
// ═══════════════════════════════════════════════

// GET /api/forum/posts/:id/replies — 获取回复列表
router.get('/posts/:id/replies', optionalAuth, (req, res) => {
  const postId = parseInt(req.params.id);

  const replies = db.prepare(`
    SELECT r.*, u.username
    FROM replies r
    JOIN users u ON u.id = r.user_id
    WHERE r.post_id = ? AND r.status = 'normal'
    ORDER BY r.created_at ASC
  `).all(postId);

  // 检查点赞状态
  let likedIds = new Set();
  if (req.user && replies.length) {
    const ids = replies.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const liked = db.prepare(
      `SELECT reply_id FROM reply_likes WHERE user_id = ? AND reply_id IN (${placeholders})`
    ).all(req.user.id, ...ids);
    likedIds = new Set(liked.map(l => l.reply_id));
  }

  // 构建嵌套回复结构
  const replyMap = {};
  const rootReplies = [];
  replies.forEach(r => {
    replyMap[r.id] = {
      id: r.id, content: r.content,
      likesCount: r.likes_count,
      author: r.username, authorId: r.user_id,
      liked: likedIds.has(r.id),
      createdAt: r.created_at,
      children: [],
    };
  });
  replies.forEach(r => {
    if (r.parent_id && replyMap[r.parent_id]) {
      replyMap[r.parent_id].children.push(replyMap[r.id]);
    } else {
      rootReplies.push(replyMap[r.id]);
    }
  });

  res.json(rootReplies);
});

// POST /api/forum/posts/:id/replies — 发回复
router.post('/posts/:id/replies', requireAuth, (req, res) => {
  const { content, parentId } = req.body;
  const postId = parseInt(req.params.id);

  if (!content) return res.status(400).json({ error: '回复内容不能为空' });

  // 检查帖子是否存在
  const post = db.prepare("SELECT id FROM posts WHERE id = ? AND status = 'normal'").get(postId);
  if (!post) return res.status(404).json({ error: '帖子不存在' });

  // 检查父回复是否存在
  if (parentId) {
    const parent = db.prepare('SELECT id FROM replies WHERE id = ? AND post_id = ?').get(parentId, postId);
    if (!parent) return res.status(400).json({ error: '父回复不存在' });
  }

  const result = db.prepare(
    'INSERT INTO replies (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)'
  ).run(postId, req.user.id, content.trim(), parentId || null);

  // 更新帖子回复数
  db.prepare('UPDATE posts SET replies_count = replies_count + 1 WHERE id = ?').run(postId);

  // 增加经验值
  level.addExp(req.user.id, level.EXP.REPLY, '回复');

  res.json({ success: true, id: result.lastInsertRowid });
});

// POST /api/forum/replies/:id/like — 回复点赞/取消
router.post('/replies/:id/like', requireAuth, (req, res) => {
  const replyId = parseInt(req.params.id);
  const existing = db.prepare('SELECT id FROM reply_likes WHERE reply_id = ? AND user_id = ?').get(replyId, req.user.id);

  if (existing) {
    db.prepare('DELETE FROM reply_likes WHERE id = ?').run(existing.id);
    db.prepare('UPDATE replies SET likes_count = likes_count - 1 WHERE id = ?').run(replyId);
    res.json({ success: true, liked: false });
  } else {
    db.prepare('INSERT INTO reply_likes (reply_id, user_id) VALUES (?, ?)').run(replyId, req.user.id);
    db.prepare('UPDATE replies SET likes_count = likes_count + 1 WHERE id = ?').run(replyId);
    // 被点赞者加经验
    const reply = db.prepare('SELECT user_id FROM replies WHERE id = ?').get(replyId);
    if (reply && reply.user_id !== req.user.id) {
      level.addExp(reply.user_id, level.EXP.REPLY_LIKE, '回复被点赞');
    }
    res.json({ success: true, liked: true });
  }
});

// ═══════════════════════════════════════════════
// 排行榜
// ═══════════════════════════════════════════════

// GET /api/forum/leaderboard — 等级排行榜
router.get('/leaderboard', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 20);
  res.json(level.getLeaderboard(limit));
});

// ═══════════════════════════════════════════════
// 举报
// ═══════════════════════════════════════════════

// POST /api/forum/report — 举报
router.post('/report', requireAuth, (req, res) => {
  const { targetType, targetId, reason } = req.body;
  if (!targetType || !targetId || !reason) return res.status(400).json({ error: '请填写完整' });

  // 检查是否已举报
  const existing = db.prepare(
    'SELECT id FROM reports WHERE user_id = ? AND target_type = ? AND target_id = ? AND status = ?'
  ).get(req.user.id, targetType, targetId, 'pending');
  if (existing) return res.status(400).json({ error: '已举报过，请等待处理' });

  db.prepare(
    'INSERT INTO reports (user_id, target_type, target_id, reason) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, targetType, parseInt(targetId), reason);

  res.json({ success: true, message: '举报已提交，管理员会尽快处理' });
});

module.exports = router;
