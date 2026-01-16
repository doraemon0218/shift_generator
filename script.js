// グローバル変数
let requestData = [];
let shiftSchedule = [];
let scheduleDrafts = [];
let selectedDraftIndex = null;
let lastTargetWorkDays = null;
let pairMatrixCandidates = [];
let nurses = [];
let dateColumns = [];
let mixingMatrix = null;

const MIXING_MATRIX_KEY = 'mixing_matrix';

// 希望の種類を表す定数
const REQUEST_TYPES = {
  AVAILABLE: 'available',
  DAY_ONLY: 'day-only',
  DAY_LATE: 'day-late',
  NIGHT_ONLY: 'night-only',
  PAID_LEAVE: 'paid-leave'
};

// シフトの種類
const SHIFT_TYPES = {
  DAY: '日勤',
  NIGHT: '夜勤',
  OFF: '休'
};

// CSVを読み込む
async function loadCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const { data } = Papa.parse(e.target.result, {
          header: true,
          skipEmptyLines: true
        });
        resolve(data);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// 日付列を取得
function getDateColumns(rows) {
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  // 8/1 から 8/31 の形式の列を取得
  return cols.filter(col => /^8\/\d+$/.test(col));
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

// 日付が週末かどうか判定（2025年8月）
function isWeekend(dateStr) {
  const [month, day] = dateStr.split('/').map(Number);
  const date = new Date(2025, month - 1, day);
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // 0=日曜, 6=土曜
}

// 日付文字列から曜日を取得
function getDayOfWeek(dateStr) {
  const [month, day] = dateStr.split('/').map(Number);
  const date = new Date(2025, month - 1, day);
  const dayOfWeek = date.getDay();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return weekdays[dayOfWeek];
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

function getPairMatrixCandidatesFromNurses() {
  if (!nurses || nurses.length === 0) return [];
  const candidates = nurses.filter(nurse => isNightShiftEligible(nurse));
  return candidates
    .map(nurse => nurse.name)
    .filter(name => name)
    .sort((a, b) => a.localeCompare(b, 'ja'));
}

function renderNightPairMatrix() {
  const container = document.getElementById('nightPairMatrix');
  if (!container) return;

  if (!pairMatrixCandidates || pairMatrixCandidates.length === 0) {
    container.innerHTML = '<p style="color: #666; margin: 0;">夜勤可のメンバーがいません。</p>';
    return;
  }

  if (pairMatrixCandidates.length === 1) {
    container.innerHTML = '<p style="color: #666; margin: 0;">夜勤可のメンバーが1名のみのため、相性表は作成できません。</p>';
    return;
  }

  const storedMatrix = getStoredMixingMatrix();
  const pairs = storedMatrix?.pairs || {};

  const headerCells = pairMatrixCandidates.map(name => `<th>${name}</th>`).join('');

  const rows = pairMatrixCandidates.map((rowName, rowIndex) => {
    const cells = pairMatrixCandidates.map((colName, colIndex) => {
      if (rowIndex === colIndex) {
        return '<td class="pair-diagonal">-</td>';
      }
      // デフォルトは○（ok）、保存済みの値がある場合はそれを使用
      const status = getMixingStatusForPair(pairs, rowName, colName) || 'ok';
      return `
        <td>
          <select class="pair-select" data-a="${rowName}" data-b="${colName}">
            <option value="ok" ${status === 'ok' ? 'selected' : ''}>○ 問題なし</option>
            <option value="avoid" ${status === 'avoid' ? 'selected' : ''}>△ 極力避けたい</option>
            <option value="block" ${status === 'block' ? 'selected' : ''}>× 禁忌</option>
          </select>
        </td>
      `;
    }).join('');

    return `
      <tr>
        <th class="name-cell">${rowName}</th>
        ${cells}
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th class="name-cell">氏名</th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  container.querySelectorAll('select.pair-select').forEach(select => {
    select.addEventListener('change', () => {
      const a = select.dataset.a;
      const b = select.dataset.b;
      const value = select.value;
      container.querySelectorAll(`select.pair-select[data-a="${b}"][data-b="${a}"]`).forEach(target => {
        if (target.value !== value) {
          target.value = value;
        }
      });
    });
  });
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

function isNightPairBlocked(candidateName, selectedNames) {
  return selectedNames.some(name => getMixingStatus(candidateName, name) === 'block');
}

function isNightPairAvoid(candidateName, selectedNames) {
  return selectedNames.some(name => getMixingStatus(candidateName, name) === 'avoid');
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
  let weekendOffDays = 0;
  let publicHolidays = 0; // 公休日数（明け休みを除く）
  let violations = 0;

  schedule.forEach((day, dayIndex) => {
    const assignment = day.nurses.find(n => n.name === nurseName);
    if (assignment) {
      if (assignment.shift !== SHIFT_TYPES.OFF) {
        workDays++;
        if (assignment.shift === SHIFT_TYPES.NIGHT) {
          nightShifts++;
        }
      } else {
        // 休みの場合
        // 明け休みは公休にカウントしない
        if (!assignment.isDayOffAfterNight) {
          // 平日の休みは公休にカウント
          if (!isWeekend(day.date)) {
            publicHolidays++;
          }
          // 週末の休みも公休にカウント（明け休みでない場合のみ）
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

  return { workDays, nightShifts, weekendOffDays, publicHolidays, violations };
}

// 希望に違反しているかチェック（希望データがない場合は全てOK）
function checkViolation(nurse, date, shift, schedule, dateIndex) {
  const request = nurse.requests[date];
  // 希望データがない場合は違反なし（全てOK）
  if (!request || request === REQUEST_TYPES.AVAILABLE) return false;
  
  if (request === REQUEST_TYPES.PAID_LEAVE) {
    return shift !== SHIFT_TYPES.OFF;
  }
  if (request === REQUEST_TYPES.DAY_ONLY || request === REQUEST_TYPES.DAY_LATE) {
    return shift === SHIFT_TYPES.NIGHT;
  }
  if (request === REQUEST_TYPES.NIGHT_ONLY) {
    return shift === SHIFT_TYPES.DAY;
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

// 夜勤をしない人かどうか判定（標準勤務形態と希望データから判断）
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
function generateShiftSchedule(nurses, dayShiftRequired, nightShiftRequired, targetWorkDays, standardHolidayDays, options = {}) {
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
    
    // 前日が明け休みの人は除外（明け休みの翌日は必ず公休）
    const prevDayAssignments = prevDay ? prevDay.nurses : [];
    const prevDayOffAfterNight = new Set(
      prevDayAssignments
        .filter(a => a.isDayOffAfterNight)
        .map(a => a.name)
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
        // 夜勤をしない人は週末は日勤も不可
        if (!isNightShiftEligible(n) && isWeekend(day.date)) {
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
    
    const requiredDayShift = isWeekend(day.date) ? nightShiftRequired : dayShiftRequired;
    for (let i = 0; i < requiredDayShift && i < dayShiftCandidates.length; i++) {
      const nurse = dayShiftCandidates[i];
      const violation = checkViolation(nurse, day.date, SHIFT_TYPES.DAY, schedule, dayIndex);
      day.nurses.push({
        name: nurse.name,
        shift: SHIFT_TYPES.DAY,
        violation
      });
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
          
          // 明け休みの翌日は必ず公休にする
          if (dayIndex + 1 < dateColumns.length - 1) {
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
            continue;
          }
          
          // 前日が明け休みの場合も交換不可（翌日は公休である必要がある）
          const prevDay = getPreviousDayShift(schedule, dayIndex);
          if (prevDay) {
            const prevAssignment = prevDay.nurses.find(a => a.name === nurse.name);
            const prevOtherAssignment = prevDay.nurses.find(a => a.name === otherNurse.name);
            if ((prevAssignment && prevAssignment.isDayOffAfterNight) || 
                (prevOtherAssignment && prevOtherAssignment.isDayOffAfterNight)) {
              continue;
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

// シフト表を表示
function renderShiftTable(schedule, container) {
  const target = container || document.getElementById('tableContainer');
  if (!target) return;

  target.innerHTML = '';

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  // ヘッダー作成
  const headerRow = document.createElement('tr');
  const nameHeader = document.createElement('th');
  nameHeader.textContent = '看護師名';
  headerRow.appendChild(nameHeader);

  dateColumns.forEach(date => {
    const th = document.createElement('th');
    const dayOfWeek = getDayOfWeek(date);
    th.textContent = `${date}(${dayOfWeek})`;
    if (isWeekend(date)) {
      th.classList.add('weekend');
    }
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  // 看護師ごとの行を作成
  nurses.forEach(nurse => {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.textContent = nurse.name;
    if (nurse.note) {
      nameCell.title = nurse.note;
      nameCell.style.cursor = 'help';
    }
    row.appendChild(nameCell);

    dateColumns.forEach(date => {
      const day = schedule.find(d => d.date === date);
      const assignment = day?.nurses.find(n => n.name === nurse.name);
      const td = document.createElement('td');

      if (assignment) {
        td.textContent = assignment.shift;
        if (assignment.shift === SHIFT_TYPES.DAY) {
          td.classList.add('day-shift');
          // 遅出可能な人に色をつける
          const nurse = nurses.find(n => n.name === assignment.name);
          if (nurse) {
            const request = nurse.requests[date];
            const canLate = nurse.shiftCapability === 'day-late' || 
                           nurse.shiftCapability === 'all' ||
                           request === REQUEST_TYPES.DAY_LATE ||
                           (request === REQUEST_TYPES.AVAILABLE && (nurse.shiftCapability === 'day-late' || nurse.shiftCapability === 'all'));
            if (canLate) {
              td.classList.add('late-capable');
              td.title = '遅出可能';
            }
          }
        } else if (assignment.shift === SHIFT_TYPES.NIGHT) {
          td.classList.add('night-shift');
        } else {
          td.classList.add('off-day');
          if (assignment.isDayOffAfterNight) {
            td.title = '明け休み';
          }
        }
        if (assignment.violation) {
          td.classList.add('violation');
          td.title = (td.title ? td.title + ' / ' : '') + '希望に違反しています';
        }
      } else {
        td.textContent = '?';
      }

      if (isWeekend(date)) {
        td.classList.add('weekend');
      }

      row.appendChild(td);
    });

    tbody.appendChild(row);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  target.appendChild(table);
}

// 統計情報を表示
function renderStats(schedule, targetWorkDays, container) {
  const statsContainer = container || document.getElementById('statsContainer');
  if (!statsContainer) return;
  statsContainer.innerHTML = '';

  const allStats = nurses.map(nurse => getNurseStats(nurse.name, schedule));
  
  const avgWorkDays = allStats.reduce((sum, s) => sum + s.workDays, 0) / allStats.length;
  const avgNightShifts = allStats.reduce((sum, s) => sum + s.nightShifts, 0) / allStats.length;
  const avgWeekendOff = allStats.reduce((sum, s) => sum + s.weekendOffDays, 0) / allStats.length;
  const totalViolations = allStats.reduce((sum, s) => sum + s.violations, 0);

  const stats = [
    { label: '平均勤務日数', value: avgWorkDays.toFixed(1) },
    { label: '平均夜勤回数', value: avgNightShifts.toFixed(1) },
    { label: '平均週末休日', value: avgWeekendOff.toFixed(1) },
    { label: '希望違反総数', value: totalViolations.toString() },
    { label: '看護師数', value: nurses.length.toString() },
    { label: 'シフト期間', value: `${dateColumns.length}日` }
  ];

  stats.forEach(stat => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `
      <div class="stat-label">${stat.label}</div>
      <div class="stat-value">${stat.value}</div>
    `;
    statsContainer.appendChild(card);
  });

  // 看護師ごとの詳細統計も表示
  const detailDiv = document.createElement('div');
  detailDiv.style.gridColumn = '1 / -1';
  detailDiv.style.marginTop = '16px';
  detailDiv.innerHTML = '<h3 style="font-size: 16px; margin-bottom: 12px;">看護師ごとの統計</h3>';
  
  const detailTable = document.createElement('table');
  detailTable.style.fontSize = '12px';
  detailTable.innerHTML = `
    <thead>
      <tr>
        <th>看護師名</th>
        <th>勤務日数</th>
        <th>夜勤回数</th>
        <th>週末休日</th>
        <th>希望違反</th>
      </tr>
    </thead>
    <tbody>
      ${nurses.map(nurse => {
        const stats = getNurseStats(nurse.name, schedule);
        return `
          <tr>
            <td>${nurse.name}${nurse.note ? ` (${nurse.note})` : ''}</td>
            <td>${stats.workDays}</td>
            <td>${stats.nightShifts}</td>
            <td>${stats.weekendOffDays}</td>
            <td>${stats.violations}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  `;
  detailDiv.appendChild(detailTable);
  statsContainer.appendChild(detailDiv);
}

function generateScheduleDrafts(count, dayShiftRequired, nightShiftRequired, targetWorkDays, standardHolidayDays) {
  const drafts = [];
  const baseSeed = Date.now();
  for (let i = 0; i < count; i += 1) {
    const randomFn = createSeededRandom(baseSeed + (i + 1) * 9973);
    drafts.push(generateShiftSchedule(nurses, dayShiftRequired, nightShiftRequired, targetWorkDays, standardHolidayDays, { randomFn }));
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
  const legendContainer = document.getElementById('legendContainer');
  if (tableContainer) tableContainer.style.display = 'block';
  if (statsContainer) statsContainer.style.display = 'block';
  if (legendContainer) legendContainer.style.display = 'block';

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
  link.download = `shift_schedule_2025_08${suffix}.csv`;
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

// メイン処理
document.addEventListener('DOMContentLoaded', () => {
  // ログイン状態を確認（管理者ページではないので、任意）
  // const currentUser = localStorage.getItem('current_user');
  // if (!currentUser) {
  //   // ログインしていなくてもCSV読み込みは可能
  // }
  
  const fileInput = document.getElementById('fileInput');
  const loadBtn = document.getElementById('loadBtn');
  const generateBtn = document.getElementById('generateBtn');
  const exportBtn = document.getElementById('exportBtn');
  const pairReloadBtn = document.getElementById('pairMatrixReload');
  const pairUpdateBtn = document.getElementById('pairMatrixUpdate');
  const pairClearBtn = document.getElementById('pairMatrixClear');

  // デフォルトファイルを読み込む（data/shift_requests.csv）
  loadBtn.addEventListener('click', async () => {
    clearError();
    const file = fileInput.files[0];
    
    if (!file) {
      // ファイルが選択されていない場合、デフォルトファイルを読み込む
      try {
        const response = await fetch('./data/shift_requests.csv');
        if (!response.ok) throw new Error('デフォルトファイルが見つかりません');
        const text = await response.text();
        const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
        requestData = data;
      } catch (error) {
        showError(`ファイルの読み込みに失敗しました: ${error.message}`);
        return;
      }
    } else {
      try {
        requestData = await loadCSV(file);
      } catch (error) {
        showError(`ファイルの読み込みに失敗しました: ${error.message}`);
        return;
      }
    }

    nurses = parseNurseData(requestData);
    if (nurses.length === 0) {
      showError('データが見つかりませんでした');
      return;
    }

    // 読み込み後に相性表セクションを表示
    const pairMatrixSection = document.getElementById('pairMatrixSection');
    const shiftConditionsSection = document.getElementById('shiftConditionsSection');
    const generateSection = document.getElementById('generateSection');
    
    if (pairMatrixSection) pairMatrixSection.style.display = 'block';
    if (shiftConditionsSection) shiftConditionsSection.style.display = 'block';
    if (generateSection) generateSection.style.display = 'block';
    
    if (pairReloadBtn) pairReloadBtn.disabled = false;
    if (pairUpdateBtn) pairUpdateBtn.disabled = false;
    if (pairClearBtn) pairClearBtn.disabled = false;
    
    loadNightPairMatrix();
    alert(`データを読み込みました。看護師数: ${nurses.length}名、期間: ${dateColumns.length}日`);
  });

  // シフト表を生成
  generateBtn.addEventListener('click', () => {
    clearError();
    const dayShiftRequired = parseInt(document.getElementById('dayShiftRequired').value) || 3;
    const nightShiftRequired = parseInt(document.getElementById('nightShiftRequired').value) || 2;
    const standardHolidayDays = parseInt(document.getElementById('standardHolidayDays').value) || 0;

    if (nurses.length === 0) {
      showError('まずデータを読み込んでください');
      return;
    }

    const targetWorkDays = Math.max(0, dateColumns.length - standardHolidayDays);
    loadMixingMatrix();
    document.getElementById('loadingContainer').style.display = 'block';
    document.getElementById('tableContainer').style.display = 'none';
    document.getElementById('statsContainer').style.display = 'none';
    document.getElementById('legendContainer').style.display = 'none';
    document.getElementById('draftContainer').style.display = 'none';
    document.getElementById('selectionNotice').style.display = 'none';
    exportBtn.disabled = true;

    // 非同期で処理（UIブロックを防ぐ）
    setTimeout(() => {
      try {
        scheduleDrafts = generateScheduleDrafts(3, dayShiftRequired, nightShiftRequired, targetWorkDays, standardHolidayDays);
        selectedDraftIndex = null;
        shiftSchedule = [];
        lastTargetWorkDays = targetWorkDays;
        renderDrafts(scheduleDrafts, targetWorkDays);

        document.getElementById('draftContainer').style.display = 'grid';
        document.getElementById('selectionNotice').style.display = 'block';
        document.getElementById('loadingContainer').style.display = 'none';
        exportBtn.disabled = false;
      } catch (error) {
        showError(`シフト表の生成に失敗しました: ${error.message}`);
        document.getElementById('loadingContainer').style.display = 'none';
      }
    }, 100);
  });

  if (pairReloadBtn) {
    pairReloadBtn.addEventListener('click', () => {
      loadNightPairMatrix();
    });
  }
  if (pairUpdateBtn) {
    pairUpdateBtn.addEventListener('click', () => {
      saveNightPairMatrix();
    });
  }
  if (pairClearBtn) {
    pairClearBtn.addEventListener('click', () => {
      clearNightPairMatrix();
    });
  }

  // CSVでエクスポート
  exportBtn.addEventListener('click', () => {
    exportAllDrafts();
  });
});
