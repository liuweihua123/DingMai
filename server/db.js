const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'club.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 设置中国时区 (UTC+8)
db.function('local_datetime', () => {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19);
});

// 数据库迁移：给旧表添加新字段（必须在建表之前执行）
function addColumnIfNotExists(table, column, type) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!columns.includes(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  } catch (e) {
    // 表可能还不存在，忽略
  }
}

addColumnIfNotExists('resources', 'status', "TEXT DEFAULT 'approved'");
addColumnIfNotExists('resources', 'submitted_by', 'INTEGER DEFAULT NULL');
addColumnIfNotExists('resources', 'reject_reason', "TEXT DEFAULT ''");
addColumnIfNotExists('users', 'exp', 'INTEGER DEFAULT 0');
addColumnIfNotExists('users', 'level', 'INTEGER DEFAULT 1');
addColumnIfNotExists('users', 'avatar', "TEXT DEFAULT ''");
addColumnIfNotExists('posts', 'tags', "TEXT DEFAULT '[]'");
addColumnIfNotExists('posts', 'views_count', 'INTEGER DEFAULT 0');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT DEFAULT '',
    points INTEGER DEFAULT 20,
    created_at DATETIME DEFAULT (local_datetime())
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT (local_datetime())
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY,
    points INTEGER NOT NULL,
    price REAL NOT NULL,
    label TEXT NOT NULL,
    popular INTEGER DEFAULT 0,
    bonus INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    region TEXT NOT NULL,
    intro TEXT NOT NULL,
    contact TEXT NOT NULL,
    image TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    price INTEGER NOT NULL,
    views INTEGER DEFAULT 0,
    status TEXT DEFAULT 'approved',
    submitted_by INTEGER DEFAULT NULL,
    reject_reason TEXT DEFAULT '',
    created_at DATETIME DEFAULT (local_datetime()),
    FOREIGN KEY (category) REFERENCES categories(id),
    FOREIGN KEY (submitted_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance INTEGER NOT NULL,
    desc TEXT NOT NULL,
    created_at DATETIME DEFAULT (local_datetime()),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS view_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    viewed_at DATETIME DEFAULT (local_datetime()),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (resource_id) REFERENCES resources(id),
    UNIQUE(user_id, resource_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    points INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    remark TEXT DEFAULT '',
    created_at DATETIME DEFAULT (local_datetime()),
    paid_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    checkin_date TEXT NOT NULL,
    created_at DATETIME DEFAULT (local_datetime()),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, checkin_date)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT (local_datetime()),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (resource_id) REFERENCES resources(id),
    UNIQUE(user_id, resource_id)
  );

  CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);
  CREATE INDEX IF NOT EXISTS idx_resources_region ON resources(region);
  CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_view_records_user ON view_records(user_id);
  CREATE INDEX IF NOT EXISTS idx_view_records_resource ON view_records(resource_id);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_no ON orders(order_no);
  CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id);
  CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
  CREATE INDEX IF NOT EXISTS idx_favorites_resource ON favorites(resource_id);
  CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
  CREATE INDEX IF NOT EXISTS idx_resources_submitted_by ON resources(submitted_by);

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    likes_count INTEGER DEFAULT 0,
    replies_count INTEGER DEFAULT 0,
    views_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'normal',
    created_at DATETIME DEFAULT (local_datetime()),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    parent_id INTEGER DEFAULT NULL,
    likes_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'normal',
    created_at DATETIME DEFAULT (local_datetime()),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES replies(id)
  );

  CREATE TABLE IF NOT EXISTS post_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT (local_datetime()),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(post_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS reply_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reply_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT (local_datetime()),
    FOREIGN KEY (reply_id) REFERENCES replies(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(reply_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    admin_note TEXT DEFAULT '',
    created_at DATETIME DEFAULT (local_datetime()),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
  CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
  CREATE INDEX IF NOT EXISTS idx_replies_post ON replies(post_id);
  CREATE INDEX IF NOT EXISTS idx_replies_user ON replies(user_id);
  CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);
  CREATE INDEX IF NOT EXISTS idx_reply_likes_reply ON reply_likes(reply_id);
  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
`);

module.exports = db;
