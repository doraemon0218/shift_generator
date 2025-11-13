const DEADLINE_KEY = 'shift_deadline';
const STORAGE_KEY_PREFIX = 'shift_request_';
const SUBMITTED_KEY_PREFIX = 'shift_submitted_';
const ADMIN_USERS_KEY = 'admin_users';

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
          <button onclick="removeAdmin('${email}')" style="padding: 4px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">削除</button>
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
  
  const nurseList = [];
  
  requestKeys.forEach(key => {
    const userKey = key.replace(STORAGE_KEY_PREFIX, '');
    const dataStr = localStorage.getItem(key);
    
    if (!dataStr) return;
    
    const data = JSON.parse(dataStr);
    
    // ユーザー情報から名前を取得
    let displayName = data.nurseName || userKey;
    if (users[userKey]) {
      displayName = users[userKey].fullName || displayName;
    }
    
    nurseList.push({
      name: displayName,
      userKey: userKey,
      doesNightShift: data.doesNightShift !== undefined ? data.doesNightShift : null
    });
  });
  
  // ユーザー情報から追加の看護師を取得
  Object.keys(users).forEach(userKey => {
    if (!nurseList.find(n => n.userKey === userKey)) {
      const user = users[userKey];
      nurseList.push({
        name: user.fullName || userKey,
        userKey: userKey,
        doesNightShift: null
      });
    }
  });
  
  const container = document.getElementById('nightShiftSettings');
  if (!container) return;
  
  if (nurseList.length === 0) {
    container.innerHTML = '<p style="color: #666;">看護師データがありません</p>';
    return;
  }
  
  container.innerHTML = `
    <div style="background: white; border: 1px solid #ddd; border-radius: 6px; padding: 16px;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
            <th style="padding: 12px; text-align: left;">看護師名</th>
            <th style="padding: 12px; text-align: left;">夜勤設定</th>
            <th style="padding: 12px; text-align: left;">操作</th>
          </tr>
        </thead>
        <tbody>
          ${nurseList.map(nurse => `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 12px;">${nurse.name}</td>
              <td style="padding: 12px;">
                <span id="nightShiftStatus_${nurse.userKey}" style="color: ${nurse.doesNightShift === null ? '#dc3545' : '#28a745'}; font-weight: 600;">
                  ${nurse.doesNightShift === null ? '未設定' : nurse.doesNightShift ? '夜勤をします' : '夜勤はしません'}
                </span>
              </td>
              <td style="padding: 12px;">
                <button onclick="setNurseNightShift('${nurse.userKey}', true)" 
                        style="padding: 6px 12px; background: #4a90e2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 4px;">
                  夜勤ON
                </button>
                <button onclick="setNurseNightShift('${nurse.userKey}', false)" 
                        style="padding: 6px 12px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 4px;">
                  夜勤OFF
                </button>
                <button onclick="setNurseNightShift('${nurse.userKey}', null)" 
                        style="padding: 6px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                  未設定
                </button>
              </td>
            </tr>
          `).join('')}
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

  const preferenceMap = {};

  requestKeys.forEach(key => {
    const userKey = key.replace(STORAGE_KEY_PREFIX, '');
    const dataStr = localStorage.getItem(key);
    if (!dataStr) return;
    const data = JSON.parse(dataStr);

    const preferenceValue = data.preferences && data.preferences.valuePreference ? data.preferences.valuePreference : null;
    const displayName = users[userKey]?.fullName || data.nurseName || userKey;

    preferenceMap[userKey] = {
      name: displayName,
      preference: preferenceValue
    };
  });

  Object.keys(users).forEach(userKey => {
    if (!preferenceMap[userKey]) {
      const user = users[userKey];
      preferenceMap[userKey] = {
        name: user.fullName || userKey,
        preference: null
      };
    }
  });

  const preferenceList = Object.keys(preferenceMap).map(userKey => ({
    userKey,
    ...preferenceMap[userKey]
  })).sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  if (preferenceList.length === 0) {
    container.innerHTML = '<p style="color: #666;">価値観のデータがまだありません</p>';
    return;
  }

  container.innerHTML = preferenceList.map(item => {
    const info = item.preference ? VALUE_PREFERENCE_OPTIONS[item.preference] : null;
    if (!info) {
      return `
        <div class="value-card value-empty">
          <div class="value-emoji">📝</div>
          <div>
            <div class="value-name">${item.name}</div>
            <div class="value-desc">価値観はまだ設定されていません</div>
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
        </div>
      </div>
    `;
  }).join('');
}

// 看護師の夜勤設定を変更
function setNurseNightShift(userKey, doesNightShift) {
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
      doesNightShift: null,
      preferences: {
        valuePreference: null
      }
    };
  }
  
  data.doesNightShift = doesNightShift;
  localStorage.setItem(storageKey, JSON.stringify(data));
  
  // 表示を更新
  loadNurseNightShiftSettings();
  loadValuePreferences();
  alert('夜勤設定を更新しました');
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
  if (!user.isAdmin) {
    alert('管理者権限が必要です');
    window.location.href = 'top.html';
    return;
  }
  
  updateDeadlineDisplay();
  loadSubmissionStatus();
  loadAdminList();
  loadNurseNightShiftSettings();
  loadValuePreferences();
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

  let submitted = 0;
  let notSubmitted = 0;
  const nurseList = [];

  requestKeys.forEach(key => {
    const userKey = key.replace(STORAGE_KEY_PREFIX, '');
    const submittedKey = SUBMITTED_KEY_PREFIX + userKey;
    const isSubmitted = localStorage.getItem(submittedKey) === 'true';

    const displayName = users[userKey]?.fullName || userKey;

    if (isSubmitted) {
      submitted++;
    } else {
      notSubmitted++;
    }

    nurseList.push({
      name: displayName,
      userKey,
      submitted: isSubmitted
    });
  });

  const total = submitted + notSubmitted;

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
      nurseList.sort((a, b) => {
        if (a.submitted !== b.submitted) {
          return a.submitted ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'ja');
      });

      nurseListContainer.innerHTML = nurseList.map(nurse => `
        <div class="nurse-item">
          <span>${nurse.name}</span>
          <span class="badge ${nurse.submitted ? 'badge-success' : 'badge-warning'}">
            ${nurse.submitted ? '提出済み' : '未提出'}
          </span>
        </div>
      `).join('');
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
      } else if (request === 'no-day') {
        value = '日勤のみ不可';
      } else if (request === 'no-night') {
        value = '夜勤のみ不可';
      } else if (request === 'no-all') {
        value = '終日不可';
      } else if (request === 'no-all-but-night-before') {
        value = '夜勤明けならOK';
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
