const express = require('express');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 自分のプロフィール取得
router.get('/me', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'admin') return res.json({ role: 'admin' });
    const result = await pool.query(
      `SELECT n.*, u.username FROM nurses n JOIN users u ON u.nurse_id = n.id WHERE n.id = $1`,
      [req.user.nurse_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '看護師情報が見つかりません' });
    res.json({ role: 'nurse', ...result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 月のシフト設定取得（公休希望上限、夜勤希望上限）
router.get('/shift-config/:year/:month', requireAuth, async (req, res) => {
  const { year, month } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM shift_configs WHERE year=$1 AND month=$2`, [year, month]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 希望一覧取得（自分の月分）
router.get('/preferences', requireAuth, async (req, res) => {
  const { year, month, nurse_id } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year/monthが必要です' });

  // 管理者は nurse_id 指定で取得可能、看護師は自分のみ
  const targetId = (req.user.role === 'admin' && nurse_id) ? parseInt(nurse_id) : req.user.nurse_id;
  if (!targetId) return res.status(400).json({ error: '対象看護師が特定できません' });

  try {
    const result = await pool.query(
      `SELECT id, nurse_id, year, month, date::text, preference, note, is_submitted, created_at, updated_at
       FROM shift_preferences WHERE nurse_id=$1 AND year=$2 AND month=$3 ORDER BY date`,
      [targetId, year, month]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 1日の希望を保存（upsert）
router.put('/preferences', requireAuth, async (req, res) => {
  const { date, preference, note } = req.body;
  if (!date || !preference) return res.status(400).json({ error: 'dateとpreferenceが必要です' });

  const nurseId = req.user.nurse_id;
  if (!nurseId) return res.status(403).json({ error: '看護師アカウントでログインしてください' });

  // 提出済みならロック
  const existing = await pool.query(
    `SELECT is_submitted FROM shift_preferences WHERE nurse_id=$1 AND date=$2`,
    [nurseId, date]
  );
  if (existing.rows[0]?.is_submitted) return res.status(403).json({ error: '提出済みのため変更できません' });

  // 勤務区分チェック：自分に許可されない選択肢をブロック
  const nurseResult = await pool.query(`SELECT work_type FROM nurses WHERE id=$1`, [nurseId]);
  const workType = nurseResult.rows[0]?.work_type;
  const allowed = getAllowedPreferences(workType);
  if (!allowed.includes(preference)) {
    return res.status(400).json({ error: 'この勤務区分では選択できない希望です' });
  }

  try {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    const result = await pool.query(
      `INSERT INTO shift_preferences (nurse_id, year, month, date, preference, note, is_submitted)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       ON CONFLICT (nurse_id, date)
       DO UPDATE SET preference=$5, note=$6, updated_at=NOW()
       RETURNING *`,
      [nurseId, year, month, date, preference, note || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 月の希望を提出（ロック）
router.post('/preferences/submit', requireAuth, async (req, res) => {
  const { year, month } = req.body;
  if (!year || !month) return res.status(400).json({ error: 'year/monthが必要です' });

  const nurseId = req.user.nurse_id;
  if (!nurseId) return res.status(403).json({ error: '看護師アカウントでログインしてください' });

  try {
    await pool.query(
      `UPDATE shift_preferences SET is_submitted=true WHERE nurse_id=$1 AND year=$2 AND month=$3`,
      [nurseId, year, month]
    );
    res.json({ message: '提出しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

function getAllowedPreferences(workType) {
  const base = ['available', 'off_request'];
  if (workType === 'day_late') return [...base, 'no_late'];
  if (workType === 'full') return [...base, 'no_late', 'no_night', 'night_wish'];
  return base; // day_only
}

module.exports = router;
