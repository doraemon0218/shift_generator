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

// ログイン処理
function handleLogin(event) {
  event.preventDefault();
  
  const lastName = document.getElementById('lastName').value.trim();
  const firstName = document.getElementById('firstName').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  
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
  
  // ユーザーが存在するか確認
  if (users[userKey]) {
    // パスワード確認
    if (users[userKey].password !== hashedPassword) {
      errorMsg.textContent = 'パスワードが正しくありません';
      errorMsg.classList.add('show');
      return;
    }
  } else {
    // 新規ユーザー登録（初回ログイン）
    users[userKey] = {
      lastName,
      firstName,
      email,
      password: hashedPassword,
      fullName: `${lastName} ${firstName}`,
      createdAt: new Date().toISOString()
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
  
  // 現在のユーザー情報を保存
  const currentUser = {
    lastName,
    firstName,
    email,
    fullName: `${lastName} ${firstName}`,
    isAdmin,
    userKey
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

