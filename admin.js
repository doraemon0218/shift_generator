// 定数は common.js から継承
// SUBMITTED_KEY_PREFIX, STORAGE_KEY_PREFIX, DEADLINE_KEY は common.js から継承

let isReadOnlyAdminView = false;

// 管理者画面で選択中の年月
let adminSelectedYear = null;
let adminSelectedMonth = null;

function initAdminSelectedMonth() {
  const target = getShiftTarget();
  adminSelectedYear = target.year;
  adminSelectedMonth = target.month;
}

function adminSwitchToMonth(year, month) {
  adminSelectedYear = year;
  adminSelectedMonth = month;
  renderAdminMonthSelector();
  loadIntegratedBoard();
  const container = document.getElementById('allNurseRequestsContainer');
  if (container && container.style.display !== 'none') {
    loadAllNurseRequests();
  }
  // fixパネルの年月入力も同期
  const fy = document.getElementById('fixYearInput');
  const fm = document.getElementById('fixMonthInput');
  if (fy) fy.value = year;
  if (fm) fm.value = month;
  renderFixManagement();
}

function renderAdminMonthSelector() {
  const container = document.getElementById('adminMonthSelector');
  if (!container) return;
  container.innerHTML = '';
  const now = new Date();

  function makeBtn(y, m, extraStyle = '') {
    const locked = isMonthLocked(y, m);
    const isSelected = y === adminSelectedYear && m === adminSelectedMonth;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'month-tab-admin' + (isSelected ? ' active' : '');
    if (extraStyle && !isSelected) btn.style.cssText = extraStyle;
    btn.textContent = `${y}年${m}月` + (locked ? ' 🔒' : '');
    btn.addEventListener('click', () => adminSwitchToMonth(y, m));
    return btn;
  }

  function makeGroup(labelText, labelStyle) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom: 10px;';
    const label = document.createElement('div');
    label.style.cssText = `font-size: 11px; font-weight: 700; margin-bottom: 6px; color: #555; ${labelStyle || ''}`;
    label.textContent = labelText;
    wrap.appendChild(label);
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap;';
    wrap.appendChild(row);
    return { wrap, row };
  }

  // ── 直近3ヶ月（来月・再来月・その次）──
  const upcomingGroup = makeGroup('📅 直近3ヶ月（シフト入力対象）');
  for (let offset = 1; offset <= 3; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    upcomingGroup.row.appendChild(makeBtn(d.getFullYear(), d.getMonth() + 1));
  }
  container.appendChild(upcomingGroup.wrap);

  // ── 過去のfix済み（LocalStorageをスキャン）──
  const fixedMonths = [];
  Object.keys(localStorage).forEach(key => {
    const match = key.match(/^shift_month_locked_(\d{4})_(\d{1,2})$/);
    if (match && localStorage.getItem(key) === 'true') {
      fixedMonths.push({ y: parseInt(match[1]), m: parseInt(match[2]) });
    }
  });
  fixedMonths.sort((a, b) => b.y !== a.y ? b.y - a.y : b.m - a.m); // 新しい順

  if (fixedMonths.length > 0) {
    const fixedGroup = makeGroup('🔒 過去のfix済み', 'color: #5c6bc0;');
    fixedMonths.forEach(({ y, m }) => {
      fixedGroup.row.appendChild(makeBtn(y, m, 'background:#e8eaf6; border-color:#9fa8da; color:#3949ab;'));
    });
    container.appendChild(fixedGroup.wrap);
  }

  // ── 現在選択中の月が上記いずれにも含まれない場合、単独で表示 ──
  if (adminSelectedYear && adminSelectedMonth) {
    const inUpcoming = [1,2,3].some(o => {
      const d = new Date(now.getFullYear(), now.getMonth() + o, 1);
      return d.getFullYear() === adminSelectedYear && d.getMonth() + 1 === adminSelectedMonth;
    });
    const inFixed = fixedMonths.some(({ y, m }) => y === adminSelectedYear && m === adminSelectedMonth);
    if (!inUpcoming && !inFixed) {
      const otherGroup = makeGroup('📌 現在選択中');
      otherGroup.row.appendChild(makeBtn(adminSelectedYear, adminSelectedMonth));
      container.appendChild(otherGroup.wrap);
    }
  }
}

// getSageImageUri, normalizeShiftCapability, getCurrentUser, getUsers, saveUsers, getAdminUsers, saveAdminUsers, getAdminRequests, saveAdminRequests は common.js から継承

// SVG版のgetSageImageUri（admin.js用）
function getSageImageUriAdmin(diffMs) {
  const hoursLeft = diffMs / (1000 * 60 * 60);
  let state = 'calm';
  if (hoursLeft <= 24) state = 'angry';
  else if (hoursLeft <= 72) state = 'sweat';
  const SAGE_SVGS = {
    calm: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="28" fill="#f5deb3" stroke="#6b4f2a" stroke-width="2"/><path d="M16 28 Q36 8 56 28" fill="#e0e0e0" stroke="#6b4f2a" stroke-width="2"/><circle cx="27" cy="34" r="3" fill="#333"/><circle cx="45" cy="34" r="3" fill="#333"/><path d="M26 45 Q36 53 46 45" stroke="#333" stroke-width="3" fill="none"/></svg>',
    sweat: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="28" fill="#f5deb3" stroke="#6b4f2a" stroke-width="2"/><path d="M16 28 Q36 8 56 28" fill="#e0e0e0" stroke="#6b4f2a" stroke-width="2"/><circle cx="27" cy="34" r="3" fill="#333"/><circle cx="45" cy="34" r="3" fill="#333"/><path d="M26 48 Q36 42 46 48" stroke="#333" stroke-width="3" fill="none"/><path d="M54 38 Q60 42 56 50 Q50 46 54 38" fill="#6ec6ff" stroke="#2c7fb8" stroke-width="1"/></svg>',
    angry: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="28" fill="#f5deb3" stroke="#6b4f2a" stroke-width="2"/><path d="M16 28 Q36 8 56 28" fill="#e0e0e0" stroke="#6b4f2a" stroke-width="2"/><path d="M22 30 L30 26" stroke="#333" stroke-width="3"/><path d="M50 30 L42 26" stroke="#333" stroke-width="3"/><circle cx="27" cy="36" r="3" fill="#333"/><circle cx="45" cy="36" r="3" fill="#333"/><path d="M26 50 Q36 42 46 50" stroke="#333" stroke-width="3" fill="none"/></svg>'
  };
  return `data:image/svg+xml;utf8,${encodeURIComponent(SAGE_SVGS[state])}`;
}

function getShiftCapabilityLabel(capability) {
  if (capability === SHIFT_CAPABILITIES.DAY_ONLY) return '日勤のみ';
  if (capability === SHIFT_CAPABILITIES.DAY_LATE) return '日勤＋遅出';
  if (capability === SHIFT_CAPABILITIES.DAY_NIGHT) return '日勤＋夜勤（遅出なし）';
  if (capability === SHIFT_CAPABILITIES.ALL) return '全部する';
  return '未設定（管理者）';
}

// VALUE_PREFERENCE_OPTIONS, getUserDirectory, getAdminUsers, saveAdminUsers は common.js から継承

// getAdminRequests, saveAdminRequests は common.js から継承

function formatRequestedAt(value) {
  if (!value) return '日時不明';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日時不明';
  return date.toLocaleString('ja-JP');
}

// 管理者申請一覧を表示
function loadAdminRequestList() {
  const container = document.getElementById('adminRequestList');
  if (!container) return;

  const requests = getAdminRequests()
    .filter(request => request && request.email)
    .sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));

  if (requests.length === 0) {
    container.innerHTML = '<p style="color: #666;">管理者申請はありません</p>';
    return;
  }

  container.innerHTML = `
    <div style="background: white; border: 1px solid #ddd; border-radius: 6px; padding: 12px;">
      ${requests.map(request => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee;">
          <div>
            <div style="font-weight: 600;">${request.fullName || '名前未登録'}</div>
            <div style="font-size: 12px; color: #666;">${request.email}</div>
            <div style="font-size: 12px; color: #666;">申請日時: ${formatRequestedAt(request.requestedAt)}</div>
          </div>
          ${isReadOnlyAdminView ? '<span style="color: #999;">閲覧のみ</span>' : `
            <div style="display: flex; gap: 6px;">
              <button onclick="approveAdminRequest('${request.email}')" style="padding: 4px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">承認</button>
              <button onclick="rejectAdminRequest('${request.email}')" style="padding: 4px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">却下</button>
            </div>
          `}
        </div>
      `).join('')}
    </div>
  `;
}

// 管理者申請を承認
function approveAdminRequest(email) {
  if (!confirm(`管理者として承認しますか？\n${email}`)) {
    return;
  }

  const requests = getAdminRequests();
  const filtered = requests.filter(request => request.email !== email);
  if (filtered.length === requests.length) {
    alert('該当する申請が見つかりません');
    return;
  }

  const admins = getAdminUsers();
  if (!admins.includes(email)) {
    admins.push(email);
    saveAdminUsers(admins);
  }

  saveAdminRequests(filtered);

  const currentUser = getCurrentUser();
  if (currentUser && currentUser.email === email) {
    currentUser.isAdmin = true;
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
  }

  loadAdminRequestList();
  loadAdminList();
  alert('管理者として承認しました');
}

// 管理者申請を却下
function rejectAdminRequest(email) {
  if (!confirm(`管理者申請を却下しますか？\n${email}`)) {
    return;
  }

  const requests = getAdminRequests();
  const filtered = requests.filter(request => request.email !== email);
  if (filtered.length === requests.length) {
    alert('該当する申請が見つかりません');
    return;
  }

  saveAdminRequests(filtered);
  loadAdminRequestList();
  alert('管理者申請を却下しました');
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
  const requests = getAdminRequests();
  const filtered = requests.filter(request => request.email !== email);
  if (filtered.length !== requests.length) {
    saveAdminRequests(filtered);
  }
  emailInput.value = '';
  loadAdminList();
  loadAdminRequestList();
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
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.email === email) {
    currentUser.isAdmin = false;
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
  }
}

// 管理者リストを表示
function loadAdminList() {
  const admins = getAdminUsers();
  const container = document.getElementById('adminList');
  const users = getUserDirectory();
  
  if (admins.length === 0) {
    container.innerHTML = '<p style="color: #666;">管理者が設定されていません</p>';
    return;
  }
  
  // 管理者のメールアドレスからユーザー情報を取得
  const adminUserList = admins.map(email => {
    // メールアドレスでユーザーを検索
    let userInfo = null;
    let userKey = null;
    for (const [key, user] of Object.entries(users)) {
      if (user.email === email) {
        userInfo = user;
        userKey = key;
        break;
      }
    }
    
    return {
      email,
      userInfo,
      userKey,
      displayName: userInfo ? userInfo.fullName : email
    };
  });
  
  container.innerHTML = `
    <div style="background: white; border: 1px solid #ddd; border-radius: 6px; padding: 12px;">
      <strong style="display: block; margin-bottom: 8px;">登録されている管理者:</strong>
      ${adminUserList.map(admin => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee;">
          <div style="flex: 1;">
            <div style="font-weight: 600;">${admin.displayName}</div>
            <div style="font-size: 12px; color: #666;">${admin.email}</div>
          </div>
          <div style="display: flex; gap: 8px;">
            ${isReadOnlyAdminView ? '' : `
              <button onclick="removeAdmin('${admin.email}')" style="padding: 4px 12px; background: #ff9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;" title="管理者権限を削除">管理者削除</button>
              ${admin.userKey ? `<button onclick="deleteNurseAccount('${admin.userKey}')" style="padding: 4px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;" title="アカウントを完全に削除">アカウント削除</button>` : ''}
            `}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// 看護師の夜勤設定を読み込み
function loadNurseNightShiftSettings() {
  const container = document.getElementById('nightShiftSettings');
  if (!container) return;
  
  // トグル機能：既に表示されている場合は非表示にする
  if (container.innerHTML.trim() !== '' && container.style.display !== 'none') {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'block';
  
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
      data.doesNightShift = initialShiftCapability === SHIFT_CAPABILITIES.ALL || initialShiftCapability === SHIFT_CAPABILITIES.DAY_NIGHT;
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
    return a.name.localeCompare(b.name, 'ja');
  });
  
  if (nurseList.length === 0) {
    container.innerHTML = '<p style="color: #666;">看護師データがありません</p>';
    return;
  }
  
  container.innerHTML = `
    <div style="background: white; border: 1px solid #ddd; border-radius: 6px; padding: 16px; overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; min-width: 640px;">
        <thead>
          <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
            <th style="padding: 12px; text-align: left;">看護師名</th>
            <th style="padding: 12px; text-align: left;">夜勤設定</th>
            <th style="padding: 12px; text-align: left;">操作</th>
          </tr>
        </thead>
        <tbody>
          ${nurseList.map(nurse => {
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
                    <button onclick="setNurseShiftCapability('${nurse.userKey}', '${SHIFT_CAPABILITIES.DAY_ONLY}')" 
                            style="padding: 6px 12px; background: #4a90e2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                      日勤のみ
                    </button>
                    <button onclick="setNurseShiftCapability('${nurse.userKey}', '${SHIFT_CAPABILITIES.DAY_LATE}')" 
                            style="padding: 6px 12px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                      日勤＋遅出
                    </button>
                    <button onclick="setNurseShiftCapability('${nurse.userKey}', '${SHIFT_CAPABILITIES.DAY_NIGHT}')" 
                            style="padding: 6px 12px; background: #5e35b1; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                      日勤＋夜勤（遅出なし）
                    </button>
                    <button onclick="setNurseShiftCapability('${nurse.userKey}', '${SHIFT_CAPABILITIES.ALL}')" 
                            style="padding: 6px 12px; background: #2e7d32; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                      全部する
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

  // トグル機能：既に表示されている場合は非表示にする
  const btn = document.getElementById('valuePreferencesBtn');
  if (container.innerHTML.trim() !== '' && container.style.display !== 'none') {
    container.innerHTML = '';
    container.style.display = 'none';
    if (btn) btn.textContent = '価値観を表示';
    return;
  }
  
  container.style.display = 'block';
  if (btn) btn.textContent = '価値観を非表示';

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
    return a.name.localeCompare(b.name, 'ja');
  });

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
  data.doesNightShift = resolvedCapability === SHIFT_CAPABILITIES.ALL || resolvedCapability === SHIFT_CAPABILITIES.DAY_NIGHT;
  localStorage.setItem(storageKey, JSON.stringify(data));
  
  // 表示を更新
  loadIntegratedBoard();
  loadValuePreferences();
  alert('勤務対応設定を更新しました');
}

// 看護師の登録データを削除（アカウントは残す）
function deleteNurseData(userKey) {
  const users = getUserDirectory();
  const user = users[userKey];
  const displayName = user?.fullName || userKey;
  if (!confirm(`「${displayName}」の登録データを削除しますか？\nシフト希望・提出状況・価値観などがリセットされます。\nアカウントは残ります。`)) {
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

  alert('登録データを削除しました（アカウントは残ります）');
  loadIntegratedBoard();
  loadValuePreferences();
  loadAllNurseRequests();
}

// 看護師のアカウントを完全削除
function deleteNurseAccount(userKey) {
  if (isReadOnlyAdminView) {
    alert('閲覧モードでは編集できません');
    return;
  }

  const users = getUserDirectory();
  const user = users[userKey];
  if (!user) {
    alert('ユーザーが見つかりません');
    return;
  }

  const displayName = user.fullName || userKey;
  const email = user.email || '';
  const currentUser = getCurrentUser();
  
  // 現在ログイン中のユーザーの場合は警告
  if (currentUser && (currentUser.userKey === userKey || currentUser.email === email)) {
    if (!confirm(`警告：現在ログイン中のユーザー「${displayName}」を削除しようとしています。\n削除後はログアウトされます。\n本当に削除しますか？`)) {
      return;
    }
  } else {
    if (!confirm(`「${displayName}」のアカウントを完全に削除しますか？\n\n削除される内容：\n- アカウント情報（ユーザー名、メールアドレスなど）\n- 勤務希望調査の情報（全期間の希望データ）\n- 価値観設定\n- 夜勤ステータス（勤務対応設定）\n- 提出状況\n- 管理者権限（管理者の場合）\n- 通知データ\n\n※ 削除されたアカウントの情報は、すべての場所から削除されます。\n\nこの操作は取り消せません。`)) {
      return;
    }
  }

  // シフト希望データを削除（勤務希望調査の情報、価値観、夜勤ステータスを含む）
  const storageKey = STORAGE_KEY_PREFIX + userKey;
  localStorage.removeItem(storageKey);

  // 提出状況を削除
  const submittedKey = SUBMITTED_KEY_PREFIX + userKey;
  localStorage.removeItem(submittedKey);

  // 通知データを削除
  if (email) {
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

  // 管理者リストから削除
  if (email) {
    const adminUsers = getAdminUsers();
    const filteredAdmins = adminUsers.filter(adminEmail => adminEmail !== email);
    if (filteredAdmins.length !== adminUsers.length) {
      saveAdminUsers(filteredAdmins);
    }

    // 管理者申請からも削除
    const adminRequests = getAdminRequests();
    const filteredRequests = adminRequests.filter(request => request.email !== email);
    if (filteredRequests.length !== adminRequests.length) {
      saveAdminRequests(filteredRequests);
    }
  }

  // ユーザー情報から削除
  delete users[userKey];
  saveUsers(users);

  // 現在ログイン中のユーザーを削除した場合はログアウト
  if (currentUser && (currentUser.userKey === userKey || currentUser.email === email)) {
    alert('アカウントを削除しました。ログアウトします。');
    localStorage.removeItem(CURRENT_USER_KEY);
    window.location.href = 'index.html';
    return;
  }

  alert('アカウントを削除しました');
  loadIntegratedBoard();
  loadValuePreferences();
  loadAllNurseRequests();
  loadAdminList();
}

// 全看護師の勤務希望・価値観を一括管理
function loadAllNurseRequests() {
  const container = document.getElementById('allNurseRequestsContainer');
  if (!container) return;

  // トグル機能
  const btn = document.getElementById('allNurseRequestsBtn');
  if (container.style.display !== 'none' && container.innerHTML.trim() !== '') {
    container.style.display = 'none';
    container.innerHTML = '';
    if (btn) btn.textContent = '一括管理画面を表示';
    return;
  }

  container.style.display = 'block';
  if (btn) btn.textContent = '一括管理画面を非表示';

  const targetYear  = adminSelectedYear;
  const targetMonth = adminSelectedMonth;
  const dates = getMonthDates(targetYear, targetMonth);
  const users = getUserDirectory();

  // 月別キーで検索、旧形式もフォールバック
  const monthSuffix = `_${targetYear}_${targetMonth}`;
  const allKeys = Object.keys(localStorage);
  const nurseDataList = [];

  // 登録ユーザー全員を対象にする
  const userEntries = Object.entries(users);
  if (userEntries.length === 0) {
    container.innerHTML = '<p style="color: #666;">登録ユーザーがいません</p>';
    return;
  }

  userEntries.forEach(([userKey, userInfo]) => {
    const monthKey  = getMonthRequestKey(userKey, targetYear, targetMonth);
    const legacyKey = STORAGE_KEY_PREFIX + userKey;
    const dataStr   = localStorage.getItem(monthKey) || localStorage.getItem(legacyKey);

    const data = dataStr ? JSON.parse(dataStr) : { requests: {}, note: '' };
    const displayName = data.nurseName || userInfo.fullName || userKey;

    const isSubmitted = localStorage.getItem(getMonthSubmittedKey(userKey, targetYear, targetMonth)) === 'true'
                     || localStorage.getItem(SUBMITTED_KEY_PREFIX + userKey) === 'true';

    nurseDataList.push({ userKey, name: displayName, data, isSubmitted, userInfo });
  });

  // 名前順にソート
  nurseDataList.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  // 日付ごとの休日希望数を集計（確定済み / 全員）
  const confirmedOffPerDate = {};
  const totalOffPerDate = {};
  dates.forEach(date => { confirmedOffPerDate[date] = 0; totalOffPerDate[date] = 0; });
  nurseDataList.forEach(nurse => {
    dates.forEach(date => {
      const req = nurse.data.requests?.[date];
      if (req === REQUEST_TYPES.PAID_LEAVE) {
        totalOffPerDate[date]++;
        if (nurse.isSubmitted) confirmedOffPerDate[date]++;
      }
    });
  });

  const submittedCount = nurseDataList.filter(n => n.isSubmitted).length;
  const totalCount = nurseDataList.length;

  const requestTypeColors = {
    [REQUEST_TYPES.AVAILABLE]: '#d4edda',
    [REQUEST_TYPES.DAY_ONLY]: '#fff3cd',
    [REQUEST_TYPES.DAY_LATE]: '#d1ecf1',
    [REQUEST_TYPES.NIGHT_ONLY]: '#e4ddff',
    [REQUEST_TYPES.PAID_LEAVE]: '#f8d7da'
  };
  const requestTypeLightColors = {
    [REQUEST_TYPES.AVAILABLE]: '#f0faf2',
    [REQUEST_TYPES.DAY_ONLY]: '#fffdf0',
    [REQUEST_TYPES.DAY_LATE]: '#f0f9fc',
    [REQUEST_TYPES.NIGHT_ONLY]: '#f6f2ff',
    [REQUEST_TYPES.PAID_LEAVE]: '#fdf4f5'
  };
  const requestTypeLabels = {
    [REQUEST_TYPES.AVAILABLE]: '可',
    [REQUEST_TYPES.DAY_ONLY]: '日',
    [REQUEST_TYPES.DAY_LATE]: '遅',
    [REQUEST_TYPES.NIGHT_ONLY]: '夜',
    [REQUEST_TYPES.PAID_LEAVE]: '休'
  };

  // 集計行のセル背景色（休日希望の重複度に応じて）
  function offCountColor(confirmed, total) {
    if (confirmed === 0 && total === 0) return '#f9f9f9';
    if (confirmed >= 5) return '#fee2e2';
    if (confirmed >= 3) return '#fef9c3';
    if (confirmed >= 1) return '#dcfce7';
    return '#f0f9ff'; // 未確定のみ
  }

  let html = `
    <div style="display:flex; gap:16px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
      <div style="font-size:13px; color:#333;">
        提出済み: <strong style="color:#22c55e;">${submittedCount}名</strong> ／ 未提出: <strong style="color:#f59e0b;">${totalCount - submittedCount}名</strong> ／ 計 ${totalCount}名
      </div>
      <div style="display:flex; gap:8px; font-size:11px; align-items:center; flex-wrap:wrap;">
        <span style="display:inline-block; width:12px; height:12px; background:#22c55e; border-radius:2px; vertical-align:middle;"></span>提出済み（確定）
        <span style="display:inline-block; width:12px; height:12px; background:#f59e0b; border-radius:2px; vertical-align:middle;"></span>未提出（暫定）
        <span style="display:inline-block; width:12px; height:12px; background:#fee2e2; border:1px solid #fca5a5; border-radius:2px; vertical-align:middle;"></span>休日希望5名以上
        <span style="display:inline-block; width:12px; height:12px; background:#fef9c3; border:1px solid #fde047; border-radius:2px; vertical-align:middle;"></span>3〜4名
      </div>
    </div>
    <div style="background: white; border: 1px solid #ddd; border-radius: 8px; overflow-x: auto;">
    <table style="width: 100%; border-collapse: collapse; min-width: 1200px; font-size: 13px;">`;

  html += '<thead>';
  // 1行目：日付ヘッダー
  html += '<tr style="background: #f8f9fa; border-bottom: 1px solid #ddd;">';
  html += '<th style="padding: 8px 10px; text-align: left; width: 120px; position:sticky; left:0; background:#f8f9fa; z-index:2;">看護師名</th>';
  html += '<th style="padding: 8px; text-align: center; width: 40px;">状態</th>';
  html += '<th style="padding: 8px; text-align: left; width: 130px;">価値観</th>';
  dates.forEach((date, idx) => {
    const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(targetYear, targetMonth - 1, idx + 1).getDay()];
    const isWE = dow === '日' || dow === '土';
    html += `<th style="padding: 4px 2px; text-align: center; width: 30px; ${isWE ? 'background:#fff3cd;' : ''} font-size:11px;" title="${date}">${idx + 1}<br><span style="color:#888;">${dow}</span></th>`;
  });
  html += '<th style="padding: 8px; text-align: left; width: 180px;">備考</th>';
  html += '<th style="padding: 8px; text-align: center; width: 90px;">操作</th>';
  html += '</tr>';

  // 2行目：確定済み休日希望数の集計行
  html += '<tr style="background:#f0f4ff; border-bottom: 2px solid #ddd;">';
  html += '<td style="padding: 5px 10px; font-size:11px; font-weight:700; color:#555; position:sticky; left:0; background:#f0f4ff; z-index:2;">確定済み休日希望数</td>';
  html += '<td></td><td></td>';
  dates.forEach(date => {
    const confirmed = confirmedOffPerDate[date];
    const total = totalOffPerDate[date];
    const bg = offCountColor(confirmed, total);
    const tentative = total - confirmed;
    let label = confirmed > 0 ? `<strong>${confirmed}</strong>` : '—';
    if (tentative > 0) label += `<span style="color:#f59e0b; font-size:9px;">+${tentative}</span>`;
    html += `<td style="padding:3px 1px; text-align:center; background:${bg}; font-size:11px;" title="${date} 確定${confirmed}名 / 暫定${tentative}名">${label}</td>`;
  });
  html += '<td colspan="2" style="padding:5px 8px; font-size:10px; color:#666;">太字=確定 +数字=未提出分</td>';
  html += '</tr>';
  html += '</thead><tbody>';

  nurseDataList.forEach(nurse => {
    const borderColor = nurse.isSubmitted ? '#22c55e' : '#f59e0b';
    const rowBg = nurse.isSubmitted ? 'white' : '#fffde7';
    html += `<tr style="border-bottom: 1px solid #eee; background: ${rowBg}; border-left: 4px solid ${borderColor};">`;

    // 氏名
    html += `<td style="padding: 8px 10px; font-weight: 600; position:sticky; left:0; background:${rowBg}; z-index:1; white-space:nowrap; ${nurse.isSubmitted ? '' : 'color:#6b7280;'}">${nurse.name}</td>`;

    // 状態バッジ
    html += `<td style="padding: 6px; text-align: center;">`;
    html += nurse.isSubmitted
      ? '<span style="background:#22c55e; color:white; padding:3px 7px; border-radius:10px; font-size:10px; font-weight:700;">確定</span>'
      : '<span style="background:#f59e0b; color:white; padding:3px 7px; border-radius:10px; font-size:10px; font-weight:700;">暫定</span>';
    html += '</td>';

    // 価値観
    html += '<td style="padding: 8px; font-size: 12px;">';
    const pref = nurse.data.preferences?.valuePreference && VALUE_PREFERENCE_OPTIONS[nurse.data.preferences.valuePreference];
    html += pref ? `<span title="${pref.description}">${pref.icon} ${pref.label}</span>` : '<span style="color:#bbb;">—</span>';
    html += '</td>';

    // 各日の希望セル
    dates.forEach((date, idx) => {
      const requestType = nurse.data.requests?.[date] || REQUEST_TYPES.AVAILABLE;
      const colorMap = nurse.isSubmitted ? requestTypeColors : requestTypeLightColors;
      const color = colorMap[requestType] || '#f0f0f0';
      const label = requestTypeLabels[requestType] || '?';
      const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(targetYear, targetMonth - 1, idx + 1).getDay()];
      const isWE = dow === '日' || dow === '土';

      // 未提出のセルは斜線パターンを追加
      const stripeStyle = nurse.isSubmitted
        ? ''
        : 'background-image: repeating-linear-gradient(-45deg, rgba(0,0,0,0.04) 0, rgba(0,0,0,0.04) 1px, transparent 0, transparent 50%); background-size: 6px 6px;';
      const weekendStyle = isWE ? 'border-left: 1px solid #fbbf24; border-right: 1px solid #fbbf24;' : '';

      html += `<td style="padding: 3px 1px; text-align: center; background-color: ${color}; ${stripeStyle} ${weekendStyle} font-size: 11px;" title="${date}${nurse.isSubmitted ? '（確定）' : '（暫定）'}: ${requestType}">${label}</td>`;
    });

    // 備考
    const noteText = nurse.data.note || '';
    html += `<td style="padding: 8px; font-size: 11px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${nurse.isSubmitted ? '#333' : '#9ca3af'};" title="${noteText}">${noteText.substring(0, 25)}${noteText.length > 25 ? '…' : ''}</td>`;

    // 操作
    html += '<td style="padding: 6px; text-align: center;">';
    if (!isReadOnlyAdminView) {
      html += `<button onclick="editNurseRequest('${nurse.userKey}')" style="padding: 3px 7px; background: #4a90e2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin: 1px;">編集</button>`;
      html += `<button onclick="deleteNurseData('${nurse.userKey}')" style="padding: 3px 7px; background: #ff9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin: 1px;">削除</button>`;
    } else {
      html += '<span style="color: #999; font-size: 11px;">閲覧のみ</span>';
    }
    html += '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// 看護師の勤務希望を編集
function editNurseRequest(userKey) {
  if (isReadOnlyAdminView) {
    alert('閲覧モードでは編集できません');
    return;
  }

  const users = getUserDirectory();
  const user = users[userKey];
  const displayName = user?.fullName || userKey;

  if (!confirm(`「${displayName}」の勤務希望を編集しますか？\n新しいウィンドウで編集画面が開きます。`)) {
    return;
  }

  // 一時的にそのユーザーでログイン状態を作成
  const storageKey = STORAGE_KEY_PREFIX + userKey;
  const dataStr = localStorage.getItem(storageKey);
  
  if (!dataStr) {
    alert('勤務希望データが見つかりません');
    return;
  }

  // 現在のユーザーをバックアップ
  const currentUser = getCurrentUser();
  const originalUserKey = currentUser ? (currentUser.userKey || getCurrentUserKey()) : null;

  // 編集対象ユーザーでログイン状態を作成
  if (user) {
    const editUser = {
      ...user,
      userKey: userKey,
      email: user.email || userKey,
      fullName: displayName
    };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(editUser));
  }

  // 編集ページを新しいタブで開く
  window.open(`nurse_input.html?edit=${userKey}`, '_blank');

  // 少し待ってから元のユーザーに戻す（編集ページが読み込まれるまで）
  setTimeout(() => {
    if (originalUserKey && currentUser) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
    }
  }, 1000);

  // 管理画面を更新
  setTimeout(() => {
    loadAllNurseRequests();
  }, 2000);
}

// ページ読み込み時に実行
document.addEventListener('DOMContentLoaded', () => {
  // ログイン状態と管理者権限を確認
  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  
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
  
  initAdminSelectedMonth();
  updateUnifiedDisplay();
  updateDeadlineDisplay();
  renderAdminMonthSelector();
  loadAdminRequestList();
  loadAdminList();
  loadIntegratedBoard();
});

// 毎月15日23:59に設定
function setDeadlineMonthly() {
  if (isReadOnlyAdminView) {
    alert('閲覧モードでは編集できません');
    return;
  }
  
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  // 今月の15日23:59
  let deadline = new Date(year, month, 15, 23, 59, 59);
  
  // 既に15日を過ぎている場合は来月の15日
  if (now > deadline) {
    deadline = new Date(year, month + 1, 15, 23, 59, 59);
  }
  
  const input = document.getElementById('deadlineInput');
  if (input) {
    input.value = formatDateTimeLocal(deadline);
    // 直接設定も実行
    localStorage.setItem(DEADLINE_KEY, deadline.toISOString());
    updateDeadlineDisplay();
    alert('締め切りを毎月15日23:59に設定しました');
  } else {
    console.error('deadlineInput element not found');
    alert('エラー: 入力欄が見つかりません');
  }
}

// 締め切りを設定
function setDeadline() {
  if (isReadOnlyAdminView) {
    alert('閲覧モードでは編集できません');
    return;
  }
  
  const input = document.getElementById('deadlineInput');
  if (!input) {
    console.error('deadlineInput element not found');
    alert('エラー: 入力欄が見つかりません');
    return;
  }
  
  const deadlineStr = input.value;
  if (!deadlineStr) {
    alert('日時を入力してください');
    return;
  }
  
  try {
    const deadline = new Date(deadlineStr);
    if (isNaN(deadline.getTime())) {
      alert('無効な日時です。正しい日時を入力してください。');
      return;
    }
    
    localStorage.setItem(DEADLINE_KEY, deadline.toISOString());
    updateDeadlineDisplay();
    alert('締め切りを設定しました: ' + deadline.toLocaleString('ja-JP'));
  } catch (error) {
    console.error('Error setting deadline:', error);
    alert('エラーが発生しました: ' + error.message);
  }
}

// 締め切りをクリア
function clearDeadline() {
  if (isReadOnlyAdminView) {
    alert('閲覧モードでは編集できません');
    return;
  }
  
  if (!confirm('締め切りをクリアしますか？')) {
    return;
  }
  
  localStorage.removeItem(DEADLINE_KEY);
  const input = document.getElementById('deadlineInput');
  if (input) {
    input.value = '';
  }
  updateDeadlineDisplay();
  alert('締め切りをクリアしました');
}

// シフト対象月を設定
// 対象月と締め切りを一括設定
function setUnifiedSettings() {
  if (isReadOnlyAdminView) { alert('閲覧モードでは編集できません'); return; }
  const dayInput = document.getElementById('deadlineDayInput');
  const day = dayInput ? parseInt(dayInput.value, 10) : NaN;

  if (!day || day < 1 || day > 31) {
    alert('締め切り日（1〜31）を入力してください');
    return;
  }

  // 締め切り日を独立して保存
  localStorage.setItem(DEADLINE_DAY_KEY, day);

  // 明示的な対象月設定は削除してgetShiftTarget()の自動導出に任せる
  localStorage.removeItem(SHIFT_TARGET_KEY);

  // 締め切り = 今月の day 日 23:59:59（対象月は自動で来月）
  const now = new Date();
  const deadline = new Date(now.getFullYear(), now.getMonth(), day, 23, 59, 59);
  localStorage.setItem(DEADLINE_KEY, deadline.toISOString());

  updateUnifiedDisplay();
  updateDeadlineDisplay();
  renderAdminMonthSelector();

  const target = getShiftTarget();
  const dl = `${deadline.getFullYear()}年${deadline.getMonth() + 1}月${deadline.getDate()}日 23:59`;
  alert(`設定しました\n対象月（自動）: ${target.year}年${target.month}月\n締め切り: ${dl}`);
}

function clearUnifiedSettings() {
  if (isReadOnlyAdminView) { alert('閲覧モードでは編集できません'); return; }
  if (!confirm('対象月・締め切りの設定をクリアしますか？')) return;
  localStorage.removeItem(SHIFT_TARGET_KEY);
  localStorage.removeItem(DEADLINE_KEY);
  updateUnifiedDisplay();
  updateDeadlineDisplay();
  alert('クリアしました（デフォルト: 来月を対象月として自動適用）');
}

function updateUnifiedDisplay() {
  const display = document.getElementById('unifiedSettingsDisplay');
  if (!display) return;

  const { year, month } = getShiftTarget();
  const deadlineStr = localStorage.getItem(DEADLINE_KEY);

  let html = `<strong>対象月（自動）：</strong> ${year}年${month}月`;
  if (deadlineStr) {
    const d = new Date(deadlineStr);
    html += `　　<strong>締め切り：</strong> ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 23:59`;
  } else {
    html += `　　<strong>締め切り：</strong> 未設定`;
  }
  display.style.display = 'block';
  display.innerHTML = html;

  // 締め切り日を入力欄に自動補完
  const fd = document.getElementById('deadlineDayInput');
  const storedDay = localStorage.getItem(DEADLINE_DAY_KEY);
  if (fd && storedDay) fd.value = storedDay;
}

// 旧関数（内部互換用）
function setShiftTarget() { setUnifiedSettings(); }
function clearShiftTarget() { clearUnifiedSettings(); }
function updateShiftTargetDisplay() { updateUnifiedDisplay(); }

// ─── シフトFix（月ロック）管理 ────────────────────────────────

function lockMonthFix() {
  if (isReadOnlyAdminView) { alert('閲覧モードでは操作できません'); return; }
  const year  = parseInt(document.getElementById('fixYearInput').value, 10);
  const month = parseInt(document.getElementById('fixMonthInput').value, 10);
  if (!year || !month || month < 1 || month > 12) { alert('年・月を正しく入力してください'); return; }
  if (!confirm(`${year}年${month}月のシフトを確定（fix）しますか？\n全員の編集が不可になります。`)) return;
  localStorage.setItem(getMonthLockedKey(year, month), 'true');
  renderFixManagement();
  alert(`${year}年${month}月を確定しました`);
}

function unlockMonthFix() {
  if (isReadOnlyAdminView) { alert('閲覧モードでは操作できません'); return; }
  const year  = parseInt(document.getElementById('fixYearInput').value, 10);
  const month = parseInt(document.getElementById('fixMonthInput').value, 10);
  if (!year || !month || month < 1 || month > 12) { alert('年・月を正しく入力してください'); return; }
  if (!confirm(`${year}年${month}月の確定を解除しますか？全員が編集可能になります。`)) return;
  localStorage.removeItem(getMonthLockedKey(year, month));
  // 個別ロック解除もすべてクリア
  Object.keys(localStorage)
    .filter(k => k.startsWith(`shift_month_unlocked_`) && k.endsWith(`_${year}_${month}`))
    .forEach(k => localStorage.removeItem(k));
  renderFixManagement();
  alert(`${year}年${month}月の確定を解除しました`);
}

function unlockUserForMonth(userKey, year, month) {
  if (isReadOnlyAdminView) { alert('閲覧モードでは操作できません'); return; }
  localStorage.setItem(getMonthUserUnlockedKey(userKey, year, month), 'true');
  renderFixManagement();
}

function relockUserForMonth(userKey, year, month) {
  if (isReadOnlyAdminView) { alert('閲覧モードでは操作できません'); return; }
  localStorage.removeItem(getMonthUserUnlockedKey(userKey, year, month));
  renderFixManagement();
}

function renderFixManagement() {
  const container = document.getElementById('fixManagementDetail');
  if (!container) return;

  const year  = parseInt(document.getElementById('fixYearInput').value, 10);
  const month = parseInt(document.getElementById('fixMonthInput').value, 10);
  if (!year || !month) { container.innerHTML = ''; return; }

  const locked = isMonthLocked(year, month);
  const statusLabel = locked
    ? `<span style="color:#dc3545;font-weight:700;">🔒 確定済み</span>`
    : `<span style="color:#28a745;font-weight:700;">🔓 未確定（編集可）</span>`;

  let html = `<p style="margin:0 0 12px;">現在の状態: ${statusLabel}</p>`;

  if (locked) {
    html += `<p style="font-size:13px;color:#666;margin-bottom:12px;">
      個別ロック解除：特定のユーザーのみ編集を許可します。修正完了後は再fixしてください。</p>`;

    const users = getUserDirectory();
    const userList = Object.entries(users).sort((a,b) => (a[1].fullName||'').localeCompare(b[1].fullName||'', 'ja'));

    if (userList.length === 0) {
      html += '<p style="color:#999;">登録ユーザーなし</p>';
    } else {
      html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
      html += '<thead><tr style="background:#f8f9fa;border-bottom:2px solid #ddd;">'
            + '<th style="padding:8px;text-align:left;">氏名</th>'
            + '<th style="padding:8px;text-align:center;">状態</th>'
            + '<th style="padding:8px;text-align:center;">操作</th>'
            + '</tr></thead><tbody>';
      userList.forEach(([userKey, info]) => {
        const name = info.fullName || userKey;
        const isUnlocked = isUserMonthUnlocked(userKey, year, month);
        const stateLabel = isUnlocked
          ? '<span style="color:#f57c00;font-weight:600;">🔓 解除中</span>'
          : '<span style="color:#666;">🔒 ロック</span>';
        const btn = isUnlocked
          ? `<button onclick="relockUserForMonth('${userKey}',${year},${month})"
               style="padding:4px 10px;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">
               再fix</button>`
          : `<button onclick="unlockUserForMonth('${userKey}',${year},${month})"
               style="padding:4px 10px;background:#ff9800;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">
               解除</button>`;
        html += `<tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px;">${name}</td>
          <td style="padding:8px;text-align:center;">${stateLabel}</td>
          <td style="padding:8px;text-align:center;">${btn}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    }
  }

  container.innerHTML = html;
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
      <div class="deadline-display-row">
        <img class="deadline-sage" id="deadlineSageAdmin" alt="仙人" />
        <div>
      <strong>現在の締め切り:</strong> ${deadline.toLocaleString('ja-JP')}<br>
      <strong>残り時間:</strong> ${days}日${hours}時間
        </div>
      </div>
    `;
  } else {
    display.className = 'deadline-display passed';
    display.innerHTML = `
      <div class="deadline-display-row">
        <img class="deadline-sage" id="deadlineSageAdmin" alt="仙人" />
        <div>
      <strong>締め切り:</strong> ${deadline.toLocaleString('ja-JP')}<br>
      <strong>ステータス:</strong> 締め切り済み
        </div>
      </div>
    `;
  }

  const sageImg = document.getElementById('deadlineSageAdmin');
  if (sageImg) {
    sageImg.src = getSageImageUriAdmin(diff);
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

// 統合管理ボードを読み込み（常に表示）
function loadIntegratedBoard() {
  const container = document.getElementById('integratedBoard');
  const statusGrid = document.getElementById('statusGrid');
  const bulkDeleteSection = document.getElementById('bulkDeleteSection');
  
  if (!container) {
    console.error('integratedBoard element not found');
    return;
  }
  
  if (!statusGrid) {
    console.error('statusGrid element not found');
    return;
  }
  
  container.style.display = 'block';
  statusGrid.style.display = 'grid';

  const boardYear  = adminSelectedYear;
  const boardMonth = adminSelectedMonth;
  const users = getUserDirectory();

  // 統計情報を計算（月別）
  const nurseMap = new Map();

  Object.keys(users).forEach(userKey => {
    if (nurseMap.has(userKey)) return;
    const user = users[userKey];
    const initialShiftCapability = normalizeShiftCapability(user?.initialShiftCapability)
      ?? normalizeShiftCapability(user?.initialNightShift);

    const monthKey  = getMonthRequestKey(userKey, boardYear, boardMonth);
    const legacyKey = STORAGE_KEY_PREFIX + userKey;
    const dataStr   = localStorage.getItem(monthKey) || localStorage.getItem(legacyKey);
    const data = dataStr ? JSON.parse(dataStr) : {};

    const storedCapability = normalizeShiftCapability(data.shiftCapability)
      ?? normalizeShiftCapability(data.doesNightShift);

    const isSubmitted = localStorage.getItem(getMonthSubmittedKey(userKey, boardYear, boardMonth)) === 'true'
                     || localStorage.getItem(SUBMITTED_KEY_PREFIX + userKey) === 'true';

    nurseMap.set(userKey, {
      name: data.nurseName || user.fullName || userKey,
      userKey,
      submitted: isSubmitted,
      adminShiftCapability: storedCapability,
      effectiveShiftCapability: storedCapability ?? initialShiftCapability,
      initialShiftCapability,
      valuePreference: data.preferences?.valuePreference || null,
      userInfo: user
    });
  });

  const nurseList = Array.from(nurseMap.values()).sort((a, b) => {
    return a.name.localeCompare(b.name, 'ja');
  });
  
  const submitted = nurseList.filter(item => item.submitted).length;
  const total = nurseList.length;
  const notSubmitted = total - submitted;
  
  // 統計情報を表示
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
  
  if (nurseList.length === 0) {
    if (container) {
      container.innerHTML = '<p style="color: #666; padding: 20px; text-align: center;">看護師データがありません</p>';
    }
    if (bulkDeleteSection) {
      bulkDeleteSection.style.display = 'none';
    }
    // データがなくても統計情報は表示
    if (statusGrid) {
      statusGrid.style.display = 'grid';
      statusGrid.style.visibility = 'visible';
    }
    return;
  }
  
  // 統合ボードのテーブルを生成
  let html = `
    <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 12px; max-height: 700px; overflow-y: auto;">
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd; position: sticky; top: 0;">
            <th style="padding: 8px; text-align: left; width: 40px;">
              <input type="checkbox" id="selectAllNurses" onchange="toggleAllNurses(this.checked)" style="cursor: pointer;" />
            </th>
            <th style="padding: 8px; text-align: left; width: 150px;">看護師名</th>
            <th style="padding: 8px; text-align: center; width: 80px;">提出状況</th>
            <th style="padding: 8px; text-align: left; width: 140px;">勤務対応設定</th>
            <th style="padding: 8px; text-align: left; width: 200px;">価値観</th>
            <th style="padding: 8px; text-align: center; width: 300px;">操作</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  nurseList.forEach(nurse => {
    const adminSetting = nurse.adminShiftCapability;
    let statusLabel;
    let statusColor;
    if (adminSetting) {
      statusLabel = getShiftCapabilityLabel(adminSetting);
      statusColor = '#28a745';
    } else if (nurse.initialShiftCapability) {
      statusLabel = `${getShiftCapabilityLabel(nurse.initialShiftCapability)}（本人申告）`;
      statusColor = '#6c757d';
    } else {
      statusLabel = '未設定';
      statusColor = '#ff9800';
    }
    
    // 価値観を取得
    let valuePreferenceLabel = '未設定';
    if (nurse.valuePreference) {
      const pref = VALUE_PREFERENCE_OPTIONS[nurse.valuePreference];
      if (pref) {
        valuePreferenceLabel = `${pref.icon} ${pref.label}`;
      }
    }
    
    html += `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px; text-align: center;">
          <input type="checkbox" class="nurse-checkbox" value="${nurse.userKey}" data-name="${nurse.name}" onchange="updateSelectedCount()" />
        </td>
        <td style="padding: 8px; font-weight: 600;">${nurse.name}</td>
        <td style="padding: 8px; text-align: center;">
          <span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; ${nurse.submitted ? 'background: #28a745; color: white;' : 'background: #ffc107; color: #856404;'}">
            ${nurse.submitted ? '提出済み' : '未提出'}
          </span>
        </td>
        <td style="padding: 8px;">
          <span style="color: ${statusColor}; font-weight: 600; font-size: 11px;">${statusLabel}</span>
        </td>
        <td style="padding: 8px; font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${valuePreferenceLabel}">${valuePreferenceLabel}</td>
        <td style="padding: 8px; text-align: center;">
          ${isReadOnlyAdminView ? '<span style="color: #999;">閲覧のみ</span>' : `
          <div style="display: flex; flex-wrap: wrap; gap: 4px; justify-content: center;">
            <button onclick="editNurseRequest('${nurse.userKey}')" style="padding: 4px 8px; background: #4a90e2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">編集</button>
            <select onchange="setNurseShiftCapabilityFromSelect('${nurse.userKey}', this.value)" style="padding: 4px 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px; cursor: pointer;">
              <option value="null" ${adminSetting === null ? 'selected' : ''}>未設定</option>
              <option value="${SHIFT_CAPABILITIES.DAY_ONLY}" ${adminSetting === SHIFT_CAPABILITIES.DAY_ONLY ? 'selected' : ''}>日勤のみ</option>
              <option value="${SHIFT_CAPABILITIES.DAY_LATE}" ${adminSetting === SHIFT_CAPABILITIES.DAY_LATE ? 'selected' : ''}>日勤＋遅出</option>
              <option value="${SHIFT_CAPABILITIES.DAY_NIGHT}" ${adminSetting === SHIFT_CAPABILITIES.DAY_NIGHT ? 'selected' : ''}>日勤＋夜勤</option>
              <option value="${SHIFT_CAPABILITIES.ALL}" ${adminSetting === SHIFT_CAPABILITIES.ALL ? 'selected' : ''}>全部する</option>
            </select>
          </div>
          `}
        </td>
      </tr>
    `;
  });
  
  html += `
        </tbody>
      </table>
    </div>
  `;
  
  if (container) {
    container.innerHTML = html;
  }
  
  // 一括削除セクションを表示
  if (bulkDeleteSection) {
    bulkDeleteSection.style.display = 'block';
  }
  
  updateSelectedCount();
}

// セレクトボックスから夜勤設定を変更
function setNurseShiftCapabilityFromSelect(userKey, value) {
  const capability = value === 'null' ? null : value;
  setNurseShiftCapability(userKey, capability);
  // 画面を更新
  loadIntegratedBoard();
}

// 提出状況を読み込み（互換性のため残す）
function loadSubmissionStatus() {
  const statusGrid = document.getElementById('statusGrid');
  const nurseListContainer = document.getElementById('nurseList');
  
  // トグル機能：既に表示されている場合は非表示にする
  const btn = document.getElementById('submissionStatusBtn');
  const bulkDeleteSection = document.getElementById('bulkDeleteSection');
  const isVisible = statusGrid && statusGrid.style.display !== 'none' && statusGrid.innerHTML.trim() !== '';
  if (isVisible) {
    if (statusGrid) statusGrid.style.display = 'none';
    if (nurseListContainer) nurseListContainer.style.display = 'none';
    if (bulkDeleteSection) bulkDeleteSection.style.display = 'none';
    if (btn) btn.textContent = '提出状況を表示';
    return;
  }
  
  if (btn) btn.textContent = '提出状況を非表示';
  
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
    return a.name.localeCompare(b.name, 'ja');
  });

  const submitted = nurseList.filter(item => item.submitted).length;
  const total = nurseList.length;
  const notSubmitted = total - submitted;

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

  if (nurseListContainer) {
    if (nurseList.length > 0) {
      nurseListContainer.style.display = 'block';
      
      // コンパクトなテーブル形式で表示（スクロールなし）
      let html = `
        <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 12px; max-height: 600px; overflow-y: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd; position: sticky; top: 0;">
                <th style="padding: 8px; text-align: left; width: 40px;">
                  <input type="checkbox" id="selectAllNurses" onchange="toggleAllNurses(this.checked)" style="cursor: pointer;" />
                </th>
                <th style="padding: 8px; text-align: left; width: 150px;">看護師名</th>
                <th style="padding: 8px; text-align: center; width: 80px;">提出状況</th>
                <th style="padding: 8px; text-align: left; width: 100px;">夜勤設定</th>
                <th style="padding: 8px; text-align: left; width: 200px;">価値観</th>
                <th style="padding: 8px; text-align: center; width: 80px;">操作</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      nurseList.forEach(nurse => {
        // 夜勤設定を取得
        const storageKey = STORAGE_KEY_PREFIX + nurse.userKey;
        const dataStr = localStorage.getItem(storageKey);
        let shiftCapability = null;
        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            shiftCapability = data.shiftCapability;
          } catch (error) {
            // エラー無視
          }
        }
        const userInfo = users[nurse.userKey] || {};
        if (!shiftCapability) {
          shiftCapability = userInfo.initialShiftCapability;
        }
        
        let shiftCapabilityLabel = '未設定';
        if (shiftCapability === SHIFT_CAPABILITIES.DAY_ONLY) {
          shiftCapabilityLabel = '日勤のみ';
        } else if (shiftCapability === SHIFT_CAPABILITIES.DAY_LATE) {
          shiftCapabilityLabel = '日勤＋遅出';
        } else if (shiftCapability === SHIFT_CAPABILITIES.DAY_NIGHT) {
          shiftCapabilityLabel = '日勤＋夜勤';
        } else if (shiftCapability === SHIFT_CAPABILITIES.ALL) {
          shiftCapabilityLabel = '全部する';
        }
        
        // 価値観を取得
        let valuePreferenceLabel = '未設定';
        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            if (data.preferences && data.preferences.valuePreference) {
              const pref = VALUE_PREFERENCE_OPTIONS[data.preferences.valuePreference];
              if (pref) {
                valuePreferenceLabel = `${pref.icon} ${pref.label}`;
              }
            }
          } catch (error) {
            // エラー無視
          }
        }
        
        html += `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 8px; text-align: center;">
              <input type="checkbox" class="nurse-checkbox" value="${nurse.userKey}" data-name="${nurse.name}" onchange="updateSelectedCount()" />
            </td>
            <td style="padding: 8px; font-weight: 600;">${nurse.name}</td>
            <td style="padding: 8px; text-align: center;">
              <span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; ${nurse.submitted ? 'background: #28a745; color: white;' : 'background: #ffc107; color: #856404;'}">
                ${nurse.submitted ? '提出済み' : '未提出'}
              </span>
            </td>
            <td style="padding: 8px; font-size: 11px;">${shiftCapabilityLabel}</td>
            <td style="padding: 8px; font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${valuePreferenceLabel}">${valuePreferenceLabel}</td>
            <td style="padding: 8px; text-align: center;">
              ${isReadOnlyAdminView ? '<span style="color: #999;">閲覧のみ</span>' : `
                <button onclick="editNurseRequest('${nurse.userKey}')" style="padding: 4px 8px; background: #4a90e2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">編集</button>
              `}
            </td>
          </tr>
        `;
      });
      
      html += `
            </tbody>
          </table>
        </div>
      `;
      
      nurseListContainer.innerHTML = html;
      
      // 一括削除セクションを表示
      const bulkDeleteSection = document.getElementById('bulkDeleteSection');
      if (bulkDeleteSection) {
        bulkDeleteSection.style.display = 'block';
      }
      
      updateSelectedCount();
    } else {
      nurseListContainer.style.display = 'none';
      const bulkDeleteSection = document.getElementById('bulkDeleteSection');
      if (bulkDeleteSection) {
        bulkDeleteSection.style.display = 'none';
      }
    }
  }
}

// 全選択/全解除
function toggleAllNurses(checked) {
  const checkboxes = document.querySelectorAll('.nurse-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.checked = checked;
  });
  updateSelectedCount();
}

// 選択数を更新
function updateSelectedCount() {
  const checkboxes = document.querySelectorAll('.nurse-checkbox:checked');
  const selectedCount = document.getElementById('selectedCount');
  if (selectedCount) {
    selectedCount.textContent = `選択中: ${checkboxes.length}名`;
  }
}

// 選択したアカウントを一括削除
function deleteSelectedAccounts() {
  if (isReadOnlyAdminView) {
    alert('閲覧モードでは編集できません');
    return;
  }

  const checkboxes = document.querySelectorAll('.nurse-checkbox:checked');
  if (checkboxes.length === 0) {
    alert('削除するアカウントを選択してください');
    return;
  }

  const selectedNames = Array.from(checkboxes).map(cb => cb.dataset.name);
  const selectedUserKeys = Array.from(checkboxes).map(cb => cb.value);
  
  const message = `以下の${selectedUserKeys.length}名のアカウントを完全に削除しますか？\n\n${selectedNames.join('\n')}\n\n削除される内容：\n- アカウント情報（ユーザー名、メールアドレスなど）\n- 勤務希望調査の情報（全期間の希望データ）\n- 価値観設定\n- 夜勤ステータス（勤務対応設定）\n- 提出状況\n- 管理者権限（該当する場合）\n- 通知データ\n\n※ 削除されたアカウントの情報は、すべての場所から削除されます。\n\nこの操作は取り消せません。`;
  
  if (!confirm(message)) {
    return;
  }

  const currentUser = getCurrentUser();
  let loggedOutUser = false;

  // 選択されたアカウントを削除
  selectedUserKeys.forEach(userKey => {
    const users = getUserDirectory();
    const user = users[userKey];
    if (!user) return;

    const displayName = user.fullName || userKey;
    const email = user.email || '';

    // 現在ログイン中のユーザーを削除する場合
    if (currentUser && (currentUser.userKey === userKey || currentUser.email === email)) {
      loggedOutUser = true;
    }

    // シフト希望データを削除（勤務希望調査の情報、価値観、夜勤ステータスを含む）
    const storageKey = STORAGE_KEY_PREFIX + userKey;
    localStorage.removeItem(storageKey);

    // 提出状況を削除
    const submittedKey = SUBMITTED_KEY_PREFIX + userKey;
    localStorage.removeItem(submittedKey);

    // 通知データを削除
    if (email) {
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

    // 管理者リストから削除
    if (email) {
      const adminUsers = getAdminUsers();
      const filteredAdmins = adminUsers.filter(adminEmail => adminEmail !== email);
      if (filteredAdmins.length !== adminUsers.length) {
        saveAdminUsers(filteredAdmins);
      }

      // 管理者申請からも削除
      const adminRequests = getAdminRequests();
      const filteredRequests = adminRequests.filter(request => request.email !== email);
      if (filteredRequests.length !== adminRequests.length) {
        saveAdminRequests(filteredRequests);
      }
    }

    // ユーザー情報から削除
    delete users[userKey];
    saveUsers(users);
  });

  alert(`${selectedUserKeys.length}名のアカウントを削除しました`);

  // 現在ログイン中のユーザーを削除した場合はログアウト
  if (loggedOutUser) {
    localStorage.removeItem(CURRENT_USER_KEY);
    window.location.href = 'index.html';
    return;
  }

  // 画面を更新（同じ位置を保持）
  loadIntegratedBoard();
  loadValuePreferences();
  loadAllNurseRequests();
  loadAdminList();
}

// 全希望データをCSVでエクスポート
function exportAllRequests() {
  const allKeys = Object.keys(localStorage);
  const requestKeys = allKeys.filter(key => key.startsWith(STORAGE_KEY_PREFIX));

  if (requestKeys.length === 0) {
    alert('エクスポートするデータがありません');
    return;
  }

  const dates = getShiftDates();
  const { year: exportYear, month: exportMonth } = getShiftTarget();
  const daysInMonth = new Date(exportYear, exportMonth, 0).getDate();

  const users = getUserDirectory();

  const header = ['氏名', '夜勤設定', 'シフト希望期間', '価値観', '備考', ...dates];
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

    // 夜勤設定を取得
    const shiftCapability = data.shiftCapability || users[userKey]?.initialShiftCapability || null;
    let nightShiftStatus = '';
    if (shiftCapability === SHIFT_CAPABILITIES.DAY_ONLY) {
      nightShiftStatus = '日勤のみ';
    } else if (shiftCapability === SHIFT_CAPABILITIES.DAY_LATE) {
      nightShiftStatus = '日勤＋遅出';
    } else if (shiftCapability === SHIFT_CAPABILITIES.DAY_NIGHT) {
      nightShiftStatus = '日勤＋夜勤（遅出なし）';
    } else if (shiftCapability === SHIFT_CAPABILITIES.ALL) {
      nightShiftStatus = '全部する（日勤・遅出・夜勤）';
    } else {
      nightShiftStatus = '未設定';
    }

    const row = [
      displayName,
      nightShiftStatus,
      `${exportYear}年${exportMonth}月1日〜${exportMonth}月${daysInMonth}日`,
      preferenceLabel,
      data.note || ''
    ];

    dates.forEach(date => {
      const request = data.requests[date];
      let value = '';

      if (request === 'available') {
        value = '終日勤務可能';
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


