// ユーザー管理のキー
const USER_STORAGE_KEY = 'shift_system_users';
const CURRENT_USER_KEY = 'current_user';
const ADMIN_USERS_KEY = 'admin_users';

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

// 入職年をパース
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

// シフト対応状況を正規化
function normalizeShiftCapability(value) {
  if (!value) return null;
  const validValues = ['day-only', 'day-late', 'day-night', 'all'];
  if (validValues.includes(value)) {
    return value;
  }
  return null;
}

const STORAGE_KEY_PREFIX = 'shift_request_';

// シフトプロファイルを確保
function ensureShiftProfile(userKey, fullName, initialShiftCapability) {
  const storageKey = STORAGE_KEY_PREFIX + userKey;
  const stored = localStorage.getItem(storageKey);

  if (stored) {
    try {
      const data = JSON.parse(stored);
      if (!data.shiftCapability && initialShiftCapability) {
        data.shiftCapability = initialShiftCapability;
        data.doesNightShift = initialShiftCapability === 'day-night' || initialShiftCapability === 'all';
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
    shiftCapability: initialShiftCapability,
    doesNightShift: initialShiftCapability === 'day-night' || initialShiftCapability === 'all',
    preferences: {
      valuePreference: null
    }
  };

  localStorage.setItem(storageKey, JSON.stringify(baseData));
}

// 登録処理
function handleRegister(event) {
  event.preventDefault();
  
  const lastName = document.getElementById('lastName').value.trim();
  const firstName = document.getElementById('firstName').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const passwordConfirm = document.getElementById('passwordConfirm').value;
  const hireYearInput = document.getElementById('hireYear');
  const hireYearRaw = hireYearInput ? hireYearInput.value.trim() : '';
  const shiftCapabilityChoice = document.querySelector('input[name="shiftCapability"]:checked');
  
  const errorMsg = document.getElementById('errorMessage');
  errorMsg.classList.remove('show');
  
  if (!lastName || !firstName || !email || !password || !passwordConfirm || !hireYearRaw || !shiftCapabilityChoice) {
    errorMsg.textContent = 'すべての項目を入力してください';
    errorMsg.classList.add('show');
    return;
  }
  
  if (!email.includes('@')) {
    errorMsg.textContent = '有効なメールアドレスを入力してください';
    errorMsg.classList.add('show');
    return;
  }
  
  if (password.length < 6) {
    errorMsg.textContent = 'パスワードは6文字以上で入力してください';
    errorMsg.classList.add('show');
    return;
  }
  
  if (password !== passwordConfirm) {
    errorMsg.textContent = 'パスワードが一致しません';
    errorMsg.classList.add('show');
    return;
  }
  
  const hireYear = parseHireYear(hireYearRaw);
  if (!hireYear) {
    errorMsg.textContent = '入職年（西暦）を正しく入力してください（1970年〜現在+1年まで）';
    errorMsg.classList.add('show');
    return;
  }
  
  const shiftCapability = normalizeShiftCapability(shiftCapabilityChoice.value);
  if (!shiftCapability) {
    errorMsg.textContent = '夜勤・遅出の対応状況を選択してください';
    errorMsg.classList.add('show');
    return;
  }
  
  const users = getUsers();
  
  // メールアドレスをキーとして検索
  let existingUser = null;
  let existingUserKey = null;
  
  for (const [key, user] of Object.entries(users)) {
    if (user.email === email) {
      existingUser = user;
      existingUserKey = key;
      break;
    }
  }
  
  if (existingUser) {
    // 既に登録されている場合はログイン画面へ誘導
    errorMsg.textContent = 'このメールアドレスは既に登録されています。ログイン画面からログインしてください。';
    errorMsg.classList.add('show');
    
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 2000);
    return;
  }
  
  // 新規ユーザー登録
  const userKey = `${lastName}_${firstName}_${email}`;
  const hashedPassword = hashPassword(password);
  const fullName = `${lastName} ${firstName}`;
  
  users[userKey] = {
    lastName,
    firstName,
    email,
    password: hashedPassword,
    fullName,
    createdAt: new Date().toISOString(),
    hireYear,
    initialShiftCapability: shiftCapability
  };
  saveUsers(users);
  
  // シフトプロファイルを初期化
  ensureShiftProfile(userKey, fullName, shiftCapability);
  
  // 管理者が設定されていない場合は最初のユーザーを管理者にする
  let adminUsers = getAdminUsers();
  let isAdmin = false;
  
  if (adminUsers.length === 0) {
    adminUsers.push(email);
    saveAdminUsers(adminUsers);
    isAdmin = true;
  }
  
  // 現在のユーザー情報を保存してログイン状態にする
  const currentUser = {
    lastName,
    firstName,
    email,
    fullName,
    isAdmin,
    userKey,
    hireYear,
    initialShiftCapability: shiftCapability
  };
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
  
  // トップページにリダイレクト
  alert('登録が完了しました。次回からログイン画面でメールアドレスとパスワードでログインできます。');
  window.location.href = 'top.html';
}

// フォーム送信イベント
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('registerForm').addEventListener('submit', handleRegister);
  
  // 既にログインしている場合はトップページへ自動リダイレクト
  const currentUser = localStorage.getItem(CURRENT_USER_KEY);
  if (currentUser) {
    window.location.href = 'top.html';
  }
});

