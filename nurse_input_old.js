// グローバル変数
let currentNurse = null;
let currentData = null;
let selectedDate = null;
const STORAGE_KEY_PREFIX = 'shift_request_';
const DEADLINE_KEY = 'shift_deadline';
const SUBMITTED_KEY_PREFIX = 'shift_submitted_';

// 希望の種類を拡張
const REQUEST_TYPES = {
  AVAILABLE: 'available',
  NO_DAY: 'no-day',
  NO_NIGHT: 'no-night',
  NO_ALL: 'no-all',
  NO_ALL_BUT_NIGHT_BEFORE: 'no-all-but-night-before' // 当直明けなら可
};

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
  return dayOfWeek === 0 || dayOfWeek === 6; // 0=日曜, 6=土曜
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
    // ログイン済みの場合は看護師名を設定
    currentNurse = user.fullName || `${user.lastName} ${user.firstName}`;
    return true;
  }
  return false;
}

// ログイン処理（旧方式との互換性のため残す）
function login(nurseName) {
  if (!nurseName || !nurseName.trim()) {
    alert('看護師名を入力してください');
    return;
  }

  currentNurse = nurseName.trim();
  
  // LocalStorageからデータを読み込み
  loadData();
  
  // 画面を切り替え
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
  
  // カレンダーを初期化
  initCalendar();
  updateStatus();
}

// 自動ログイン（ログイン済みの場合）
function autoLogin() {
  if (checkLoginStatus()) {
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
      // 個人設定ページを開く
      const nightShiftSelection = document.getElementById('nightShiftSelection');
      const mainCalendar = document.getElementById('mainCalendar');
      if (nightShiftSelection) nightShiftSelection.style.display = 'none';
      if (mainCalendar) mainCalendar.style.display = 'block';
      
      // 設定ボタンを表示
      const settingsBtn = document.getElementById('settingsBtn');
      if (settingsBtn) {
        settingsBtn.style.display = 'inline-block';
      }
      
      // 設定ページを開く
      setTimeout(() => {
        openSettingsPage();
      }, 100);
    } else {
      // 通常の希望入力ページ
      // 夜勤設定を確認（loadData内で処理）
    }
  } else {
    // ログインしていない場合はログインページへ
    window.location.href = 'login.html';
  }
}

// データの読み込み
function loadData() {
  // ログイン済みの場合はユーザーキーを使用
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
      doesNightShift: null, // 夜勤をするかどうか（null = 未設定）
      preferences: {
        consecutiveDaysOffAfterNight: false, // 夜勤明けの休みと休日が連続することを積極的に希望する
        consecutiveDaysOff: false, // 休日の連続を希望する
        distributeDaysOff: false // 休日は分散して配置することを希望する
      }
    };
    saveData();
  }
  
  // 提出状態を確認
  const CURRENT_USER_KEY = 'current_user';
  const currentUser = localStorage.getItem(CURRENT_USER_KEY);
  let userKeyForSubmit = currentNurse;
  
  if (currentUser) {
    const user = JSON.parse(currentUser);
    userKeyForSubmit = user.userKey || currentNurse;
  }
  
  const submittedKey = SUBMITTED_KEY_PREFIX + userKeyForSubmit;
  const isSubmitted = localStorage.getItem(submittedKey) === 'true';
  currentData.submitted = isSubmitted;
  
  // 設定が未設定の場合は初期化
  if (!currentData.preferences) {
    currentData.preferences = {
      consecutiveDaysOffAfterNight: false,
      consecutiveDaysOff: false,
      distributeDaysOff: false
    };
    saveData();
  }
  
  // 旧形式の設定を新しい形式に変換
  if (currentData.preferences.acceptDayOffAfterNight !== undefined) {
    // 旧形式の設定がある場合は削除
    delete currentData.preferences.acceptDayOffAfterNight;
    saveData();
  }
  
  // UIを更新（要素が存在する場合のみ）
  const currentNurseNameEl = document.getElementById('currentNurseName');
  const displayNurseNameEl = document.getElementById('displayNurseName');
  const noteInputEl = document.getElementById('noteInput');
  
  if (currentNurseNameEl) currentNurseNameEl.textContent = currentNurse;
  if (displayNurseNameEl) displayNurseNameEl.textContent = currentNurse;
  if (noteInputEl) noteInputEl.value = currentData.note || '';
  
  // 設定ページの値を更新
  if (currentData.preferences) {
    const prefConsecutiveAfterNight = document.getElementById('prefConsecutiveDaysOffAfterNight');
    const prefConsecutive = document.getElementById('prefConsecutiveDaysOff');
    const prefDistribute = document.getElementById('prefDistributeDaysOff');
    
    if (prefConsecutiveAfterNight) prefConsecutiveAfterNight.checked = currentData.preferences.consecutiveDaysOffAfterNight || false;
    if (prefConsecutive) prefConsecutive.checked = currentData.preferences.consecutiveDaysOff || false;
    if (prefDistribute) prefDistribute.checked = currentData.preferences.distributeDaysOff || false;
  }
  
  // 夜勤設定を確認（URLパラメータで設定ページの場合はスキップ）
  const urlParams = new URLSearchParams(window.location.search);
  const page = urlParams.get('page');
  
  if (page !== 'settings') {
    // 夜勤設定情報を表示
    const nightShiftInfo = document.getElementById('nightShiftInfo');
    const nightShiftStatus = document.getElementById('nightShiftStatus');
    
    if (currentData.doesNightShift === null || currentData.doesNightShift === undefined) {
      // 夜勤設定が未設定の場合はメッセージを表示
      if (nightShiftInfo) nightShiftInfo.style.display = 'block';
      if (nightShiftStatus) nightShiftStatus.textContent = '未設定（管理者に連絡してください）';
      if (nightShiftStatus) nightShiftStatus.style.color = '#dc3545';
      
      // カレンダーは表示しない
      const mainCalendar = document.getElementById('mainCalendar');
      if (mainCalendar) mainCalendar.style.display = 'none';
    } else {
      // 夜勤設定が設定されている場合はカレンダーを表示
      if (nightShiftInfo) nightShiftInfo.style.display = 'block';
      if (nightShiftStatus) {
        nightShiftStatus.textContent = currentData.doesNightShift ? '夜勤をします' : '夜勤はしません';
        nightShiftStatus.style.color = '#28a745';
      }
      
      const mainCalendar = document.getElementById('mainCalendar');
      if (mainCalendar) mainCalendar.style.display = 'block';
      
      // 設定ボタンを表示
      const settingsBtn = document.getElementById('settingsBtn');
      if (settingsBtn) {
        settingsBtn.style.display = 'inline-block';
      }
      // 凡例を更新
      const nightBeforeLegend = document.getElementById('nightBeforeLegend');
      if (nightBeforeLegend) {
        nightBeforeLegend.style.display = currentData.doesNightShift ? 'flex' : 'none';
      }
      updateSubmitButtons();
      initCalendar();
    }
  }
}

// 夜勤設定は管理者のみ変更可能（削除）

// データの保存
function saveData() {
  if (!currentNurse) return;
  
  // ログイン済みの場合はユーザーキーを使用
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
  if (!calendarGrid) return;
  
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
  
  // 2025年8月の最初の日を取得して、その週の開始日を計算
  const firstDay = new Date(2025, 7, 1); // 8月は7（0-indexed）
  const firstDayOfWeek = firstDay.getDay(); // 0=日曜, 6=土曜
  
  // 最初の週の空白セルを追加
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
    
    // 日付番号と曜日を表示
    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = day;
    dayCell.appendChild(dayNumber);
    
    const dayLabel = document.createElement('div');
    dayLabel.className = 'day-label';
    
    // 既存のデータを反映
    const request = currentData.requests[date];
    if (request) {
      dayCell.classList.add(request);
      dayLabel.textContent = getRequestTypeLabelShort(request);
    } else {
      // 未入力の場合は「未入力」を表示
      dayLabel.textContent = '未入力';
      dayLabel.style.color = '#999';
    }
    
    dayCell.appendChild(dayLabel);
    
    // 編集可能かどうか
    if (isEditable) {
      dayCell.style.cursor = 'pointer';
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
  
  // 最後の週の空白セルを追加（31日後を計算）
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
  const labels = {
    'available': '○',
    'no-day': '日勤✕',
    'no-night': '夜勤✕',
    'no-all': '✕',
    'no-all-but-night-before': '✕(明け可)'
  };
  return labels[requestType] || '';
}

// セルのテキストを更新
function updateCellText(cell, requestType) {
  // day-label要素を探して更新
  const dayLabel = cell.querySelector('.day-label');
  if (dayLabel) {
    dayLabel.textContent = getRequestTypeLabelShort(requestType);
    dayLabel.style.color = '#666';
    dayLabel.title = getRequestTypeLabel(requestType);
  }
  // ツールチップも設定
  cell.title = getRequestTypeLabel(requestType);
}

// 希望タイプのラベルを取得
function getRequestTypeLabel(requestType) {
  const labels = {
    'available': '希望なし（終日勤務可能）',
    'no-day': '日勤不可',
    'no-night': '夜勤不可',
    'no-all': '終日不可',
    'no-all-but-night-before': '終日不可（夜勤明けの休みならば歓迎！）'
  };
  return labels[requestType] || '';
}

// 選択モーダルを開く
function openSelectionModal(date) {
  if (currentData.submitted) return;
  
  selectedDate = date;
  const modal = document.getElementById('selectionModal');
  const dateLabel = document.getElementById('selectedDate');
  const optionsContainer = document.getElementById('modalOptions');
  
  dateLabel.textContent = `${date} (${getDayOfWeek(date)})`;
  
  // 夜勤の有無に応じて選択肢を生成
  const doesNightShift = currentData.doesNightShift;
  const currentRequest = currentData.requests[date];
  
  let options = [];
  
  if (doesNightShift) {
    // 夜勤をする人の選択肢
    options = [
      { value: 'available', label: '希望なし（終日勤務可能）', desc: '日勤・夜勤どちらも可能' },
      { value: 'no-day', label: '日勤不可', desc: '日勤は不可ですが夜勤は可能' },
      { value: 'no-night', label: '夜勤不可', desc: '夜勤は不可ですが日勤は可能' },
      { value: 'no-all', label: '終日不可', desc: 'その日は勤務不可' },
      { value: 'no-all-but-night-before', label: '終日不可（夜勤明けの休みならば歓迎！）', desc: '休み希望だが、夜勤明けの休みなら許容します' }
    ];
  } else {
    // 夜勤をしない人の選択肢
    options = [
      { value: 'available', label: '希望なし（日勤可能）', desc: '日勤可能' },
      { value: 'no-day', label: '日勤不可', desc: 'その日は日勤不可（休み）' },
      { value: 'no-all', label: '終日不可', desc: 'その日は勤務不可' }
    ];
  }
  
  // 選択肢ボタンを生成
  optionsContainer.innerHTML = options.map(opt => `
    <button class="option-button ${currentRequest === opt.value ? 'selected' : ''}" 
            data-value="${opt.value}">
      <strong>${opt.label}</strong>
      <div style="font-size: 12px; color: #666; margin-top: 4px;">${opt.desc}</div>
    </button>
  `).join('');
  
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
  document.getElementById('selectionModal').classList.remove('active');
  selectedDate = null;
}

// 希望を設定
function setRequest(date, requestType) {
  if (!currentNurse) return;
  
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
    cell.classList.remove('available', 'no-day', 'no-night', 'no-all', 'no-all-but-night-before');
    cell.classList.add(requestType);
    cell.style.background = ''; // 背景色をリセット
    updateCellText(cell, requestType);
    
    // アニメーション効果
    cell.style.transform = 'scale(1.1)';
    setTimeout(() => {
      cell.style.transform = '';
    }, 200);
  }
  
  // 自動保存
  saveData();
  updateProgress();
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
    
    // カレンダーの編集を無効化
    document.querySelectorAll('.day-cell').forEach(cell => {
      cell.classList.add('disabled');
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
  const deadlineInfo = document.getElementById('deadlineInfo');
  const deadlineStr = localStorage.getItem(DEADLINE_KEY);
  
  if (deadlineStr) {
    const deadline = new Date(deadlineStr);
    const now = new Date();
    const diff = deadline - now;
    
    // 大きなバナーを表示
    if (deadlineBanner) {
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
        
        // 3日前以内は警告色に変更
        if (days <= 3) {
          deadlineBanner.style.background = '#ffc107';
          deadlineBanner.style.color = '#856404';
        } else {
          deadlineBanner.style.background = '#dc3545';
          deadlineBanner.style.color = 'white';
        }
      } else {
        // 締め切りが過ぎている
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
    }
    
    // 小さな表示も更新（既存の互換性のため）
    if (deadlineInfo) {
      deadlineInfo.style.display = 'block';
      const deadlineDateSmallEl = document.getElementById('deadlineDateSmall');
      if (deadlineDateSmallEl) {
        if (diff > 0) {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          deadlineDateSmallEl.textContent = 
            `${deadline.toLocaleString('ja-JP')} (あと${days}日${hours}時間)`;
        } else {
          deadlineDateSmallEl.textContent = 
            `${deadline.toLocaleString('ja-JP')} (締め切り済み)`;
        }
      }
      
      if (diff <= 0) {
        deadlineInfo.classList.add('deadline-warning');
      } else {
        deadlineInfo.classList.remove('deadline-warning');
      }
    }
  } else {
    if (deadlineBanner) deadlineBanner.style.display = 'none';
    if (deadlineInfo) deadlineInfo.style.display = 'none';
  }
}

// 下書き保存
function saveDraft() {
  currentData.note = document.getElementById('noteInput').value;
  saveData();
  
  // 一時的な通知
  const btn = document.getElementById('saveDraftBtn');
  const originalText = btn.textContent;
  btn.textContent = '保存しました！';
  btn.style.background = '#28a745';
  
  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.background = '';
  }, 2000);
}

// 提出
function submit() {
  if (!confirm('シフト希望を提出しますか？提出後は編集できなくなります。')) {
    return;
  }
  
  currentData.note = document.getElementById('noteInput').value;
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
  // 締め切りチェック
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
  
  // 提出フラグを削除
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
  
  // カレンダーを再初期化
  initCalendar();
  
  alert('提出を取り消しました。再度編集できます。');
}

// 設定ページを開く
function openSettingsPage() {
  if (!currentData) return;
  
  // 締め切りチェック
  const deadlineStr = localStorage.getItem(DEADLINE_KEY);
  const isDeadlinePassed = deadlineStr ? new Date(deadlineStr) < new Date() : false;
  
  if (currentData.submitted || isDeadlinePassed) {
    // 提出済みでも設定は変更可能
  }
  
  // 現在の設定値を反映
  if (currentData.preferences) {
    const prefConsecutiveAfterNight = document.getElementById('prefConsecutiveDaysOffAfterNight');
    const prefConsecutive = document.getElementById('prefConsecutiveDaysOff');
    const prefDistribute = document.getElementById('prefDistributeDaysOff');
    
    if (prefConsecutiveAfterNight) prefConsecutiveAfterNight.checked = currentData.preferences.consecutiveDaysOffAfterNight || false;
    if (prefConsecutive) prefConsecutive.checked = currentData.preferences.consecutiveDaysOff || false;
    if (prefDistribute) prefDistribute.checked = currentData.preferences.distributeDaysOff || false;
  }
  
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal) {
    settingsModal.classList.add('active');
  }
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
    currentData.preferences = {};
  }
  
  const prefConsecutiveAfterNight = document.getElementById('prefConsecutiveDaysOffAfterNight');
  const prefConsecutive = document.getElementById('prefConsecutiveDaysOff');
  const prefDistribute = document.getElementById('prefDistributeDaysOff');
  
  if (prefConsecutiveAfterNight) currentData.preferences.consecutiveDaysOffAfterNight = prefConsecutiveAfterNight.checked;
  if (prefConsecutive) currentData.preferences.consecutiveDaysOff = prefConsecutive.checked;
  if (prefDistribute) currentData.preferences.distributeDaysOff = prefDistribute.checked;
  
  saveData();
  closeSettingsPage();
  alert('設定を保存しました');
}

// ログアウト（トップページに戻る）
function goToTop() {
  window.location.href = 'top.html';
}

// リマインダーメールチェック（期限3日前に未提出者に送信）
function checkReminderEmail() {
  const deadlineStr = localStorage.getItem(DEADLINE_KEY);
  if (!deadlineStr) return;
  
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diff = deadline - now;
  const daysUntilDeadline = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  // 3日前のチェック
  if (daysUntilDeadline === 3) {
    const CURRENT_USER_KEY = 'current_user';
    const currentUser = localStorage.getItem(CURRENT_USER_KEY);
    if (!currentUser) return;
    
    const user = JSON.parse(currentUser);
    const userKey = user.userKey || `${user.lastName}_${user.firstName}_${user.email}`;
    const submittedKey = SUBMITTED_KEY_PREFIX + userKey;
    
    // 提出状況を確認
    const isSubmitted = localStorage.getItem(submittedKey) === 'true';
    
    if (!isSubmitted) {
      // 未提出の場合、通知を送信
      sendReminderEmail(user.email, user.fullName, deadline);
    }
  }
}

// リマインダーメールを送信（テンプレート）
function sendReminderEmail(email, name, deadline) {
  const NOTIFICATION_SENT_KEY = `reminder_sent_${email}_${deadline.toISOString().split('T')[0]}`;
  
  // 既に送信済みかチェック
  if (localStorage.getItem(NOTIFICATION_SENT_KEY)) {
    return;
  }
  
  // メールテンプレート
  const subject = '【重要】シフト希望調査の締め切りが近づいています';
  const body = `
${name} 様

シフト希望調査の締め切りが近づいています。

【締め切り日時】
${deadline.toLocaleString('ja-JP')}

まだシフト希望の提出が完了していません。
お忙しいとは存じますが、期日までにシフト希望の入力をお願いいたします。

以下のURLから入力できます：
${window.location.origin}/nurse_input.html

よろしくお願いいたします。
手術室シフト管理システム
  `.trim();
  
  // 実際のメール送信はバックエンドが必要
  // ここでは送信ログを記録
  console.log('=== リマインダーメール送信（テンプレート） ===');
  console.log('宛先:', email);
  console.log('件名:', subject);
  console.log('本文:', body);
  
  // 送信済みフラグを設定
  localStorage.setItem(NOTIFICATION_SENT_KEY, 'true');
  
  // ユーザーに通知（実際の実装では、バックエンドでメールを送信）
  // デモ版ではコンソールに出力のみ
}

// イベントリスナーの設定
document.addEventListener('DOMContentLoaded', () => {
  // ログイン状態を確認
  autoLogin();
  
  // ログインボタン（旧方式との互換性のため残す）
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      const nurseName = document.getElementById('nurseName').value;
      login(nurseName);
    });
  }
  
  // Enterキーでログイン（旧方式との互換性のため残す）
  const nurseNameInput = document.getElementById('nurseName');
  if (nurseNameInput) {
    nurseNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        login(document.getElementById('nurseName').value);
      }
    });
  }
  
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
  
  // リマインダーメールチェック（期限3日前に未提出者に送信）
  checkReminderEmail();
  
  // 既存のログイン状態を確認
  const lastNurse = localStorage.getItem('last_logged_in_nurse');
  if (lastNurse) {
    const nurseNameInput = document.getElementById('nurseName');
    if (nurseNameInput) {
      nurseNameInput.value = lastNurse;
    }
  }
});

// ログイン時に最後のログインユーザーを保存
const originalLogin = login;
login = function(nurseName) {
  localStorage.setItem('last_logged_in_nurse', nurseName);
  originalLogin(nurseName);
};
