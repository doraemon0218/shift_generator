// グローバル変数
let shiftSchedule = [];
let scheduleDrafts = [];
let selectedDraftIndex = null;
let lastTargetWorkDays = null;
let pairMatrixCandidates = [];
let nurses = [];
let dateColumns = [];
let mixingMatrix = null;
let generatorYear = null;
let generatorMonth = null;

// 定数は common.js から継承

// 日付列を取得（M/D 形式 — 月は動的）
function getDateColumns(rows) {
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  return cols.filter(col => /^\d{1,2}\/\d{1,2}$/.test(col));
}

// LocalStorageから看護師の標準勤務形態を取得
function getNurseShiftCapabilityFromStorage(nurseName) {
  const STORAGE_KEY_PREFIX = 'shift_request_';
  const allKeys = Object.keys(localStorage);
  const requestKeys = allKeys.filter(key => key.startsWith(STORAGE_KEY_PREFIX));
  
  for (const key of requestKeys) {
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (data.nurseName === nurseName) {
        // shiftCapabilityを正規化
        const cap = data.shiftCapability;
        if (cap === 'day-only' || cap === 'day-late' || cap === 'day-night' || cap === 'all') {
          return cap;
        }
      }
    } catch (error) {
      // パースエラーは無視
    }
  }
  return null;
}

// 看護師データを解析
function parseNurseData(rows) {
  const nurses = [];
  dateColumns = getDateColumns(rows);

  rows.forEach(row => {
    const nurseName = row['氏名'] || '';
    const nurse = {
      name: nurseName,
      note: row['備考'] || '',
      requests: {},
      shiftCapability: getNurseShiftCapabilityFromStorage(nurseName) // LocalStorageから標準勤務形態を取得
    };

    dateColumns.forEach(date => {
      const request = row[date] || '';
      if (request.includes('公休希望') || request.includes('有給休暇希望')) {
        nurse.requests[date] = REQUEST_TYPES.PAID_LEAVE;
      } else if (request.includes('夜勤のみ可能') || request.includes('夜勤のみ可')) {
        nurse.requests[date] = REQUEST_TYPES.NIGHT_ONLY;
      } else if (request.includes('日勤＋遅出までなら可能') || request.includes('日勤＋遅出までなら可')) {
        nurse.requests[date] = REQUEST_TYPES.DAY_LATE;
      } else if (request.includes('日勤のみ可能') || request.includes('日勤のみ可')) {
        nurse.requests[date] = REQUEST_TYPES.DAY_ONLY;
      } else if (request.includes('終日勤務可能') || request.includes('休み希望なし') || request.includes('勤務可能')) {
        nurse.requests[date] = REQUEST_TYPES.AVAILABLE;
      } else if (request.includes('夜勤明けならOK') || request.includes('夜勤明けの休みならば歓迎') || request.includes('当直明けなら可')) {
        nurse.requests[date] = REQUEST_TYPES.NIGHT_ONLY;
      } else if (request.includes('終日不可')) {
        nurse.requests[date] = REQUEST_TYPES.PAID_LEAVE;
      } else if (request.includes('日勤のみ不可') || request.includes('日勤不可')) {
        nurse.requests[date] = REQUEST_TYPES.NIGHT_ONLY;
      } else if (request.includes('夜勤のみ不可') || request.includes('夜勤不可')) {
        nurse.requests[date] = REQUEST_TYPES.DAY_LATE;
      } else {
        nurse.requests[date] = REQUEST_TYPES.AVAILABLE;
      }
    });

    nurses.push(nurse);
  });

  return nurses;
}

function getDateDow(dateStr) {
  const [month, day] = dateStr.split('/').map(Number);
  return new Date(generatorYear || new Date().getFullYear(), month - 1, day).getDay();
}

function isWeekend(dateStr) {
  const dow = getDateDow(dateStr);
  return dow === 0 || dow === 6;
}

function getDayOfWeek(dateStr) {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return weekdays[getDateDow(dateStr)];
}

function normalizeName(value) {
  return String(value || '').trim();
}

function shuffleArray(items, randomFn = Math.random) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function createSeededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function loadMixingMatrix() {
  const stored = localStorage.getItem(MIXING_MATRIX_KEY);
  if (!stored) {
    mixingMatrix = null;
    return;
  }
  try {
    mixingMatrix = JSON.parse(stored);
  } catch (error) {
    console.error('Failed to parse mixing matrix', error);
    mixingMatrix = null;
  }
}

function getMixingStatus(nameA, nameB) {
  if (!mixingMatrix || !mixingMatrix.pairs) return 'ok';
  const a = normalizeName(nameA);
  const b = normalizeName(nameB);
  if (!a || !b) return 'ok';
  const direct = mixingMatrix.pairs[a]?.[b];
  const reverse = mixingMatrix.pairs[b]?.[a];
  return direct || reverse || 'ok';
}

function getStoredMixingMatrix() {
  const stored = localStorage.getItem(MIXING_MATRIX_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to parse mixing matrix', error);
    return null;
  }
}

function getMixingStatusForPair(pairs, nameA, nameB) {
  if (!pairs) return '';
  return pairs[nameA]?.[nameB] || pairs[nameB]?.[nameA] || '';
}

// CSVから夜勤をする人のみを抽出
function getPairMatrixCandidatesFromNurses() {
  if (!nurses || nurses.length === 0) return [];
  
  // 夜勤可能な人を抽出
  // shiftCapabilityがday-nightまたはall、または夜勤可能と判定された人
  const candidates = nurses.filter(nurse => {
    // 標準勤務形態から判断
    if (nurse.shiftCapability === 'day-night' || nurse.shiftCapability === 'all') {
      return true;
    }
    // day-onlyは除外
    if (nurse.shiftCapability === 'day-only') {
      return false;
    }
    // それ以外はisNightShiftEligibleで判定
    return isNightShiftEligible(nurse);
  });
  
  return candidates
    .map(nurse => nurse.name)
    .filter(name => name)
    .sort((a, b) => a.localeCompare(b, 'ja'));
}

// 表示名：同姓がいる場合は「田中(花)」形式、いなければ苗字のみ
function pairDisplayName(fullName, allNames) {
  const parts = fullName.trim().split(/\s+/);
  const last = parts[0] || fullName;
  const first = parts.slice(1).join('');
  const hasDup = allNames.some(n => n !== fullName && (n.trim().split(/\s+/)[0] || n) === last);
  return hasDup && first ? `${last}(${first[0]})` : last;
}

const PAIR_SYMBOL = { ok: '○', avoid: '△', block: '×' };

function renderNightPairMatrix() {
  const container = document.getElementById('nightPairMatrix');
  if (!container) return;

  if (!pairMatrixCandidates || pairMatrixCandidates.length === 0) {
    container.innerHTML = '<p style="color: #666; margin: 0;">夜勤するメンバーがいません。</p>';
    return;
  }
  if (pairMatrixCandidates.length === 1) {
    container.innerHTML = '<p style="color: #666; margin: 0;">夜勤するメンバーが1名のみのため、相性表は作成できません。</p>';
    return;
  }

  const storedMatrix = getStoredMixingMatrix();
  const pairs = storedMatrix?.pairs || {};
  const allNames = pairMatrixCandidates;

  const headerCells = allNames.map(name =>
    `<th>${pairDisplayName(name, allNames)}</th>`
  ).join('');

  const rows = allNames.map((rowName, rowIndex) => {
    const cells = allNames.map((colName, colIndex) => {
      if (rowIndex === colIndex) {
        return '<td class="pair-diagonal">-</td>';
      }
      const status = getMixingStatusForPair(pairs, rowName, colName) || 'ok';
      if (rowIndex < colIndex) {
        // 上三角：編集可能（select）
        return `<td><select class="pair-select" data-a="${rowName}" data-b="${colName}">
          <option value="ok"    ${status === 'ok'    ? 'selected' : ''}>○</option>
          <option value="avoid" ${status === 'avoid' ? 'selected' : ''}>△</option>
          <option value="block" ${status === 'block' ? 'selected' : ''}>×</option>
        </select></td>`;
      }
      // 下三角：読み取り専用（ミラー表示）
      return `<td class="pair-mirror" data-a="${rowName}" data-b="${colName}">${PAIR_SYMBOL[status]}</td>`;
    }).join('');

    return `<tr><th class="name-cell">${pairDisplayName(rowName, allNames)}</th>${cells}</tr>`;
  }).join('');

  container.innerHTML = `
    <table>
      <thead><tr><th class="name-cell"></th>${headerCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  container.querySelectorAll('select.pair-select').forEach(select => {
    select.addEventListener('change', () => {
      const a = select.dataset.a;
      const b = select.dataset.b;
      const value = select.value;
      // 下三角のミラーセルを更新
      container.querySelectorAll(`.pair-mirror[data-a="${b}"][data-b="${a}"]`).forEach(cell => {
        cell.textContent = PAIR_SYMBOL[value] || '○';
      });
      saveNightPairMatrixSilent();
    });
  });
}

// 相性表をサイレント保存（ボタンを押さずに自動保存）
function saveNightPairMatrixSilent() {
  const container = document.getElementById('nightPairMatrix');
  if (!container || !pairMatrixCandidates || pairMatrixCandidates.length < 2) {
    return;
  }

  const pairs = {};
  container.querySelectorAll('select.pair-select').forEach(select => {
    const value = select.value || 'ok';
    const a = select.dataset.a;
    const b = select.dataset.b;
    if (!pairs[a]) pairs[a] = {};
    if (!pairs[b]) pairs[b] = {};
    pairs[a][b] = value;
    pairs[b][a] = value;
  });

  const names = [...pairMatrixCandidates];
  localStorage.setItem(MIXING_MATRIX_KEY, JSON.stringify({ names, pairs }));
}

function loadNightPairMatrix() {
  pairMatrixCandidates = getPairMatrixCandidatesFromNurses();
  renderNightPairMatrix();
}

function saveNightPairMatrix() {
  const container = document.getElementById('nightPairMatrix');
  if (!container || !pairMatrixCandidates || pairMatrixCandidates.length < 2) {
    alert('夜勤可のメンバーが2名以上いないため、保存できません。');
    return;
  }

  const pairs = {};
  container.querySelectorAll('select.pair-select').forEach(select => {
    const value = select.value || 'ok';
    const a = select.dataset.a;
    const b = select.dataset.b;
    if (!pairs[a]) pairs[a] = {};
    if (!pairs[b]) pairs[b] = {};
    pairs[a][b] = value;
    pairs[b][a] = value;
  });

  const names = [...pairMatrixCandidates];
  localStorage.setItem(MIXING_MATRIX_KEY, JSON.stringify({ names, pairs }));
  alert('相性表を保存しました');
}

function clearNightPairMatrix() {
  if (!confirm('相性表の設定を全てクリアしますか？')) {
    return;
  }
  localStorage.removeItem(MIXING_MATRIX_KEY);
  renderNightPairMatrix();
}

// × は常に禁忌（夜勤は必ず2人）
function isNightPairBlocked(candidateName, selectedNames) {
  return selectedNames.some(name => getMixingStatus(candidateName, name) === 'block');
}

function isNightPairAvoid(candidateName, selectedNames) {
  return selectedNames.some(name => getMixingStatus(candidateName, name) === 'avoid');
}

// ×関係の件数を返す
function countBlockRelationships(name) {
  if (!mixingMatrix || !mixingMatrix.pairs) return 0;
  return Object.values(mixingMatrix.pairs[name] || {}).filter(v => v === 'block').length;
}

// ×関係が多い上位N名を返す
function getTopBlockedNurses(n = 5) {
  return (pairMatrixCandidates || [])
    .map(name => ({ name, blocks: countBlockRelationships(name) }))
    .filter(x => x.blocks > 0)
    .sort((a, b) => b.blocks - a.blocks)
    .slice(0, n);
}

// 看護師のスコアを計算（公平性の指標）
function calculateNurseScore(nurse, schedule, targetWorkDays, targetPublicHolidays = null) {
  const stats = getNurseStats(nurse.name, schedule);
  
  // 勤務日数の偏差（目標値からの差）
  const workDayDiff = Math.abs(stats.workDays - targetWorkDays);
  
  // 希望違反の回数（特に夜勤者は重要）
  const violationCount = stats.violations;
  const violationWeight = doesNightShift(nurse) ? 150 : 100; // 夜勤者の希望違反は重い
  
  // 公休日数の偏差（標準公休日数からの差）
  let publicHolidayDiff = 0;
  if (targetPublicHolidays !== null) {
    publicHolidayDiff = Math.abs(stats.publicHolidays - targetPublicHolidays);
  } else {
    // 全看護師の公休日数の平均を計算
    const allNurseStats = nurses.map(n => getNurseStats(n.name, schedule));
    const avgPublicHolidays = allNurseStats.reduce((sum, s) => sum + s.publicHolidays, 0) / allNurseStats.length;
    publicHolidayDiff = Math.abs(stats.publicHolidays - avgPublicHolidays);
  }
  
  // 全看護師の週末休日の平均を計算
  const allNurseStats = nurses.map(n => getNurseStats(n.name, schedule));
  const avgWeekendOff = allNurseStats.reduce((sum, s) => sum + s.weekendOffDays, 0) / allNurseStats.length;
  const weekendOffDiff = Math.abs(stats.weekendOffDays - avgWeekendOff);
  
  // 夜勤回数の偏差（夜勤可能な人の中で）
  const nightEligible = nurses.filter(n => doesNightShift(n));
  if (nightEligible.length > 0) {
    const nightEligibleStats = nightEligible.map(n => getNurseStats(n.name, schedule));
    const avgNightShifts = nightEligibleStats.reduce((sum, s) => sum + s.nightShifts, 0) / nightEligibleStats.length;
    const nightDiff = Math.abs(stats.nightShifts - avgNightShifts);
    
    return workDayDiff * 10 + violationCount * violationWeight + publicHolidayDiff * 8 + weekendOffDiff * 5 + nightDiff * 3;
  }
  
  return workDayDiff * 10 + violationCount * violationWeight + publicHolidayDiff * 8 + weekendOffDiff * 5;
}

// 看護師の統計を取得
function getNurseStats(nurseName, schedule) {
  let workDays = 0;
  let nightShifts = 0;
  let lateShifts = 0;
  let weekendOffDays = 0;
  let publicHolidays = 0; // 公休日数（明け休みを除く）
  let violations = 0;

  schedule.forEach((day) => {
    const assignment = day.nurses.find(n => n.name === nurseName);
    if (assignment) {
      if (assignment.shift !== SHIFT_TYPES.OFF) {
        workDays++;
        if (assignment.shift === SHIFT_TYPES.NIGHT) {
          nightShifts++;
        } else if (assignment.shift === SHIFT_TYPES.LATE) {
          lateShifts++;
        }
      } else {
        if (!assignment.isDayOffAfterNight) {
          if (!isWeekend(day.date)) {
            publicHolidays++;
          }
          if (isWeekend(day.date)) {
            weekendOffDays++;
            publicHolidays++;
          }
        }
      }
      if (assignment.violation) {
        violations++;
      }
    }
  });

  return { workDays, nightShifts, lateShifts, weekendOffDays, publicHolidays, violations };
}

// 希望に違反しているかチェック（希望データがない場合は全てOK）
function checkViolation(nurse, date, shift, schedule, dateIndex) {
  const request = nurse.requests[date];
  // 希望データがない場合は違反なし（全てOK）
  if (!request || request === REQUEST_TYPES.AVAILABLE) return false;
  
  if (request === REQUEST_TYPES.PAID_LEAVE) {
    return shift !== SHIFT_TYPES.OFF;
  }
  if (request === REQUEST_TYPES.DAY_ONLY) {
    return shift === SHIFT_TYPES.NIGHT || shift === SHIFT_TYPES.LATE;
  }
  if (request === REQUEST_TYPES.DAY_LATE) {
    return shift === SHIFT_TYPES.NIGHT;
  }
  if (request === REQUEST_TYPES.NIGHT_ONLY) {
    return shift === SHIFT_TYPES.DAY || shift === SHIFT_TYPES.LATE;
  }
  return false;
}

// 前日のシフトを取得
function getPreviousDayShift(schedule, dateIndex) {
  if (dateIndex === 0) return null;
  const prevDate = dateColumns[dateIndex - 1];
  const prevDay = schedule.find(d => d.date === prevDate);
  return prevDay;
}

// 看護師の直近 n 日間の連続勤務数を計算
function countConsecutiveWorkDays(nurseName, schedule, beforeIndex) {
  let count = 0;
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const assignment = schedule[i]?.nurses.find(a => a.name === nurseName);
    if (assignment && assignment.shift !== SHIFT_TYPES.OFF) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// 夜勤をしない人かどうか判定（標準勤務形態と希望データから判断）
function isLateShiftEligible(nurse) {
  if (nurse.shiftCapability === 'day-only') return false;
  if (nurse.shiftCapability === 'day-late' || nurse.shiftCapability === 'all') return true;
  return true; // 未設定はデフォルト可
}

function isNightShiftEligible(nurse) {
  // 標準勤務形態を優先的に確認
  if (nurse.shiftCapability) {
    // day-onlyは夜勤不可、day-late/day-night/allは夜勤可
    if (nurse.shiftCapability === 'day-only') {
      return false;
    }
    if (nurse.shiftCapability === 'day-late' || nurse.shiftCapability === 'day-night' || nurse.shiftCapability === 'all') {
      return true;
    }
  }
  
  // 希望データがない場合は夜勤可能とみなす
  const hasRequests = Object.keys(nurse.requests).length > 0;
  if (!hasRequests) return true;
  
  // 夜勤不可が多すぎる場合は夜勤をしない人とみなす
  const totalDays = Object.keys(nurse.requests).length;
  const noNightCount = Object.values(nurse.requests).filter(r =>
    r === REQUEST_TYPES.DAY_ONLY || r === REQUEST_TYPES.DAY_LATE || r === REQUEST_TYPES.PAID_LEAVE
  ).length;
  // 半分以上が夜勤不可の場合は夜勤をしない人と判定
  return (noNightCount / totalDays) < 0.5;
}

// 夜勤をする人かどうか判定（夜勤者の希望を最優先にするため）
function doesNightShift(nurse) {
  if (nurse.shiftCapability === 'day-night' || nurse.shiftCapability === 'all') {
    return true;
  }
  return isNightShiftEligible(nurse);
}

// シフト表を生成
function getShiftConfigFromUI() {
  const dow = {};
  [0,1,2,3,4,5,6].forEach(d => {
    dow[d] = {
      surgeryLines: parseInt(document.getElementById(`cfg_surgery_${d}`)?.value) || 0,
      dayShift:     parseInt(document.getElementById(`cfg_day_${d}`)?.value)     || 0,
      lateShift:    parseInt(document.getElementById(`cfg_late_${d}`)?.value)    || 0,
      nightShift:   parseInt(document.getElementById(`cfg_night_${d}`)?.value)   ?? 2,
    };
  });
  const holidayConfig = {
    surgeryLines: parseInt(document.getElementById('cfg_surgery_holiday')?.value) || 0,
    dayShift:     parseInt(document.getElementById('cfg_day_holiday')?.value)     || 2,
    lateShift:    parseInt(document.getElementById('cfg_late_holiday')?.value)    || 0,
    nightShift:   parseInt(document.getElementById('cfg_night_holiday')?.value)   ?? 2,
  };
  const holidayDatesRaw = document.getElementById('holidayDates')?.value || '';
  const holidays = holidayDatesRaw.split(/[,、\s]+/).map(s => s.trim()).filter(s => /^\d{1,2}\/\d{1,2}$/.test(s));
  return {
    dow,
    holidayConfig,
    holidays,
    holidayDays:      parseInt(document.getElementById('standardHolidayDays')?.value) || 8,
    dayAfterNightOff: true,
  };
}

function generateShiftSchedule(nurses, shiftConfig, targetWorkDays, options = {}) {
  // 後方互換：旧シグネチャ（数値）で呼ばれた場合のフォールバック
  if (typeof shiftConfig === 'number') {
    const dayReq = shiftConfig;
    const nightReq = targetWorkDays;
    const twDays = options;
    shiftConfig = { dow: {}, holidayDays: 8, dayAfterNightOff: true };
    [0,1,2,3,4,5,6].forEach(d => {
      shiftConfig.dow[d] = { surgeryLines: 0, dayShift: (d===0||d===6)?0:dayReq, lateShift: 0, nightShift: nightReq };
    });
    targetWorkDays = typeof twDays === 'number' ? twDays : 20;
    options = {};
  }
  const standardHolidayDays = shiftConfig.holidayDays || 8;
  const schedule = [];
  const random = options.randomFn || Math.random;
  const targetPublicHolidays = standardHolidayDays || null; // 標準公休日数
  
  // 初期化：各日のスケジュール
  dateColumns.forEach(date => {
    schedule.push({
      date,
      nurses: []
    });
  });

  // 各看護師の初期統計
  const nurseStats = {};
  nurses.forEach(nurse => {
    nurseStats[nurse.name] = {
      workDays: 0,
      nightShifts: 0,
      weekendOffDays: 0,
      violations: 0
    };
  });

  // 優先度の高い看護師から割り当て（有給希望など）
  const sortedNurses = shuffleArray(nurses, random).sort((a, b) => {
    // 備考に有給や希望がある場合を優先
    const aPriority = (a.note.includes('有給') || a.note.includes('旅行') || a.note.includes('通院')) ? 1 : 0;
    const bPriority = (b.note.includes('有給') || b.note.includes('旅行') || b.note.includes('通院')) ? 1 : 0;
    return bPriority - aPriority;
  });

  // まず有給希望の日を割り当て
  schedule.forEach(day => {
    sortedNurses.forEach(nurse => {
      if (nurse.requests[day.date] === REQUEST_TYPES.PAID_LEAVE) {
        day.nurses.push({
          name: nurse.name,
          shift: SHIFT_TYPES.OFF,
          violation: false
        });
        if (isWeekend(day.date)) {
          nurseStats[nurse.name].weekendOffDays++;
        }
      }
    });
  });

  // 各日についてシフトを割り当て
  schedule.forEach((day, dayIndex) => {
    const assigned = new Set(day.nurses.map(n => n.name));
    const available = sortedNurses.filter(n => !assigned.has(n.name));
    
    // 前日のシフトを確認（明け休みチェック用）
    const prevDay = getPreviousDayShift(schedule, dayIndex);
    
    // 現在の日までに割り当てられた看護師の統計を計算
    const currentSchedule = schedule.slice(0, dayIndex + 1);
    
    // 前日が明け休みの人は除外（当直明け翌日休暇オプションが有効な場合）
    const prevDayAssignments = prevDay ? prevDay.nurses : [];
    const prevDayOffAfterNight = new Set(
      shiftConfig.dayAfterNightOff !== false
        ? prevDayAssignments.filter(a => a.isDayOffAfterNight).map(a => a.name)
        : []
    );
    
    // 日勤を割り当て
    const dayShiftCandidates = shuffleArray(available
      .filter(n => {
        // 明け休みの翌日は除外（必ず公休）
        if (prevDayOffAfterNight.has(n.name)) {
          return false;
        }
        // 既に明け休みとして設定されている人は除外
        const existingAssignment = day.nurses.find(a => a.name === n.name);
        if (existingAssignment && existingAssignment.isDayOffAfterNight) {
          return false;
        }
        // 希望チェック（希望データがない場合はOK）
        const request = n.requests[day.date];
        if (request === REQUEST_TYPES.NIGHT_ONLY || request === REQUEST_TYPES.PAID_LEAVE) {
          return false;
        }
        // 夜勤をしない人は週末・祝日は日勤も不可
        const isHol = Array.isArray(shiftConfig.holidays) && shiftConfig.holidays.includes(day.date);
        if (!isNightShiftEligible(n) && (isWeekend(day.date) || isHol)) {
          return false;
        }
        // 5日以上連続勤務は避ける（師長の配慮を自動化）
        if (countConsecutiveWorkDays(n.name, schedule, dayIndex) >= 5) {
          return false;
        }
        return true;
      })
      , random).sort((a, b) => {
        const aStats = getNurseStats(a.name, currentSchedule);
        const bStats = getNurseStats(b.name, currentSchedule);
        
        // 夜勤をする人の希望を最優先（希望違反の少ない夜勤者を優先）
        const aIsNight = doesNightShift(a);
        const bIsNight = doesNightShift(b);
        if (aIsNight !== bIsNight) {
          return bIsNight ? -1 : 1; // 夜勤者を優先
        }
        
        // 夜勤者の場合、希望違反が少ない人を優先
        if (aIsNight && bIsNight) {
          if (aStats.violations !== bStats.violations) {
            return aStats.violations - bStats.violations;
          }
        }
        
        // 勤務日数が少ない人、希望違反が少ない人を優先
        if (aStats.workDays !== bStats.workDays) {
          return aStats.workDays - bStats.workDays;
        }
        return aStats.violations - bStats.violations;
      });
    
    const dow = getDateDow(day.date);
    const isHoliday = Array.isArray(shiftConfig.holidays) && shiftConfig.holidays.includes(day.date);
    const dowCfg = isHoliday
      ? (shiftConfig.holidayConfig || { surgeryLines: 0, dayShift: 2, lateShift: 0, nightShift: 2 })
      : (shiftConfig.dow[dow] || { dayShift: 0, lateShift: 0, nightShift: 2 });

    for (let i = 0; i < dowCfg.dayShift && i < dayShiftCandidates.length; i++) {
      const nurse = dayShiftCandidates[i];
      const violation = checkViolation(nurse, day.date, SHIFT_TYPES.DAY, schedule, dayIndex);
      day.nurses.push({ name: nurse.name, shift: SHIFT_TYPES.DAY, violation });
      nurseStats[nurse.name].workDays++;
      if (violation) nurseStats[nurse.name].violations++;
    }

    // 遅出を割り当て
    const assignedAfterDay = new Set(day.nurses.map(n => n.name));
    const lateShiftCandidates = shuffleArray(available.filter(n => {
      if (assignedAfterDay.has(n.name)) return false;
      if (prevDayOffAfterNight.has(n.name)) return false;
      const req = n.requests[day.date];
      if (req === REQUEST_TYPES.PAID_LEAVE || req === REQUEST_TYPES.NIGHT_ONLY || req === REQUEST_TYPES.DAY_ONLY) return false;
      if (!isLateShiftEligible(n)) return false;
      if (countConsecutiveWorkDays(n.name, schedule, dayIndex) >= 5) return false;
      return true;
    }), random).sort((a, b) => {
      const aStats = getNurseStats(a.name, schedule.slice(0, dayIndex + 1));
      const bStats = getNurseStats(b.name, schedule.slice(0, dayIndex + 1));
      return aStats.workDays - bStats.workDays;
    });
    for (let i = 0; i < (dowCfg.lateShift || 0) && i < lateShiftCandidates.length; i++) {
      const nurse = lateShiftCandidates[i];
      const violation = checkViolation(nurse, day.date, SHIFT_TYPES.LATE, schedule, dayIndex);
      day.nurses.push({ name: nurse.name, shift: SHIFT_TYPES.LATE, violation });
      nurseStats[nurse.name].workDays++;
      if (violation) nurseStats[nurse.name].violations++;
    }

    // 夜勤を割り当て
    const assignedForDay = new Set(day.nurses.map(n => n.name));
    const availableForNight = available.filter(n => !assignedForDay.has(n.name));
    const nightShiftCandidates = shuffleArray(availableForNight
      .filter(n => {
        // 希望チェック
        const request = n.requests[day.date];
        if (request === REQUEST_TYPES.DAY_ONLY || request === REQUEST_TYPES.DAY_LATE || request === REQUEST_TYPES.PAID_LEAVE) {
          return false;
        }
        // 夜勤をしない人は除外
        if (!isNightShiftEligible(n)) {
          return false;
        }
        // 5日以上連続勤務は避ける
        if (countConsecutiveWorkDays(n.name, schedule, dayIndex) >= 5) {
          return false;
        }
        return true;
      })
      , random).sort((a, b) => {
        const aStats = getNurseStats(a.name, currentSchedule);
        const bStats = getNurseStats(b.name, currentSchedule);
        
        // 夜勤をする人の希望を最優先（希望違反の少ない夜勤者を優先）
        const aIsNight = doesNightShift(a);
        const bIsNight = doesNightShift(b);
        if (aIsNight && !bIsNight) return -1;
        if (!aIsNight && bIsNight) return 1;
        
        // 希望違反が少ない人を優先（特に夜勤者）
        if (aIsNight && bIsNight && aStats.violations !== bStats.violations) {
          return aStats.violations - bStats.violations;
        }
        
        // 夜勤回数が少ない人、勤務日数が少ない人を優先
        if (aStats.nightShifts !== bStats.nightShifts) {
          return aStats.nightShifts - bStats.nightShifts;
        }
        return aStats.workDays - bStats.workDays;
      });
    
    const nightShiftRequired = dowCfg.nightShift ?? 2;
    const selectedNight = [];
    const usedNight = new Set();
    for (let i = 0; i < nightShiftRequired && i < nightShiftCandidates.length; i++) {
      let picked = null;

      for (const candidate of nightShiftCandidates) {
        if (usedNight.has(candidate.name)) continue;
        if (isNightPairBlocked(candidate.name, selectedNight)) continue;
        if (!isNightPairAvoid(candidate.name, selectedNight)) {
          picked = candidate;
          break;
        }
      }

      if (!picked) {
        for (const candidate of nightShiftCandidates) {
          if (usedNight.has(candidate.name)) continue;
          if (isNightPairBlocked(candidate.name, selectedNight)) continue;
          picked = candidate;
          break;
        }
      }

      if (!picked) {
        break;
      }

      const nurse = picked;
      usedNight.add(nurse.name);
      selectedNight.push(nurse.name);

      const violation = checkViolation(nurse, day.date, SHIFT_TYPES.NIGHT, schedule, dayIndex);
      day.nurses.push({
        name: nurse.name,
        shift: SHIFT_TYPES.NIGHT,
        violation
      });
      nurseStats[nurse.name].workDays++;
      nurseStats[nurse.name].nightShifts++;
      if (violation) nurseStats[nurse.name].violations++;
      
      // 夜勤の翌日は明け休み（必ず設定、上書きされない）
      if (dayIndex < dateColumns.length - 1) {
        const nextDate = dateColumns[dayIndex + 1];
        const nextDay = schedule.find(d => d.date === nextDate);
        if (nextDay) {
          const existingIndex = nextDay.nurses.findIndex(n => n.name === nurse.name);
          if (existingIndex >= 0) {
            // 既存の割り当てを明け休みに上書き
            nextDay.nurses[existingIndex] = {
              name: nurse.name,
              shift: SHIFT_TYPES.OFF,
              violation: false,
              isDayOffAfterNight: true // 明け休みフラグ
            };
          } else {
            nextDay.nurses.push({
              name: nurse.name,
              shift: SHIFT_TYPES.OFF,
              violation: false,
              isDayOffAfterNight: true // 明け休みフラグ
            });
          }
          
          // 明け休みの翌日も公休にする（オプション）
          if (shiftConfig.dayAfterNightOff !== false && dayIndex + 1 < dateColumns.length - 1) {
            const afterNextDate = dateColumns[dayIndex + 2];
            const afterNextDay = schedule.find(d => d.date === afterNextDate);
            if (afterNextDay) {
              const afterNextExistingIndex = afterNextDay.nurses.findIndex(n => n.name === nurse.name);
              if (afterNextExistingIndex >= 0) {
                // 既存の割り当てを公休に上書き（ただし明け休みではない）
                afterNextDay.nurses[afterNextExistingIndex] = {
                  name: nurse.name,
                  shift: SHIFT_TYPES.OFF,
                  violation: false,
                  isDayOffAfterNight: false // 公休（明け休みではない）
                };
              } else {
                afterNextDay.nurses.push({
                  name: nurse.name,
                  shift: SHIFT_TYPES.OFF,
                  violation: false,
                  isDayOffAfterNight: false // 公休（明け休みではない）
                });
              }
            }
          }
        }
      }
    }

    // 残りは休日に（明け休みで既に割り当て済みの人はスキップ）
    const allAssigned = new Set(day.nurses.map(n => n.name));
    available.forEach(nurse => {
      if (!allAssigned.has(nurse.name)) {
        day.nurses.push({
          name: nurse.name,
          shift: SHIFT_TYPES.OFF,
          violation: false
        });
        // 週末休日は、夜勤をしない人のみカウント（公休として）
        if (isWeekend(day.date) && !isNightShiftEligible(nurse)) {
          nurseStats[nurse.name].weekendOffDays++;
        }
      }
    });
  });

  // 公平性を向上させるための微調整（簡単な最適化）
  for (let iteration = 0; iteration < 3; iteration++) {
    schedule.forEach(day => {
      day.nurses.forEach((assignment, idx) => {
        const nurse = nurses.find(n => n.name === assignment.name);
        if (!nurse) return;

        // 現在のスコア
        const currentScore = calculateNurseScore(nurse, schedule, targetWorkDays, targetPublicHolidays);
        
        // 他の看護師と交換可能かチェック
        day.nurses.forEach((other, otherIdx) => {
          if (idx === otherIdx) return;
          const otherNurse = nurses.find(n => n.name === other.name);
          if (!otherNurse) return;

          // 明け休みやその翌日の公休は交換不可
          if (assignment.isDayOffAfterNight || other.isDayOffAfterNight) {
            return;
          }

          // 前日が明け休みの場合も交換不可（翌日は公休である必要がある）
          const prevDay = getPreviousDayShift(schedule, dayIndex);
          if (prevDay) {
            const prevAssignment = prevDay.nurses.find(a => a.name === nurse.name);
            const prevOtherAssignment = prevDay.nurses.find(a => a.name === otherNurse.name);
            if ((prevAssignment && prevAssignment.isDayOffAfterNight) ||
                (prevOtherAssignment && prevOtherAssignment.isDayOffAfterNight)) {
              return;
            }
          }
          
          // 交換して違反がないか確認
          const canSwap = !checkViolation(nurse, day.date, other.shift) &&
                         !checkViolation(otherNurse, day.date, assignment.shift) &&
                         assignment.shift !== other.shift;

          if (canSwap) {
            // 一時的に交換
            const temp = assignment.shift;
            assignment.shift = other.shift;
            other.shift = temp;

            const newScore = calculateNurseScore(nurse, schedule, targetWorkDays, targetPublicHolidays);
            const otherNewScore = calculateNurseScore(otherNurse, schedule, targetWorkDays, targetPublicHolidays);
            const otherCurrentScore = calculateNurseScore(otherNurse, schedule, targetWorkDays, targetPublicHolidays);

            // スコアが改善しない場合は戻す
            if (newScore + otherNewScore >= currentScore + otherCurrentScore) {
              other.shift = assignment.shift;
              assignment.shift = temp;
            }
          }
        });
  });
    });
  }

  return schedule;
}

// シフト表を表示（コンパクト版）
function renderShiftTable(schedule, container) {
  const target = container || document.getElementById('tableContainer');
  if (!target) return;
  // コンテナ専用の場合はh2を残してそれ以降をクリア
  if (!container) {
    Array.from(target.children).forEach(child => { if (child.tagName !== 'H2') child.remove(); });
  } else {
    target.innerHTML = '';
  }

  // 入職年降順ソート（nullは末尾）
  const sortedNurses = [...nurses].sort((a, b) => {
    if (a.hireYear == null && b.hireYear == null) return 0;
    if (a.hireYear == null) return 1;
    if (b.hireYear == null) return -1;
    return b.hireYear - a.hireYear;
  });

  // ×関係が多い上位5名
  const topBlocked = getTopBlockedNurses(5);
  const BLOCK_COLORS = ['#b71c1c', '#c0392b', '#e74c3c', '#e67e22', '#f39c12'];
  const blockColorMap = new Map(topBlocked.map((x, i) => [x.name, BLOCK_COLORS[i]]));

  const LABEL = {
    [SHIFT_TYPES.DAY]: '日',
    [SHIFT_TYPES.LATE]: '遅',
    [SHIFT_TYPES.NIGHT]: '夜',
    [SHIFT_TYPES.OFF]: '休',
  };
  const BG = {
    [SHIFT_TYPES.DAY]: '#dbeafe',
    [SHIFT_TYPES.LATE]: '#dcfce7',
    [SHIFT_TYPES.NIGHT]: '#fef3c7',
    [SHIFT_TYPES.OFF]: '#f3f4f6',
  };

  const wrap = document.createElement('div');
  wrap.style.cssText = 'overflow-x:auto; border:1px solid #ddd; border-radius:6px; max-height:65vh; overflow-y:auto;';

  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse; font-size:10px; white-space:nowrap;';

  // ヘッダー
  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');

  const nameTh = document.createElement('th');
  nameTh.textContent = '氏名';
  nameTh.style.cssText = 'position:sticky;left:0;top:0;z-index:4;background:#f8f9fa;padding:3px 6px;border:1px solid #ddd;min-width:58px;text-align:left;';
  hRow.appendChild(nameTh);

  dateColumns.forEach(date => {
    const th = document.createElement('th');
    const d = date.split('/')[1];
    const dow = getDayOfWeek(date);
    const isWE = isWeekend(date);
    th.innerHTML = `${d}<br>${dow}`;
    th.style.cssText = `position:sticky;top:0;z-index:3;background:#f8f9fa;padding:2px 1px;border:1px solid #ddd;min-width:22px;font-weight:${isWE?'700':'400'};color:${isWE?'#b71c1c':'inherit'};`;
    hRow.appendChild(th);
  });

  // 集計列ヘッダー
  [['遅', '#dcfce7'], ['夜', '#fef3c7'], ['公休', '#f3f4f6']].forEach(([label, bg]) => {
    const th = document.createElement('th');
    th.textContent = label;
    th.style.cssText = `position:sticky;top:0;z-index:3;background:${bg};padding:2px 4px;border:1px solid #ddd;min-width:26px;font-weight:700;`;
    hRow.appendChild(th);
  });

  thead.appendChild(hRow);
  table.appendChild(thead);

  // 行
  const tbody = document.createElement('tbody');
  sortedNurses.forEach(nurse => {
    const stats = getNurseStats(nurse.name, schedule);
    const row = document.createElement('tr');

    // 氏名セル
    const nameTd = document.createElement('td');
    const lastName = nurse.name.trim().split(/\s+/)[0] || nurse.name;
    const blockColor = blockColorMap.get(nurse.name);
    nameTd.style.cssText = `position:sticky;left:0;z-index:2;background:${blockColor ? blockColor + '1a' : '#fff'};padding:2px 4px;border:1px solid #ddd;font-size:10px;white-space:nowrap;${blockColor ? `border-left:3px solid ${blockColor};` : ''}`;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = lastName;
    if (blockColor) nameSpan.style.color = blockColor;
    nameTd.appendChild(nameSpan);

    if (nurse.hireYear) {
      const yr = document.createElement('span');
      yr.textContent = `'${String(nurse.hireYear).slice(-2)}`;
      yr.style.cssText = 'color:#9ca3af;font-size:8px;margin-left:2px;';
      nameTd.appendChild(yr);
    }
    if (blockColor) {
      const blocks = topBlocked.find(x => x.name === nurse.name)?.blocks || 0;
      nameTd.title = `×関係 ${blocks}件（要フォロー）`;
    }
    row.appendChild(nameTd);

    // 日付セル
    dateColumns.forEach(date => {
      const day = schedule.find(d => d.date === date);
      const assignment = day?.nurses.find(n => n.name === nurse.name);
      const td = document.createElement('td');
      const isWE = isWeekend(date);

      if (assignment) {
        const isAke = assignment.shift === SHIFT_TYPES.OFF && assignment.isDayOffAfterNight;
        td.textContent = isAke ? '明' : (LABEL[assignment.shift] || assignment.shift);
        td.style.background = isAke ? '#fed7aa' : (BG[assignment.shift] || '#fff');
        if (assignment.violation) {
          td.style.outline = '2px solid #dc2626';
          td.style.outlineOffset = '-1px';
          td.title = '希望違反';
        }
      } else {
        td.textContent = '-';
        td.style.color = '#ccc';
      }

      td.style.cssText += `padding:1px;border:1px solid #e5e7eb;text-align:center;font-weight:${isWE ? '700' : '400'};`;
      row.appendChild(td);
    });

    // 集計セル（遅/夜/公休）
    [[stats.lateShifts, '#dcfce7'], [stats.nightShifts, '#fef3c7'], [stats.publicHolidays, '#f3f4f6']].forEach(([val, bg]) => {
      const td = document.createElement('td');
      td.textContent = val;
      td.style.cssText = `background:${bg};padding:1px 3px;border:1px solid #ddd;text-align:center;font-weight:700;`;
      row.appendChild(td);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  target.appendChild(wrap);

  // 凡例
  const legend = document.createElement('div');
  legend.style.cssText = 'margin-top:8px; display:flex; gap:12px; flex-wrap:wrap; font-size:11px; align-items:center;';
  [
    ['日', '#dbeafe', '日勤'],
    ['遅', '#dcfce7', '遅出'],
    ['夜', '#fef3c7', '夜勤'],
    ['明', '#fed7aa', '夜勤明け'],
    ['休', '#f3f4f6', '公休'],
  ].forEach(([label, bg, title]) => {
    const el = document.createElement('span');
    el.style.cssText = `background:${bg};padding:2px 6px;border:1px solid #ddd;border-radius:3px;`;
    el.textContent = `${label} ${title}`;
    el.title = title;
    legend.appendChild(el);
  });
  if (topBlocked.length > 0) {
    const note = document.createElement('span');
    note.style.cssText = 'color:#b71c1c;font-size:10px;border-left:3px solid #b71c1c;padding-left:6px;';
    note.textContent = `赤名前 = ×関係上位（要フォロー）`;
    legend.appendChild(note);
  }
  target.appendChild(legend);
}

// 統計情報を表示（公平性可視化）
function renderStats(schedule, targetWorkDays, container) {
  const statsContainer = container || document.getElementById('statsContainer');
  if (!statsContainer) return;
  if (!container) {
    Array.from(statsContainer.children).forEach(child => { if (child.tagName !== 'H2') child.remove(); });
  } else {
    statsContainer.innerHTML = '';
  }

  const allData = nurses.map(nurse => ({ nurse, stats: getNurseStats(nurse.name, schedule) }));
  const n = allData.length || 1;

  const avgLate   = allData.reduce((s, x) => s + x.stats.lateShifts, 0) / n;
  const avgNight  = allData.reduce((s, x) => s + x.stats.nightShifts, 0) / n;
  const avgOff    = allData.reduce((s, x) => s + x.stats.publicHolidays, 0) / n;
  const avgWork   = allData.reduce((s, x) => s + x.stats.workDays, 0) / n;
  const totalViol = allData.reduce((s, x) => s + x.stats.violations, 0);

  // サマリーカード
  const summaryDiv = document.createElement('div');
  summaryDiv.style.cssText = 'display:flex; gap:12px; flex-wrap:wrap; margin-bottom:16px;';
  [
    ['スタッフ数', `${n}名`],
    ['平均勤務日数', avgWork.toFixed(1)],
    ['平均遅出回数', avgLate.toFixed(1)],
    ['平均夜勤回数', avgNight.toFixed(1)],
    ['平均公休日数', avgOff.toFixed(1)],
    ['希望違反総数', totalViol],
  ].forEach(([label, value]) => {
    const card = document.createElement('div');
    card.style.cssText = 'background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;padding:10px 16px;text-align:center;min-width:90px;';
    card.innerHTML = `<div style="font-size:11px;color:#666;margin-bottom:4px;">${label}</div><div style="font-size:18px;font-weight:700;color:#333;">${value}</div>`;
    summaryDiv.appendChild(card);
  });
  statsContainer.appendChild(summaryDiv);

  // ×関係上位5名の注意書き
  const topBlocked = getTopBlockedNurses(5);
  if (topBlocked.length > 0) {
    const BLOCK_COLORS = ['#b71c1c', '#c0392b', '#e74c3c', '#e67e22', '#f39c12'];
    const alertDiv = document.createElement('div');
    alertDiv.style.cssText = 'margin-bottom:16px;padding:10px 14px;background:#fff3f3;border:1px solid #fca5a5;border-radius:6px;font-size:12px;';
    alertDiv.innerHTML = '<strong style="color:#b71c1c;">⚠ ×関係上位スタッフ（管理者フォロー推奨）</strong><div style="margin-top:6px;display:flex;gap:10px;flex-wrap:wrap;">'
      + topBlocked.map((x, i) => `<span style="display:inline-flex;align-items:center;gap:4px;background:${BLOCK_COLORS[i]}1a;border:1px solid ${BLOCK_COLORS[i]};border-radius:4px;padding:2px 8px;color:${BLOCK_COLORS[i]};font-weight:600;">
        ${x.name.split(/\s+/)[0]} <span style="font-size:10px;opacity:0.8;">(×${x.blocks}件)</span></span>`).join('')
      + '</div>';
    statsContainer.appendChild(alertDiv);
  }

  // 公平性テーブル（入職年降順）
  const sortedData = [...allData].sort((a, b) => {
    if (a.nurse.hireYear == null && b.nurse.hireYear == null) return 0;
    if (a.nurse.hireYear == null) return 1;
    if (b.nurse.hireYear == null) return -1;
    return b.nurse.hireYear - a.nurse.hireYear;
  });

  function fairnessColor(val, avg) {
    const diff = val - avg;
    if (Math.abs(diff) <= 1) return '#f0fdf4'; // 平均内 → 薄緑
    if (Math.abs(diff) <= 2) return '#fef9c3'; // ±2 → 薄黄
    return diff > 0 ? '#fee2e2' : '#dbeafe';   // 多い→薄赤, 少ない→薄青
  }

  const tableWrap = document.createElement('div');
  tableWrap.style.cssText = 'overflow-x:auto;';
  const tbl = document.createElement('table');
  tbl.style.cssText = 'font-size:12px;border-collapse:collapse;width:100%;';
  tbl.innerHTML = `
    <thead>
      <tr style="background:#f8f9fa;">
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">氏名</th>
        <th style="padding:6px 4px;border:1px solid #ddd;">入職年</th>
        <th style="padding:6px 4px;border:1px solid #ddd;">勤務日数</th>
        <th style="padding:6px 4px;border:1px solid #ddd;background:#dcfce7;">遅出</th>
        <th style="padding:6px 4px;border:1px solid #ddd;background:#fef3c7;">夜勤</th>
        <th style="padding:6px 4px;border:1px solid #ddd;background:#f3f4f6;">公休</th>
        <th style="padding:6px 4px;border:1px solid #ddd;">希望違反</th>
      </tr>
    </thead>
    <tbody>
      ${sortedData.map(({ nurse, stats }) => {
        const lateBg  = fairnessColor(stats.lateShifts,  avgLate);
        const nightBg = fairnessColor(stats.nightShifts, avgNight);
        const offBg   = fairnessColor(stats.publicHolidays, avgOff);
        const lastName = nurse.name.trim().split(/\s+/)[0] || nurse.name;
        return `<tr>
          <td style="padding:4px 8px;border:1px solid #ddd;white-space:nowrap;">${lastName}${nurse.hireYear ? `<span style="color:#9ca3af;font-size:10px;margin-left:3px;">'${String(nurse.hireYear).slice(-2)}</span>` : ''}</td>
          <td style="padding:4px;border:1px solid #ddd;text-align:center;color:#666;">${nurse.hireYear ?? '—'}</td>
          <td style="padding:4px;border:1px solid #ddd;text-align:center;">${stats.workDays}</td>
          <td style="padding:4px;border:1px solid #ddd;text-align:center;background:${lateBg};">${stats.lateShifts}</td>
          <td style="padding:4px;border:1px solid #ddd;text-align:center;background:${nightBg};">${stats.nightShifts}</td>
          <td style="padding:4px;border:1px solid #ddd;text-align:center;background:${offBg};">${stats.publicHolidays}</td>
          <td style="padding:4px;border:1px solid #ddd;text-align:center;${stats.violations > 0 ? 'color:#dc2626;font-weight:700;' : ''}">${stats.violations}</td>
        </tr>`;
      }).join('')}
      <tr style="background:#f0f4ff;font-weight:700;">
        <td style="padding:4px 8px;border:1px solid #ddd;">平均</td>
        <td style="padding:4px;border:1px solid #ddd;"></td>
        <td style="padding:4px;border:1px solid #ddd;text-align:center;">${avgWork.toFixed(1)}</td>
        <td style="padding:4px;border:1px solid #ddd;text-align:center;background:#dcfce7;">${avgLate.toFixed(1)}</td>
        <td style="padding:4px;border:1px solid #ddd;text-align:center;background:#fef3c7;">${avgNight.toFixed(1)}</td>
        <td style="padding:4px;border:1px solid #ddd;text-align:center;background:#f3f4f6;">${avgOff.toFixed(1)}</td>
        <td style="padding:4px;border:1px solid #ddd;text-align:center;">${totalViol}</td>
      </tr>
    </tbody>`;
  tableWrap.appendChild(tbl);
  statsContainer.appendChild(tableWrap);

  const hint = document.createElement('p');
  hint.style.cssText = 'font-size:11px;color:#666;margin-top:8px;';
  hint.textContent = '色: 薄緑=平均±1以内 / 薄黄=平均±2 / 薄赤=多い / 薄青=少ない';
  statsContainer.appendChild(hint);
}

function generateScheduleDrafts(count, shiftConfig, targetWorkDays) {
  const drafts = [];
  const baseSeed = Date.now();
  for (let i = 0; i < count; i += 1) {
    const randomFn = createSeededRandom(baseSeed + (i + 1) * 9973);
    drafts.push(generateShiftSchedule(nurses, shiftConfig, targetWorkDays, { randomFn }));
  }
  return drafts;
}

function updateDraftSelectionUI() {
  document.querySelectorAll('.draft-card').forEach((card, index) => {
    card.classList.toggle('selected', index === selectedDraftIndex);
  });
}

function selectDraft(index, targetWorkDays) {
  selectedDraftIndex = index;
  shiftSchedule = scheduleDrafts[index];
  lastTargetWorkDays = targetWorkDays;

  renderShiftTable(shiftSchedule);
  renderStats(shiftSchedule, lastTargetWorkDays);

  const tableContainer = document.getElementById('tableContainer');
  const statsContainer = document.getElementById('statsContainer');
  if (tableContainer) tableContainer.style.display = 'block';
  if (statsContainer) statsContainer.style.display = 'block';

  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) exportBtn.disabled = false;
  updateDraftSelectionUI();
}

function renderDrafts(drafts, targetWorkDays) {
  const container = document.getElementById('draftContainer');
  const notice = document.getElementById('selectionNotice');
  if (!container) return;

  container.innerHTML = '';
  if (!drafts || drafts.length === 0) {
    container.style.display = 'none';
    if (notice) notice.style.display = 'none';
    return;
  }

  drafts.forEach((draft, index) => {
    const card = document.createElement('div');
    card.className = 'draft-card';

    const selectBtn = document.createElement('button');
    selectBtn.className = 'btn-primary';
    selectBtn.type = 'button';
    selectBtn.textContent = 'この案を採用';
    selectBtn.addEventListener('click', () => selectDraft(index, targetWorkDays));

    const headerWrap = document.createElement('div');
    headerWrap.className = 'draft-header';
    headerWrap.appendChild(document.createTextNode(`案 ${index + 1}`));
    headerWrap.appendChild(selectBtn);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'draft-table';
    renderShiftTable(draft, tableWrap);

    card.appendChild(headerWrap);
    card.appendChild(tableWrap);
    container.appendChild(card);
  });

  container.style.display = 'grid';
  if (notice) notice.style.display = 'block';
  updateDraftSelectionUI();
}

// CSVでエクスポート
function exportToCSV(schedule, filenameSuffix = '') {
  const rows = [];
  
  // ヘッダー
  const header = ['看護師名', ...dateColumns];
  rows.push(header);

  // データ行
  nurses.forEach(nurse => {
    const row = [nurse.name];
    dateColumns.forEach(date => {
      const day = schedule.find(d => d.date === date);
      const assignment = day?.nurses.find(n => n.name === nurse.name);
      row.push(assignment ? assignment.shift : '');
    });
    rows.push(row);
  });

  // CSV文字列を作成
  const csvContent = rows.map(row => 
    row.map(cell => `"${cell}"`).join(',')
  ).join('\n');

  // ダウンロード
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const suffix = filenameSuffix ? `_${filenameSuffix}` : '';
  const { year, month } = getShiftTarget();
  link.download = `shift_schedule_${year}_${String(month).padStart(2, '0')}${suffix}.csv`;
  link.click();
}

function exportAllDrafts() {
  if (!scheduleDrafts || scheduleDrafts.length === 0) {
    showError('まず下書きを作成してください');
    return;
  }
  scheduleDrafts.forEach((draft, index) => {
    exportToCSV(draft, `draft${index + 1}`);
  });
}

// エラーメッセージを表示
function showError(message) {
  const container = document.getElementById('errorContainer');
  container.innerHTML = `<div class="error">${message}</div>`;
}

function clearError() {
  document.getElementById('errorContainer').innerHTML = '';
}

// 30名の固定プロファイル（ダミーデータ用）
const DUMMY_PROFILES = [
  { name: '田中 花子',   cap: 'day-only', hireYear: 2005 },
  { name: '鈴木 美咲',   cap: 'day-only', hireYear: 2007 },
  { name: '高橋 葵',     cap: 'day-only', hireYear: 2010 },
  { name: '伊藤 結衣',   cap: 'day-only', hireYear: 2012 },
  { name: '渡辺 莉子',   cap: 'day-only', hireYear: 2015 },
  { name: '山本 千夏',   cap: 'day-late', hireYear: 2008 },
  { name: '中村 さくら', cap: 'day-late', hireYear: 2011 },
  { name: '小林 陽菜',   cap: 'day-late', hireYear: 2014 },
  { name: '加藤 凜',     cap: 'day-late', hireYear: 2017 },
  { name: '吉田 心',     cap: 'day-late', hireYear: 2020 },
  { name: '佐藤 彩',     cap: 'all',      hireYear: 2006 },
  { name: '松本 菜々',   cap: 'all',      hireYear: 2009 },
  { name: '井上 あい',   cap: 'all',      hireYear: 2010 },
  { name: '木村 春香',   cap: 'all',      hireYear: 2013 },
  { name: '林 翠',       cap: 'all',      hireYear: 2013 },
  { name: '清水 舞',     cap: 'all',      hireYear: 2015 },
  { name: '山田 桃花',   cap: 'all',      hireYear: 2016 },
  { name: '斎藤 ひかり', cap: 'all',      hireYear: 2017 },
  { name: '藤田 夕佳',   cap: 'all',      hireYear: 2018 },
  { name: '岡田 みほ',   cap: 'all',      hireYear: 2018 },
  { name: '池田 恵',     cap: 'all',      hireYear: 2019 },
  { name: '橋本 ともみ', cap: 'all',      hireYear: 2020 },
  { name: '石川 まい',   cap: 'all',      hireYear: 2021 },
  { name: '前田 萌',     cap: 'all',      hireYear: 2021 },
  { name: '藤原 悠',     cap: 'all',      hireYear: 2022 },
  { name: '小川 里奈',   cap: 'all',      hireYear: 2022 },
  { name: '岩田 朱音',   cap: 'all',      hireYear: 2023 },
  { name: '坂本 遥',     cap: 'all',      hireYear: 2023 },
  { name: '村田 玲',     cap: 'all',      hireYear: 2024 },
  { name: '中島 由衣',   cap: 'all',      hireYear: 2025 },
];

// テスト用ダミーデータをLocalStorageに書き込む（nurse_input.js と同一形式）
function writeDummyToLocalStorage(year, month) {
  const dateCols = getMonthDates(year, month);
  const seeded = createSeededRandom(20260428);

  // ユーザープロファイルにhireYearを書き込む
  let userProfiles = {};
  try { userProfiles = JSON.parse(localStorage.getItem(USER_STORAGE_KEY) || '{}'); } catch (e) {}
  DUMMY_PROFILES.forEach(({ name, cap, hireYear }) => {
    const userKey = name.replace(/\s/g, '_');
    userProfiles[userKey] = Object.assign(userProfiles[userKey] || {}, {
      fullName: name, shiftCapability: cap, hireYear: hireYear ?? null,
    });
  });
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userProfiles));

  DUMMY_PROFILES.forEach(({ name, cap }) => {
    const userKey = name.replace(/\s/g, '_');
    const requests = {};

    dateCols.forEach(dateStr => {
      const [m, d] = dateStr.split('/').map(Number);
      const dow = new Date(year, m - 1, d).getDay();
      const isWeekendDay = dow === 0 || dow === 6;
      const r = seeded();

      if (cap === 'day-only') {
        requests[dateStr] = r < 0.15 ? REQUEST_TYPES.PAID_LEAVE : REQUEST_TYPES.DAY_ONLY;
      } else if (cap === 'day-late') {
        if (r < 0.12) requests[dateStr] = REQUEST_TYPES.PAID_LEAVE;
        else if (r < 0.25) requests[dateStr] = REQUEST_TYPES.DAY_LATE;
        else requests[dateStr] = REQUEST_TYPES.AVAILABLE;
      } else {
        if ((isWeekendDay && r < 0.20) || r < 0.08) requests[dateStr] = REQUEST_TYPES.PAID_LEAVE;
        else if (r < 0.16) requests[dateStr] = REQUEST_TYPES.NIGHT_ONLY;
        else if (r < 0.22) requests[dateStr] = REQUEST_TYPES.DAY_LATE;
        else requests[dateStr] = REQUEST_TYPES.AVAILABLE;
      }
    });

    const data = {
      nurseName: name,
      userKey,
      requests,
      note: cap === 'day-only' ? '日勤のみ' : (cap === 'day-late' ? '遅出まで可' : ''),
      submitted: true,
      submittedAt: new Date().toISOString(),
      shiftCapability: cap,
      doesNightShift: cap === 'all',
      preferences: { valuePreference: null }
    };

    const key = `${STORAGE_KEY_PREFIX}${userKey}_${year}_${month}`;
    localStorage.setItem(key, JSON.stringify(data));
  });
}

// LocalStorageからnursesとdateColumnsを構築（nurse_input.jsと同一形式）
function loadNursesFromLocalStorage(year, month) {
  generatorYear = year;
  generatorMonth = month;
  dateColumns = getMonthDates(year, month);
  const prefix = STORAGE_KEY_PREFIX;
  const result = [];

  let userProfiles = {};
  try { userProfiles = JSON.parse(localStorage.getItem(USER_STORAGE_KEY) || '{}'); } catch (e) {}

  Object.keys(localStorage).forEach(key => {
    if (!key.startsWith(prefix)) return;
    const tail = key.slice(prefix.length);
    const match = tail.match(/^(.+)_(\d{4})_(\d{1,2})$/);
    if (!match) return;
    const y = parseInt(match[2]), m = parseInt(match[3]);
    if (y !== year || m !== month) return;

    try {
      const data = JSON.parse(localStorage.getItem(key));
      const userKey = match[1];
      const profile = userProfiles[userKey] || {};
      const nurse = {
        name: data.nurseName || userKey.replace(/_/g, ' '),
        note: data.note || '',
        requests: {},
        shiftCapability: data.shiftCapability || null,
        hireYear: profile.hireYear ?? data.hireYear ?? null,
      };
      dateColumns.forEach(date => {
        nurse.requests[date] = data.requests?.[date] || REQUEST_TYPES.AVAILABLE;
      });
      result.push(nurse);
    } catch (e) {}
  });

  return result;
}

function processNursesLoaded(loadedNurses) {
  if (!loadedNurses || loadedNurses.length === 0) {
    showError('データが見つかりませんでした');
    return;
  }
  nurses = loadedNurses;
  const pairMatrixSection = document.getElementById('pairMatrixSection');
  const shiftConditionsSection = document.getElementById('shiftConditionsSection');
  const generateSection = document.getElementById('generateSection');
  if (pairMatrixSection) pairMatrixSection.style.display = 'block';
  if (shiftConditionsSection) shiftConditionsSection.style.display = 'block';
  if (generateSection) generateSection.style.display = 'block';
  loadNightPairMatrix();
  const nightShiftCount = getPairMatrixCandidatesFromNurses().length;
  alert(`データを読み込みました。\n看護師数: ${nurses.length}名\n期間: ${dateColumns.length}日\n夜勤する人: ${nightShiftCount}名\n\n夜勤ペア相性表が前回の設定を引き継ぎました。\n確認後、「シフト表を生成」ボタンを押してください。`);
}


// メイン処理
document.addEventListener('DOMContentLoaded', () => {
  const generateBtn = document.getElementById('generateBtn');
  const exportBtn = document.getElementById('exportBtn');

  // 相性表アコーディオン
  const pairToggleBtn = document.getElementById('pairMatrixToggle');
  if (pairToggleBtn) {
    pairToggleBtn.addEventListener('click', () => {
      const body = document.getElementById('pairMatrixBody');
      if (!body) return;
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      pairToggleBtn.textContent = open ? '▼ 表示' : '▲ 閉じる';
    });
  }

  // テスト用ダミーデータ読み込み（LocalStorageに書き込んでから読み込む）
  const dummyBtn = document.getElementById('dummyLoadBtn');
  if (dummyBtn) {
    dummyBtn.addEventListener('click', () => {
      clearError();
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const year = next.getFullYear();
      const month = next.getMonth() + 1;
      writeDummyToLocalStorage(year, month);
      const loaded = loadNursesFromLocalStorage(year, month);
      processNursesLoaded(loaded);
    });
  }

  // LocalStorageから勤務希望データを読み込む
  const lsLoadBtn = document.getElementById('lsLoadBtn');
  if (lsLoadBtn) {
    lsLoadBtn.addEventListener('click', () => {
      clearError();
      const yearVal = parseInt(document.getElementById('lsYear').value);
      const monthVal = parseInt(document.getElementById('lsMonth').value);
      if (!yearVal || !monthVal || monthVal < 1 || monthVal > 12) {
        showError('年と月を正しく入力してください');
        return;
      }
      const loaded = loadNursesFromLocalStorage(yearVal, monthVal);
      if (!loaded.length) {
        showError(`${yearVal}年${monthVal}月の勤務希望データがLocalStorageに見つかりません`);
        return;
      }
      processNursesLoaded(loaded);
    });
  }

  // シフト表を生成
  generateBtn.addEventListener('click', () => {
    clearError();
    if (nurses.length === 0) {
      showError('まずデータを読み込んでください');
      return;
    }

    const shiftConfig = getShiftConfigFromUI();
    const targetWorkDays = Math.max(0, dateColumns.length - shiftConfig.holidayDays);
    loadMixingMatrix();
    document.getElementById('loadingContainer').style.display = 'block';
    document.getElementById('tableContainer').style.display = 'none';
    document.getElementById('statsContainer').style.display = 'none';
    document.getElementById('draftContainer').style.display = 'none';
    document.getElementById('selectionNotice').style.display = 'none';
    exportBtn.disabled = true;

    // 非同期で処理（UIブロックを防ぐ）
    setTimeout(() => {
      try {
        scheduleDrafts = generateScheduleDrafts(3, shiftConfig, targetWorkDays);
        selectedDraftIndex = null;
        shiftSchedule = [];
        lastTargetWorkDays = targetWorkDays;
        renderDrafts(scheduleDrafts, targetWorkDays);

        document.getElementById('draftContainer').style.display = 'grid';
        document.getElementById('selectionNotice').style.display = 'block';
        document.getElementById('loadingContainer').style.display = 'none';
        const exportSection = document.getElementById('exportSection');
        if (exportSection) exportSection.style.display = 'block';
        exportBtn.disabled = false;
      } catch (error) {
        showError(`シフト表の生成に失敗しました: ${error.message}`);
        document.getElementById('loadingContainer').style.display = 'none';
      }
    }, 100);
  });

  // 相性表のボタンイベントは削除（自動生成・自動保存のため不要）

  // CSVでエクスポート
  exportBtn.addEventListener('click', () => {
    exportAllDrafts();
  });
});
