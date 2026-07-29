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
app.use('/api/settings', require('./routes/settings'));
app.use('/api', require('./routes/preferences'));
app.use('/api', require('./routes/generate'));

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

const DEMO_NURSES = [
  { name: '山田 花子',  employee_id: 'N001', work_type: 'full',     skill_level: 'skilled',  username: 'yamada_h',   password: 'demo1234' },
  { name: '田中 恵子',  employee_id: 'N002', work_type: 'full',     skill_level: 'skilled',  username: 'tanaka_k',   password: 'demo1234' },
  { name: '鈴木 美咲',  employee_id: 'N003', work_type: 'full',     skill_level: 'half',     username: 'suzuki_m',   password: 'demo1234' },
  { name: '佐藤 由美',  employee_id: 'N004', work_type: 'day_late', skill_level: 'skilled',  username: 'sato_y',     password: 'demo1234' },
  { name: '高橋 愛子',  employee_id: 'N005', work_type: 'full',     skill_level: 'trainee',  username: 'takahashi_a',password: 'demo1234' },
  { name: '伊藤 さくら',employee_id: 'N006', work_type: 'day_only', skill_level: 'skilled',  username: 'ito_s',      password: 'demo1234' },
  { name: '渡辺 麻衣',  employee_id: 'N007', work_type: 'full',     skill_level: 'skilled',  username: 'watanabe_m', password: 'demo1234' },
  { name: '中村 りな',  employee_id: 'N008', work_type: 'day_late', skill_level: 'half',     username: 'nakamura_r', password: 'demo1234' },
  { name: '小林 智子',  employee_id: 'N009', work_type: 'full',     skill_level: 'skilled',  username: 'kobayashi_t',password: 'demo1234' },
  { name: '加藤 玲奈',  employee_id: 'N010', work_type: 'day_only', skill_level: 'skilled',  username: 'kato_r',     password: 'demo1234' },
  { name: '吉田 ゆり',  employee_id: 'N011', work_type: 'full',     skill_level: 'half',     username: 'yoshida_y',  password: 'demo1234' },
  { name: '山口 奈緒',  employee_id: 'N012', work_type: 'day_late', skill_level: 'skilled',  username: 'yamaguchi_n',password: 'demo1234' },
  { name: '松本 あかね', employee_id: 'N013', work_type: 'full',    skill_level: 'trainee',  username: 'matsumoto_a',password: 'demo1234' },
  { name: '井上 さつき', employee_id: 'N014', work_type: 'full',    skill_level: 'skilled',  username: 'inoue_s',    password: 'demo1234' },
  { name: '木村 陽子',  employee_id: 'N015', work_type: 'day_only', skill_level: 'half',     username: 'kimura_y',   password: 'demo1234' },
];

async function initDemoNurses() {
  const existing = await pool.query(`SELECT COUNT(*) FROM nurses`);
  if (parseInt(existing.rows[0].count) > 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const n of DEMO_NURSES) {
      const nurseRes = await client.query(
        `INSERT INTO nurses (name, employee_id, work_type, skill_level) VALUES ($1, $2, $3, $4) RETURNING id`,
        [n.name, n.employee_id, n.work_type, n.skill_level]
      );
      const nurseId = nurseRes.rows[0].id;
      const hash = await bcrypt.hash(n.password, 10);
      await client.query(
        `INSERT INTO users (username, password_hash, role, nurse_id) VALUES ($1, $2, 'nurse', $3)`,
        [n.username, hash, nurseId]
      );
    }
    await client.query('COMMIT');
    console.log(`デモ用看護師 ${DEMO_NURSES.length}名を作成しました（パスワード: demo1234）`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('デモ看護師の作成に失敗:', err.message);
  } finally {
    client.release();
  }
}

function ensureInit() {
  if (!initPromise) {
    initPromise = pool.query(schemaSQL)
      .then(initAdmin)
      .then(initDemoNurses)
      .catch(err => {
        initPromise = null;
        throw err;
      });
  }
  return initPromise;
}

module.exports = { app, ensureInit };
