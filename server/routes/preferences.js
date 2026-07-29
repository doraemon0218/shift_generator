const express = require('express');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// シフト設定 upsert（管理者のみ）
router.put('/shift-config/:year/:month', requireAdmin, async (req, res) => {
  const { year, month } = req.params;
  const { day_counts, late_counts, night_count } = req.body;
  if (!day_counts || !late_counts || night_count === undefined) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO shift_configs (year, month, day_counts, late_counts, night_count)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (year, month) DO UPDATE
         SET day_counts=$3, late_counts=$4, night_count=$5, updated_at=NOW()
       RETURNING *`,
      [year, month, day_counts, late_counts, night_count]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

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

// 希望一覧取得（自分の月分 / 管理者は全員分または指定看護師）
router.get('/preferences', requireAuth, async (req, res) => {
  const { year, month, nurse_id } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year/monthが必要です' });

  try {
    if (req.user.role === 'admin') {
      // 管理者: nurse_id 指定があればその1名、なければ全員分
      const cond   = nurse_id ? `AND nurse_id=$3` : '';
      const params = nurse_id ? [year, month, parseInt(nurse_id)] : [year, month];
      const result = await pool.query(
        `SELECT id, nurse_id, year, month, date::text, preference, note, is_submitted, created_at, updated_at
         FROM shift_preferences WHERE year=$1 AND month=$2 ${cond} ORDER BY nurse_id, date`,
        params
      );
      return res.json(result.rows);
    }

    // 看護師は自分のみ
    const targetId = req.user.nurse_id;
    if (!targetId) return res.status(400).json({ error: '対象看護師が特定できません' });
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

    // 提出タイミングを記録（早期提出ランキング用）
    const settingsRes = await pool.query(`SELECT value FROM system_settings WHERE key='deadline_day'`);
    const deadlineDay = parseInt(settingsRes.rows[0]?.value);
    let deadlineDate = null;
    let daysEarly = null;
    if (deadlineDay >= 1 && deadlineDay <= 31) {
      // 対象月の前月の締め切り日
      const dl = new Date(parseInt(year), parseInt(month) - 2, deadlineDay, 23, 59, 59);
      deadlineDate = dl;
      daysEarly = (dl - new Date()) / 86400000;
    }
    await pool.query(
      `INSERT INTO preference_submissions (nurse_id, year, month, submitted_at, deadline_date, days_early)
       VALUES ($1, $2, $3, NOW(), $4, $5)
       ON CONFLICT (nurse_id, year, month) DO UPDATE
         SET submitted_at=NOW(), deadline_date=$4, days_early=$5`,
      [nurseId, year, month, deadlineDate, daysEarly !== null ? Math.round(daysEarly * 100) / 100 : null]
    );

    res.json({ message: '提出しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ランキング取得（管理者・看護師共通）
router.get('/rankings', requireAuth, async (req, res) => {
  try {
    const earlyRes = await pool.query(`
      SELECT n.id, n.name,
             COALESCE(SUM(GREATEST(ps.days_early, 0)), 0)::NUMERIC(7,1) AS total_days_early,
             COUNT(ps.id) FILTER (WHERE ps.days_early > 0) AS early_count,
             COUNT(ps.id) AS submission_count
      FROM nurses n
      LEFT JOIN preference_submissions ps ON ps.nurse_id = n.id
      WHERE n.is_active = true
      GROUP BY n.id, n.name
      ORDER BY total_days_early DESC, n.name
    `);
    const nightRes = await pool.query(`
      SELECT n.id, n.name,
             COUNT(sp.id)::INTEGER AS night_wish_count
      FROM nurses n
      LEFT JOIN shift_preferences sp ON sp.nurse_id = n.id AND sp.preference = 'night_wish'
      WHERE n.is_active = true AND n.work_type = 'full'
      GROUP BY n.id, n.name
      ORDER BY night_wish_count ASC, n.name
    `);
    res.json({ earlySubmission: earlyRes.rows, nightWish: nightRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 自分のスコア取得
router.get('/my-stats', requireAuth, async (req, res) => {
  const nurseId = req.user.nurse_id;
  if (!nurseId) return res.status(403).json({ error: '看護師アカウントが必要です' });
  try {
    const earlyRes = await pool.query(`
      SELECT COALESCE(SUM(GREATEST(days_early, 0)), 0)::NUMERIC(7,1) AS total_days_early,
             COUNT(*) FILTER (WHERE days_early > 0) AS early_count,
             COUNT(*) AS submission_count
      FROM preference_submissions WHERE nurse_id=$1`, [nurseId]);
    const nightRes = await pool.query(`
      SELECT COUNT(*)::INTEGER AS night_wish_count
      FROM shift_preferences WHERE nurse_id=$1 AND preference='night_wish'`, [nurseId]);
    res.json({
      ...earlyRes.rows[0],
      night_wish_count: nightRes.rows[0].night_wish_count
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

function getAllowedPreferences(workType) {
  const base = ['available', 'off_request', 'paid_leave'];
  if (workType === 'day_late') return [...base, 'no_late', 'late_wish'];
  if (workType === 'full') return [...base, 'no_late', 'no_night', 'late_wish', 'night_wish'];
  return base; // day_only
}

module.exports = router;
