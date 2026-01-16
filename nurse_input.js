// グローバル変数
let currentNurse = null;
let currentData = null;
let selectedDate = null;
const STORAGE_KEY_PREFIX = 'shift_request_';
const DEADLINE_KEY = 'shift_deadline';
const SUBMITTED_KEY_PREFIX = 'shift_submitted_';

const SHIFT_CAPABILITIES = {
  NIGHT: 'night',
  LATE: 'late',
  DAY: 'day'
};

// 希望の種類
const REQUEST_TYPES = {
  AVAILABLE: 'available',
  DAY_ONLY: 'day-only',
  DAY_LATE: 'day-late',
  NIGHT_ONLY: 'night-only',
  PAID_LEAVE: 'paid-leave'
};

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

const REQUEST_OPTION_PRESETS = {
  'available': {
    label: '休み希望なし（勤務可能）',
    icon: '✅',
    desc: '日勤・遅出・夜勤どれも対応できます'
  },
  'day-only': {
    label: '日勤のみ可能（遅出・夜勤不可）',
    icon: '🌞',
    desc: '日勤のみ対応できます'
  },
  'day-late': {
    label: '日勤＋遅出までなら可能（夜勤不可）',
    icon: '🌇',
    desc: '日勤・遅出は可能、夜勤は不可です'
  },
  'night-only': {
    label: '夜勤のみ可能（日勤・遅出不可）',
    icon: '🌙',
    desc: '夜勤のみ対応できます'
  },
  'paid-leave': {
    label: '公休希望(有給休暇を含む)',
    icon: '🏖️',
    desc: 'この日は公休希望（有給休暇を含む）です'
  }
};

let quickOptionsContainer = null;
let quickOptionsDate = null;
let quickOptionsHideTimeout = null;
let quickOptionsInitialized = false;
let quickPointer = { x: null, y: null };

function getUserDirectory() {
  const USER_STORAGE_KEY = 'shift_system_users';
  const stored = localStorage.getItem(USER_STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
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
  return '未設定（管理者に連絡してください）';
}

function resolveShiftCapability(data, userInfo) {
  return normalizeShiftCapability(data?.shiftCapability)
    ?? normalizeShiftCapability(data?.doesNightShift)
    ?? normalizeShiftCapability(userInfo?.initialShiftCapability)
    ?? normalizeShiftCapability(userInfo?.initialNightShift)
    ?? null;
}

function normalizeRequestType(value) {
  if (!value) return value;
  const supported = [
    REQUEST_TYPES.AVAILABLE,
    REQUEST_TYPES.DAY_ONLY,
    REQUEST_TYPES.DAY_LATE,
    REQUEST_TYPES.NIGHT_ONLY,
    REQUEST_TYPES.PAID_LEAVE
  ];
  if (supported.includes(value)) return value;

  if (value === 'no-day') return REQUEST_TYPES.NIGHT_ONLY;
  if (value === 'no-night') return REQUEST_TYPES.DAY_LATE;
  if (value === 'no-all') return REQUEST_TYPES.PAID_LEAVE;
  if (value === 'no-all-but-night-before') return REQUEST_TYPES.NIGHT_ONLY;
  if (value === 'available') return REQUEST_TYPES.AVAILABLE;
  return REQUEST_TYPES.AVAILABLE;
}

function isQuickOptionsTarget(target) {
  return Boolean(quickOptionsContainer && target instanceof Node && quickOptionsContainer.contains(target));
}

function isDayCellTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(target.closest('.day-cell'));
}

// 日付の生成（2025年8月）
const dates = [];
for (let i = 1; i <= 31; i++) {
  dates.push(`8/${i}`);
}

// 日付が週末かどうか判定
function isWeekend(dateStr) {
  const [month, day] = dateStr.split('/').map(Number);
  const date = new Date(2025, month - 1, day);
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

// 曜日を取得
function getDayOfWeek(dateStr) {
  const [month, day] = dateStr.split('/').map(Number);
  const date = new Date(2025, month - 1, day);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return days[date.getDay()];
}

// ログイン状態を確認
function checkLoginStatus() {
  const CURRENT_USER_KEY = 'current_user';
  const currentUser = localStorage.getItem(CURRENT_USER_KEY);
  
  if (currentUser) {
    const user = JSON.parse(currentUser);
    currentNurse = user.fullName || `${user.lastName} ${user.firstName}`;
    return true;
  }
  return false;
}

// 自動ログイン
function autoLogin() {
  if (!checkLoginStatus()) {
    window.location.href = 'index.html';
    return;
  }
  
  // データを読み込み
  loadData();
  
  // メインコンテンツを表示
  const mainContent = document.getElementById('mainContent');
  if (mainContent) {
    mainContent.style.display = 'block';
  }
  
  // URLパラメータでページを判定
  const urlParams = new URLSearchParams(window.location.search);
  const page = urlParams.get('page');
  
  if (page === 'settings') {
    // 個人設定ページ
    const mainCalendar = document.getElementById('mainCalendar');
    if (mainCalendar) mainCalendar.style.display = 'block';
    
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.style.display = 'inline-block';
    
    setTimeout(() => {
      openSettingsPage();
    }, 100);
  } else {
    // 通常の希望入力ページ
    showCalendarPage();
  }
}

// カレンダーページを表示
function showCalendarPage() {
  const mainCalendar = document.getElementById('mainCalendar');
  if (mainCalendar) {
    mainCalendar.style.display = 'block';
  }
  
  // 夜勤設定情報を表示
  const nightShiftInfo = document.getElementById('nightShiftInfo');
  const nightShiftStatus = document.getElementById('nightShiftStatus');
  
  if (nightShiftInfo) {
    nightShiftInfo.style.display = 'block';
    const capability = resolveShiftCapability(currentData, null);
    if (nightShiftStatus) {
      nightShiftStatus.textContent = getShiftCapabilityLabel(capability);
      nightShiftStatus.style.color = capability ? '#28a745' : '#dc3545';
    }
  }
  
  // 設定ボタンを表示
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.style.display = 'inline-block';
  }
  
  // 凡例を更新（夜勤をする人の場合のみ夜勤関連の選択肢を表示）
  const legendDayLate = document.getElementById('legendDayLate');
  const legendNightOnly = document.getElementById('legendNightOnly');
  const capability = resolveShiftCapability(currentData, null);
  if (legendDayLate) {
    legendDayLate.style.display = capability === SHIFT_CAPABILITIES.DAY ? 'none' : 'flex';
  }
  if (legendNightOnly) {
    legendNightOnly.style.display = capability ? (capability === SHIFT_CAPABILITIES.NIGHT ? 'flex' : 'none') : 'flex';
  }
  
  // カレンダーを初期化
  initCalendar();
  updateStatus();
  loadSharedRequestsTable();
}

// データの読み込み
function loadData() {
  const CURRENT_USER_KEY = 'current_user';
  const currentUser = localStorage.getItem(CURRENT_USER_KEY);
  let userKey = currentNurse;
  
  if (currentUser) {
    const user = JSON.parse(currentUser);
    userKey = user.userKey || currentNurse;
  }
  
  const storageKey = STORAGE_KEY_PREFIX + userKey;
  const stored = localStorage.getItem(storageKey);
  
  if (stored) {
    currentData = JSON.parse(stored);
  } else {
    // 新規データ
    currentData = {
      nurseName: currentNurse,
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
    saveData();
  }

  const currentUserInfo = currentUser ? JSON.parse(currentUser) : null;
  const resolvedCapability = resolveShiftCapability(currentData, currentUserInfo);
  if (!currentData.shiftCapability && resolvedCapability) {
    currentData.shiftCapability = resolvedCapability;
    currentData.doesNightShift = resolvedCapability === SHIFT_CAPABILITIES.NIGHT;
    saveData();
  }

  if (currentData.requests && typeof currentData.requests === 'object') {
    let normalized = false;
    Object.keys(currentData.requests).forEach(date => {
      const updated = normalizeRequestType(currentData.requests[date]);
      if (updated !== currentData.requests[date]) {
        currentData.requests[date] = updated;
        normalized = true;
      }
    });
    if (normalized) {
      saveData();
    }
  }

  // 提出状態を確認
  if (currentUser) {
    const user = JSON.parse(currentUser);
    const userKeyForSubmit = user.userKey || currentNurse;
    const submittedKey = SUBMITTED_KEY_PREFIX + userKeyForSubmit;
    const isSubmitted = localStorage.getItem(submittedKey) === 'true';
    currentData.submitted = isSubmitted;
  }

  // 設定が未設定の場合は初期化（旧データの互換も考慮）
  if (!currentData.preferences || typeof currentData.preferences !== 'object') {
    currentData.preferences = { valuePreference: null };
    saveData();
  } else {
    if (currentData.preferences.valuePreference === undefined) {
      let inferred = null;
      if (currentData.preferences.consecutiveDaysOffAfterNight) {
        inferred = 'chain-holiday';
      } else if (currentData.preferences.consecutiveDaysOff) {
        inferred = 'chain-holiday';
      } else if (currentData.preferences.distributeDaysOff) {
        inferred = 'relax-home';
      }
      currentData.preferences = { valuePreference: inferred };
      saveData();
    }
  }

  if (currentData.preferences) {
    delete currentData.preferences.consecutiveDaysOffAfterNight;
    delete currentData.preferences.consecutiveDaysOff;
    delete currentData.preferences.distributeDaysOff;
  }

  // UIを更新
  const currentNurseNameEl = document.getElementById('currentNurseName');
  const noteInputEl = document.getElementById('noteInput');

  if (currentNurseNameEl) currentNurseNameEl.textContent = currentNurse;
  if (noteInputEl) noteInputEl.value = currentData.note || '';

  updateValuePreferenceDisplay();
}

// データの保存
function saveData() {
  if (!currentNurse) return;
  
  const CURRENT_USER_KEY = 'current_user';
  const currentUser = localStorage.getItem(CURRENT_USER_KEY);
  let userKey = currentNurse;
  
  if (currentUser) {
    const user = JSON.parse(currentUser);
    userKey = user.userKey || currentNurse;
    currentData.userKey = userKey;
  }
  
  const storageKey = STORAGE_KEY_PREFIX + userKey;
  localStorage.setItem(storageKey, JSON.stringify(currentData));
}

// カレンダーの初期化
function initCalendar() {
  const calendarGrid = document.getElementById('calendarGrid');
  if (!calendarGrid || !currentData) return;

  hideQuickOptions(true);
  calendarGrid.innerHTML = '';

  // 締め切りチェック
  const deadlineStr = localStorage.getItem(DEADLINE_KEY);
  const isDeadlinePassed = deadlineStr ? new Date(deadlineStr) < new Date() : false;
  const isEditable = !currentData.submitted && !isDeadlinePassed;
  
  // 曜日ヘッダー
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  weekdays.forEach((day, index) => {
    const weekdayCell = document.createElement('div');
    weekdayCell.className = 'calendar-weekday';
    if (index === 0 || index === 6) {
      weekdayCell.classList.add('weekend');
    }
    weekdayCell.textContent = day;
    calendarGrid.appendChild(weekdayCell);
  });
  
  // 2025年8月の最初の日を取得
  const firstDay = new Date(2025, 7, 1);
  const firstDayOfWeek = firstDay.getDay();
  
  // 最初の週の空白セル
  for (let i = 0; i < firstDayOfWeek; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'day-cell empty';
    calendarGrid.appendChild(emptyCell);
  }
  
  // 各日のセルを追加
  dates.forEach(date => {
    const dayCell = document.createElement('div');
    dayCell.className = 'day-cell';
    dayCell.dataset.date = date;
    
    const [month, day] = date.split('/').map(Number);
    const dayOfWeek = getDayOfWeek(date);
    
    if (dayOfWeek === '日' || dayOfWeek === '土') {
      dayCell.classList.add('weekend');
    }
    
    // 日付番号
    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = day;
    dayCell.appendChild(dayNumber);
    
    // ラベル
    const dayLabel = document.createElement('div');
    dayLabel.className = 'day-label';
    
    const request = currentData.requests[date];
    if (request) {
      dayCell.classList.add(request);
      dayLabel.textContent = getRequestTypeLabelShort(request);
      dayCell.title = getRequestTypeLabel(request);
    } else {
      dayLabel.textContent = '未入力';
      dayLabel.style.color = '#999';
      dayCell.title = 'クリックして休み希望を選択';
    }
    
    dayCell.appendChild(dayLabel);
    
    // 編集可能かどうか
    if (isEditable) {
      dayCell.style.cursor = 'pointer';
      dayCell.addEventListener('mouseenter', (e) => {
        quickPointer.x = e.clientX;
        quickPointer.y = e.clientY;
        showQuickOptions(dayCell, date);
      });
      dayCell.addEventListener('mousemove', (e) => {
        quickPointer.x = e.clientX;
        quickPointer.y = e.clientY;
        updateQuickOptionsPosition(dayCell, date);
      });
      dayCell.addEventListener('mouseleave', (e) => {
        if (isQuickOptionsTarget(e.relatedTarget)) {
          return;
        }
        hideQuickOptions();
      });
      dayCell.addEventListener('click', function(e) {
        e.stopPropagation();
        openSelectionModal(date);
      });
    } else {
      dayCell.classList.add('disabled');
      dayCell.style.cursor = 'not-allowed';
    }
    
    calendarGrid.appendChild(dayCell);
  });
  
  // 最後の週の空白セル
  const lastDay = new Date(2025, 7, 31);
  const lastDayOfWeek = lastDay.getDay();
  const remainingCells = 6 - lastDayOfWeek;
  for (let i = 0; i < remainingCells; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'day-cell empty';
    calendarGrid.appendChild(emptyCell);
  }
  
  updateProgress();
}

// 短縮ラベルを取得
function getRequestTypeLabelShort(requestType) {
  const preset = REQUEST_OPTION_PRESETS[requestType];
  return preset ? preset.label : '未入力';
}

function getRequestTypeLabelCompact(requestType) {
  const labels = {
    'available': '勤務OK',
    'day-only': '日勤のみ',
    'day-late': '日勤+遅出',
    'night-only': '夜勤のみ',
    'paid-leave': '公休希望'
  };
  return labels[requestType] || '未入力';
}

// 希望タイプのラベルを取得
function getRequestTypeLabel(requestType) {
  const preset = REQUEST_OPTION_PRESETS[requestType];
  return preset ? preset.label : '';
}

function getRequestOptions() {
  if (!currentData) return [];
  const capability = resolveShiftCapability(currentData, null);
  let keys = ['day-only', 'paid-leave'];
  if (!capability || capability === SHIFT_CAPABILITIES.NIGHT) {
    keys = ['available', 'day-only', 'day-late', 'night-only', 'paid-leave'];
  }

  return keys.map(key => {
    const preset = REQUEST_OPTION_PRESETS[key];
    let desc = preset.desc;

    if (key === 'available') {
      if (capability === SHIFT_CAPABILITIES.DAY) {
        desc = '日勤のみ対応できます';
      } else if (capability === SHIFT_CAPABILITIES.LATE) {
        desc = '日勤・遅出は対応できます';
      }
    }

    return {
      value: key,
      label: preset.label,
      icon: preset.icon,
      desc
    };
  });
}

function getAllowedRequestKeys() {
  const capability = resolveShiftCapability(currentData, null);
  if (!capability || capability === SHIFT_CAPABILITIES.NIGHT) {
    return ['available', 'day-only', 'day-late', 'night-only', 'paid-leave'];
  }
  return ['day-only', 'paid-leave'];
}

function loadSharedRequestsTable() {
  const container = document.getElementById('sharedRequestsTable');
  if (!container) return;

  const users = getUserDirectory();
  const allKeys = Object.keys(localStorage);
  const requestKeys = allKeys.filter(key => key.startsWith(STORAGE_KEY_PREFIX));
  const nurseMap = new Map();

  requestKeys.forEach(key => {
    const userKey = key.replace(STORAGE_KEY_PREFIX, '');
    const dataStr = localStorage.getItem(key);
    if (!dataStr) return;
    try {
      const data = JSON.parse(dataStr);
      const userInfo = users[userKey] || {};
      const name = data.nurseName || userInfo.fullName || userKey;
      nurseMap.set(userKey, {
        name,
        requests: data.requests || {}
      });
    } catch (error) {
      console.error('Failed to parse shift request data', error);
    }
  });

  Object.keys(users).forEach(userKey => {
    if (nurseMap.has(userKey)) return;
    const user = users[userKey];
    nurseMap.set(userKey, {
      name: user.fullName || userKey,
      requests: {}
    });
  });

  const nurseList = Array.from(nurseMap.values()).sort((a, b) => {
    return a.name.localeCompare(b.name, 'ja');
  });

  if (nurseList.length === 0) {
    container.innerHTML = '<p style="color:#666; padding: 12px;">共有できる勤務希望がありません。</p>';
    return;
  }

  const headerCells = dates.map(date => `<th>${date}</th>`).join('');
  const rows = nurseList.map(nurse => {
    const cells = dates.map(date => {
      const request = normalizeRequestType(nurse.requests[date]);
      const label = request ? getRequestTypeLabelCompact(request) : '未入力';
      const fullLabel = request ? getRequestTypeLabel(request) : '未入力';
      return `<td title="${fullLabel}">${label}</td>`;
    }).join('');
    return `<tr><td class="name-cell">${nurse.name}</td>${cells}</tr>`;
  }).join('');

  container.innerHTML = `
    <table class="shared-requests-table">
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
}

function ensureQuickOptionsContainer() {
  if (quickOptionsContainer) return;
  quickOptionsContainer = document.createElement('div');
  quickOptionsContainer.className = 'quick-options';
  quickOptionsContainer.dataset.currentDate = '';
  quickOptionsContainer.addEventListener('mouseenter', () => {
    if (quickOptionsHideTimeout) {
      clearTimeout(quickOptionsHideTimeout);
      quickOptionsHideTimeout = null;
    }
  });
  quickOptionsContainer.addEventListener('mouseleave', (e) => {
    if (isDayCellTarget(e.relatedTarget)) {
      return;
    }
    hideQuickOptions();
  });
  document.body.appendChild(quickOptionsContainer);
}

function initQuickOptions() {
  if (quickOptionsInitialized) return;
  ensureQuickOptionsContainer();
  window.addEventListener('scroll', () => hideQuickOptions(true));
  window.addEventListener('resize', () => hideQuickOptions(true));
  quickOptionsInitialized = true;
}

function showQuickOptions(cell, date) {
  if (!currentData || currentData.submitted) return;
  ensureQuickOptionsContainer();
  if (quickOptionsHideTimeout) {
    clearTimeout(quickOptionsHideTimeout);
    quickOptionsHideTimeout = null;
  }

  const options = getRequestOptions();
  if (options.length === 0) return;

  quickOptionsDate = date;
  quickOptionsContainer.dataset.currentDate = String(date);
  const currentRequest = currentData.requests[date];

  const headerHtml = `<div class="quick-options-header">${date} (${getDayOfWeek(date)})</div>`;
  const optionsHtml = options.map(opt => `
    <button type="button" class="quick-option-button ${currentRequest === opt.value ? 'selected' : ''}" data-value="${opt.value}" title="${getRequestTypeLabel(opt.value)}">
      <div class="quick-option-line">
        <span class="quick-option-icon">${opt.icon}</span>
        <span class="quick-option-label">${opt.label}</span>
      </div>
      <div class="quick-option-desc">${opt.desc}</div>
    </button>
  `).join('');

  quickOptionsContainer.innerHTML = headerHtml + optionsHtml;
  quickOptionsContainer.style.display = 'block';

  quickOptionsContainer.querySelectorAll('.quick-option-button').forEach(btn => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.value;
      setRequest(date, value);
    });
  });

  requestAnimationFrame(() => {
    const containerRect = quickOptionsContainer.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;

    let top;
    let left;
    let placeBelow = true;

    if (quickPointer.x !== null && quickPointer.y !== null) {
      top = quickPointer.y + 12;
      left = quickPointer.x + 12;

      if (top + containerRect.height > viewportHeight - 12) {
        top = quickPointer.y - containerRect.height - 12;
        placeBelow = false;
      }
    } else {
      const rect = cell.getBoundingClientRect();
      const anchorX = rect.left + rect.width / 2;
      const anchorY = rect.top;
      top = anchorY - containerRect.height - 12;
      left = anchorX - containerRect.width / 2;
      placeBelow = false;

      if (top < 12) {
        top = rect.bottom + 12;
        placeBelow = true;
      }
    }

    if (left + containerRect.width > viewportWidth - 12) {
      left = viewportWidth - containerRect.width - 12;
    }
    if (left < 12) {
      left = 12;
    }

    if (top < 12) {
      top = 12;
      placeBelow = true;
    }
    if (top + containerRect.height > viewportHeight - 12) {
      top = viewportHeight - containerRect.height - 12;
      placeBelow = false;
    }

    quickOptionsContainer.style.top = `${top}px`;
    quickOptionsContainer.style.left = `${left}px`;

    if (placeBelow) {
      quickOptionsContainer.classList.add('below');
    } else {
      quickOptionsContainer.classList.remove('below');
    }
  });
}

function updateQuickOptionsPosition(cell, date) {
  if (!quickOptionsContainer || quickOptionsContainer.style.display !== 'block') return;
  if (date && quickOptionsContainer.dataset.currentDate && quickOptionsContainer.dataset.currentDate !== String(date)) {
    return;
  }

  const containerRect = quickOptionsContainer.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;

  let top;
  let left;
  let placeBelow = true;

  if (quickPointer.x !== null && quickPointer.y !== null) {
    top = quickPointer.y + 12;
    left = quickPointer.x + 12;

    if (top + containerRect.height > viewportHeight - 12) {
      top = quickPointer.y - containerRect.height - 12;
      placeBelow = false;
    }
  } else if (cell) {
    const rect = cell.getBoundingClientRect();
    const anchorX = rect.left + rect.width / 2;
    const anchorY = rect.top;
    top = anchorY - containerRect.height - 12;
    left = anchorX - containerRect.width / 2;
    placeBelow = false;

    if (top < 12) {
      top = rect.bottom + 12;
      placeBelow = true;
    }
  } else {
    return;
  }

  if (left + containerRect.width > viewportWidth - 12) {
    left = viewportWidth - containerRect.width - 12;
  }
  if (left < 12) {
    left = 12;
  }

  if (top < 12) {
    top = 12;
    placeBelow = true;
  }
  if (top + containerRect.height > viewportHeight - 12) {
    top = viewportHeight - containerRect.height - 12;
    placeBelow = false;
  }

  quickOptionsContainer.style.top = `${top}px`;
  quickOptionsContainer.style.left = `${left}px`;

  if (placeBelow) {
    quickOptionsContainer.classList.add('below');
  } else {
    quickOptionsContainer.classList.remove('below');
  }
}

function hideQuickOptions(immediate = false) {
  if (!quickOptionsContainer) return;
  if (quickOptionsHideTimeout) {
    clearTimeout(quickOptionsHideTimeout);
    quickOptionsHideTimeout = null;
  }

  const finalizeHide = () => {
    quickOptionsContainer.style.display = 'none';
    quickOptionsContainer.classList.remove('below');
    quickOptionsContainer.dataset.currentDate = '';
    quickOptionsDate = null;
    quickPointer.x = null;
    quickPointer.y = null;
    quickOptionsHideTimeout = null;
  };

  if (immediate) {
    finalizeHide();
    return;
  }

  quickOptionsHideTimeout = setTimeout(() => {
    finalizeHide();
  }, 200);
}

function getValuePreferenceInfo(value) {
  if (!value) return null;
  return VALUE_PREFERENCE_OPTIONS[value] || null;
}

function updateValuePreferenceDisplay() {
  const wrapper = document.getElementById('valuePreferenceStatus');
  const badge = document.getElementById('valuePreferenceBadge');
  if (!wrapper || !badge) return;

  const value = currentData && currentData.preferences ? currentData.preferences.valuePreference : null;
  const info = getValuePreferenceInfo(value);

  wrapper.style.display = 'flex';
  if (info) {
    badge.classList.remove('value-badge--empty');
    badge.innerHTML = `<span class="emoji">${info.icon}</span><span>${info.label}</span>`;
  } else {
    badge.classList.add('value-badge--empty');
    badge.innerHTML = '未設定';
  }
}

// 選択モーダルを開く
function openSelectionModal(date) {
  if (!currentData || currentData.submitted) return;
  
  hideQuickOptions(true);
  selectedDate = date;
  const modal = document.getElementById('selectionModal');
  const dateLabel = document.getElementById('selectedDate');
  const optionsContainer = document.getElementById('modalOptions');
  
  if (!modal || !dateLabel || !optionsContainer) return;
  
  dateLabel.textContent = `${date} (${getDayOfWeek(date)})`;
  
  const options = getRequestOptions();
  const currentRequest = currentData.requests[date];
  
  if (options.length === 0) {
    optionsContainer.innerHTML = '<p style="color: #666;">選択肢が利用できません</p>';
  } else {
    optionsContainer.innerHTML = options.map(opt => `
      <button class="option-button ${currentRequest === opt.value ? 'selected' : ''}" 
              data-value="${opt.value}" title="${getRequestTypeLabel(opt.value)}">
        <div class="option-title">
          <span class="option-icon">${opt.icon}</span>
          <span>${opt.label}</span>
        </div>
        <div class="option-desc">${opt.desc}</div>
      </button>
    `).join('');
  }
  
  // イベントリスナーを追加
  optionsContainer.querySelectorAll('.option-button').forEach(btn => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.value;
      setRequest(date, value);
    });
  });
  
  modal.classList.add('active');
}

// 選択モーダルを閉じる
function closeSelectionModal() {
  const modal = document.getElementById('selectionModal');
  if (modal) {
    modal.classList.remove('active');
  }
  hideQuickOptions(true);
  selectedDate = null;
}

// 希望を設定
function setRequest(date, requestType) {
  if (!currentNurse || !currentData) return;

  if (!getAllowedRequestKeys().includes(requestType)) {
    alert('現在の夜勤・遅出の対応状況では選択できない希望です。');
    return;
  }
  
  // 締め切りチェック
  const deadlineStr = localStorage.getItem(DEADLINE_KEY);
  const isDeadlinePassed = deadlineStr ? new Date(deadlineStr) < new Date() : false;
  
  if (currentData.submitted || isDeadlinePassed) {
    alert('締め切りが過ぎているか、既に提出済みのため編集できません。');
    return;
  }
  
  currentData.requests[date] = requestType;
  
  // セルを更新
  const cell = document.querySelector(`[data-date="${date}"]`);
  if (cell) {
    // 既存のクラスを削除
    cell.classList.remove('available', 'day-only', 'day-late', 'night-only', 'paid-leave');
    cell.classList.add(requestType);
    cell.style.background = '';
    
    // ラベルを更新
    const dayLabel = cell.querySelector('.day-label');
    if (dayLabel) {
      dayLabel.textContent = getRequestTypeLabelShort(requestType);
      dayLabel.style.color = '#666';
      dayLabel.title = getRequestTypeLabel(requestType);
    }
    cell.title = getRequestTypeLabel(requestType);
    
    // アニメーション効果
    cell.style.transform = 'scale(1.1)';
    setTimeout(() => {
      cell.style.transform = '';
    }, 200);
  }
  
  // 自動保存
  saveData();
  updateProgress();
  loadSharedRequestsTable();
  hideQuickOptions(true);
  closeSelectionModal();
}

// 進捗を更新
function updateProgress() {
  if (!currentData) return;
  const filled = Object.keys(currentData.requests).length;
  const progressEl = document.getElementById('inputProgress');
  if (progressEl) {
    progressEl.textContent = `${filled}/31`;
  }
}

// ステータスを更新
function updateStatus() {
  if (!currentData) return;
  
  const statusBadge = document.getElementById('statusBadge');
  if (statusBadge) {
    if (currentData.submitted) {
      statusBadge.textContent = '提出済み';
      statusBadge.className = 'status-badge status-submitted';
    } else {
      statusBadge.textContent = '下書き';
      statusBadge.className = 'status-badge status-draft';
    }
  }
  
  updateSubmitButtons();
  updateDeadlineInfo();
}

// 提出ボタンの状態を更新
function updateSubmitButtons() {
  if (!currentData) return;
  
  const submitBtn = document.getElementById('submitBtn');
  const cancelBtn = document.getElementById('cancelSubmitBtn');
  const saveDraftBtn = document.getElementById('saveDraftBtn');
  
  if (currentData.submitted) {
    if (submitBtn) submitBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'block';
    if (saveDraftBtn) saveDraftBtn.disabled = true;
    
    document.querySelectorAll('.day-cell').forEach(cell => {
      if (!cell.classList.contains('empty')) {
        cell.classList.add('disabled');
      }
    });
  } else {
    if (submitBtn) submitBtn.style.display = 'block';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (saveDraftBtn) saveDraftBtn.disabled = false;
  }
}

// 締め切り情報を更新
function updateDeadlineInfo() {
  const deadlineBanner = document.getElementById('deadlineBanner');
  const deadlineStr = localStorage.getItem(DEADLINE_KEY);
  
  if (!deadlineBanner) return;
  
  if (deadlineStr) {
    const deadline = new Date(deadlineStr);
    const now = new Date();
    const diff = deadline - now;
    
    deadlineBanner.style.display = 'block';
    
    const deadlineDateEl = document.getElementById('deadlineDate');
    const deadlineCountdownEl = document.getElementById('deadlineCountdown');
    
    if (diff > 0) {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (deadlineDateEl) {
        deadlineDateEl.textContent = deadline.toLocaleString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      
      if (deadlineCountdownEl) {
        deadlineCountdownEl.textContent = `残り: ${days}日 ${hours}時間 ${minutes}分`;
      }
      
      if (days <= 3) {
        deadlineBanner.style.background = '#ffc107';
        deadlineBanner.style.color = '#856404';
      } else {
        deadlineBanner.style.background = '#dc3545';
        deadlineBanner.style.color = 'white';
      }
    } else {
      if (deadlineDateEl) {
        deadlineDateEl.textContent = deadline.toLocaleString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      if (deadlineCountdownEl) {
        deadlineCountdownEl.textContent = '締め切り済み';
      }
      deadlineBanner.style.background = '#6c757d';
      deadlineBanner.style.color = 'white';
    }
  } else {
    deadlineBanner.style.display = 'none';
  }
}

// 下書き保存
function saveDraft() {
  if (!currentData) return;
  
  const noteInput = document.getElementById('noteInput');
  if (noteInput) {
    currentData.note = noteInput.value;
  }
  
  saveData();
  
  const btn = document.getElementById('saveDraftBtn');
  if (btn) {
    const originalText = btn.textContent;
    btn.textContent = '保存しました！';
    btn.style.background = '#28a745';
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
    }, 2000);
  }
}

// 提出
function submit() {
  if (!currentData) return;
  
  if (!confirm('シフト希望を提出しますか？提出後は編集できなくなります。')) {
    return;
  }
  
  const noteInput = document.getElementById('noteInput');
  if (noteInput) {
    currentData.note = noteInput.value;
  }
  
  currentData.submitted = true;
  currentData.submittedAt = new Date().toISOString();
  
  // 提出フラグを保存
  const CURRENT_USER_KEY = 'current_user';
  const currentUser = localStorage.getItem(CURRENT_USER_KEY);
  let userKeyForSubmit = currentNurse;
  
  if (currentUser) {
    const user = JSON.parse(currentUser);
    userKeyForSubmit = user.userKey || currentNurse;
  }
  
  const submittedKey = SUBMITTED_KEY_PREFIX + userKeyForSubmit;
  localStorage.setItem(submittedKey, 'true');
  
  saveData();
  updateStatus();
  alert('シフト希望を提出しました。ありがとうございます。');
}

// 提出を取り消す
function cancelSubmit() {
  if (!currentData) return;
  
  const deadlineStr = localStorage.getItem(DEADLINE_KEY);
  const isDeadlinePassed = deadlineStr ? new Date(deadlineStr) < new Date() : false;
  
  if (isDeadlinePassed) {
    alert('締め切りが過ぎているため、提出を取り消すことはできません。');
    return;
  }
  
  if (!confirm('提出を取り消しますか？再度編集できるようになります。')) {
    return;
  }
  
  currentData.submitted = false;
  currentData.submittedAt = null;
  
  const CURRENT_USER_KEY = 'current_user';
  const currentUser = localStorage.getItem(CURRENT_USER_KEY);
  let userKeyForSubmit = currentNurse;
  
  if (currentUser) {
    const user = JSON.parse(currentUser);
    userKeyForSubmit = user.userKey || currentNurse;
  }
  
  const submittedKey = SUBMITTED_KEY_PREFIX + userKeyForSubmit;
  localStorage.removeItem(submittedKey);
  
  saveData();
  updateStatus();
  initCalendar();
  
  alert('提出を取り消しました。再度編集できます。');
}

// 設定ページを開く
function openSettingsPage() {
  if (!currentData) return;
  
  const settingsModal = document.getElementById('settingsModal');
  if (!settingsModal) return;
  
  const currentValue = currentData.preferences ? currentData.preferences.valuePreference : null;
  const radios = document.querySelectorAll('input[name="valuePreference"]');
  radios.forEach(radio => {
    radio.checked = radio.value === currentValue;
  });
  
  settingsModal.classList.add('active');
}

// 設定ページを閉じる
function closeSettingsPage() {
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal) {
    settingsModal.classList.remove('active');
  }
}

// 設定を保存
function saveSettings() {
  if (!currentData) return;
  
  if (!currentData.preferences) {
    currentData.preferences = { valuePreference: null };
  }
  
  const selected = document.querySelector('input[name="valuePreference"]:checked');
  if (!selected) {
    alert('夜勤明けの過ごし方を1つ選択してください。');
    return;
  }
  
  currentData.preferences.valuePreference = selected.value;
  saveData();
  updateValuePreferenceDisplay();
  closeSettingsPage();
  alert('価値観を保存しました');
}

// トップページに戻る
function goToTop() {
  window.location.href = 'top.html';
}

// イベントリスナーの設定
document.addEventListener('DOMContentLoaded', () => {
  // ログイン状態を確認
  autoLogin();
  initQuickOptions();
  
  // 下書き保存ボタン
  const saveDraftBtn = document.getElementById('saveDraftBtn');
  if (saveDraftBtn) {
    saveDraftBtn.addEventListener('click', saveDraft);
  }
  
  // 提出ボタン
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', submit);
  }
  
  // 提出取り消しボタン
  const cancelSubmitBtn = document.getElementById('cancelSubmitBtn');
  if (cancelSubmitBtn) {
    cancelSubmitBtn.addEventListener('click', cancelSubmit);
  }
  
  // 備考欄の自動保存
  const noteInput = document.getElementById('noteInput');
  if (noteInput) {
    noteInput.addEventListener('blur', () => {
      if (currentData) {
        currentData.note = noteInput.value;
        saveData();
      }
    });
  }
  
  // モーダルのキャンセルボタン
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', closeSelectionModal);
  }
  
  // モーダルの背景をクリックで閉じる
  const selectionModal = document.getElementById('selectionModal');
  if (selectionModal) {
    selectionModal.addEventListener('click', (e) => {
      if (e.target.id === 'selectionModal') {
        closeSelectionModal();
      }
    });
  }
  
  // 設定モーダルの背景をクリックで閉じる
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target.id === 'settingsModal') {
        closeSettingsPage();
      }
    });
  }
  
  // 締め切り情報を定期的に更新（1分ごと）
  setInterval(() => {
    updateDeadlineInfo();
  }, 60000);
});

