const DEADLINE_KEY = 'shift_deadline';
const CURRENT_USER_KEY = 'current_user';

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
  
  // 管理者の場合は管理者メニューを表示
  const adminCard = document.getElementById('adminCard');
  if (adminCard) {
    if (user.isAdmin) {
      adminCard.classList.remove('locked');
    } else {
      adminCard.classList.add('locked');
      adminCard.addEventListener('click', event => {
        event.preventDefault();
        alert('この画面は管理者専用です。管理者アカウントでログインしてください。');
      });
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

