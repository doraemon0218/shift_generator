const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const WORK_TYPE_LABEL = { day_only: '日勤のみ', day_late: '日勤・遅出', full: '日勤・遅出・夜勤' };
const SKILL_LABEL = { trainee: 'みならい', half: '0.5人前', skilled: '1人前' };

// 看護師一覧
router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.*, u.username FROM nurses n
       LEFT JOIN users u ON u.nurse_id = n.id
       WHERE n.is_active = true
       ORDER BY n.id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 看護師登録
router.post('/', requireAdmin, async (req, res) => {
  const { name, employee_id, work_type, skill_level, username, password } = req.body;
  if (!name || !work_type || !skill_level || !username || !password) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const nurseResult = await client.query(
      `INSERT INTO nurses (name, employee_id, work_type, skill_level)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, employee_id || null, work_type, skill_level]
    );
    const nurse = nurseResult.rows[0];

    const hash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO users (username, password_hash, role, nurse_id) VALUES ($1, $2, 'nurse', $3)`,
      [username, hash, nurse.id]
    );

    await client.query('COMMIT');
    res.status(201).json(nurse);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(400).json({ error: 'ユーザー名または職員IDが重複しています' });
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// 看護師更新
router.put('/:id', requireAdmin, async (req, res) => {
  const { name, employee_id, work_type, skill_level } = req.body;
  try {
    const result = await pool.query(
      `UPDATE nurses SET name=$1, employee_id=$2, work_type=$3, skill_level=$4
       WHERE id=$5 AND is_active=true RETURNING *`,
      [name, employee_id || null, work_type, skill_level, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '看護師が見つかりません' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// パスワードリセット（管理者のみ）
router.put('/:id/password', requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'パスワードを入力してください' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(`UPDATE users SET password_hash=$1 WHERE nurse_id=$2`, [hash, req.params.id]);
    res.json({ message: 'パスワードを更新しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 看護師無効化（論理削除）
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query(`UPDATE nurses SET is_active=false WHERE id=$1`, [req.params.id]);
    res.json({ message: '削除しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 看護師自己登録（初回セットアップ、認証不要）
router.post('/self-register', async (req, res) => {
  const { name, employee_id, work_type, username, password } = req.body;
  if (!name) return res.status(400).json({ error: '氏名を入力してください' });
  if (!work_type || !['day_only','day_late','full'].includes(work_type))
    return res.status(400).json({ error: '勤務区分を選択してください' });
  if (!username) return res.status(400).json({ error: 'ログインIDを入力してください' });
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'パスワードは6文字以上にしてください' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nurseResult = await client.query(
      `INSERT INTO nurses (name, employee_id, work_type, skill_level) VALUES ($1, $2, $3, 'trainee') RETURNING *`,
      [name, employee_id || null, work_type]
    );
    const nurse = nurseResult.rows[0];
    const hash = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      `INSERT INTO users (username, password_hash, role, nurse_id) VALUES ($1, $2, 'nurse', $3) RETURNING *`,
      [username, hash, nurse.id]
    );
    const user = userResult.rows[0];
    await client.query('COMMIT');

    const token = jwt.sign(
      { id: user.id, username: user.username, role: 'nurse', nurse_id: nurse.id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, role: 'nurse', nurse_id: nurse.id, nurse_name: nurse.name }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(400).json({ error: 'そのログインIDはすでに使われています' });
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// ─── ペア設定（○/×/△マトリクス） ───

// ペア設定一覧
router.get('/pair-settings', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ps.*, na.name AS nurse_a_name, nb.name AS nurse_b_name
       FROM nurse_pair_settings ps
       JOIN nurses na ON ps.nurse_a_id = na.id
       JOIN nurses nb ON ps.nurse_b_id = nb.id
       ORDER BY ps.nurse_a_id, ps.nurse_b_id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ペア設定を upsert（status='ok' の場合は削除してデフォルトに戻す）
router.post('/pair-settings', requireAdmin, async (req, res) => {
  const { nurse_a_id, nurse_b_id, status, reason } = req.body;
  if (!nurse_a_id || !nurse_b_id || !status) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }
  if (nurse_a_id === nurse_b_id) return res.status(400).json({ error: '同一人物は指定できません' });

  const aId = Math.min(nurse_a_id, nurse_b_id);
  const bId = Math.max(nurse_a_id, nurse_b_id);

  try {
    if (status === 'ok') {
      await pool.query(
        `DELETE FROM nurse_pair_settings WHERE nurse_a_id=$1 AND nurse_b_id=$2`, [aId, bId]
      );
      return res.json({ status: 'ok', deleted: true });
    }

    const result = await pool.query(
      `INSERT INTO nurse_pair_settings (nurse_a_id, nurse_b_id, status, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (nurse_a_id, nurse_b_id)
       DO UPDATE SET status=$3, reason=$4, updated_at=NOW()
       RETURNING *`,
      [aId, bId, status, reason || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ─── 旧: 禁忌ペア一覧 ───
// 禁忌ペア一覧
router.get('/forbidden-pairs', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT fp.*, na.name as nurse_a_name, nb.name as nurse_b_name
       FROM forbidden_pairs fp
       JOIN nurses na ON fp.nurse_a_id = na.id
       JOIN nurses nb ON fp.nurse_b_id = nb.id
       ORDER BY fp.id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 禁忌ペア登録
router.post('/forbidden-pairs', requireAdmin, async (req, res) => {
  const { nurse_a_id, nurse_b_id, reason } = req.body;
  if (!nurse_a_id || !nurse_b_id) return res.status(400).json({ error: '2名を選択してください' });
  if (nurse_a_id === nurse_b_id) return res.status(400).json({ error: '同一人物は指定できません' });
  try {
    const result = await pool.query(
      `INSERT INTO forbidden_pairs (nurse_a_id, nurse_b_id, reason) VALUES ($1, $2, $3) RETURNING *`,
      [Math.min(nurse_a_id, nurse_b_id), Math.max(nurse_a_id, nurse_b_id), reason || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'すでに登録済みのペアです' });
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 禁忌ペア削除
router.delete('/forbidden-pairs/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM forbidden_pairs WHERE id=$1`, [req.params.id]);
    res.json({ message: '削除しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
