// 共通定数とユーティリティ関数

// ストレージキー
const USER_STORAGE_KEY = 'shift_system_users';
const CURRENT_USER_KEY = 'current_user';
const ADMIN_USERS_KEY = 'admin_users';
const ADMIN_REQUESTS_KEY = 'admin_requests';
const STORAGE_KEY_PREFIX = 'shift_request_';
const DEADLINE_KEY = 'shift_deadline';
const SUBMITTED_KEY_PREFIX = 'shift_submitted_';
const MIXING_MATRIX_KEY = 'mixing_matrix';
const PAID_LEAVE_LIMIT = 10;

// シフト対応状況
const SHIFT_CAPABILITIES = {
  DAY_ONLY: 'day-only',
  DAY_LATE: 'day-late',
  DAY_NIGHT: 'day-night',
  ALL: 'all'
};

// 希望の種類
const REQUEST_TYPES = {
  AVAILABLE: 'available',
  DAY_ONLY: 'day-only',
  DAY_LATE: 'day-late',
  NIGHT_ONLY: 'night-only',
  PAID_LEAVE: 'paid-leave'
};

// シフトの種類
const SHIFT_TYPES = {
  DAY: '日勤',
  NIGHT: '夜勤',
  OFF: '休'
};

// 価値観設定オプション
const VALUE_PREFERENCE_OPTIONS = {
  'go-out': {
    label: '夜勤明けは、アクティブに過ごしたい',
    icon: '🎢',
    description: '夜勤明けでも外出やイベントを楽しみたい。活発に活動したいタイプです。'
  },
  'relax-home': {
    label: '夜勤明けは、自宅でゆっくり休みたい',
    icon: '🛋️',
    description: '夜勤明けは自宅でゆっくり過ごしたい。無理せず体力回復を優先します。'
  },
  'chain-holiday': {
    label: '夜勤明けから連続して休みが欲しい',
    icon: '🌙➡️🛌',
    description: '夜勤明けから公休をつなげて連続休みにしたい。しっかりと体力を回復したいです。'
  },
  'no-holiday': {
    label: '夜勤明け後は、すぐ通常勤務に戻りたい',
    icon: '💪',
    description: '夜勤明け後は連続休みより通常勤務に戻したい。働くリズムを崩したくないタイプです。'
  }
};

// シフト対応状況を正規化
function normalizeShiftCapability(value) {
  const supported = [SHIFT_CAPABILITIES.DAY_ONLY, SHIFT_CAPABILITIES.DAY_LATE, SHIFT_CAPABILITIES.DAY_NIGHT, SHIFT_CAPABILITIES.ALL];
  if (supported.includes(value)) return value;
  const map = { 'night': SHIFT_CAPABILITIES.ALL, 'late': SHIFT_CAPABILITIES.DAY_LATE, 'day': SHIFT_CAPABILITIES.DAY_ONLY,
                'on': SHIFT_CAPABILITIES.ALL, 'off': SHIFT_CAPABILITIES.DAY_LATE, true: SHIFT_CAPABILITIES.ALL, false: SHIFT_CAPABILITIES.DAY_LATE };
  return map[value] || null;
}

// 日付が週末かどうか判定（2025年8月）
function isWeekend(dateStr) {
  const [month, day] = dateStr.split('/').map(Number);
  return [0, 6].includes(new Date(2025, month - 1, day).getDay());
}

// 日付文字列から曜日を取得
function getDayOfWeek(dateStr) {
  const [month, day] = dateStr.split('/').map(Number);
  return ['日', '月', '火', '水', '木', '金', '土'][new Date(2025, month - 1, day).getDay()];
}

// 仙人画像URIを取得
function getSageImageUri(diffMs) {
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return days > 1 ? './img/sage_calm.png' : './img/sage_excited.png';
}

// ユーザーデータを取得
function getUsers() {
  const stored = localStorage.getItem(USER_STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
}

// ユーザーデータを保存
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

// 現在のユーザーを取得
function getCurrentUser() {
  const stored = localStorage.getItem(CURRENT_USER_KEY);
  return stored ? JSON.parse(stored) : null;
}

// 現在のユーザーのキーを取得
function getCurrentUserKey() {
  const user = getCurrentUser();
  return user ? (user.userKey || user.email) : null;
}

