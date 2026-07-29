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

// 30名のデモ看護師: 20名フルシフト（日勤・遅出・夜勤）+ 10名日勤専任
const DEMO_NURSES = [
  // ── フルシフト 20名 ──
  { name: '山田 花子',    employee_id: 'N001', work_type: 'full', skill_level: 'skilled',  username: 'yamada_h',    password: 'demo1234' },
  { name: '田中 恵子',    employee_id: 'N002', work_type: 'full', skill_level: 'skilled',  username: 'tanaka_k',    password: 'demo1234' },
  { name: '鈴木 美咲',    employee_id: 'N003', work_type: 'full', skill_level: 'half',     username: 'suzuki_m',    password: 'demo1234' },
  { name: '高橋 愛子',    employee_id: 'N004', work_type: 'full', skill_level: 'trainee',  username: 'takahashi_a', password: 'demo1234' },
  { name: '渡辺 麻衣',    employee_id: 'N005', work_type: 'full', skill_level: 'skilled',  username: 'watanabe_m',  password: 'demo1234' },
  { name: '小林 智子',    employee_id: 'N006', work_type: 'full', skill_level: 'skilled',  username: 'kobayashi_t', password: 'demo1234' },
  { name: '吉田 ゆり',    employee_id: 'N007', work_type: 'full', skill_level: 'half',     username: 'yoshida_y',   password: 'demo1234' },
  { name: '松本 あかね',  employee_id: 'N008', work_type: 'full', skill_level: 'trainee',  username: 'matsumoto_a', password: 'demo1234' },
  { name: '井上 さつき',  employee_id: 'N009', work_type: 'full', skill_level: 'skilled',  username: 'inoue_s',     password: 'demo1234' },
  { name: '中島 由紀',    employee_id: 'N010', work_type: 'full', skill_level: 'skilled',  username: 'nakajima_y',  password: 'demo1234' },
  { name: '林 奈美',      employee_id: 'N011', work_type: 'full', skill_level: 'half',     username: 'hayashi_n',   password: 'demo1234' },
  { name: '清水 美鈴',    employee_id: 'N012', work_type: 'full', skill_level: 'skilled',  username: 'shimizu_m',   password: 'demo1234' },
  { name: '池田 理恵',    employee_id: 'N013', work_type: 'full', skill_level: 'skilled',  username: 'ikeda_r',     password: 'demo1234' },
  { name: '橋本 みき',    employee_id: 'N014', work_type: 'full', skill_level: 'half',     username: 'hashimoto_m', password: 'demo1234' },
  { name: '石田 なつき',  employee_id: 'N015', work_type: 'full', skill_level: 'trainee',  username: 'ishida_n',    password: 'demo1234' },
  { name: '前田 かな',    employee_id: 'N016', work_type: 'full', skill_level: 'skilled',  username: 'maeda_k',     password: 'demo1234' },
  { name: '藤田 裕子',    employee_id: 'N017', work_type: 'full', skill_level: 'half',     username: 'fujita_y',    password: 'demo1234' },
  { name: '岡田 しおり',  employee_id: 'N018', work_type: 'full', skill_level: 'skilled',  username: 'okada_s',     password: 'demo1234' },
  { name: '後藤 めぐみ',  employee_id: 'N019', work_type: 'full', skill_level: 'skilled',  username: 'goto_m',      password: 'demo1234' },
  { name: '村上 みゆき',  employee_id: 'N020', work_type: 'full', skill_level: 'half',     username: 'murakami_m',  password: 'demo1234' },
  // ── 日勤専任 10名 ──
  { name: '伊藤 さくら',  employee_id: 'N021', work_type: 'day_only', skill_level: 'skilled',  username: 'ito_s',      password: 'demo1234' },
  { name: '加藤 玲奈',    employee_id: 'N022', work_type: 'day_only', skill_level: 'skilled',  username: 'kato_r',     password: 'demo1234' },
  { name: '木村 陽子',    employee_id: 'N023', work_type: 'day_only', skill_level: 'half',     username: 'kimura_y',   password: 'demo1234' },
  { name: '佐々木 春香',  employee_id: 'N024', work_type: 'day_only', skill_level: 'skilled',  username: 'sasaki_h',   password: 'demo1234' },
  { name: '宮田 あい',    employee_id: 'N025', work_type: 'day_only', skill_level: 'skilled',  username: 'miyata_a',   password: 'demo1234' },
  { name: '小川 ちはる',  employee_id: 'N026', work_type: 'day_only', skill_level: 'half',     username: 'ogawa_c',    password: 'demo1234' },
  { name: '長谷川 理沙',  employee_id: 'N027', work_type: 'day_only', skill_level: 'skilled',  username: 'hasegawa_r', password: 'demo1234' },
  { name: '野口 ひとみ',  employee_id: 'N028', work_type: 'day_only', skill_level: 'skilled',  username: 'noguchi_m',  password: 'demo1234' },
  { name: '福田 えり',    employee_id: 'N029', work_type: 'day_only', skill_level: 'half',     username: 'fukuda_e',   password: 'demo1234' },
  { name: '斎藤 なな',    employee_id: 'N030', work_type: 'day_only', skill_level: 'skilled',  username: 'saito_n',    password: 'demo1234' },
];

// デモ看護師の冪等シード（employee_id で重複回避）
async function initDemoNurses() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const n of DEMO_NURSES) {
      // 看護師レコードをupsert（employee_idが同じなら更新）
      const nurseRes = await client.query(
        `INSERT INTO nurses (name, employee_id, work_type, skill_level)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (employee_id) DO UPDATE
           SET name=$1, work_type=$3, skill_level=$4
         RETURNING id`,
        [n.name, n.employee_id, n.work_type, n.skill_level]
      );
      const nurseId = nurseRes.rows[0].id;
      // ユーザーが存在しない場合のみ作成（bcryptは重いので不要な再ハッシュを省く）
      const existingUser = await client.query(
        `SELECT id FROM users WHERE username=$1`, [n.username]
      );
      if (existingUser.rows.length === 0) {
        const hash = await bcrypt.hash(n.password, 10);
        await client.query(
          `INSERT INTO users (username, password_hash, role, nurse_id)
           VALUES ($1, $2, 'nurse', $3)`,
          [n.username, hash, nurseId]
        );
      }
    }
    await client.query('COMMIT');
    console.log(`デモ看護師 ${DEMO_NURSES.length}名をシードしました`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('デモ看護師シード失敗:', err.message);
  } finally {
    client.release();
  }
}

// 外部から呼べるように export
module.exports.DEMO_NURSES = DEMO_NURSES;
module.exports.seedDemoNurses = initDemoNurses;

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
