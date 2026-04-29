// グローバル変数
let currentNurse = null;
let currentData = null;
let selectedDate = null;
// 定数は common.js から継承

const REQUEST_OPTION_PRESETS = {
  'available': {
    label: '終日勤務可能',
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
// PAID_LEAVE_LIMIT は common.js から継承

const SAGE_SVGS = {
  calm: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="28" fill="#f5deb3" stroke="#6b4f2a" stroke-width="2"/><path d="M16 28 Q36 8 56 28" fill="#e0e0e0" stroke="#6b4f2a" stroke-width="2"/><circle cx="27" cy="34" r="3" fill="#333"/><circle cx="45" cy="34" r="3" fill="#333"/><path d="M26 45 Q36 53 46 45" stroke="#333" stroke-width="3" fill="none"/></svg>',
  sweat: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="28" fill="#f5deb3" stroke="#6b4f2a" stroke-width="2"/><path d="M16 28 Q36 8 56 28" fill="#e0e0e0" stroke="#6b4f2a" stroke-width="2"/><circle cx="27" cy="34" r="3" fill="#333"/><circle cx="45" cy="34" r="3" fill="#333"/><path d="M26 48 Q36 42 46 48" stroke="#333" stroke-width="3" fill="none"/><path d="M54 38 Q60 42 56 50 Q50 46 54 38" fill="#6ec6ff" stroke="#2c7fb8" stroke-width="1"/></svg>',
  angry: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="28" fill="#f5deb3" stroke="#6b4f2a" stroke-width="2"/><path d="M16 28 Q36 8 56 28" fill="#e0e0e0" stroke="#6b4f2a" stroke-width="2"/><path d="M22 30 L30 26" stroke="#333" stroke-width="3"/><path d="M50 30 L42 26" stroke="#333" stroke-width="3"/><circle cx="27" cy="36" r="3" fill="#333"/><circle cx="45" cy="36" r="3" fill="#333"/><path d="M26 50 Q36 42 46 50" stroke="#333" stroke-width="3" fill="none"/></svg>'
};

// getSageImageUri は共通版を使用（nurse_input.jsでは独自のSVGを使用する必要がある場合は上書き）
// getUserDirectory, getCurrentUserKey は common.js から継承（必要に応じて拡張可能）

// nurse_input.js用のgetSageImageUri（SVG使用版）
function getSageImageUriNurse(diffMs) {
  const hoursLeft = diffMs / (1000 * 60 * 60);
  let state = 'calm';
  if (hoursLeft <= 24) {
    state = 'angry';
  } else if (hoursLeft <= 72) {
    state = 'sweat';
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(SAGE_SVGS[state])}`;
}

// normalizeShiftCapability は common.js から継承

function getShiftCapabilityLabel(capability) {
  if (capability === SHIFT_CAPABILITIES.DAY_ONLY) return '日勤のみ';
  if (capability === SHIFT_CAPABILITIES.DAY_LATE) return '日勤＋遅出';
  if (capability === SHIFT_CAPABILITIES.DAY_NIGHT) return '日勤＋夜勤（遅出なし）';
  if (capability === SHIFT_CAPABILITIES.ALL) return '全部する';
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

// 選択中の年月（月セレクタで変更される）
let selectedYear = null;
let selectedMonth = null;
let dates = [];

function initSelectedMonth() {
  // デフォルトは「来月」（今日から見て最も近い入力対象月）
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  selectedYear  = next.getFullYear();
  selectedMonth = next.getMonth() + 1;
  dates = getMonthDates(selectedYear, selectedMonth);
}

function switchToMonth(year, month) {
  selectedYear = year;
  selectedMonth = month;
  dates = getMonthDates(year, month);
  loadData();
  initCalendar();
  renderMonthSelector();
  updateStatus();
  updatePaidLeaveCounter();
  loadSharedRequestsTable();
}

// isWeekend, getDayOfWeek は common.js から継承

// ログイン状態を確認
function checkLoginStatus() {
  const currentUser = getCurrentUser();
  if (currentUser) {
    currentNurse = currentUser.fullName || `${currentUser.lastName} ${currentUser.firstName}`;
    return true;
  }
  return false;
}

// 自動ログイン
function autoLogin() {
  try {
    if (!checkLoginStatus()) {
      window.location.href = 'index.html';
      return;
    }

    initSelectedMonth();

    // メインコンテンツを表示
    const mainContent = document.getElementById('mainContent');
    if (mainContent) {
      mainContent.style.display = 'block';
    }
    
    // データを読み込み
    loadData();
    
    // currentDataが確実に設定されるまで待つ
    if (!currentData) {
      console.error('currentData is null after loadData()');
      // 再試行
      setTimeout(() => {
        if (!currentData) {
          loadData();
        }
        initializePage();
      }, 100);
      return;
    }
    
    initializePage();
  } catch (error) {
    console.error('Error in autoLogin:', error);
    alert('ページの読み込みでエラーが発生しました。ページを再読み込みしてください。');
  }
}

// ページの初期化
function initializePage() {
  // URLパラメータでページを判定
  const urlParams = new URLSearchParams(window.location.search);
  const page = urlParams.get('page');
  
  if (page === 'settings') {
    // 個人設定ページ
    // カレンダーは非表示にする
    const mainCalendar = document.getElementById('mainCalendar');
    if (mainCalendar) mainCalendar.style.display = 'none';
    
    // 設定ボタンは非表示にする（モーダルで直接開くため）
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.style.display = 'none';
    
    // 設定モーダルを開く
    if (currentData) {
      openSettingsPage();
    } else {
      // データがまだ読み込まれていない場合は再試行
      setTimeout(() => {
        if (currentData) {
          openSettingsPage();
        } else {
          console.error('currentData is still null after retry');
        }
      }, 200);
    }
  } else {
    // 通常の希望入力ページ
    showCalendarPage();
  }
}

// カレンダーページを表示
function showCalendarPage() {
  // currentDataがnullの場合は再読み込みを試みる
  if (!currentData) {
    console.warn('currentData is null in showCalendarPage, attempting to reload...');
    loadData();
    if (!currentData) {
      console.error('currentData is still null after reload');
      alert('データの読み込みに失敗しました。ページを再読み込みしてください。');
      return;
    }
  }
  
  const mainCalendar = document.getElementById('mainCalendar');
  if (mainCalendar) {
    mainCalendar.style.display = 'block';
  }
  
  // 夜勤設定情報を表示
  const nightShiftInfo = document.getElementById('nightShiftInfo');
  const nightShiftStatus = document.getElementById('nightShiftStatus');
  
  if (nightShiftInfo && currentData) {
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
  if (currentData) {
    const capability = resolveShiftCapability(currentData, null);
    if (legendDayLate) {
      legendDayLate.style.display = capability === SHIFT_CAPABILITIES.DAY_LATE || capability === SHIFT_CAPABILITIES.ALL ? 'flex' : 'none';
    }
    if (legendNightOnly) {
      legendNightOnly.style.display = capability === SHIFT_CAPABILITIES.DAY_NIGHT || capability === SHIFT_CAPABILITIES.ALL ? 'flex' : 'none';
    }
  }
  
  // カレンダーを初期化
  if (currentData) {
    renderMonthSelector();
    initCalendar();
    updateStatus();
    updatePaidLeaveCounter();
    loadSharedRequestsTable();
  } else {
    console.error('Cannot initialize calendar: currentData is null');
  }
}

// データの読み込み
function loadData() {
  const currentUser = getCurrentUser();
  let userKey = currentNurse;

  if (currentUser) {
    userKey = currentUser.userKey || currentNurse;
  }

  // 月別キーを優先し、旧形式にフォールバック
  const monthKey = getMonthRequestKey(userKey, selectedYear, selectedMonth);
  const legacyKey = STORAGE_KEY_PREFIX + userKey;
  const stored = localStorage.getItem(monthKey) || localStorage.getItem(legacyKey);

  if (stored) {
    currentData = JSON.parse(stored);
  } else {
    // 新規データ
    const defaultRequests = {};
    dates.forEach(date => {
      defaultRequests[date] = REQUEST_TYPES.AVAILABLE;
    });
    currentData = {
      nurseName: currentNurse,
      userKey: userKey,
      requests: defaultRequests,
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

  const currentUserInfo = currentUser;
  const resolvedCapability = resolveShiftCapability(currentData, currentUserInfo);
  if (!currentData.shiftCapability && resolvedCapability) {
    currentData.shiftCapability = resolvedCapability;
    currentData.doesNightShift = resolvedCapability === SHIFT_CAPABILITIES.ALL || resolvedCapability === SHIFT_CAPABILITIES.DAY_NIGHT;
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
    dates.forEach(date => {
      if (!currentData.requests[date]) {
        currentData.requests[date] = REQUEST_TYPES.AVAILABLE;
        normalized = true;
      }
    });
    if (normalized) {
      saveData();
    }
  }

  // 提出状態を確認（月別）
  if (currentUser) {
    const userKeyForSubmit = getCurrentUserKey() || currentNurse;
    const monthSubmittedKey = getMonthSubmittedKey(userKeyForSubmit, selectedYear, selectedMonth);
    const legacySubmittedKey = SUBMITTED_KEY_PREFIX + userKeyForSubmit;
    const isSubmitted = localStorage.getItem(monthSubmittedKey) === 'true'
                     || localStorage.getItem(legacySubmittedKey) === 'true';
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

  // 夜勤ステータスを表示（currentDataが設定された後）
  setTimeout(() => {
    updateNightShiftStatusInHeader();
  }, 50);

  updateValuePreferenceDisplay();
}

// ヘッダーに夜勤ステータスを表示
function updateNightShiftStatusInHeader() {
  const badge = document.getElementById('currentUserNightShiftStatus');
  if (!badge || !currentData) return;
  
  const currentUser = getCurrentUser();
  const shiftCapability = resolveShiftCapability(currentData, currentUser);
  
  if (shiftCapability === SHIFT_CAPABILITIES.DAY_NIGHT || shiftCapability === SHIFT_CAPABILITIES.ALL) {
    badge.textContent = '🌙 夜勤可';
    badge.style.background = '#e3f2fd';
    badge.style.color = '#1976d2';
  } else if (shiftCapability === SHIFT_CAPABILITIES.DAY_LATE) {
    badge.textContent = '🌇 遅出可';
    badge.style.background = '#fff3e0';
    badge.style.color = '#f57c00';
  } else if (shiftCapability === SHIFT_CAPABILITIES.DAY_ONLY) {
    badge.textContent = '🌞 日勤のみ';
    badge.style.background = '#f3e5f5';
    badge.style.color = '#7b1fa2';
  } else {
    badge.textContent = '❓ 未設定';
    badge.style.background = '#f5f5f5';
    badge.style.color = '#757575';
  }
}

// データの保存
function saveData() {
  if (!currentNurse || !selectedYear || !selectedMonth) return;

  const CURRENT_USER_KEY = 'current_user';
  const currentUser = localStorage.getItem(CURRENT_USER_KEY);
  let userKey = currentNurse;

  if (currentUser) {
    const user = JSON.parse(currentUser);
    userKey = user.userKey || currentNurse;
    currentData.userKey = userKey;
  }

  const storageKey = getMonthRequestKey(userKey, selectedYear, selectedMonth);
  localStorage.setItem(storageKey, JSON.stringify(currentData));
}

// カレンダーの初期化
function initCalendar() {
  const calendarGrid = document.getElementById('calendarGrid');
  if (!calendarGrid) {
    console.error('calendarGrid element not found');
    return;
  }
  if (!currentData) {
    console.error('currentData is null in initCalendar');
    // currentDataがnullの場合は初期化を試みる
    loadData();
    if (!currentData) {
      console.error('currentData is still null after loadData()');
      return;
    }
  }

  hideQuickOptions(true);
  calendarGrid.innerHTML = '';

  const monthHeader = document.getElementById('calendarMonthHeader');
  if (monthHeader) {
    monthHeader.textContent = `${selectedYear}年${selectedMonth}月`;
  }

  // ロック状態チェック
  const userKey = getCurrentUserKey() || currentNurse;
  const locked = isMonthLocked(selectedYear, selectedMonth);
  const unlocked = locked && isUserMonthUnlocked(userKey, selectedYear, selectedMonth);

  // 締め切りチェックは管理者が設定した対象月のみ適用
  const deadlineStr = localStorage.getItem(DEADLINE_KEY);
  const adminTarget = getShiftTarget();
  const isTargetMonth = selectedYear === adminTarget.year && selectedMonth === adminTarget.month;
  const isDeadlinePassed = isTargetMonth && deadlineStr ? new Date(deadlineStr) < new Date() : false;

  const isEditable = (!locked || unlocked) && !currentData.submitted && !isDeadlinePassed;
  
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
  
  const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
  const firstDayOfWeek = firstDay.getDay();
  
  // 最初の週の空白セル
  for (let i = 0; i < firstDayOfWeek; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'day-cell empty';
    calendarGrid.appendChild(emptyCell);
  }
  
  // 各日のセルを追加
  const sharedSummary = getSharedRequestSummary();
  dates.forEach(date => {
    const dayCell = document.createElement('div');
    dayCell.className = 'day-cell';
    dayCell.dataset.date = date;
    
    const [month, day] = date.split('/').map(Number);
    const dayOfWeek = getDayOfWeek(date);
    
    if (dayOfWeek === '日' || dayOfWeek === '土') {
      dayCell.classList.add('weekend');
    }
    
    // 日付番号（曜日も含める）
    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = `${day}(${dayOfWeek})`;
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

    const summary = sharedSummary[date];
    if (summary && (summary.paidLeave > 0 || summary.nightOff > 0)) {
      const badgeWrap = document.createElement('div');
      badgeWrap.className = 'shared-badges';
      if (summary.paidLeave > 0) {
        const leaveBadge = document.createElement('span');
        leaveBadge.className = 'shared-badge leave';
        leaveBadge.textContent = `公休${summary.paidLeave}`;
        badgeWrap.appendChild(leaveBadge);
      }
      if (summary.nightOff > 0) {
        const nightBadge = document.createElement('span');
        nightBadge.className = 'shared-badge night-off';
        nightBadge.textContent = `夜勤不可${summary.nightOff}`;
        badgeWrap.appendChild(nightBadge);
      }
      dayCell.appendChild(badgeWrap);
    }
    
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
  const lastDayDate = new Date(selectedYear, selectedMonth - 1, dates.length);
  const lastDayOfWeek = lastDayDate.getDay();
  const remainingCells = lastDayOfWeek < 6 ? 6 - lastDayOfWeek : 0;
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
    'available': '終日勤務可能',
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
  if (!capability || capability === SHIFT_CAPABILITIES.ALL) {
    keys = ['available', 'day-only', 'day-late', 'night-only', 'paid-leave'];
  } else if (capability === SHIFT_CAPABILITIES.DAY_LATE) {
    keys = ['day-only', 'day-late', 'paid-leave'];
  } else if (capability === SHIFT_CAPABILITIES.DAY_NIGHT) {
    keys = ['available', 'day-only', 'night-only', 'paid-leave'];
  }

  return keys.map(key => {
    const preset = REQUEST_OPTION_PRESETS[key];
    let desc = preset.desc;

    if (key === 'available') {
      if (capability === SHIFT_CAPABILITIES.DAY_ONLY) {
        desc = '日勤のみ対応できます';
      } else if (capability === SHIFT_CAPABILITIES.DAY_LATE) {
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
  if (!capability || capability === SHIFT_CAPABILITIES.ALL) {
    return ['available', 'day-only', 'day-late', 'night-only', 'paid-leave'];
  }
  if (capability === SHIFT_CAPABILITIES.DAY_LATE) {
    return ['day-only', 'day-late', 'paid-leave'];
  }
  if (capability === SHIFT_CAPABILITIES.DAY_NIGHT) {
    return ['available', 'day-only', 'night-only', 'paid-leave'];
  }
  return ['day-only', 'paid-leave'];
}

function isNightUnavailableRequest(requestType) {
  return requestType === REQUEST_TYPES.DAY_ONLY || requestType === REQUEST_TYPES.DAY_LATE;
}

// 選択中の月のキーからuserKeyを抽出するヘルパー
function extractUserKeyFromMonthKey(key) {
  const tail = key.slice(STORAGE_KEY_PREFIX.length);
  const match = tail.match(/^(.+)_(\d{4})_(\d{1,2})$/);
  if (!match) return null;
  const y = parseInt(match[2]), m = parseInt(match[3]);
  if (y !== selectedYear || m !== selectedMonth) return null;
  return match[1]; // userKey
}

function getSharedRequestSummary() {
  const summary = {};
  const currentUserKey = getCurrentUserKey();

  Object.keys(localStorage)
    .filter(k => k.startsWith(STORAGE_KEY_PREFIX))
    .forEach(key => {
      const userKey = extractUserKeyFromMonthKey(key);
      if (!userKey || userKey === currentUserKey) return;
      try {
        const data = JSON.parse(localStorage.getItem(key));
        const requests = data.requests || {};
        dates.forEach(date => {
          const request = normalizeRequestType(requests[date]);
          if (!request) return;
          if (!summary[date]) summary[date] = { paidLeave: 0, nightOff: 0 };
          if (request === REQUEST_TYPES.PAID_LEAVE) {
            summary[date].paidLeave += 1;
          } else if (isNightUnavailableRequest(request)) {
            summary[date].nightOff += 1;
          }
        });
      } catch (e) { /* ignore */ }
    });

  return summary;
}

function updatePaidLeaveCounter() {
  if (!currentData) return;
  const counter = document.getElementById('paidLeaveCount');
  if (!counter) return;
  const count = Object.values(currentData.requests || {}).filter(value => value === REQUEST_TYPES.PAID_LEAVE).length;
  counter.textContent = `${count}/${PAID_LEAVE_LIMIT}`;
}

function loadSharedRequestsTable() {
  const container = document.getElementById('sharedRequestsTable');
  if (!container) return;

  const users = getUserDirectory();
  const nurseMap = new Map();

  // 選択中の月のデータのみ収集（ユーザーキーを正確に抽出）
  Object.keys(localStorage)
    .filter(k => k.startsWith(STORAGE_KEY_PREFIX))
    .forEach(key => {
      const userKey = extractUserKeyFromMonthKey(key);
      if (!userKey) return;
      try {
        const data = JSON.parse(localStorage.getItem(key));
        const userInfo = users[userKey] || {};
        nurseMap.set(userKey, {
          name: data.nurseName || userInfo.fullName || userKey,
          requests: data.requests || {},
          hireYear: typeof userInfo.hireYear === 'number' ? userInfo.hireYear : null,
          shiftCapability: resolveShiftCapability(data, userInfo)
        });
      } catch (e) { /* ignore */ }
    });

  // 登録ユーザーでデータなしの人も空欄で表示
  Object.keys(users).forEach(userKey => {
    if (nurseMap.has(userKey)) return;
    const user = users[userKey];
    nurseMap.set(userKey, {
      name: user.fullName || userKey,
      requests: {},
      hireYear: typeof user?.hireYear === 'number' ? user.hireYear : null,
      shiftCapability: resolveShiftCapability(null, user)
    });
  });

  const nurseList = Array.from(nurseMap.values()).sort((a, b) => {
    const nightA = a.shiftCapability === SHIFT_CAPABILITIES.DAY_NIGHT || a.shiftCapability === SHIFT_CAPABILITIES.ALL;
    const nightB = b.shiftCapability === SHIFT_CAPABILITIES.DAY_NIGHT || b.shiftCapability === SHIFT_CAPABILITIES.ALL;
    if (nightA !== nightB) return nightA ? -1 : 1;
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
      const classes = [];
      if (request === REQUEST_TYPES.PAID_LEAVE) {
        classes.push('shared-leave');
      } else if (isNightUnavailableRequest(request)) {
        classes.push('shared-night-off');
      }
      const classAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
      return `<td${classAttr} title="${fullLabel}">${label}</td>`;
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
  if (requestType === REQUEST_TYPES.PAID_LEAVE) {
    const currentCount = Object.values(currentData.requests || {}).filter(value => value === REQUEST_TYPES.PAID_LEAVE).length;
    const alreadySelected = currentData.requests[date] === REQUEST_TYPES.PAID_LEAVE;
    if (!alreadySelected && currentCount >= PAID_LEAVE_LIMIT) {
      alert(`公休希望は月${PAID_LEAVE_LIMIT}日までです。`);
      return;
    }
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
  updatePaidLeaveCounter();
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
  const lockBanner = document.getElementById('lockBanner');

  // 締め切りチェックは管理者が設定した対象月のみ適用。
  // 翌月・翌々月の事前入力は締め切り制限なし。
  const deadlineStr = localStorage.getItem(DEADLINE_KEY);
  const adminTarget = getShiftTarget();
  const isTargetMonth = selectedYear === adminTarget.year && selectedMonth === adminTarget.month;
  const isDeadlinePassed = isTargetMonth && deadlineStr
    ? new Date(deadlineStr) < new Date()
    : false;

  // ロック状態チェック
  const userKey = getCurrentUserKey() || currentNurse;
  const locked = isMonthLocked(selectedYear, selectedMonth);
  const unlocked = isUserMonthUnlocked(userKey, selectedYear, selectedMonth);
  const isEditable = !locked || unlocked;

  if (lockBanner) {
    if (locked && !unlocked) {
      lockBanner.style.display = 'block';
      lockBanner.textContent = `🔒 ${selectedYear}年${selectedMonth}月のシフトは確定済みです。編集できません。`;
    } else if (locked && unlocked) {
      lockBanner.style.display = 'block';
      lockBanner.textContent = `🔓 ${selectedYear}年${selectedMonth}月は個別にロック解除中です。修正後は管理者に連絡してください。`;
      lockBanner.style.background = '#fff3cd';
      lockBanner.style.borderColor = '#ffc107';
      lockBanner.style.color = '#856404';
    } else {
      lockBanner.style.display = 'none';
    }
  }

  if (!isEditable) {
    // 確定月：編集不可
    if (submitBtn) submitBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (saveDraftBtn) saveDraftBtn.disabled = true;
    document.querySelectorAll('.day-cell').forEach(cell => {
      if (!cell.classList.contains('empty')) cell.classList.add('disabled');
    });
    return;
  }

  if (currentData.submitted) {
    if (submitBtn) submitBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'block';
    if (saveDraftBtn) saveDraftBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = isDeadlinePassed;

    document.querySelectorAll('.day-cell').forEach(cell => {
      if (!cell.classList.contains('empty')) {
        cell.classList.add('disabled');
      }
    });
  } else {
    if (submitBtn) submitBtn.style.display = 'block';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (saveDraftBtn) saveDraftBtn.disabled = isDeadlinePassed;
    if (submitBtn) submitBtn.disabled = isDeadlinePassed;
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
    const sageImg = document.getElementById('deadlineSage');
    
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

    if (sageImg) {
      sageImg.src = getSageImageUriNurse(diff);
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

  const deadlineStr = localStorage.getItem(DEADLINE_KEY);
  const adminTarget = getShiftTarget();
  const isTargetMonth = selectedYear === adminTarget.year && selectedMonth === adminTarget.month;
  const isDeadlinePassed = isTargetMonth && deadlineStr ? new Date(deadlineStr) < new Date() : false;
  if (isDeadlinePassed) {
    alert('締め切りが過ぎているため、提出できません。');
    return;
  }
  
  if (!confirm('シフト希望を提出しますか？提出後は編集できなくなります。')) {
    return;
  }
  
  const noteInput = document.getElementById('noteInput');
  if (noteInput) {
    currentData.note = noteInput.value;
  }
  
  currentData.submitted = true;
  currentData.submittedAt = new Date().toISOString();

  // 提出フラグを月別で保存
  const CURRENT_USER_KEY = 'current_user';
  const currentUser = localStorage.getItem(CURRENT_USER_KEY);
  let userKeyForSubmit = currentNurse;

  if (currentUser) {
    const user = JSON.parse(currentUser);
    userKeyForSubmit = user.userKey || currentNurse;
  }

  localStorage.setItem(getMonthSubmittedKey(userKeyForSubmit, selectedYear, selectedMonth), 'true');

  saveData();
  updateStatus();
  alert('シフト希望を提出しました。ありがとうございます。');
}

// 提出を取り消す
function cancelSubmit() {
  if (!currentData) return;

  const deadlineStr = localStorage.getItem(DEADLINE_KEY);
  const adminTarget = getShiftTarget();
  const isTargetMonth = selectedYear === adminTarget.year && selectedMonth === adminTarget.month;
  const isDeadlinePassed = isTargetMonth && deadlineStr ? new Date(deadlineStr) < new Date() : false;

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
  
  localStorage.removeItem(getMonthSubmittedKey(userKeyForSubmit, selectedYear, selectedMonth));

  saveData();
  updateStatus();
  initCalendar();

  alert('提出を取り消しました。再度編集できます。');
}

// 設定ページを開く
function openSettingsPage() {
  if (!currentData) {
    console.warn('currentData is not loaded yet, attempting to load...');
    loadData();
    if (!currentData) {
      console.error('Failed to load currentData');
      alert('データの読み込みに失敗しました。ページを再読み込みしてください。');
      return;
    }
  }
  
  const settingsModal = document.getElementById('settingsModal');
  if (!settingsModal) {
    console.error('settingsModal element not found');
    return;
  }
  
  // 現在の価値観設定を反映
  const currentValue = currentData.preferences ? currentData.preferences.valuePreference : null;
  const radios = document.querySelectorAll('input[name="valuePreference"]');
  radios.forEach(radio => {
    radio.checked = radio.value === currentValue;
  });
  
  // モーダルを表示
  settingsModal.classList.add('active');
  document.body.style.overflow = 'hidden'; // 背景スクロールを無効化
}

// 設定ページを閉じる
function closeSettingsPage() {
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal) {
    settingsModal.classList.remove('active');
    document.body.style.overflow = ''; // 背景スクロールを再有効化
  }
  
  // 設定ページから来た場合はトップページに戻る
  const urlParams = new URLSearchParams(window.location.search);
  const page = urlParams.get('page');
  if (page === 'settings') {
    window.location.href = 'top.html';
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

// 月セレクタを描画（現在月 ±5ヶ月を表示）
function renderMonthSelector() {
  const container = document.getElementById('monthSelector');
  if (!container) return;

  const userKey = getCurrentUserKey() || currentNurse;
  const monthSet = new Map(); // "YYYY-MM" → {year, month}

  // 1) 今日基準：来月・再来月・その次の月（+1/+2/+3）
  const now = new Date();
  [1, 2, 3].forEach(offset => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const y = d.getFullYear(), m = d.getMonth() + 1;
    monthSet.set(`${y}-${m}`, { year: y, month: m });
  });

  // 2) ユーザーがすでにデータを持つ月（管理者が対象月を動かしても消えない）
  //    キー形式: shift_request_{userKey}_{year}_{month}
  //    年月は末尾の _YYYY_M(M) で識別（userKey自体が _ を含む可能性があるため末尾正規表現）
  const prefix = `${STORAGE_KEY_PREFIX}${userKey}_`;
  Object.keys(localStorage)
    .filter(k => k.startsWith(prefix))
    .forEach(k => {
      const tail = k.slice(prefix.length);          // "2026_6" など
      const match = tail.match(/^(\d{4})_(\d{1,2})$/);
      if (match) {
        const y = parseInt(match[1]), m = parseInt(match[2]);
        monthSet.set(`${y}-${m}`, { year: y, month: m });
      }
    });

  // 時系列順にソート
  const tabs = Array.from(monthSet.values())
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

  container.innerHTML = '';
  tabs.forEach(({ year, month }) => {
    const locked = isMonthLocked(year, month);
    const unlocked = locked && isUserMonthUnlocked(userKey, year, month);
    const isSelected = year === selectedYear && month === selectedMonth;

    const btn = document.createElement('button');
    btn.className = 'month-tab' + (isSelected ? ' active' : '');
    btn.type = 'button';

    let lockIcon = '';
    if (locked && !unlocked) lockIcon = ' 🔒';
    else if (locked && unlocked) lockIcon = ' 🔓';

    btn.textContent = `${year}年${month}月${lockIcon}`;
    btn.addEventListener('click', () => switchToMonth(year, month));
    container.appendChild(btn);
  });
}

// イベントリスナーの設定
document.addEventListener('DOMContentLoaded', () => {
  // ログイン状態を確認
  autoLogin();
  
  // 少し遅延してからクイックオプションを初期化（カレンダーが表示された後）
  setTimeout(() => {
    initQuickOptions();
  }, 200);
  
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

