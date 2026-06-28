const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/categories
router.get('/categories', (req, res) => {
  const categories = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM resources WHERE category = c.id) as real_count
    FROM categories c
    ORDER BY real_count DESC
  `).all();
  res.json(categories.map(c => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    count: c.real_count,
  })));
});

// GET /api/plans
router.get('/plans', (req, res) => {
  const plans = db.prepare('SELECT * FROM plans ORDER BY id').all();
  res.json(plans.map(p => ({
    id: p.id,
    points: p.points,
    price: p.price,
    label: p.label,
    popular: !!p.popular,
    bonus: p.bonus || 0,
  })));
});

// GET /api/stats
router.get('/stats', (req, res) => {
  const totalResources = db.prepare('SELECT COUNT(*) as c FROM resources').get().c;
  const totalMembers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalViews = db.prepare('SELECT COALESCE(SUM(views), 0) as c FROM resources').get().c;

  res.json({ totalResources, totalMembers, totalViews });
});

module.exports = router;
