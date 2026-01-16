// ユーザー管理のキー
const USER_STORAGE_KEY = 'shift_system_users';
const CURRENT_USER_KEY = 'current_user';
const ADMIN_USERS_KEY = 'admin_users';
const ADMIN_REQUESTS_KEY = 'admin_requests';
const ENABLE_DEMO_ADMIN_FOR_ALL = true;
const STORAGE_KEY_PREFIX = 'shift_request_';

const SHIFT_CAPABILITIES = {
  DAY_ONLY: 'day-only',
  DAY_LATE: 'day-late',
  DAY_NIGHT: 'day-night',
  ALL: 'all'
};

function normalizeShiftCapability(value) {
  const supported = [
    SHIFT_CAPABILITIES.DAY_ONLY,
    SHIFT_CAPABILITIES.DAY_LATE,
    SHIFT_CAPABILITIES.DAY_NIGHT,
    SHIFT_CAPABILITIES.ALL
  ];
  if (supported.includes(value)) return value;
  if (value === 'night') return SHIFT_CAPABILITIES.ALL;
  if (value === 'late') return SHIFT_CAPABILITIES.DAY_LATE;
  if (value === 'day') return SHIFT_CAPABILITIES.DAY_ONLY;
  if (value === 'on') return SHIFT_CAPABILITIES.ALL;
  if (value === 'off') return SHIFT_CAPABILITIES.DAY_LATE;
  if (value === true) return SHIFT_CAPABILITIES.ALL;
  if (value === false) return SHIFT_CAPABILITIES.DAY_LATE;
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
        data.doesNightShift = resolvedShift === SHIFT_CAPABILITIES.ALL || resolvedShift === SHIFT_CAPABILITIES.DAY_NIGHT;
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
    doesNightShift: resolvedShift === SHIFT_CAPABILITIES.ALL || resolvedShift === SHIFT_CAPABILITIES.DAY_NIGHT,
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
  
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  
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
  
  // ユーザーが存在しない場合は新規登録画面へ誘導
  if (!existingUser) {
    errorMsg.textContent = 'このメールアドレスは登録されていません。新規登録画面から登録してください。';
    errorMsg.classList.add('show');
    
    setTimeout(() => {
      window.location.href = 'register.html';
    }, 2000);
    return;
  }
  
  // パスワード確認
  if (existingUser.password !== hashedPassword) {
    errorMsg.textContent = 'パスワードが正しくありません';
    errorMsg.classList.add('show');
    return;
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
  
  // 既存ユーザーのデータを使用
  const fullName = existingUser.fullName || `${existingUser.lastName || ''} ${existingUser.firstName || ''}`.trim() || email.split('@')[0];
  const hireYear = existingUser.hireYear ?? null;
  const initialShiftCapability = normalizeShiftCapability(existingUser.initialShiftCapability)
    ?? normalizeShiftCapability(existingUser.shiftCapability)
    ?? normalizeShiftCapability(existingUser.initialNightShift)
    ?? null;

  ensureShiftProfile(existingUserKey, fullName, initialShiftCapability);
  
  // 現在のユーザー情報を保存
  const currentUser = {
    lastName: existingUser.lastName || '',
    firstName: existingUser.firstName || '',
    email,
    fullName,
    isAdmin,
    userKey: existingUserKey,
    hireYear,
    initialShiftCapability
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

