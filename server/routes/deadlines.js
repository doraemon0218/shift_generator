const express = require('express');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 月の締め切りを取得（全ユーザー）
router.get('/:year/:month', requireAuth, async (req, res) => {
  const { year, month } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM deadlines WHERE year=$1 AND month=$2`,
      [year, month]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 複数月の締め切りをまとめて取得（管理者用）
router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM deadlines ORDER BY year DESC, month DESC LIMIT 12`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 締め切りを設定・更新（管理者のみ）
router.post('/', requireAdmin, async (req, res) => {
  const { year, month, deadline_date } = req.body;
  if (!year || !month || !deadline_date) {
    return res.status(400).json({ error: 'year, month, deadline_date は必須です' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO deadlines (year, month, deadline_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (year, month)
       DO UPDATE SET deadline_date=$3, updated_at=NOW()
       RETURNING *`,
      [year, month, deadline_date]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 締め切りを削除（管理者のみ）
router.delete('/:year/:month', requireAdmin, async (req, res) => {
  const { year, month } = req.params;
  try {
    await pool.query(`DELETE FROM deadlines WHERE year=$1 AND month=$2`, [year, month]);
    res.json({ message: '締め切りを削除しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
