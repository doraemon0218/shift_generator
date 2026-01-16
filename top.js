const DEADLINE_KEY = 'shift_deadline';
const CURRENT_USER_KEY = 'current_user';

const SAGE_SVGS = {
  calm: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="28" fill="#f5deb3" stroke="#6b4f2a" stroke-width="2"/><path d="M16 28 Q36 8 56 28" fill="#e0e0e0" stroke="#6b4f2a" stroke-width="2"/><circle cx="27" cy="34" r="3" fill="#333"/><circle cx="45" cy="34" r="3" fill="#333"/><path d="M26 45 Q36 53 46 45" stroke="#333" stroke-width="3" fill="none"/></svg>',
  sweat: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="28" fill="#f5deb3" stroke="#6b4f2a" stroke-width="2"/><path d="M16 28 Q36 8 56 28" fill="#e0e0e0" stroke="#6b4f2a" stroke-width="2"/><circle cx="27" cy="34" r="3" fill="#333"/><circle cx="45" cy="34" r="3" fill="#333"/><path d="M26 48 Q36 42 46 48" stroke="#333" stroke-width="3" fill="none"/><path d="M54 38 Q60 42 56 50 Q50 46 54 38" fill="#6ec6ff" stroke="#2c7fb8" stroke-width="1"/></svg>',
  angry: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="28" fill="#f5deb3" stroke="#6b4f2a" stroke-width="2"/><path d="M16 28 Q36 8 56 28" fill="#e0e0e0" stroke="#6b4f2a" stroke-width="2"/><path d="M22 30 L30 26" stroke="#333" stroke-width="3"/><path d="M50 30 L42 26" stroke="#333" stroke-width="3"/><circle cx="27" cy="36" r="3" fill="#333"/><circle cx="45" cy="36" r="3" fill="#333"/><path d="M26 50 Q36 42 46 50" stroke="#333" stroke-width="3" fill="none"/></svg>'
};

function getSageImageUri(diffMs) {
  const hoursLeft = diffMs / (1000 * 60 * 60);
  let state = 'calm';
  if (hoursLeft <= 24) {
    state = 'angry';
  } else if (hoursLeft <= 72) {
    state = 'sweat';
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(SAGE_SVGS[state])}`;
}

// ページ読み込み時に実行
document.addEventListener('DOMContentLoaded', () => {
  // ログイン状態を確認
  const currentUser = localStorage.getItem(CURRENT_USER_KEY);
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  const user = JSON.parse(currentUser);
  
  // ユーザー名を表示
  document.getElementById('userName').textContent = user.fullName;
  renderAdminToggle(user);
  
  // 管理者カードは閲覧可能（非管理者は閲覧モード）
  const adminCard = document.getElementById('adminCard');
  if (adminCard && !user.isAdmin) {
    adminCard.classList.remove('locked');
    const description = adminCard.querySelector('.menu-description');
    if (description && !description.textContent.includes('閲覧モード')) {
      description.innerHTML += '<br />※ 閲覧モードで開きます';
    }
  }
  
  // 締め切り情報を表示
  updateDeadlineDisplay();
  
  // 通知チェック（未提出の場合）
  checkNotification();
  
  // ログアウトボタンのイベント
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('ログアウトしますか？')) {
        localStorage.removeItem('current_user');
        window.location.href = 'index.html';
      }
    });
  }
  
  // 締め切り情報を定期的に更新（1分ごと）
  setInterval(updateDeadlineDisplay, 60000);
});

function renderAdminToggle(user) {
  const statusEl = document.getElementById('adminToggleStatus');
  const toggleBtn = document.getElementById('adminToggleBtn');
  if (!statusEl || !toggleBtn) return;

  const updateLabel = (isAdmin) => {
    statusEl.textContent = isAdmin ? 'ON（管理者）' : 'OFF（一般）';
    statusEl.style.color = isAdmin ? '#28a745' : '#dc3545';
  };

  updateLabel(Boolean(user.isAdmin));

  toggleBtn.addEventListener('click', () => {
    const nextValue = !Boolean(user.isAdmin);
    if (!confirm(`管理者権限を${nextValue ? 'ON' : 'OFF'}に切り替えますか？`)) {
      return;
    }
    user.isAdmin = nextValue;
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    updateLabel(nextValue);
  });
}

// 締め切り表示を更新
function updateDeadlineDisplay() {
  const banner = document.getElementById('deadlineBanner');
  const deadlineStr = localStorage.getItem(DEADLINE_KEY);
  
  if (!deadlineStr) {
    banner.style.display = 'none';
    return;
  }
  
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diff = deadline - now;
  const sageImg = document.getElementById('deadlineSage');
  
  banner.style.display = 'block';
  
  const deadlineDateEl = document.getElementById('deadlineDate');
  const countdownEl = document.getElementById('deadlineCountdown');
  
  deadlineDateEl.textContent = deadline.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  if (diff > 0) {
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    countdownEl.textContent = `残り: ${days}日 ${hours}時間 ${minutes}分`;
    
    if (days <= 3) {
      banner.className = 'deadline-banner warning';
    } else {
      banner.className = 'deadline-banner info';
    }
  } else {
    banner.className = 'deadline-banner';
    countdownEl.textContent = '締め切り済み';
  }

  if (sageImg) {
    sageImg.src = getSageImageUri(diff);
  }
}

// 通知チェック（未提出の場合、期日3日前に通知）
function checkNotification() {
  const deadlineStr = localStorage.getItem(DEADLINE_KEY);
  if (!deadlineStr) return;
  
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diff = deadline - now;
  const daysUntilDeadline = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  // 3日前のチェック
  if (daysUntilDeadline === 3) {
    const currentUser = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
    if (!currentUser) return;
    
    const userKey = currentUser.userKey || `${currentUser.lastName}_${currentUser.firstName}_${currentUser.email}`;
    const STORAGE_KEY_PREFIX = 'shift_request_';
    const SUBMITTED_KEY_PREFIX = 'shift_submitted_';
    const storageKey = STORAGE_KEY_PREFIX + userKey;
    const submittedKey = SUBMITTED_KEY_PREFIX + userKey;
    
    // 提出状況を確認
    const isSubmitted = localStorage.getItem(submittedKey) === 'true';
    
    if (!isSubmitted) {
      // 未提出の場合、通知を送信
      sendNotificationEmail(currentUser.email, currentUser.fullName, deadline);
    }
  }
  
  // 通知情報を表示
  if (daysUntilDeadline <= 3 && daysUntilDeadline > 0) {
    document.getElementById('notificationInfo').style.display = 'block';
  }
}

// 通知メールを送信（テンプレート）
function sendNotificationEmail(email, name, deadline) {
  const NOTIFICATION_SENT_KEY = `notification_sent_${email}_${deadline.toISOString().split('T')[0]}`;
  
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
  console.log('=== メール送信（テンプレート） ===');
  console.log('宛先:', email);
  console.log('件名:', subject);
  console.log('本文:', body);
  
  // 送信済みフラグを設定
  localStorage.setItem(NOTIFICATION_SENT_KEY, 'true');
  
  // ユーザーに通知（実際の実装では、バックエンドでメールを送信）
  alert(`未提出のため、${email} に通知メールが送信されます。\n\n（デモ版では実際のメール送信は行われません）`);
}

