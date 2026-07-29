const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ─── ユーティリティ ───

function fmtDate(year, month, day) {
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function getPref(prefs, nurseId, date) {
  return prefs[nurseId]?.[date] || 'available';
}

function isForbidden(aId, bId, pairMap) {
  const k = `${Math.min(aId,bId)}-${Math.max(aId,bId)}`;
  return pairMap[k]?.status === 'forbidden';
}

// シード付き疑似乱数（LCG）
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

// ─── スコア計算 ───

// スコアが低い人ほど優先して割り当て
// 優先順位（全戦略共通）:
//   最優先: night_wish（夜勤希望） → 大幅マイナス
//   準優先: available（制約なし）
//   回避:   no_night（夜勤不可）  → 大ペナルティ（ただし人員不足なら割り当て可）
function nightScore(n, prefs, date, stats, strategy, rng) {
  const pref = getPref(prefs, n.id, date);
  let s = stats[n.id].nights * 10;

  // no_night は除外ではなく高ペナルティ（最後の手段として残す）
  if (pref === 'no_night') s += 300;

  if (strategy === 'preference') {
    if (pref === 'night_wish') s -= 120;     // 最高優先
    if (pref === 'available')  s -= 5;
  } else if (strategy === 'balance') {
    if (pref === 'night_wish') s -= 20;      // 均等重視でも希望は少し優先
  } else {                                   // random
    s += rng() * 40;
    if (pref === 'night_wish') s -= 60;
  }
  return s;
}

function lateScore(n, prefs, date, stats, strategy, rng) {
  const pref = getPref(prefs, n.id, date);
  let s = stats[n.id].lates * 8;

  // no_late は高ペナルティ（ソフト制約）
  if (pref === 'no_late') s += 200;

  if (strategy === 'preference') {
    if (pref === 'late_wish') s -= 80;       // 希望優先
    if (pref === 'available') s -= 3;
  } else if (strategy === 'random') {
    s += rng() * 30;
    if (pref === 'late_wish') s -= 40;
  } else {
    if (pref === 'late_wish') s -= 8;
  }
  return s;
}

// ─── メイン生成ロジック ───

function generate(nurses, prefs, config, pairMap, year, month, strategy, seed) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const rng = makeRng(seed);

  const shifts  = {};  // nurseId → { date → shift_type }
  const stats   = {};  // nurseId → { nights, offs, days, lates, afterNights, paid }
  const warns   = [];

  for (const n of nurses) {
    shifts[n.id] = {};
    stats[n.id] = { nights: 0, offs: 0, days: 0, lates: 0, afterNights: 0, paid: 0 };
  }

  // 4週8休ターゲット: 月の日数 × (8/28) を丸め
  const offTarget = Math.round(daysInMonth * 8 / 28);

  let prevNightIds = [];  // 昨夜夜勤 → 今日明け
  let prevAfterIds = [];  // 昨日明け  → 今日休暇（公休カウント）

  for (let d = 1; d <= daysInMonth; d++) {
    const date = fmtDate(year, month, d);
    const dow  = new Date(year, month - 1, d).getDay(); // 0=日, 6=土

    const reqDay   = (config.day_counts  || [6,6,6,6,6,5,5])[dow];
    const reqLate  = (config.late_counts || [2,2,1,2,1,0,0])[dow];
    const reqNight = config.night_count ?? 2;

    const fixed = new Set();

    // ① 明け確定（昨夜の夜勤者 → 今日明け、公休カウントしない）
    for (const nId of prevNightIds) {
      shifts[nId][date] = 'after_night';
      stats[nId].afterNights++;
      fixed.add(nId);
    }

    // ② 休暇確定（昨日明けだった看護師 → 今日公休、4週8休カウント対象）
    for (const nId of prevAfterIds) {
      if (!fixed.has(nId)) {
        shifts[nId][date] = 'off';
        stats[nId].offs++;
        fixed.add(nId);
      }
    }

    prevAfterIds  = [...prevNightIds];
    prevNightIds  = [];

    // ③ 強制オフ（希望・日勤専任の土日）
    for (const n of nurses) {
      if (fixed.has(n.id)) continue;
      const pref = getPref(prefs, n.id, date);

      if (n.work_type === 'day_only' && (dow === 0 || dow === 6)) {
        shifts[n.id][date] = 'off';
        stats[n.id].offs++;
        fixed.add(n.id);
        continue;
      }
      if (pref === 'off_request') {
        shifts[n.id][date] = 'off';
        stats[n.id].offs++;
        fixed.add(n.id);
        continue;
      }
      if (pref === 'paid_leave') {
        shifts[n.id][date] = 'holiday';
        stats[n.id].offs++;
        stats[n.id].paid++;
        fixed.add(n.id);
        continue;
      }
    }

    // ④ 夜勤割り当て（full限定 + 禁忌ペア / no_nightはスコアで回避）
    let nightPool = nurses.filter(n =>
      !fixed.has(n.id) &&
      n.work_type === 'full'
    );

    // ランダム戦略の場合はプールをシャッフル
    if (strategy === 'random') nightPool = shuffleArr(nightPool, rng);

    nightPool.sort((a, b) =>
      nightScore(a, prefs, date, stats, strategy, rng) -
      nightScore(b, prefs, date, stats, strategy, rng)
    );

    const tonight = [];
    for (const n of nightPool) {
      if (tonight.length >= reqNight) break;
      if (tonight.some(a => isForbidden(a.id, n.id, pairMap))) continue;
      tonight.push(n);
      if (getPref(prefs, n.id, date) === 'no_night') {
        warns.push(`${date}: ${n.name} — 夜勤不可希望がありましたが人員不足のため割り当て`);
      }
      shifts[n.id][date] = 'night';
      stats[n.id].nights++;
      fixed.add(n.id);
    }
    if (tonight.length < reqNight) {
      warns.push(`${date}: 夜勤 ${tonight.length}/${reqNight}人（対応可能な人員不足）`);
    }
    prevNightIds = tonight.map(n => n.id);

    // ⑤ 遅出割り当て（no_latはスコアで回避）
    let latePool = nurses.filter(n =>
      !fixed.has(n.id) &&
      n.work_type !== 'day_only'
    );
    if (strategy === 'random') latePool = shuffleArr(latePool, rng);

    latePool.sort((a, b) =>
      lateScore(a, prefs, date, stats, strategy, rng) -
      lateScore(b, prefs, date, stats, strategy, rng)
    );

    let lateCount = 0;
    for (const n of latePool) {
      if (lateCount >= reqLate) break;
      if (getPref(prefs, n.id, date) === 'no_late') {
        warns.push(`${date}: ${n.name} — 遅出不可希望がありましたが人員不足のため割り当て`);
      }
      shifts[n.id][date] = 'late';
      stats[n.id].lates++;
      fixed.add(n.id);
      lateCount++;
    }

    // ⑥ 日勤 or 公休 の割り当て
    const remaining = nurses.filter(n => !fixed.has(n.id));
    const daysLeft  = daysInMonth - d; // 今日を除く残り日数

    let dayCount = 0;

    // day_only看護師は平日必ず日勤（4週8休は週末の公休で達成）
    if (dow !== 0 && dow !== 6) {
      for (const n of remaining) {
        if (n.work_type === 'day_only') {
          shifts[n.id][date] = 'day';
          stats[n.id].days++;
          dayCount++;
          fixed.add(n.id);
        }
      }
    }

    // その他の看護師は4週8休に基づき日勤 or 公休を決定
    let orderedRemaining = remaining.filter(n => !fixed.has(n.id));
    if (strategy === 'random') orderedRemaining = shuffleArr(orderedRemaining, rng);

    // offが少ない（目標まで余裕ある）人を先に日勤へ
    orderedRemaining = [...orderedRemaining].sort((a, b) => {
      const aOff = offTarget - stats[a.id].offs;
      const bOff = offTarget - stats[b.id].offs;
      return aOff - bOff;
    });

    for (const n of orderedRemaining) {
      const offStillNeeded = offTarget - stats[n.id].offs;

      // 残り日数でまだ達成できる AND 日勤枠が残っている → 日勤
      if (dayCount < reqDay && offStillNeeded < daysLeft + 1) {
        shifts[n.id][date] = 'day';
        stats[n.id].days++;
        dayCount++;
      } else {
        shifts[n.id][date] = 'off';
        stats[n.id].offs++;
      }
      fixed.add(n.id);
    }
  }

  // 4週8休未達成の警告
  for (const n of nurses) {
    const totalOff = stats[n.id].offs;
    if (totalOff < offTarget - 1) {
      warns.push(`${n.name}: 公休日数 ${totalOff}日（目標 ${offTarget}日）`);
    }
  }

  return { shifts, stats, warnings: warns };
}

function shuffleArr(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── APIエンドポイント ───

// シフト自動生成（3候補を返す）
router.post('/generate/:year/:month', requireAdmin, async (req, res) => {
  const year  = parseInt(req.params.year);
  const month = parseInt(req.params.month);

  try {
    // 看護師一覧
    const nursesRes = await pool.query(
      `SELECT n.*, u.username FROM nurses n
       LEFT JOIN users u ON u.nurse_id = n.id
       WHERE n.is_active = true ORDER BY n.id`
    );
    const nurses = nursesRes.rows;

    // 勤務希望
    const prefRes = await pool.query(
      `SELECT nurse_id, date::text, preference, is_submitted
       FROM shift_preferences WHERE year=$1 AND month=$2`, [year, month]
    );
    const prefs = {};
    for (const r of prefRes.rows) {
      if (!prefs[r.nurse_id]) prefs[r.nurse_id] = {};
      prefs[r.nurse_id][r.date] = r.preference;
    }

    // シフト設定
    const cfgRes = await pool.query(
      `SELECT * FROM shift_configs WHERE year=$1 AND month=$2`, [year, month]
    );
    const config = cfgRes.rows[0] || {
      day_counts:  [2,22,22,22,22,22,2],  // 日: 日曜=2, 月〜金=22, 土=2
      late_counts: [2, 2, 2, 2, 2, 2,2],  // 遅出: 全曜日2
      night_count: 2
    };

    // 禁忌ペア設定
    const pairRes = await pool.query(`SELECT * FROM nurse_pair_settings`);
    const pairMap = {};
    for (const r of pairRes.rows) {
      const key = `${r.nurse_a_id}-${r.nurse_b_id}`;
      pairMap[key] = r;
    }

    // 3候補を生成
    const strategies = [
      { key: 'preference', name: '希望優先', desc: '夜勤・遅出希望を最大限尊重した案' },
      { key: 'balance',    name: '均等分散', desc: '夜勤・遅出を全員に均等に配分した案' },
      { key: 'random',     name: 'バリエーション', desc: '偏りを排除したランダム割り当て案' },
    ];

    const candidates = strategies.map(({ key, name, desc }, i) => {
      const { shifts, stats, warnings } = generate(
        nurses, prefs, config, pairMap, year, month, key, 42 + i * 137
      );
      return { strategy: key, name, desc, shifts, stats, warnings };
    });

    res.json({ year, month, nurses, candidates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'シフト生成に失敗しました', detail: err.message });
  }
});

// 選択した候補を保存
router.post('/generate/:year/:month/save', requireAdmin, async (req, res) => {
  const year  = parseInt(req.params.year);
  const month = parseInt(req.params.month);
  const { shifts } = req.body; // { nurseId: { date: shift_type } }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 既存の自動生成データを削除
    await client.query(
      `DELETE FROM generated_shifts WHERE year=$1 AND month=$2 AND is_manually_adjusted=false`,
      [year, month]
    );

    for (const [nurseId, dayMap] of Object.entries(shifts)) {
      for (const [date, shiftType] of Object.entries(dayMap)) {
        await client.query(
          `INSERT INTO generated_shifts (nurse_id, year, month, date, shift_type)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (nurse_id, date) DO UPDATE SET shift_type=$5`,
          [parseInt(nurseId), year, month, date, shiftType]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'シフトを保存しました' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: '保存に失敗しました' });
  } finally {
    client.release();
  }
});

// 保存済みシフト取得
router.get('/generated-shifts/:year/:month', requireAdmin, async (req, res) => {
  const { year, month } = req.params;
  try {
    const result = await pool.query(
      `SELECT gs.*, n.name as nurse_name, n.work_type
       FROM generated_shifts gs
       JOIN nurses n ON gs.nurse_id = n.id
       WHERE gs.year=$1 AND gs.month=$2 ORDER BY n.id, gs.date`,
      [year, month]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
