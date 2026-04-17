// ═══════════════════════════════════════════════════════════════
// QLTK — TienTool  |  Renderer Process
// ═══════════════════════════════════════════════════════════════
import { createIcons, icons } from 'lucide';

const api = window.electronAPI;

// ── State ──────────────────────────────────────────────────────
let currentKeyId = null;
let accounts = [];
let selectedIndex = -1;
let serverList = [];

// ── DOM refs ───────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);

const dom = {
  pageLogin: $('#page-login'),
  pageDashboard: $('#page-dashboard'),
  loginForm: $('#login-form'),
  inputKey: $('#input-key'),
  btnLogin: $('#btn-login'),
  loginError: $('#login-error'),
  btnLogout: $('#btn-logout'),
  accountCount: $('#account-count'),
  accountsTbody: $('#accounts-tbody'),
  formId: $('#form-id'),
  formUsername: $('#form-username'),
  formPassword: $('#form-password'),
  formServer: $('#form-server'),
  formNote: $('#form-note'),
  formAccountType: $('#form-accountType'),
  togglePass: $('#toggle-pass'),
  btnAdd: $('#btn-add'),
  btnEdit: $('#btn-edit'),
  btnAddClone: $('#btn-add-clone'),
  btnDelete: $('#btn-delete'),
  btnLoginLauncher: $('#btn-login-launcher'),
  btnScriptAuto: $('#btn-script-auto'),
  toastContainer: $('#toast-container'),
  btnNhanAllCode: $('#btn-nhan-all-code'),
  autoProgressContainer: $('#auto-progress-container'),
  autoProgressAcc: $('#auto-progress-acc'),
  autoProgressCode: $('#auto-progress-code'),
  autoProgressBar: $('#auto-progress-bar'),
  autoProgressMsg: $('#auto-progress-msg'),

  btnMinimize: $('#btn-minimize'),
  btnMaximize: $('#btn-maximize'),
  btnClose: $('#btn-close'),
};

// ── Init Lucide Icons ──────────────────────────────────────────
function refreshIcons() {
  createIcons({ icons });
}
refreshIcons();

// ── Page management ────────────────────────────────────────────
// Fix initial state: show login, hide dashboard
document.querySelectorAll('.page').forEach((p) => {
  p.classList.add('hidden');
  p.style.display = '';
});
dom.pageLogin.classList.remove('hidden');
dom.pageLogin.style.display = 'flex';

function showPage(name) {
  document.querySelectorAll('.page').forEach((p) => {
    p.classList.add('hidden');
    p.style.display = 'none';
  });
  const target = $(`#page-${name}`);
  target.classList.remove('hidden');
  target.style.display = 'flex';
}

// ── Window Controls ────────────────────────────────────────────
dom.btnMinimize.addEventListener('click', () => api.minimize());
dom.btnMaximize.addEventListener('click', () => api.maximize());
dom.btnClose.addEventListener('click', () => api.close());

// ── Toast ──────────────────────────────────────────────────────
function toast(message, type = 'info') {
  const colors = {
    success: 'bg-gradient-to-r from-emerald-500 to-teal-500',
    error: 'bg-gradient-to-r from-red-500 to-rose-400',
    info: 'bg-gradient-to-r from-brand-400 to-blue-500',
  };
  const el = document.createElement('div');
  el.className = `px-4 py-2.5 rounded-lg text-sm font-medium text-white shadow-lg max-w-[300px] toast-anim ${colors[type] || colors.info}`;
  el.textContent = message;
  dom.toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Toggle Password ────────────────────────────────────────────
dom.togglePass.addEventListener('click', () => {
  const input = dom.formPassword;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  // swap icon
  const iconEl = dom.togglePass.querySelector('i, svg');
  if (iconEl) {
    iconEl.setAttribute('data-lucide', isPass ? 'eye-off' : 'eye');
    refreshIcons();
  }
});

// ══════════════════════════════════════════════════════════════
//  FETCH SERVER LIST
// ══════════════════════════════════════════════════════════════
async function loadServers() {
  try {
    const res = await fetch('https://api3.gnddt.com/api/Function/GetAllServer');
    const data = await res.json();
    if (data.result && data.ListServer) {
      serverList = data.ListServer;
      populateServerDropdown();
    }
  } catch (err) {
    console.error('[Renderer] Failed to fetch servers:', err);
    populateServerDropdown();
  }
}

function populateServerDropdown() {
  const sel = dom.formServer;
  sel.innerHTML = '<option value="">-- Chọn server --</option>';
  serverList.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.serverId;
    opt.textContent = `${s.serverId}. ${s.Name}`;
    if (s.Offline) {
      opt.textContent += ' (Offline)';
      opt.disabled = true;
    }
    if (s.New) {
      opt.textContent += ' ✦';
    }
    sel.appendChild(opt);
  });
}

// Get server display name from id
export function getServerName(serverId) {
  const s = serverList.find((x) => String(x.serverId) === String(serverId));
  return s ? s.Name : String(serverId);
}

// Load servers on startup
loadServers();

// ══════════════════════════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════════════════════════
dom.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = dom.inputKey.value.trim();
  if (!key) return;

  dom.loginError.textContent = '';
  dom.btnLogin.querySelector('.btn-text').textContent = 'Đang đăng nhập...';
  dom.btnLogin.querySelector('.btn-loader').classList.remove('hidden');
  dom.btnLogin.disabled = true;

  try {
    const result = await api.login(key);
    if (result.success) {
      currentKeyId = result.data._id;
      showPage('dashboard');
      toast('Đăng nhập thành công!', 'success');
      loadAccounts();
    } else {
      dom.loginError.textContent = result.error;
    }
  } catch {
    dom.loginError.textContent = 'Lỗi không xác định.';
  } finally {
    dom.btnLogin.querySelector('.btn-text').textContent = 'Đăng nhập';
    dom.btnLogin.querySelector('.btn-loader').classList.add('hidden');
    dom.btnLogin.disabled = false;
  }
});

// ── Logout ─────────────────────────────────────────────────────
dom.btnLogout.addEventListener('click', () => {
  currentKeyId = null;
  accounts = [];
  selectedIndex = -1;
  clearForm();
  dom.inputKey.value = '';
  dom.loginError.textContent = '';
  showPage('login');
  toast('Đã đăng xuất.', 'info');
});

// ══════════════════════════════════════════════════════════════
//  ACCOUNTS
// ══════════════════════════════════════════════════════════════
async function loadAccounts() {
  dom.accountCount.textContent = 'Đang tải...';
  try {
    const result = await api.getAccounts(currentKeyId);
    if (result.success) {
      accounts = result.data;
      selectedIndex = -1;
      clearForm();
      renderAccounts();
    } else {
      toast(result.error, 'error');
    }
  } catch {
    toast('Không thể tải dữ liệu.', 'error');
  }
}

function renderAccounts() {
  dom.accountCount.textContent = `Danh sách (${accounts.length})`;

  if (accounts.length === 0) {
    dom.accountsTbody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-gray-500 text-sm">Chưa có tài khoản nào.</td></tr>`;
    return;
  }

  dom.accountsTbody.innerHTML = accounts
    .map(
      (acc, i) => `
    <tr data-index="${i}" class="cursor-pointer transition-colors hover:bg-brand-400/10 ${i === selectedIndex ? 'selected' : ''} ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}">
      <td class="px-2 py-1 border-b border-white/[0.03] text-brand-400 text-[10px] font-bold">${i === selectedIndex ? '▶' : ''}</td>
      <td class="px-2 py-1 border-b border-white/[0.03] text-xs truncate" title="${esc(acc.username)}">${esc(acc.username)}</td>
      <td class="px-2 py-1 border-b border-white/[0.03] text-xs">${acc.server}</td>
      <td class="px-2 py-1 border-b border-white/[0.03] text-xs truncate text-gray-400" title="${esc(acc.note || '')}">${esc(acc.note || '')}</td>
      <td class="px-2 py-1 border-b border-white/[0.03] text-xs text-gray-400">${acc.accountType}</td>
    </tr>`
    )
    .join('');
}

// ── Table click → select row ───────────────────────────────────
dom.accountsTbody.addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-index]');
  if (!tr) return;
  selectAccount(parseInt(tr.dataset.index, 10));
});

function selectAccount(idx) {
  selectedIndex = idx;
  const acc = accounts[idx];
  if (!acc) return;
  dom.formId.value = acc._id;
  dom.formUsername.value = acc.username;
  dom.formPassword.value = acc.password;
  dom.formServer.value = acc.server;
  dom.formNote.value = acc.note || '';
  dom.formAccountType.value = acc.accountType;
  renderAccounts();
}

function clearForm() {
  dom.formId.value = '';
  dom.formUsername.value = '';
  dom.formPassword.value = '';
  dom.formServer.value = '';
  dom.formNote.value = '';
  dom.formAccountType.value = '0';
}

function getFormData() {
  return {
    keyId: currentKeyId,
    username: dom.formUsername.value.trim(),
    password: dom.formPassword.value.trim(),
    server: dom.formServer.value,
    accountType: dom.formAccountType.value,
    note: dom.formNote.value.trim(),
  };
}

// ── CRUD ───────────────────────────────────────────────────────
dom.btnAdd.addEventListener('click', async () => {
  const data = getFormData();
  if (!data.username || !data.password) return toast('Nhập tài khoản và mật khẩu.', 'error');
  data.accountType = '1';
  const result = await api.createAccount(data);
  result.success ? (toast('Đã thêm acc chính.', 'success'), loadAccounts()) : toast(result.error, 'error');
});

dom.btnAddClone.addEventListener('click', async () => {
  const data = getFormData();
  if (!data.username || !data.password) return toast('Nhập tài khoản và mật khẩu.', 'error');
  data.accountType = '0';
  const result = await api.createAccount(data);
  result.success ? (toast('Đã thêm acc clone.', 'success'), loadAccounts()) : toast(result.error, 'error');
});

dom.btnEdit.addEventListener('click', async () => {
  const id = dom.formId.value;
  if (!id) return toast('Chọn tài khoản để sửa.', 'error');
  const result = await api.updateAccount(id, getFormData());
  result.success ? (toast('Đã cập nhật.', 'success'), loadAccounts()) : toast(result.error, 'error');
});

dom.btnDelete.addEventListener('click', async () => {
  const id = dom.formId.value;
  if (!id) return toast('Chọn tài khoản để xóa.', 'error');
  if (!confirm('Xóa tài khoản này?')) return;
  const result = await api.deleteAccount(id);
  result.success ? (toast('Đã xóa.', 'success'), loadAccounts()) : toast(result.error, 'error');
});

// ── Login Launcher ─────────────────────────────────────────────
dom.btnLoginLauncher.addEventListener('click', async () => {
  const data = getFormData();
  if (!data.username || !data.password || !data.server) {
    return toast('Vui lòng chọn tài khoản và server hợp lệ.', 'error');
  }

  toast('Đang mở Launcher...', 'info');
  try {
    const result = await api.loginGame(data.username, data.password, data.server);
    if (result.success) {
      toast('Đã mở Game Launcher.', 'success');
      const sName = getServerName(data.server);
      await api.renameWindow(result.pid, `${data.username} - ${sName}`);
    } else {
      toast(result.msg || 'Không thể đăng nhập game.', 'error');
    }
  } catch (err) {
    toast('Lỗi khi mở Game Launcher.', 'error');
  }
});

// ── Placeholder buttons ────────────────────────────────────────

const placeholderIds = [
  'btn-flash-login', 'btn-sort', 'btn-kill-all',

  'btn-clipboard', 'btn-log', 'btn-config',
  'btn-import-json', 'btn-export-json', 'btn-export-txt',
  'btn-code-tuan'
];
placeholderIds.forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => toast('Chức năng sẽ được cập nhật sau.', 'info'));
});

// ── Keyboard navigation ───────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'SELECT') return;
  if (e.key === 'ArrowDown' && accounts.length > 0) {
    e.preventDefault();
    selectAccount(selectedIndex < accounts.length - 1 ? selectedIndex + 1 : 0);
  }
  if (e.key === 'ArrowUp' && accounts.length > 0) {
    e.preventDefault();
    selectAccount(selectedIndex > 0 ? selectedIndex - 1 : accounts.length - 1);
  }
});

// TAB AUTO

let isAutoRunning = false;

// Listen for progress updates from Main
api.onAutoProgress((data) => {
  if (data.accCurrent && data.accTotal) {
    dom.autoProgressAcc.textContent = `Acc: ${data.accCurrent}/${data.accTotal} (${data.username})`;
    // Update main progress bar based on accounts
    const accPercent = (data.accCurrent / data.accTotal) * 100;
    dom.autoProgressBar.style.width = `${accPercent}%`;
  }
  
  if (data.codeCurrent && data.codeTotal) {
    dom.autoProgressCode.textContent = `Code: ${data.codeCurrent}/${data.codeTotal}`;
  } else {
    dom.autoProgressCode.textContent = 'Code: --';
  }

  if (data.message) {
    dom.autoProgressMsg.textContent = data.message;
  }
});

// btn-script-auto
dom.btnScriptAuto.addEventListener('click', async () => {
  toast('Đang chạy script auto...', 'info');
  await api.openBatFile();
});

// btn-nhan-all-code
dom.btnNhanAllCode.addEventListener('click', async () => {
  if (isAutoRunning) {
    // STOP logic
    const res = await api.stopGetAllCode();
    if (res.success) {
      toast('Đã gửi yêu cầu dừng...', 'info');
    }
    return;
  }

  // START logic
  isAutoRunning = true;
  dom.btnNhanAllCode.classList.add('bg-red-500', 'hover:bg-red-400');
  dom.btnNhanAllCode.classList.remove('bg-surface');
  dom.btnNhanAllCode.innerHTML = '<i data-lucide="square" class="w-3.5 h-3.5"></i> Dừng nhận code';
  refreshIcons();

  dom.autoProgressContainer.classList.remove('hidden');
  dom.autoProgressMsg.textContent = 'Đang bắt đầu...';
  dom.autoProgressBar.style.width = '0%';

  try {
    await api.getAllCode(currentKeyId);
  } catch (err) {
    toast('Lỗi khi chạy automation.', 'error');
  } finally {
    isAutoRunning = false;
    dom.btnNhanAllCode.classList.remove('bg-red-500', 'hover:bg-red-400');
    dom.btnNhanAllCode.classList.add('bg-surface');
    dom.btnNhanAllCode.innerHTML = '<i data-lucide="gift" class="w-3.5 h-3.5"></i> Nhận all code';
    refreshIcons();
    toast('Tiến trình automation đã kết thúc.', 'info');
    setTimeout(() => {
      if (!isAutoRunning) dom.autoProgressContainer.classList.add('hidden');
    }, 5000);
  }
});

// ── Helpers ────────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
