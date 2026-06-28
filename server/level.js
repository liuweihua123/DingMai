// ═══════════════════════════════════════════════
// 等级系统 — Level System
// ═══════════════════════════════════════════════

const db = require('./db');

const MAX_LEVEL = 30;

// 经验值来源
const EXP = {
  POST: 10,           // 发帖
  REPLY: 5,           // 回复
  POST_LIKE: 3,       // 帖子被点赞
  REPLY_LIKE: 2,      // 回复被点赞
  RESOURCE_APPROVED: 50, // 人脉审核通过
  CHECKIN: 2,         // 每日签到
  RESOURCE_UNLOCKED: 5,  // 人脉被他人解锁
};

// 升级所需经验：level^2 * 100
function expForLevel(level) {
  if (level <= 1) return 0;
  return Math.floor(Math.pow(level - 1, 2) * 100);
}

// 计算当前等级
function calcLevel(exp) {
  let level = 1;
  while (level < MAX_LEVEL && exp >= expForLevel(level + 1)) {
    level++;
  }
  return level;
}

// 获取等级信息
function getLevelInfo(exp) {
  const level = calcLevel(exp);
  const currentExp = expForLevel(level);
  const nextExp = level < MAX_LEVEL ? expForLevel(level + 1) : currentExp;
  const progress = level >= MAX_LEVEL ? 100 : Math.floor(((exp - currentExp) / (nextExp - currentExp)) * 100);
  return { level, exp, currentExp, nextExp, progress };
}

// 等级称号
function getLevelTitle(level) {
  if (level >= 28) return '人脉之王';
  if (level >= 25) return '社交达人';
  if (level >= 22) return '圈内大佬';
  if (level >= 19) return '人脉专家';
  if (level >= 16) return '资源达人';
  if (level >= 13) return '活跃会员';
  if (level >= 10) return '资深用户';
  if (level >= 7) return '进阶用户';
  if (level >= 4) return '普通用户';
  return '新手上路';
}

// 等级颜色
function getLevelColor(level) {
  if (level >= 25) return '#ff4757';  // 红色 - 传说
  if (level >= 20) return '#ff6b81';  // 粉红 - 史诗
  if (level >= 15) return '#c9a96e';  // 金色 - 稀有
  if (level >= 10) return '#5b8fb9';  // 蓝色 - 精英
  if (level >= 5) return '#6baa75';   // 绿色 - 进阶
  return '#a09888';                    // 灰色 - 新手
}

// 增加经验值
function addExp(userId, amount, reason) {
  const user = db.prepare('SELECT exp, level FROM users WHERE id = ?').get(userId);
  if (!user) return;

  const newExp = user.exp + amount;
  const newLevel = calcLevel(newExp);
  const leveledUp = newLevel > user.level;

  db.prepare('UPDATE users SET exp = ?, level = ? WHERE id = ?').run(newExp, newLevel, userId);

  // 如果升级了，记录到交易流水
  if (leveledUp) {
    const title = getLevelTitle(newLevel);
    db.prepare(
      'INSERT INTO transactions (user_id, type, amount, balance, desc) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, 'levelup', 0, newExp, `升级到 Lv.${newLevel} ${title}`);
  }

  return { newExp, newLevel, leveledUp };
}

// 获取排行榜
function getLeaderboard(limit = 10) {
  return db.prepare(`
    SELECT id, username, exp, level
    FROM users
    ORDER BY exp DESC
    LIMIT ?
  `).all(limit).map(u => ({
    id: u.id,
    username: u.username,
    exp: u.exp,
    level: u.level,
    title: getLevelTitle(u.level),
    color: getLevelColor(u.level),
  }));
}

module.exports = {
  MAX_LEVEL, EXP,
  expForLevel, calcLevel, getLevelInfo, getLevelTitle, getLevelColor,
  addExp, getLeaderboard,
};
