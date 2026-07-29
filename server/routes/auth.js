const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください' });

  try {
    const result = await pool.query(
      `SELECT u.*, n.name as nurse_name FROM users u
       LEFT JOIN nurses n ON u.nurse_id = n.id
       WHERE u.username = $1`,
      [username]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'ユーザー名またはパスワードが違います' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'ユーザー名またはパスワードが違います' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, nurse_id: user.nurse_id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, nurse_id: user.nurse_id, nurse_name: user.nurse_name }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
