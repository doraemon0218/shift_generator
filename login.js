// ユーザー管理のキー
const USER_STORAGE_KEY = 'shift_system_users';
const CURRENT_USER_KEY = 'current_user';
const ADMIN_USERS_KEY = 'admin_users';
const STORAGE_KEY_PREFIX = 'shift_request_';

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

function ensureShiftProfile(userKey, fullName, initialNightShift) {
  const storageKey = STORAGE_KEY_PREFIX + userKey;
  const stored = localStorage.getItem(storageKey);

  if (stored) {
    try {
      const data = JSON.parse(stored);
      if ((data.doesNightShift === undefined || data.doesNightShift === null) && typeof initialNightShift === 'boolean') {
        data.doesNightShift = initialNightShift;
        localStorage.setItem(storageKey, JSON.stringify(data));
      }
    } catch (error) {
      console.error('Failed to parse existing shift data', error);
    }
    return;
  }

  const baseData = {
    nurseName: fullName,
    userKey,
    requests: {},
    note: '',
    submitted: false,
    submittedAt: null,
    doesNightShift: typeof initialNightShift === 'boolean' ? initialNightShift : null,
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
  
  const lastName = document.getElementById('lastName').value.trim();
  const firstName = document.getElementById('firstName').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const hireYearInput = document.getElementById('hireYear');
  const hireYearRaw = hireYearInput ? hireYearInput.value.trim() : '';
  const nightShiftChoice = document.querySelector('input[name="initialNightShift"]:checked');
  
  const errorMsg = document.getElementById('errorMessage');
  errorMsg.classList.remove('show');
  
  if (!lastName || !firstName || !email || !password) {
    errorMsg.textContent = 'すべての項目を入力してください';
    errorMsg.classList.add('show');
    return;
  }
  
  const users = getUsers();
  const userKey = `${lastName}_${firstName}_${email}`;
  const hashedPassword = hashPassword(password);
  const existingUser = users[userKey];
  const isNewUser = !existingUser;

  let hireYear = existingUser ? existingUser.hireYear ?? null : null;
  let initialNightShift = existingUser && typeof existingUser.initialNightShift === 'boolean'
    ? existingUser.initialNightShift
    : null;

  if (isNewUser) {
    const parsedYear = parseHireYear(hireYearRaw);
    if (!parsedYear) {
      errorMsg.textContent = '入職年（西暦）を正しく入力してください（1970年〜現在+1年まで）';
      errorMsg.classList.add('show');
      return;
    }
    if (!nightShiftChoice) {
      errorMsg.textContent = '現在の夜勤状況を選択してください';
      errorMsg.classList.add('show');
      return;
    }

    hireYear = parsedYear;
    initialNightShift = nightShiftChoice.value === 'on';
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

    const parsedYear = parseHireYear(hireYearRaw);
    if (parsedYear && parsedYear !== existingUser.hireYear) {
      existingUser.hireYear = parsedYear;
      hireYear = parsedYear;
      userDataUpdated = true;
    }

    if (nightShiftChoice) {
      const choiceValue = nightShiftChoice.value === 'on';
      if (existingUser.initialNightShift !== choiceValue) {
        existingUser.initialNightShift = choiceValue;
        initialNightShift = choiceValue;
        userDataUpdated = true;
      }
    }

    if (userDataUpdated) {
      users[userKey] = existingUser;
      saveUsers(users);
    }
  } else {
    users[userKey] = {
      lastName,
      firstName,
      email,
      password: hashedPassword,
      fullName: `${lastName} ${firstName}`,
      createdAt: new Date().toISOString(),
      hireYear,
      initialNightShift
    };
    saveUsers(users);
  }
  
  // 管理者かどうか確認
  let adminUsers = getAdminUsers();
  let isAdmin = adminUsers.includes(email);
  
  // 初回ログイン時、管理者が設定されていない場合は最初のユーザーを管理者にする
  if (adminUsers.length === 0) {
    adminUsers.push(email);
    saveAdminUsers(adminUsers);
    isAdmin = true;
  }

  const fullName = `${lastName} ${firstName}`;
  const resolvedHireYear = hireYear ?? parseHireYear(hireYearRaw);
  const resolvedNightShift = typeof initialNightShift === 'boolean'
    ? initialNightShift
    : (nightShiftChoice ? nightShiftChoice.value === 'on' : null);

  ensureShiftProfile(userKey, fullName, resolvedNightShift);
  
  // 現在のユーザー情報を保存
  const currentUser = {
    lastName,
    firstName,
    email,
    fullName,
    isAdmin,
    userKey,
    hireYear: resolvedHireYear ?? null,
    initialNightShift: resolvedNightShift
  };
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
  
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

