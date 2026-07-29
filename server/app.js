require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: false });
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// APIルート
app.use('/api/auth', require('./routes/auth'));
app.use('/api/nurses', require('./routes/nurses'));
app.use('/api', require('./routes/preferences'));

// ─── 初期化（サーバーレス対応：コールドスタート時に1回だけ実行） ───
let initPromise = null;
const schemaSQL = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');

async function initAdmin() {
  const existing = await pool.query(`SELECT id FROM users WHERE role='admin' LIMIT 1`);
  if (existing.rows.length > 0) return;
  const hash = await bcrypt.hash('admin1234', 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, role) VALUES ('admin', $1, 'admin')`,
    [hash]
  );
  console.log('管理者アカウントを作成しました: admin / admin1234');
}

function ensureInit() {
  if (!initPromise) {
    initPromise = pool.query(schemaSQL).then(initAdmin).catch(err => {
      initPromise = null; // 失敗時はリセットして再試行可能に
      throw err;
    });
  }
  return initPromise;
}

module.exports = { app, ensureInit };
