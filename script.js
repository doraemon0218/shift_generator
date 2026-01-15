// グローバル変数
let requestData = [];
let shiftSchedule = [];
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

// 看護師データを解析
function parseNurseData(rows) {
  const nurses = [];
  dateColumns = getDateColumns(rows);

  rows.forEach(row => {
    const nurse = {
      name: row['氏名'] || '',
      note: row['備考'] || '',
      requests: {}
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
      } else if (request.includes('休み希望なし') || request.includes('勤務可能')) {
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

function normalizeName(value) {
  return String(value || '').trim();
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

function isNightPairBlocked(candidateName, selectedNames) {
  return selectedNames.some(name => getMixingStatus(candidateName, name) === 'block');
}

function isNightPairAvoid(candidateName, selectedNames) {
  return selectedNames.some(name => getMixingStatus(candidateName, name) === 'avoid');
}

// 看護師のスコアを計算（公平性の指標）
function calculateNurseScore(nurse, schedule, targetWorkDays) {
  const stats = getNurseStats(nurse.name, schedule);
  
  // 勤務日数の偏差（目標値からの差）
  const workDayDiff = Math.abs(stats.workDays - targetWorkDays);
  
  // 希望違反の回数
  const violationCount = stats.violations;
  
  // 全看護師の週末休日の平均を計算
  const allNurseStats = nurses.map(n => getNurseStats(n.name, schedule));
  const avgWeekendOff = allNurseStats.reduce((sum, s) => sum + s.weekendOffDays, 0) / allNurseStats.length;
  const weekendOffDiff = Math.abs(stats.weekendOffDays - avgWeekendOff);
  
  // 夜勤回数の偏差（夜勤可能な人の中で）
  const nightEligible = nurses.filter(n => 
    Object.values(n.requests).some(r => r !== REQUEST_TYPES.DAY_ONLY && r !== REQUEST_TYPES.DAY_LATE && r !== REQUEST_TYPES.PAID_LEAVE)
  );
  if (nightEligible.length > 0) {
    const nightEligibleStats = nightEligible.map(n => getNurseStats(n.name, schedule));
    const avgNightShifts = nightEligibleStats.reduce((sum, s) => sum + s.nightShifts, 0) / nightEligibleStats.length;
    const nightDiff = Math.abs(stats.nightShifts - avgNightShifts);
    
    return workDayDiff * 10 + violationCount * 100 + weekendOffDiff * 5 + nightDiff * 3;
  }
  
  return workDayDiff * 10 + violationCount * 100 + weekendOffDiff * 5;
}

// 看護師の統計を取得
function getNurseStats(nurseName, schedule) {
  let workDays = 0;
  let nightShifts = 0;
  let weekendOffDays = 0;
  let violations = 0;

  schedule.forEach(day => {
    const assignment = day.nurses.find(n => n.name === nurseName);
    if (assignment) {
      if (assignment.shift !== SHIFT_TYPES.OFF) {
        workDays++;
        if (assignment.shift === SHIFT_TYPES.NIGHT) {
          nightShifts++;
        }
      } else if (isWeekend(day.date) && !assignment.isDayOffAfterNight) {
        // 明け休みは週末休日にカウントしない
        weekendOffDays++;
      }
      
      if (assignment.violation) {
        violations++;
      }
    }
  });

  return { workDays, nightShifts, weekendOffDays, violations };
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

// 夜勤をしない人かどうか判定（希望データから判断）
function isNightShiftEligible(nurse) {
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

// シフト表を生成
function generateShiftSchedule(nurses, dayShiftRequired, nightShiftRequired, targetWorkDays) {
  const schedule = [];
  
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
  const sortedNurses = [...nurses].sort((a, b) => {
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
    
    // 日勤を割り当て
    const dayShiftCandidates = available
      .filter(n => {
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
      .sort((a, b) => {
        const aStats = getNurseStats(a.name, currentSchedule);
        const bStats = getNurseStats(b.name, currentSchedule);
        // 勤務日数が少ない人、希望違反が少ない人を優先
        if (aStats.workDays !== bStats.workDays) {
          return aStats.workDays - bStats.workDays;
        }
        return aStats.violations - bStats.violations;
      });
    
    for (let i = 0; i < dayShiftRequired && i < dayShiftCandidates.length; i++) {
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
    const nightShiftCandidates = availableForNight
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
      .sort((a, b) => {
        const aStats = getNurseStats(a.name, currentSchedule);
        const bStats = getNurseStats(b.name, currentSchedule);
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
      
      // 夜勤の翌日は明け休み（休日にカウントされない）
      if (dayIndex < dateColumns.length - 1) {
        const nextDate = dateColumns[dayIndex + 1];
        const nextDay = schedule.find(d => d.date === nextDate);
        if (nextDay) {
          const existingAssignment = nextDay.nurses.find(n => n.name === nurse.name);
          if (!existingAssignment) {
            nextDay.nurses.push({
              name: nurse.name,
              shift: SHIFT_TYPES.OFF,
              violation: false,
              isDayOffAfterNight: true // 明け休みフラグ
            });
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
        const currentScore = calculateNurseScore(nurse, schedule, targetWorkDays);
        
        // 他の看護師と交換可能かチェック
        day.nurses.forEach((other, otherIdx) => {
          if (idx === otherIdx) return;
          const otherNurse = nurses.find(n => n.name === other.name);
          if (!otherNurse) return;

          // 交換して違反がないか確認
          const canSwap = !checkViolation(nurse, day.date, other.shift) &&
                         !checkViolation(otherNurse, day.date, assignment.shift) &&
                         assignment.shift !== other.shift;

          if (canSwap) {
            // 一時的に交換
            const temp = assignment.shift;
            assignment.shift = other.shift;
            other.shift = temp;

            const newScore = calculateNurseScore(nurse, schedule, targetWorkDays);
            const otherNewScore = calculateNurseScore(otherNurse, schedule, targetWorkDays);
            const otherCurrentScore = calculateNurseScore(otherNurse, schedule, targetWorkDays);

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
function renderShiftTable(schedule) {
  const table = document.getElementById('shiftTable');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

  thead.innerHTML = '';
  tbody.innerHTML = '';

  // ヘッダー作成
  const headerRow = document.createElement('tr');
  const nameHeader = document.createElement('th');
  nameHeader.textContent = '看護師名';
  headerRow.appendChild(nameHeader);

  dateColumns.forEach(date => {
    const th = document.createElement('th');
    th.textContent = date;
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
        } else if (assignment.shift === SHIFT_TYPES.NIGHT) {
          td.classList.add('night-shift');
        } else {
          td.classList.add('off-day');
        }
        if (assignment.violation) {
          td.classList.add('violation');
          td.title = '希望に違反しています';
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
}

// 統計情報を表示
function renderStats(schedule, targetWorkDays) {
  const statsContainer = document.getElementById('stats');
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

// CSVでエクスポート
function exportToCSV(schedule) {
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
  link.download = `shift_schedule_2025_08.csv`;
  link.click();
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

    generateBtn.disabled = false;
    alert(`データを読み込みました。看護師数: ${nurses.length}名、期間: ${dateColumns.length}日`);
  });

  // シフト表を生成
  generateBtn.addEventListener('click', () => {
    clearError();
    const dayShiftRequired = parseInt(document.getElementById('dayShiftRequired').value) || 3;
    const nightShiftRequired = parseInt(document.getElementById('nightShiftRequired').value) || 2;
    const targetWorkDays = parseInt(document.getElementById('targetWorkDays').value) || 20;

    if (nurses.length === 0) {
      showError('まずデータを読み込んでください');
      return;
    }

    loadMixingMatrix();
    document.getElementById('loadingContainer').style.display = 'block';
    document.getElementById('tableContainer').style.display = 'none';
    document.getElementById('statsContainer').style.display = 'none';
    document.getElementById('legendContainer').style.display = 'none';

    // 非同期で処理（UIブロックを防ぐ）
    setTimeout(() => {
      try {
        shiftSchedule = generateShiftSchedule(nurses, dayShiftRequired, nightShiftRequired, targetWorkDays);
        renderShiftTable(shiftSchedule);
        renderStats(shiftSchedule, targetWorkDays);
        
        document.getElementById('tableContainer').style.display = 'block';
        document.getElementById('statsContainer').style.display = 'block';
        document.getElementById('legendContainer').style.display = 'block';
        document.getElementById('loadingContainer').style.display = 'none';
        exportBtn.disabled = false;
      } catch (error) {
        showError(`シフト表の生成に失敗しました: ${error.message}`);
        document.getElementById('loadingContainer').style.display = 'none';
      }
    }, 100);
  });

  // CSVでエクスポート
  exportBtn.addEventListener('click', () => {
    if (shiftSchedule.length === 0) {
      showError('シフト表が生成されていません');
      return;
    }
    exportToCSV(shiftSchedule);
  });
});
