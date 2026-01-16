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

// 登録処理
function handleRegister(event) {
  event.preventDefault();
  
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const passwordConfirm = document.getElementById('passwordConfirm').value;
  
  const errorMsg = document.getElementById('errorMessage');
  errorMsg.classList.remove('show');
  
  if (!email || !password || !passwordConfirm) {
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
  // メールアドレスをベースにしたユーザーキーを生成（一時的）
  const tempUserKey = `user_${email.replace(/[@.]/g, '_')}`;
  const hashedPassword = hashPassword(password);
  
  // メールアドレスのローカル部分から名前を推定（初期値）
  const emailLocal = email.split('@')[0];
  const tempName = emailLocal.charAt(0).toUpperCase() + emailLocal.slice(1);
  
  users[tempUserKey] = {
    email,
    password: hashedPassword,
    fullName: tempName,
    lastName: '',
    firstName: '',
    createdAt: new Date().toISOString(),
    hireYear: null,
    initialShiftCapability: null,
    registeredFrom: 'register'
  };
  saveUsers(users);
  
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
    email,
    fullName: tempName,
    lastName: '',
    firstName: '',
    isAdmin,
    userKey: tempUserKey,
    hireYear: null,
    initialShiftCapability: null,
    isNewUser: true
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

