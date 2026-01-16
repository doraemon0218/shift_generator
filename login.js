// ユーザー管理のキー
const USER_STORAGE_KEY = 'shift_system_users';
const CURRENT_USER_KEY = 'current_user';
const ADMIN_USERS_KEY = 'admin_users';
const ADMIN_REQUESTS_KEY = 'admin_requests';
const ENABLE_DEMO_ADMIN_FOR_ALL = true;
const STORAGE_KEY_PREFIX = 'shift_request_';

const SHIFT_CAPABILITIES = {
  NIGHT: 'night',
  LATE: 'late',
  DAY: 'day'
};

function normalizeShiftCapability(value) {
  if (value === SHIFT_CAPABILITIES.NIGHT || value === SHIFT_CAPABILITIES.LATE || value === SHIFT_CAPABILITIES.DAY) {
    return value;
  }
  if (value === 'on') return SHIFT_CAPABILITIES.NIGHT;
  if (value === 'off') return SHIFT_CAPABILITIES.LATE;
  if (value === true) return SHIFT_CAPABILITIES.NIGHT;
  if (value === false) return SHIFT_CAPABILITIES.LATE;
  return null;
}

// ユーザーデータを取得
function getUsers() {
  const stored = localStorage.getItem(USER_STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
}

// ユーザーを保存
function saveUsers(users) {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(users));
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

// 管理者申請一覧を取得
function getAdminRequests() {
  const stored = localStorage.getItem(ADMIN_REQUESTS_KEY);
  return stored ? JSON.parse(stored) : [];
}

// 管理者申請一覧を保存
function saveAdminRequests(requests) {
  localStorage.setItem(ADMIN_REQUESTS_KEY, JSON.stringify(requests));
}

// パスワードのハッシュ（簡易版）
function hashPassword(password) {
  // 実際の実装では、より安全なハッシュを使用すべき
  // ここでは簡易版として実装
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

function ensureShiftProfile(userKey, fullName, initialShiftCapability) {
  const storageKey = STORAGE_KEY_PREFIX + userKey;
  const stored = localStorage.getItem(storageKey);

  if (stored) {
    try {
      const data = JSON.parse(stored);
      const normalizedShift = normalizeShiftCapability(data.shiftCapability) ?? normalizeShiftCapability(data.doesNightShift);
      const resolvedShift = normalizedShift ?? normalizeShiftCapability(initialShiftCapability);
      if (!normalizedShift && resolvedShift) {
        data.shiftCapability = resolvedShift;
      }
      if (resolvedShift && typeof data.doesNightShift !== 'boolean') {
        data.doesNightShift = resolvedShift === SHIFT_CAPABILITIES.NIGHT;
      }
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to parse existing shift data', error);
    }
    return;
  }

  const resolvedShift = normalizeShiftCapability(initialShiftCapability);
  const baseData = {
    nurseName: fullName,
    userKey,
    requests: {},
    note: '',
    submitted: false,
    submittedAt: null,
    shiftCapability: resolvedShift,
    doesNightShift: resolvedShift === SHIFT_CAPABILITIES.NIGHT,
    preferences: {
      valuePreference: null
    }
  };

  localStorage.setItem(storageKey, JSON.stringify(baseData));
}

function parseHireYear(value) {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  const currentYear = new Date().getFullYear();
  if (parsed < 1970 || parsed > currentYear + 1) {
    return null;
  }
  return parsed;
}

// ログイン処理
function handleLogin(event) {
  event.preventDefault();
  
  const lastNameEl = document.getElementById('lastName');
  const firstNameEl = document.getElementById('firstName');
  const lastName = lastNameEl ? lastNameEl.value.trim() : '';
  const firstName = firstNameEl ? firstNameEl.value.trim() : '';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const hireYearInput = document.getElementById('hireYear');
  const hireYearRaw = hireYearInput ? hireYearInput.value.trim() : '';
  const nightShiftChoice = document.querySelector('input[name="initialShiftCapability"]:checked')
    || document.querySelector('input[name="initialNightShift"]:checked');
  const adminRequestInput = document.getElementById('adminRequest');
  const wantsAdminRequest = adminRequestInput ? adminRequestInput.checked : false;
  
  const errorMsg = document.getElementById('errorMessage');
  errorMsg.classList.remove('show');
  
  if (!email || !password) {
    errorMsg.textContent = 'メールアドレスとパスワードを入力してください';
    errorMsg.classList.add('show');
    return;
  }
  
  const users = getUsers();
  const hashedPassword = hashPassword(password);
  
  // メールアドレスでユーザーを検索
  let existingUser = null;
  let existingUserKey = null;
  
  for (const [key, user] of Object.entries(users)) {
    if (user.email === email) {
      existingUser = user;
      existingUserKey = key;
      break;
    }
  }
  
  const isNewUser = !existingUser;

  let hireYear = existingUser ? existingUser.hireYear ?? null : null;
  let initialShiftCapability = existingUser
    ? (normalizeShiftCapability(existingUser.initialShiftCapability)
      ?? normalizeShiftCapability(existingUser.shiftCapability)
      ?? normalizeShiftCapability(existingUser.initialNightShift))
    : null;

  if (isNewUser) {
    const parsedYear = parseHireYear(hireYearRaw);
    if (!parsedYear) {
      errorMsg.textContent = '入職年（西暦）を正しく入力してください（1970年〜現在+1年まで）';
      errorMsg.classList.add('show');
      return;
    }
    if (!nightShiftChoice) {
      errorMsg.textContent = '夜勤・遅出の対応状況を選択してください';
      errorMsg.classList.add('show');
      return;
    }

    hireYear = parsedYear;
    initialShiftCapability = normalizeShiftCapability(nightShiftChoice.value);
  }

  // ユーザーが存在するか確認
  if (existingUser) {
    // パスワード確認
    if (existingUser.password !== hashedPassword) {
      errorMsg.textContent = 'パスワードが正しくありません';
      errorMsg.classList.add('show');
      return;
    }

    let userDataUpdated = false;
    
    // 名前が未設定で入力されていた場合は更新
    if ((!existingUser.lastName || !existingUser.firstName) && lastName && firstName) {
      existingUser.lastName = lastName;
      existingUser.firstName = firstName;
      existingUser.fullName = `${lastName} ${firstName}`;
      userDataUpdated = true;
    }

    const parsedYear = parseHireYear(hireYearRaw);
    if (parsedYear && parsedYear !== existingUser.hireYear) {
      existingUser.hireYear = parsedYear;
      hireYear = parsedYear;
      userDataUpdated = true;
    }

    if (nightShiftChoice) {
      const choiceValue = normalizeShiftCapability(nightShiftChoice.value);
      if (choiceValue && existingUser.initialShiftCapability !== choiceValue) {
        existingUser.initialShiftCapability = choiceValue;
        initialShiftCapability = choiceValue;
        userDataUpdated = true;
      }
    } else if (!existingUser.initialShiftCapability && initialShiftCapability) {
      existingUser.initialShiftCapability = initialShiftCapability;
      userDataUpdated = true;
    }

    if (userDataUpdated) {
      users[existingUserKey] = existingUser;
      saveUsers(users);
    }
    
    // 既存ユーザーのデータを使用
    hireYear = existingUser.hireYear ?? hireYear;
    initialShiftCapability = normalizeShiftCapability(existingUser.initialShiftCapability)
      ?? normalizeShiftCapability(existingUser.shiftCapability)
      ?? normalizeShiftCapability(existingUser.initialNightShift)
      ?? initialShiftCapability;
  } else {
    // 新規ユーザー登録（ログイン画面から）
    // 姓・名が入力されている場合のみ新規登録
    if (!lastName || !firstName) {
      errorMsg.textContent = '未登録のメールアドレスです。新規登録画面から登録してください。';
      errorMsg.classList.add('show');
      
      setTimeout(() => {
        window.location.href = 'register.html';
      }, 2000);
      return;
    }
    
    const parsedYear = parseHireYear(hireYearRaw);
    if (!parsedYear) {
      errorMsg.textContent = '入職年（西暦）を正しく入力してください（1970年〜現在+1年まで）';
      errorMsg.classList.add('show');
      return;
    }
    if (!nightShiftChoice) {
      errorMsg.textContent = '夜勤・遅出の対応状況を選択してください';
      errorMsg.classList.add('show');
      return;
    }

    hireYear = parsedYear;
    initialShiftCapability = normalizeShiftCapability(nightShiftChoice.value);
    
    const userKey = `${lastName}_${firstName}_${email}`;
    users[userKey] = {
      lastName,
      firstName,
      email,
      password: hashedPassword,
      fullName: `${lastName} ${firstName}`,
      createdAt: new Date().toISOString(),
      hireYear,
      initialShiftCapability
    };
    saveUsers(users);
    existingUserKey = userKey;
  }
  
  // 管理者かどうか確認（テスト環境では全員管理者）
  let adminUsers = getAdminUsers();
  let isAdmin = adminUsers.includes(email);
  
  // 初回ログイン時、管理者が設定されていない場合は最初のユーザーを管理者にする
  if (adminUsers.length === 0) {
    adminUsers.push(email);
    saveAdminUsers(adminUsers);
    isAdmin = true;
  }
  
  const adminRequests = getAdminRequests();
  if (ENABLE_DEMO_ADMIN_FOR_ALL) {
    isAdmin = true;
  } else if (isAdmin) {
    const filtered = adminRequests.filter(request => request.email !== email);
    if (filtered.length !== adminRequests.length) {
      saveAdminRequests(filtered);
    }
  } else if (wantsAdminRequest) {
    if (!adminRequests.some(request => request.email === email)) {
      adminRequests.push({
        email,
        fullName: `${lastName} ${firstName}`,
        userKey,
        requestedAt: new Date().toISOString()
      });
      saveAdminRequests(adminRequests);
    }
  }

  const fullName = existingUser 
    ? (existingUser.fullName || `${existingUser.lastName || ''} ${existingUser.firstName || ''}`.trim() || email.split('@')[0])
    : `${lastName} ${firstName}`;
  const finalLastName = existingUser ? (existingUser.lastName || lastName || '') : lastName;
  const finalFirstName = existingUser ? (existingUser.firstName || firstName || '') : firstName;
  const resolvedHireYear = hireYear ?? parseHireYear(hireYearRaw);
  const resolvedShiftCapability = normalizeShiftCapability(initialShiftCapability)
    ?? normalizeShiftCapability(nightShiftChoice ? nightShiftChoice.value : null);

  ensureShiftProfile(existingUserKey, fullName, resolvedShiftCapability);
  
  // 現在のユーザー情報を保存
  const currentUser = {
    lastName: finalLastName,
    firstName: finalFirstName,
    email,
    fullName,
    isAdmin,
    userKey: existingUserKey,
    hireYear: resolvedHireYear ?? null,
    initialShiftCapability: resolvedShiftCapability
  };
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));

  if (wantsAdminRequest && !isAdmin) {
    alert('管理者申請を受け付けました。既存の管理者が承認すると権限が付与されます。');
  }
  
  // トップページにリダイレクト
  window.location.href = 'top.html';
}

  // フォーム送信イベント
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  
  // 既存のログイン状態を確認
  const currentUser = localStorage.getItem(CURRENT_USER_KEY);
  if (currentUser) {
    // 既にログインしている場合はトップページへ自動リダイレクト
    window.location.href = 'top.html';
  }
});

