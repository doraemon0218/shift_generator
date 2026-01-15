const DEADLINE_KEY = 'shift_deadline';
const STORAGE_KEY_PREFIX = 'shift_request_';
const SUBMITTED_KEY_PREFIX = 'shift_submitted_';
const ADMIN_USERS_KEY = 'admin_users';
const MIXING_MATRIX_KEY = 'mixing_matrix';

const SHIFT_CAPABILITIES = {
  NIGHT: 'night',
  LATE: 'late',
  DAY: 'day'
};

let isReadOnlyAdminView = false;

function normalizeMixingSymbol(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (['○', '◯', 'o', 'O'].includes(text)) return 'ok';
  if (['△', '▲'].includes(text)) return 'avoid';
  if (['×', 'x', 'X'].includes(text)) return 'block';
  return null;
}

function mergeMixingStatus(current, next) {
  const rank = { ok: 1, avoid: 2, block: 3 };
  if (!current) return next;
  if (!next) return current;
  return rank[next] > rank[current] ? next : current;
}

function parseMixingMatrix(table) {
  if (!Array.isArray(table) || table.length < 2) {
    throw new Error('シートにデータがありません');
  }

  const headerRow = table[0].map(cell => String(cell || '').trim());
  const pairs = {};
  const names = [];

  for (let i = 1; i < table.length; i++) {
    const row = table[i];
    const rowName = String(row?.[0] || '').trim();
    if (!rowName) continue;
    if (!pairs[rowName]) pairs[rowName] = {};
    names.push(rowName);

    for (let j = 1; j < headerRow.length; j++) {
      const colName = String(headerRow[j] || '').trim();
      if (!colName) continue;
      const status = normalizeMixingSymbol(row?.[j]);
      if (!status) continue;

      pairs[rowName][colName] = mergeMixingStatus(pairs[rowName][colName], status);
      if (!pairs[colName]) pairs[colName] = {};
      pairs[colName][rowName] = mergeMixingStatus(pairs[colName][rowName], status);
    }
  }

  if (names.length === 0) {
    throw new Error('職員名が読み取れません');
  }

  return { names, pairs };
}

function updateMixingMatrixStatus() {
  const statusEl = document.getElementById('mixingMatrixStatus');
  if (!statusEl) return;
  const stored = localStorage.getItem(MIXING_MATRIX_KEY);
  if (!stored) {
    statusEl.textContent = '未登録';
    return;
  }
  try {
    const data = JSON.parse(stored);
    const count = data?.names?.length || 0;
    statusEl.textContent = count > 0 ? `登録済み（${count}名）` : '登録済み';
  } catch (error) {
    statusEl.textContent = '登録データの読み込みに失敗しました';
  }
}

function uploadMixingMatrix() {
  const input = document.getElementById('mixingMatrixInput');
  if (!input || !input.files || input.files.length === 0) {
    alert('Excelファイルを選択してください');
    return;
  }

  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const table = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
      const parsed = parseMixingMatrix(table);
      localStorage.setItem(MIXING_MATRIX_KEY, JSON.stringify(parsed));
      updateMixingMatrixStatus();
      alert(`混ぜるな危険の対戦表を保存しました（${parsed.names.length}名）`);
    } catch (error) {
      console.error(error);
      alert(`対戦表の読み込みに失敗しました: ${error.message}`);
    }
  };
  reader.onerror = () => {
    alert('ファイルの読み込みに失敗しました');
  };
  reader.readAsArrayBuffer(file);
}

function normalizeShiftCapability(value) {
  if (value === SHIFT_CAPABILITIES.NIGHT || value === SHIFT_CAPABILITIES.LATE || value === SHIFT_CAPABILITIES.DAY) {
    return value;
  }
  if (value === true) return SHIFT_CAPABILITIES.NIGHT;
  if (value === false) return SHIFT_CAPABILITIES.LATE;
  return null;
}

function getShiftCapabilityLabel(capability) {
  if (capability === SHIFT_CAPABILITIES.NIGHT) return '夜勤をする';
  if (capability === SHIFT_CAPABILITIES.LATE) return '夜勤はしない（遅出まで）';
  if (capability === SHIFT_CAPABILITIES.DAY) return '遅出も夜勤もしない';
  return '未設定（管理者）';
}

const VALUE_PREFERENCE_OPTIONS = {
  'go-out': {
    label: '夜勤明けは、遊びに行きたい',
    icon: '🎢',
    description: '夜勤明けでもアクティブに過ごしたい。イベントやお出かけの予定を入れたいタイプです。'
  },
  'relax-home': {
    label: '夜勤明けは、家でゆっくりしたい',
    icon: '🛋️',
    description: '夜勤明けは自宅でゆっくり休みたい。無理せず体力回復を優先するスタイルです。'
  },
  'chain-holiday': {
    label: '夜勤明けの翌日は、公休で休みをつなぎたい',
    icon: '🌙➡️🛌',
    description: '夜勤明けから連続して休みがあると嬉しい。しっかりと体力を回復させたい派です。'
  },
  'no-holiday': {
    label: '夜勤明けの翌日は、むしろ公休を入れないでほしい',
    icon: '💪',
    description: '夜勤明け後は通常勤務に戻したい。連続休みよりリズムを崩さず働きたいタイプです。'
  }
};

function getUserDirectory() {
  const USER_STORAGE_KEY = 'shift_system_users';
  const stored = localStorage.getItem(USER_STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
}

// 管理者ユーザーを取得
function getAdminUsers() {
  const stored = localStorage.getItem(ADMIN_USERS_KEY);
  return stored ? JSON.parse(stored) : [];
}

// 管理者ユーザーを保存
function saveAdminUsers(admins) {
  localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(admins));
}

// 管理者を追加
function addAdmin() {
  const emailInput = document.getElementById('adminEmailInput');
  const email = emailInput.value.trim();
  
  if (!email) {
    alert('Gmailアドレスを入力してください');
    return;
  }
  
  if (!email.includes('@')) {
    alert('有効なメールアドレスを入力してください');
    return;
  }
  
  const admins = getAdminUsers();
  if (admins.includes(email)) {
    alert('このメールアドレスは既に管理者として登録されています');
    return;
  }
  
  admins.push(email);
  saveAdminUsers(admins);
  emailInput.value = '';
  loadAdminList();
  alert('管理者を追加しました');
}

// 管理者を削除
function removeAdmin(email) {
  if (!confirm(`管理者から削除しますか？\n${email}`)) {
    return;
  }
  
  const admins = getAdminUsers();
  const filtered = admins.filter(a => a !== email);
  saveAdminUsers(filtered);
  loadAdminList();
  
  // 現在のユーザーが削除された場合、管理者権限を更新
  const currentUser = JSON.parse(localStorage.getItem('current_user'));
  if (currentUser && currentUser.email === email) {
    currentUser.isAdmin = false;
    localStorage.setItem('current_user', JSON.stringify(currentUser));
  }
}

// 管理者リストを表示
function loadAdminList() {
  const admins = getAdminUsers();
  const container = document.getElementById('adminList');
  
  if (admins.length === 0) {
    container.innerHTML = '<p style="color: #666;">管理者が設定されていません</p>';
    return;
  }
  
  container.innerHTML = `
    <div style="background: white; border: 1px solid #ddd; border-radius: 6px; padding: 12px;">
      <strong style="display: block; margin-bottom: 8px;">登録されている管理者:</strong>
      ${admins.map(email => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee;">
          <span>${email}</span>
          ${isReadOnlyAdminView ? '' : `
            <button onclick="removeAdmin('${email}')" style="padding: 4px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">削除</button>
          `}
        </div>
      `).join('')}
    </div>
  `;
}

// 看護師の夜勤設定を読み込み
function loadNurseNightShiftSettings() {
  const allKeys = Object.keys(localStorage);
  const requestKeys = allKeys.filter(key => key.startsWith(STORAGE_KEY_PREFIX));
  const users = getUserDirectory();
  
  const nurseMap = new Map();
  
  requestKeys.forEach(key => {
    const userKey = key.replace(STORAGE_KEY_PREFIX, '');
    const dataStr = localStorage.getItem(key);
    if (!dataStr) return;

    let data;
    try {
      data = JSON.parse(dataStr);
    } catch (error) {
      console.error('Failed to parse shift request data', error);
      return;
    }

    const userInfo = users[userKey] || {};
    const hireYear = typeof userInfo.hireYear === 'number' ? userInfo.hireYear : null;
    const initialShiftCapability = normalizeShiftCapability(userInfo.initialShiftCapability)
      ?? normalizeShiftCapability(userInfo.initialNightShift);

    const storedCapability = normalizeShiftCapability(data.shiftCapability)
      ?? normalizeShiftCapability(data.doesNightShift);

    if (!storedCapability && initialShiftCapability) {
      data.shiftCapability = initialShiftCapability;
      data.doesNightShift = initialShiftCapability === SHIFT_CAPABILITIES.NIGHT;
      localStorage.setItem(key, JSON.stringify(data));
    }

    const nameFromData = data.nurseName || userInfo.fullName || userKey;
    const adminShiftCapability = storedCapability ?? null;
    const effectiveShiftCapability = adminShiftCapability !== null ? adminShiftCapability : initialShiftCapability;

    nurseMap.set(userKey, {
      name: nameFromData,
      userKey,
      adminShiftCapability,
      effectiveShiftCapability,
      initialShiftCapability,
      hireYear
    });
  });
  
  Object.keys(users).forEach(userKey => {
    if (nurseMap.has(userKey)) return;
    const user = users[userKey];
    const hireYear = typeof user?.hireYear === 'number' ? user.hireYear : null;
    const initialShiftCapability = normalizeShiftCapability(user?.initialShiftCapability)
      ?? normalizeShiftCapability(user?.initialNightShift);

    nurseMap.set(userKey, {
      name: user.fullName || userKey,
      userKey,
      adminShiftCapability: null,
      effectiveShiftCapability: initialShiftCapability,
      initialShiftCapability,
      hireYear
    });
  });
  
  const nurseList = Array.from(nurseMap.values()).sort((a, b) => {
    const yearA = a.hireYear ?? Number.MAX_SAFE_INTEGER;
    const yearB = b.hireYear ?? Number.MAX_SAFE_INTEGER;
    if (yearA !== yearB) return yearA - yearB;
    return a.name.localeCompare(b.name, 'ja');
  });
  
  const container = document.getElementById('nightShiftSettings');
  if (!container) return;
  
  if (nurseList.length === 0) {
    container.innerHTML = '<p style="color: #666;">看護師データがありません</p>';
    return;
  }
  
  container.innerHTML = `
    <div style="background: white; border: 1px solid #ddd; border-radius: 6px; padding: 16px; overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; min-width: 640px;">
        <thead>
          <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
            <th style="padding: 12px; text-align: left;">入職年</th>
            <th style="padding: 12px; text-align: left;">看護師名</th>
            <th style="padding: 12px; text-align: left;">夜勤設定</th>
            <th style="padding: 12px; text-align: left;">操作</th>
          </tr>
        </thead>
        <tbody>
          ${nurseList.map(nurse => {
            const yearLabel = nurse.hireYear ? `${nurse.hireYear}年` : '未登録';
            const adminSetting = nurse.adminShiftCapability;
            let statusLabel;
            let statusColor;
            if (adminSetting) {
              statusLabel = `${getShiftCapabilityLabel(adminSetting)}（管理者設定）`;
              statusColor = '#28a745';
            } else {
              statusLabel = '未設定（管理者）';
              statusColor = '#ff9800';
            }
            const initialLabel = nurse.initialShiftCapability
              ? `本人申告: ${getShiftCapabilityLabel(nurse.initialShiftCapability)}`
              : '本人申告: 未回答';
            const additionalNote = (adminSetting === null && nurse.initialShiftCapability)
              ? '※ 現在は本人申告値が初期値として利用されています'
              : '';

            return `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px; white-space: nowrap;">${yearLabel}</td>
                <td style="padding: 12px;">${nurse.name}</td>
                <td style="padding: 12px;">
                  <span id="nightShiftStatus_${nurse.userKey}" style="color: ${statusColor}; font-weight: 600;">
                    ${statusLabel}
                  </span>
                  <div style="font-size: 12px; color: #666; margin-top: 4px;">
                    ${initialLabel}${additionalNote ? `<br>${additionalNote}` : ''}
                  </div>
                </td>
                <td style="padding: 12px;">
                  ${isReadOnlyAdminView ? '<span style="color: #999;">閲覧のみ</span>' : `
                  <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    <button onclick="setNurseShiftCapability('${nurse.userKey}', '${SHIFT_CAPABILITIES.NIGHT}')" 
                            style="padding: 6px 12px; background: #4a90e2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                      夜勤可
                    </button>
                    <button onclick="setNurseShiftCapability('${nurse.userKey}', '${SHIFT_CAPABILITIES.LATE}')" 
                            style="padding: 6px 12px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                      夜勤不可（遅出まで）
                    </button>
                    <button onclick="setNurseShiftCapability('${nurse.userKey}', '${SHIFT_CAPABILITIES.DAY}')" 
                            style="padding: 6px 12px; background: #5e35b1; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                      遅出・夜勤不可
                    </button>
                    <button onclick="setNurseShiftCapability('${nurse.userKey}', null)" 
                            style="padding: 6px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                      未設定
                    </button>
                    <button onclick="deleteNurseData('${nurse.userKey}')" 
                            style="padding: 6px 12px; background: #b71c1c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                      登録データ削除
                    </button>
                  </div>
                  `}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function loadValuePreferences() {
  const container = document.getElementById('valuePreferenceList');
  if (!container) return;

  const users = getUserDirectory();
  const allKeys = Object.keys(localStorage);
  const requestKeys = allKeys.filter(key => key.startsWith(STORAGE_KEY_PREFIX));

  const preferenceMap = new Map();

  requestKeys.forEach(key => {
    const userKey = key.replace(STORAGE_KEY_PREFIX, '');
    const dataStr = localStorage.getItem(key);
    if (!dataStr) return;
    const data = JSON.parse(dataStr);

    const userInfo = users[userKey] || {};
    const preferenceValue = data.preferences && data.preferences.valuePreference ? data.preferences.valuePreference : null;
    const displayName = userInfo.fullName || data.nurseName || userKey;
    const hireYear = typeof userInfo.hireYear === 'number' ? userInfo.hireYear : null;

    preferenceMap.set(userKey, {
      name: displayName,
      preference: preferenceValue,
      hireYear
    });
  });

  Object.keys(users).forEach(userKey => {
    if (!preferenceMap.has(userKey)) {
      const user = users[userKey];
      const hireYear = typeof user?.hireYear === 'number' ? user.hireYear : null;
      preferenceMap.set(userKey, {
        name: user.fullName || userKey,
        preference: null,
        hireYear
      });
    }
  });

  const preferenceList = Array.from(preferenceMap.entries()).map(([userKey, value]) => ({
    userKey,
    ...value
  })).sort((a, b) => {
    const yearA = a.hireYear ?? Number.MAX_SAFE_INTEGER;
    const yearB = b.hireYear ?? Number.MAX_SAFE_INTEGER;
    if (yearA !== yearB) return yearA - yearB;
    return a.name.localeCompare(b.name, 'ja');
  });

  if (preferenceList.length === 0) {
    container.innerHTML = '<p style="color: #666;">価値観のデータがまだありません</p>';
    return;
  }

  container.innerHTML = preferenceList.map(item => {
    const info = item.preference ? VALUE_PREFERENCE_OPTIONS[item.preference] : null;
    const hireYearLabel = item.hireYear ? `${item.hireYear}年入職` : '入職年: 未登録';
    if (!info) {
      return `
        <div class="value-card value-empty">
          <div class="value-emoji">📝</div>
          <div>
            <div class="value-name">${item.name}</div>
            <div class="value-desc">価値観はまだ設定されていません</div>
            <div class="value-meta">${hireYearLabel}</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="value-card">
        <div class="value-emoji">${info.icon}</div>
        <div>
          <div class="value-name">${item.name}</div>
          <div class="value-label">${info.label}</div>
          <div class="value-desc">${info.description}</div>
          <div class="value-meta">${hireYearLabel}</div>
        </div>
      </div>
    `;
  }).join('');
}

// 看護師の勤務対応設定を変更
function setNurseShiftCapability(userKey, shiftCapability) {
  const storageKey = STORAGE_KEY_PREFIX + userKey;
  const dataStr = localStorage.getItem(storageKey);
  
  let data;
  if (dataStr) {
    data = JSON.parse(dataStr);
  } else {
    // ユーザー情報から名前を取得
    const users = getUserDirectory();
    const user = users[userKey];
    
    data = {
      nurseName: user ? user.fullName : userKey,
      userKey: userKey,
      requests: {},
      note: '',
      submitted: false,
      submittedAt: null,
      shiftCapability: null,
      doesNightShift: null,
      preferences: {
        valuePreference: null
      }
    };
  }

  const resolvedCapability = normalizeShiftCapability(shiftCapability);
  data.shiftCapability = resolvedCapability;
  data.doesNightShift = resolvedCapability === SHIFT_CAPABILITIES.NIGHT;
  localStorage.setItem(storageKey, JSON.stringify(data));
  
  // 表示を更新
  loadNurseNightShiftSettings();
  loadValuePreferences();
  alert('勤務対応設定を更新しました');
}

// 看護師の登録データを削除
function deleteNurseData(userKey) {
  const users = getUserDirectory();
  const user = users[userKey];
  const displayName = user?.fullName || userKey;
  if (!confirm(`「${displayName}」の登録データを削除しますか？\nシフト希望・提出状況・価値観などがリセットされます。`)) {
    return;
  }

  const storageKey = STORAGE_KEY_PREFIX + userKey;
  const submittedKey = SUBMITTED_KEY_PREFIX + userKey;
  localStorage.removeItem(storageKey);
  localStorage.removeItem(submittedKey);

  if (user && user.email) {
    const email = user.email;
    const notificationPrefix = `notification_sent_${email}_`;
    const keysToDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(notificationPrefix)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => localStorage.removeItem(key));
  }

  alert('登録データを削除しました');
  loadNurseNightShiftSettings();
  loadSubmissionStatus();
  loadValuePreferences();
}

// ページ読み込み時に実行
document.addEventListener('DOMContentLoaded', () => {
  // ログイン状態と管理者権限を確認
  const currentUser = localStorage.getItem('current_user');
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }
  
  const user = JSON.parse(currentUser);
  isReadOnlyAdminView = !user.isAdmin;
  if (isReadOnlyAdminView) {
    const notice = document.getElementById('readOnlyNotice');
    if (notice) notice.style.display = 'block';
    document.body.classList.add('read-only');
    document.querySelectorAll('.admin-action').forEach(el => {
      el.setAttribute('disabled', 'true');
      el.classList.add('disabled');
    });
  }
  
  updateDeadlineDisplay();
  loadSubmissionStatus();
  loadAdminList();
  loadNurseNightShiftSettings();
  loadValuePreferences();
  updateMixingMatrixStatus();
});

// 毎月15日23:59に設定
function setDeadlineMonthly() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  // 今月の15日23:59
  let deadline = new Date(year, month, 15, 23, 59, 59);
  
  // 既に15日を過ぎている場合は来月の15日
  if (now > deadline) {
    deadline = new Date(year, month + 1, 15, 23, 59, 59);
  }
  
  document.getElementById('deadlineInput').value = formatDateTimeLocal(deadline);
  setDeadline();
}

// 締め切りを設定
function setDeadline() {
  const input = document.getElementById('deadlineInput');
  const deadlineStr = input.value;
  
  if (!deadlineStr) {
    alert('日時を入力してください');
    return;
  }
  
  const deadline = new Date(deadlineStr);
  localStorage.setItem(DEADLINE_KEY, deadline.toISOString());
  updateDeadlineDisplay();
  alert('締め切りを設定しました');
}

// 締め切りをクリア
function clearDeadline() {
  if (!confirm('締め切りをクリアしますか？')) {
    return;
  }
  localStorage.removeItem(DEADLINE_KEY);
  document.getElementById('deadlineInput').value = '';
  updateDeadlineDisplay();
  alert('締め切りをクリアしました');
}

// 締め切り表示を更新
function updateDeadlineDisplay() {
  const display = document.getElementById('deadlineDisplay');
  const deadlineStr = localStorage.getItem(DEADLINE_KEY);
  
  if (!deadlineStr) {
    display.style.display = 'none';
    return;
  }
  
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diff = deadline - now;
  
  display.style.display = 'block';
  
  if (diff > 0) {
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    display.className = 'deadline-display';
    if (days <= 1) {
      display.className = 'deadline-display warning';
    }
    
    display.innerHTML = `
      <strong>現在の締め切り:</strong> ${deadline.toLocaleString('ja-JP')}<br>
      <strong>残り時間:</strong> ${days}日${hours}時間
    `;
  } else {
    display.className = 'deadline-display passed';
    display.innerHTML = `
      <strong>締め切り:</strong> ${deadline.toLocaleString('ja-JP')}<br>
      <strong>ステータス:</strong> 締め切り済み
    `;
  }
  
  // 入力欄にも表示
  document.getElementById('deadlineInput').value = formatDateTimeLocal(deadline);
}

// 日時をdatetime-local形式に変換
function formatDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// 提出状況を読み込み
function loadSubmissionStatus() {
  const allKeys = Object.keys(localStorage);
  const requestKeys = allKeys.filter(key => key.startsWith(STORAGE_KEY_PREFIX));
  const users = getUserDirectory();

  const nurseMap = new Map();

  requestKeys.forEach(key => {
    const userKey = key.replace(STORAGE_KEY_PREFIX, '');
    const submittedKey = SUBMITTED_KEY_PREFIX + userKey;
    const isSubmitted = localStorage.getItem(submittedKey) === 'true';

    const userInfo = users[userKey] || {};
    const displayName = userInfo.fullName || userKey;
    const hireYear = typeof userInfo.hireYear === 'number' ? userInfo.hireYear : null;

    nurseMap.set(userKey, {
      name: displayName,
      userKey,
      submitted: isSubmitted,
      hireYear
    });
  });

  Object.keys(users).forEach(userKey => {
    if (nurseMap.has(userKey)) return;
    const user = users[userKey];
    const hireYear = typeof user?.hireYear === 'number' ? user.hireYear : null;
    nurseMap.set(userKey, {
      name: user.fullName || userKey,
      userKey,
      submitted: false,
      hireYear
    });
  });

  const nurseList = Array.from(nurseMap.values()).sort((a, b) => {
    const yearA = a.hireYear ?? Number.MAX_SAFE_INTEGER;
    const yearB = b.hireYear ?? Number.MAX_SAFE_INTEGER;
    if (yearA !== yearB) return yearA - yearB;
    return a.name.localeCompare(b.name, 'ja');
  });

  const submitted = nurseList.filter(item => item.submitted).length;
  const total = nurseList.length;
  const notSubmitted = total - submitted;

  const statusGrid = document.getElementById('statusGrid');
  if (statusGrid) {
    statusGrid.style.display = 'grid';
    statusGrid.innerHTML = `
      <div class="status-card">
        <div class="status-label">総看護師数</div>
        <div class="status-value">${total}</div>
      </div>
      <div class="status-card success">
        <div class="status-label">提出済み</div>
        <div class="status-value">${submitted}</div>
      </div>
      <div class="status-card warning">
        <div class="status-label">未提出</div>
        <div class="status-value">${notSubmitted}</div>
      </div>
      <div class="status-card">
        <div class="status-label">提出率</div>
        <div class="status-value">${total > 0 ? Math.round((submitted / total) * 100) : 0}%</div>
      </div>
    `;
  }

  const nurseListContainer = document.getElementById('nurseList');
  if (nurseListContainer) {
    if (nurseList.length > 0) {
      nurseListContainer.style.display = 'block';
      nurseListContainer.innerHTML = nurseList.map(nurse => {
        const hireYearLabel = nurse.hireYear ? `${nurse.hireYear}年入職` : '入職年未登録';
        return `
          <div class="nurse-item">
            <span>${hireYearLabel}｜${nurse.name}</span>
            <span class="badge ${nurse.submitted ? 'badge-success' : 'badge-warning'}">
              ${nurse.submitted ? '提出済み' : '未提出'}
            </span>
          </div>
        `;
      }).join('');
    } else {
      nurseListContainer.style.display = 'none';
    }
  }
}

// 全希望データをCSVでエクスポート
function exportAllRequests() {
  const allKeys = Object.keys(localStorage);
  const requestKeys = allKeys.filter(key => key.startsWith(STORAGE_KEY_PREFIX));

  if (requestKeys.length === 0) {
    alert('エクスポートするデータがありません');
    return;
  }

  const dates = [];
  for (let i = 1; i <= 31; i++) {
    dates.push(`8/${i}`);
  }

  const users = getUserDirectory();

  const header = ['氏名', 'シフト希望期間', '価値観', '備考', ...dates];
  const rows = [header];

  requestKeys.forEach(key => {
    const userKey = key.replace(STORAGE_KEY_PREFIX, '');
    const dataStr = localStorage.getItem(key);
    if (!dataStr) return;

    const data = JSON.parse(dataStr);

    const displayName = data.nurseName || users[userKey]?.fullName || userKey;
    const preferenceValue = data.preferences && data.preferences.valuePreference ? data.preferences.valuePreference : null;
    const preferenceInfo = preferenceValue ? VALUE_PREFERENCE_OPTIONS[preferenceValue] : null;
    const preferenceLabel = preferenceInfo ? `${preferenceInfo.icon} ${preferenceInfo.label}` : '';

    const row = [
      displayName,
      '2025年8月1日〜8月31日',
      preferenceLabel,
      data.note || ''
    ];

    dates.forEach(date => {
      const request = data.requests[date];
      let value = '';

      if (request === 'available') {
        value = '休み希望なし（勤務可能）';
      } else if (request === 'day-only') {
        value = '日勤のみ可能（遅出・夜勤不可）';
      } else if (request === 'day-late') {
        value = '日勤＋遅出までなら可能（夜勤不可）';
      } else if (request === 'night-only') {
        value = '夜勤のみ可能（日勤・遅出不可）';
      } else if (request === 'paid-leave') {
        value = '公休希望(有給休暇を含む)';
      } else if (request === 'no-day') {
        value = '夜勤のみ可能（日勤・遅出不可）';
      } else if (request === 'no-night') {
        value = '日勤＋遅出までなら可能（夜勤不可）';
      } else if (request === 'no-all') {
        value = '公休希望(有給休暇を含む)';
      } else if (request === 'no-all-but-night-before') {
        value = '夜勤のみ可能（日勤・遅出不可）';
      }

      row.push(value);
    });

    rows.push(row);
  });

  const csvContent = rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `shift_requests_export_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();

  const statusDiv = document.getElementById('exportStatus');
  if (statusDiv) {
    statusDiv.innerHTML = `<div style="color: #28a745; padding: 8px; background: #d4edda; border-radius: 4px;">
      ✅ ${requestKeys.length}名の希望データをエクスポートしました
    </div>`;

    setTimeout(() => {
      statusDiv.innerHTML = '';
    }, 3000);
  }
}

// EOF


