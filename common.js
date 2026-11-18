// 員工頁與後台共用：登入、呼叫後端、小工具
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = ['', '一', '二', '三', '四', '五', '六', '日'];
let idToken = '';

function toast(msg, bad) {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = 'toast'; }, 3500);
}
function busy(on) { $('busy').style.display = on ? 'flex' : 'none'; }

async function login() {
  const cfg = window.APP_CONFIG;
  if (!cfg || cfg.LIFF_ID.indexOf('請貼上') === 0 || cfg.API_URL.indexOf('請貼上') === 0) throw new Error('尚未設定 config.js');
  await liff.init({ liffId: cfg.LIFF_ID });
  if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return false; }
  const dec = liff.getDecodedIDToken();
  if (!dec || dec.exp * 1000 < Date.now() + 60000) { relogin(); return false; }
  idToken = liff.getIDToken();
  return true;
}
function relogin() {
  try { liff.logout(); } catch (e) { /* ignore */ }
  if (liff.isInClient()) location.reload(); else liff.login({ redirectUri: location.href });
}

// 只讀取資料的操作，網路斷線時可以安全地自動重試（寫入的操作不自動重試，避免重複送出）
const READ_ONLY = ['me', 'myMonth', 'myApps', 'adminToday', 'lineStatus', 'adminApps', 'otDay', 'otMonth', 'notifyGet', 'adminEmps', 'adminReport', 'getSettings'];
// 呼叫後端。系統忙碌（多人同時操作）時會自動等一下再重試，最多 3 次
async function api(action, data, quiet) {
  if (!quiet) busy(true);
  try {
    for (let attempt = 0; ; attempt++) {
      let j;
      try {
        const res = await fetch(window.APP_CONFIG.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(Object.assign({ action: action, idToken: idToken }, data || {}))
        });
        j = await res.json();
      } catch (e) {
        if (attempt < 2 && READ_ONLY.indexOf(action) >= 0) { await new Promise((r) => setTimeout(r, 1500)); continue; }
        throw new Error(window.NET_MSG || '網路連線不穩，請稍後再試');
      }
      if (j.ok) return j.data;
      if (j.error === 'AUTH') { relogin(); throw new Error('登入已過期，重新登入中…'); }
      if (j.error === 'BUSY') {
        if (attempt < 3) { await new Promise((r) => setTimeout(r, 1200 + Math.random() * 1500)); continue; }
        throw new Error(window.BUSY_MSG || '目前使用人數較多，請稍候再按一次');
      }
      throw new Error(j.error || '發生錯誤');
    }
  } finally { if (!quiet) busy(false); }
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.page').forEach((p) => { p.style.display = p.id === 'p-' + name ? 'block' : 'none'; });
}
function hm(t) { return t ? t.slice(0, 5) : '—'; }
function flagHtml(flags) {
  return flags.map((f) => '<span class="tag ' + ({ '遲到': 'warn', '早退': 'warn', '缺卡': 'bad', '缺勤': 'bad', '請假': 'info', '補卡': 'info' }[f] || '') + '">' + esc(f) + '</span>').join('');
}
function thisMonth() {
  const d = new Date(Date.now() + 8 * 3600000);
  return d.toISOString().slice(0, 7);
}
