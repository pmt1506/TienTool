// ═══════════════════════════════════════════════════════════════
// QLTK — TienTool  |  Renderer Process
// ═══════════════════════════════════════════════════════════════
import { createIcons, icons } from 'lucide';

const api = window.electronAPI;
const BASE_URL = import.meta.env.VITE_BASE_URL;

// ── State ──────────────────────────────────────────────────────
let currentKeyId = null;
let accounts = [];
let templates = [];
let selectedIndex = -1;
let serverList = [];
let renewPollInterval = null;
let registerPollInterval = null;
let currentRegisterRequestId = '';

// ── DOM refs ───────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);

const dom = {
  pageLogin: $('#page-login'),
  pageDashboard: $('#page-dashboard'),
  loginForm: $('#login-form'),
  inputKey: $('#input-key'),
  btnLogin: $('#btn-login'),
  btnShowRegister: $('#btn-show-register'),
  btnResendKey: $('#btn-resend-key'),
  loginError: $('#login-error'),
  btnLogout: $('#btn-logout'),
  accountCount: $('#account-count'),
  inputSearchAccount: $('#search-account'),
  accountsTbody: $('#accounts-tbody'),
  chkSelectAll: $('#chk-select-all'),
  formId: $('#form-id'),
  formUsername: $('#form-username'),
  formPassword: $('#form-password'),
  formServer: $('#form-server'),
  formNote: $('#form-note'),
  formAccountType: $('#form-accountType'),
  copyPass: $('#copy-pass'),
  btnAdd: $('#btn-add'),
  btnEdit: $('#btn-edit'),
  btnAddClone: $('#btn-add-clone'),
  btnDelete: $('#btn-delete'),
  
  // Templates
  templateSelect: $('#template-select'),
  btnCreateTemplate: $('#btn-create-template'),
  btnRenameTemplate: $('#btn-rename-template'),
  btnDeleteTemplate: $('#btn-delete-template'),

  btnLoginLauncher: $('#btn-login-launcher'),
  btnScriptAuto: $('#btn-script-auto'),
  rowToolsAction: $('#row-tools-action'),
  btnSetupFirstRun: $('#btn-setup-first-run'),
  toastContainer: $('#toast-container'),
  btnNhanAllCode: $('#btn-nhan-all-code'),
  btnCodeTuan: $('#btn-code-tuan'),
  btnResetAn: $('#btn-reset-an'),
  btnVipRewardWeek: $('#btn-vip-reward-week'),
  btnOpenWebshop: $('#btn-open-webshop'),
  autoProgressContainer: $('#auto-progress-container'),
  autoProgressAcc: $('#auto-progress-acc'),
  autoProgressCode: $('#auto-progress-code'),
  autoProgressBar: $('#auto-progress-bar'),
  autoProgressMsg: $('#auto-progress-msg'),

  btnArrangeLauncher: $('#btn-arrange-launcher'),
  btnArrangeLauncher100: $('#btn-arrange-launcher-100'),
  btnClearCache: $('#btn-clear-cache'),
  btnUpdateGame: $('#btn-update-game'),
  btnRegAcc: $('#btn-reg-acc'),

  // Reg Acc Modal (Admin)
  modalRegAcc: $('#modal-reg-acc'),
  btnCloseRegAcc: $('#btn-close-reg-acc'),
  btnCancelRegAcc: $('#btn-cancel-reg-acc'),
  tabRegChecked: $('#tab-reg-checked'),
  tabRegQuick: $('#tab-reg-quick'),
  viewRegChecked: $('#view-reg-checked'),
  viewRegQuick: $('#view-reg-quick'),
  regCheckedCount: $('#reg-checked-count'),
  regCheckedListCount: $('#reg-checked-list-count'),
  selectCheckedServer: $('#select-checked-server'),
  inputQuickPrefix: $('#input-quick-prefix'),
  inputQuickCount: $('#input-quick-count'),
  inputQuickStart: $('#input-quick-start'),
  inputQuickPad: $('#input-quick-pad'),
  inputQuickPassword: $('#input-quick-password'),
  selectQuickServer: $('#select-quick-server'),
  quickCreateChar: $('#quick-create-char'),
  quickSaveTool: $('#quick-save-tool'),
  regAccProgressContainer: $('#reg-acc-progress-container'),
  regAccProgressTitle: $('#reg-acc-progress-title'),
  regAccProgressPercent: $('#reg-acc-progress-percent'),
  regAccProgressBar: $('#reg-acc-progress-bar'),
  regAccProgressLog: $('#reg-acc-progress-log'),
  btnStartRegAcc: $('#btn-start-reg-acc'),
  btnStopRegAcc: $('#btn-stop-reg-acc'),

  btnConfig: $('#btn-config'),
  modalConfig: $('#modal-config'),
  btnCloseConfig: $('#btn-close-config'),
  btnSaveConfig: $('#btn-save-config'),
  inputRegPrefix: $('#input-reg-prefix'),
  inputRegCheckEnable: $('#input-reg-check-enable'),

  btnLog: $('#btn-log'),

  btnMinimize: $('#btn-minimize'),
  btnMaximize: $('#btn-maximize'),
  btnClose: $('#btn-close'),

  // Custom Prompt
  modalPrompt: $('#modal-prompt'),
  promptTitle: $('#prompt-title'),
  inputPrompt: $('#input-prompt'),
  btnClosePrompt: $('#btn-close-prompt'),
  btnCancelPrompt: $('#btn-cancel-prompt'),
  btnSubmitPrompt: $('#btn-submit-prompt'),

  // Register Modal
  modalRegister: $('#modal-register'),
  btnCloseRegister: $('#btn-close-register'),
  inputRegisterEmail: $('#input-register-email'),
  btnGenerateRegisterQr: $('#btn-generate-register-qr'),
  registerQrContainer: $('#register-qr-container'),
  imgRegisterQr: $('#img-register-qr'),

  // Inline Renew Container
  inlineRenewContainer: $('#inline-renew-container'),
  imgInlineRenewQr: $('#img-inline-renew-qr'),
};

// ── Load Config ────────────────────────────────────────────────
let config = { regPrefix: 'GNLM', regCheckEnable: true };
try {
  const saved = localStorage.getItem('tt_config');
  if (saved) config = { ...config, ...JSON.parse(saved) };
} catch (e) {
  console.error('Lỗi tải config:', e);
}

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

// ── Confirm modal (thay cho window.confirm cho đồng bộ giao diện) ──
function asyncConfirm(message, { title = 'Xác nhận', okText = 'Đồng ý', cancelText = 'Hủy' } = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-confirm');
    const titleEl = document.getElementById('confirm-title');
    const msgEl = document.getElementById('confirm-message');
    const btnOk = document.getElementById('btn-ok-confirm');
    const btnCancel = document.getElementById('btn-cancel-confirm');

    if (!modal) return resolve(confirm(message)); // fallback

    titleEl.textContent = title;
    msgEl.textContent = message;
    btnOk.textContent = okText;
    btnCancel.textContent = cancelText;
    modal.classList.remove('hidden');
    refreshIcons();
    btnOk.focus();

    const cleanup = () => {
      modal.classList.add('hidden');
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKeydown);
    };
    const onOk = () => {
      cleanup();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const onKeydown = (e) => {
      if (e.key === 'Enter') onOk();
      if (e.key === 'Escape') onCancel();
    };

    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKeydown);
  });
}

// ── Alert modal (thay cho window.alert) ──
function asyncAlert(message, { title = 'Thông báo', okText = 'Đã hiểu', type = 'error' } = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-alert');
    const titleEl = document.getElementById('alert-title');
    const msgEl = document.getElementById('alert-message');
    const btnOk = document.getElementById('btn-ok-alert');
    const topBar = document.getElementById('alert-top-bar');
    const iconContainer = document.getElementById('alert-icon-container');
    const iconEl = document.getElementById('alert-icon');

    if (!modal) {
      alert(message);
      return resolve(true);
    }

    titleEl.textContent = title;
    msgEl.textContent = message;
    btnOk.textContent = okText;

    if (type === 'error') {
      topBar.className = 'h-1.5 w-full bg-gradient-to-r from-red-500 via-rose-500 to-amber-500';
      iconContainer.className = 'w-14 h-14 rounded-full flex items-center justify-center bg-red-500/15 ring-4 ring-red-500/10';
      iconEl.className = 'w-7 h-7 text-red-400';
      iconEl.setAttribute('data-lucide', 'alert-triangle');
      btnOk.className = 'w-full px-3 py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white text-sm font-semibold rounded-md transition-all shadow-lg shadow-red-500/20';
    } else if (type === 'warning') {
      topBar.className = 'h-1.5 w-full bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400';
      iconContainer.className = 'w-14 h-14 rounded-full flex items-center justify-center bg-amber-500/15 ring-4 ring-amber-500/10';
      iconEl.className = 'w-7 h-7 text-amber-400';
      iconEl.setAttribute('data-lucide', 'alert-circle');
      btnOk.className = 'w-full px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-sm font-semibold rounded-md transition-all shadow-lg shadow-amber-500/20';
    } else {
      topBar.className = 'h-1.5 w-full bg-gradient-to-r from-brand-400 to-blue-500';
      iconContainer.className = 'w-14 h-14 rounded-full flex items-center justify-center bg-brand-500/15 ring-4 ring-brand-500/10';
      iconEl.className = 'w-7 h-7 text-brand-400';
      iconEl.setAttribute('data-lucide', 'info');
      btnOk.className = 'w-full px-3 py-2 bg-gradient-to-r from-brand-400 to-brand-500 hover:from-brand-300 hover:to-brand-400 text-white text-sm font-semibold rounded-md transition-all shadow-lg shadow-brand-500/20';
    }

    modal.classList.remove('hidden');
    refreshIcons();
    btnOk.focus();

    const cleanup = () => {
      modal.classList.add('hidden');
      btnOk.removeEventListener('click', onOk);
      document.removeEventListener('keydown', onKeydown);
    };
    const onOk = () => {
      cleanup();
      resolve(true);
    };
    const onKeydown = (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') onOk();
    };

    btnOk.addEventListener('click', onOk);
    document.addEventListener('keydown', onKeydown);
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function getSavedLicenseEmail() {
  return localStorage.getItem('tt_license_email') || '';
}

function setSavedLicenseEmail(email) {
  if (email) {
    localStorage.setItem('tt_license_email', email);
  }
}

// ── Copy Password ────────────────────────────────────────────
dom.copyPass.addEventListener('click', async () => {
  const input = dom.formPassword;
  const password = input.value;

  if (!password) return;

  try {
    await navigator.clipboard.writeText(password);

    // optional: đổi icon / feedback
    const iconEl = dom.copyPass.querySelector('i, svg');
    if (iconEl) {
      iconEl.setAttribute('data-lucide', 'check'); // icon check khi copy thành công
      refreshIcons();

      // đổi lại icon sau 1.5s
      setTimeout(() => {
        iconEl.setAttribute('data-lucide', 'copy');
        refreshIcons();
      }, 1500);
    }

    toast('Copy mật khẩu thành công', 'success')

  } catch (err) {
    toast('Copy mật khẩu thất bại', 'error')
    console.error('Copy failed:', err);
  }
});

// ══════════════════════════════════════════════════════════════
//  FETCH SERVER LIST
// ══════════════════════════════════════════════════════════════
async function loadServers() {
  try {
    const res = await fetch(`${BASE_URL}/GetAllServer`);
    const data = await res.json();
    console.log(data);
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
  if (sel) {
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

  const checkedSel = dom.selectCheckedServer;
  if (checkedSel) {
    const currentVal = checkedSel.value;
    checkedSel.innerHTML = '<option value="">Theo server của từng account (Mặc định)</option>';
    serverList.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.serverId;
      opt.textContent = `${s.serverId}. ${s.Name}`;
      if (s.Offline) {
        opt.textContent += ' (Offline)';
        opt.disabled = true;
      }
      checkedSel.appendChild(opt);
    });
    if (currentVal) checkedSel.value = currentVal;
  }

  const quickSel = dom.selectQuickServer;
  if (quickSel) {
    const currentVal = quickSel.value;
    quickSel.innerHTML = '';
    serverList.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.serverId;
      opt.textContent = `${s.serverId}. ${s.Name}`;
      if (s.Offline) {
        opt.textContent += ' (Offline)';
        opt.disabled = true;
      }
      quickSel.appendChild(opt);
    });
    if (currentVal && serverList.some((s) => String(s.serverId) === String(currentVal))) {
      quickSel.value = currentVal;
    } else if (serverList.length > 0) {
      quickSel.value = serverList[0].serverId;
    }
  }
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
async function loginWithKey(key, { silent = false } = {}) {
  dom.loginError.textContent = '';
  dom.btnLogin.querySelector('.btn-text').textContent = 'Đang đăng nhập...';
  dom.btnLogin.querySelector('.btn-loader').classList.remove('hidden');
  dom.btnLogin.disabled = true;

  try {
    const result = await api.login(key);
    if (result.success) {
      currentKeyId = result.data._id;
      dom.inputKey.value = result.data.keys || key;
      await api.saveKey(result.data.keys || key);
      setSavedLicenseEmail(result.data.email || getSavedLicenseEmail());

      if (result.data.hideAuto) {
        dom.btnScriptAuto?.classList.add('hidden');
        dom.rowToolsAction?.classList.remove('grid-cols-3');
        dom.rowToolsAction?.classList.add('grid-cols-2');
      } else {
        dom.btnScriptAuto?.classList.remove('hidden');
        dom.rowToolsAction?.classList.remove('grid-cols-2');
        dom.rowToolsAction?.classList.add('grid-cols-3');
      }

      if (result.data.isAdmin) {
        dom.btnRegAcc?.classList.remove('hidden');
      } else {
        dom.btnRegAcc?.classList.add('hidden');
      }

      showPage('dashboard');
      if (!silent) toast('Đăng nhập thành công!', 'success');
      dom.inlineRenewContainer.classList.add('hidden');
      dom.inlineRenewContainer.classList.remove('flex');
      dom.btnShowRegister.classList.remove('hidden');
      await loadAccounts();
      return true;
    }

    dom.loginError.textContent = result.error;
    if (result.error.includes('hết hạn')) {
      dom.inlineRenewContainer.classList.remove('hidden');
      dom.inlineRenewContainer.classList.add('flex');

      const bank = 'TPBank';
      const acc = '02137848401';
      const amount = '59000';
      const des = `GH ${key}`;
      const qrUrl = `https://qr.sepay.vn/img?bank=${bank}&acc=${acc}&template=compact&amount=${amount}&des=${encodeURIComponent(des)}`;

      dom.imgInlineRenewQr.src = qrUrl;
      dom.btnShowRegister.classList.add('hidden');

      if (renewPollInterval) clearInterval(renewPollInterval);
      renewPollInterval = setInterval(async () => {
        const res = await api.checkKey(key);
        if (res && res.success && res.exists && res.expiredAt) {
          const currentTime = Date.now();
          const expiredTime = new Date(res.expiredAt).getTime();
          if (expiredTime > currentTime) {
            clearInterval(renewPollInterval);
            toast('Gia hạn thành công! Đang tự động đăng nhập...', 'success');
            await loginWithKey(key);
          }
        }
      }, 3000);
    } else {
      dom.inlineRenewContainer.classList.add('hidden');
      dom.inlineRenewContainer.classList.remove('flex');
      dom.btnShowRegister.classList.remove('hidden');
    }
  } catch (err) {
    console.error('[Renderer] Login error:', err);
    dom.loginError.textContent = 'Lỗi không xác định.';
    dom.inlineRenewContainer.classList.add('hidden');
    dom.inlineRenewContainer.classList.remove('flex');
    dom.btnShowRegister.classList.remove('hidden');
  } finally {
    dom.btnLogin.querySelector('.btn-text').textContent = 'Đăng nhập';
    dom.btnLogin.querySelector('.btn-loader').classList.add('hidden');
    dom.btnLogin.disabled = false;
  }

  return false;
}

dom.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = dom.inputKey.value.trim();
  if (!key) return;
  await loginWithKey(key);
});

dom.inputKey.addEventListener('input', () => {
  if (renewPollInterval) clearInterval(renewPollInterval);
  dom.inlineRenewContainer.classList.add('hidden');
  dom.inlineRenewContainer.classList.remove('flex');
  dom.btnShowRegister.classList.remove('hidden');
});

dom.btnLogout.addEventListener('click', () => {
  currentKeyId = null;
  accounts = [];
  selectedIndex = -1;
  if (renewPollInterval) clearInterval(renewPollInterval);
  if (registerPollInterval) clearInterval(registerPollInterval);
  clearForm();
  dom.loginError.textContent = '';
  dom.inlineRenewContainer.classList.add('hidden');
  dom.inlineRenewContainer.classList.remove('flex');
  dom.btnShowRegister.classList.remove('hidden');
  dom.btnRegAcc?.classList.add('hidden');
  showPage('login');
  toast('Đã đăng xuất.', 'info');
});

dom.btnShowRegister.addEventListener('click', () => {
  currentRegisterRequestId = '';
  dom.inputRegisterEmail.value = getSavedLicenseEmail();
  dom.registerQrContainer.classList.add('hidden');
  dom.registerQrContainer.classList.remove('flex');
  dom.btnGenerateRegisterQr.classList.remove('hidden');
  dom.modalRegister.classList.remove('hidden');
  refreshIcons();
});

dom.btnCloseRegister.addEventListener('click', () => {
  if (registerPollInterval) clearInterval(registerPollInterval);
  dom.modalRegister.classList.add('hidden');
});

dom.btnGenerateRegisterQr.addEventListener('click', async () => {
  const email = dom.inputRegisterEmail.value.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return toast('Vui lòng nhập email hợp lệ để nhận key.', 'error');
  }

  dom.btnGenerateRegisterQr.disabled = true;
  dom.btnGenerateRegisterQr.textContent = 'Đang tạo yêu cầu...';

  try {
    const request = await api.createRegisterRequest(email);
    if (!request.success) {
      toast(request.error || 'Không tạo được yêu cầu đăng ký.', 'error');
      return;
    }

    currentRegisterRequestId = request.data.requestId;
    setSavedLicenseEmail(request.data.email);

    const bank = 'TPBank';
    const acc = '02137848401';
    const amount = '59000';
    const des = `DK ${currentRegisterRequestId}`;
    const qrUrl = `https://qr.sepay.vn/img?bank=${bank}&acc=${acc}&template=compact&amount=${amount}&des=${encodeURIComponent(des)}`;

    dom.imgRegisterQr.src = qrUrl;
    dom.registerQrContainer.classList.remove('hidden');
    dom.registerQrContainer.classList.add('flex');
    dom.btnGenerateRegisterQr.classList.add('hidden');
    toast('Đã tạo mã QR thành công!', 'success');

    if (registerPollInterval) clearInterval(registerPollInterval);
    registerPollInterval = setInterval(async () => {
      const res = await api.getRegisterRequestStatus(currentRegisterRequestId);
      if (res?.success && res.data?.status === 'paid' && res.data?.key) {
        clearInterval(registerPollInterval);
        dom.modalRegister.classList.add('hidden');
        dom.inputKey.value = res.data.key;
        await api.exportKeyTxt(res.data.email || getSavedLicenseEmail(), res.data.key);
        toast('Đăng ký thành công! Đang tự động đăng nhập...', 'success');
        await loginWithKey(res.data.key);
      } else if (res?.success && res.data?.status === 'expired') {
        clearInterval(registerPollInterval);
        toast('Yêu cầu thanh toán đã hết hạn. Vui lòng tạo lại QR.', 'error');
        dom.btnGenerateRegisterQr.classList.remove('hidden');
        dom.registerQrContainer.classList.add('hidden');
        dom.registerQrContainer.classList.remove('flex');
      }
    }, 3000);
  } catch (err) {
    console.error('[Renderer] Register QR error:', err);
    toast('Lỗi hệ thống khi tạo QR.', 'error');
  } finally {
    dom.btnGenerateRegisterQr.disabled = false;
    dom.btnGenerateRegisterQr.textContent = 'Tạo QR Thanh toán';
  }
});

dom.btnResendKey.addEventListener('click', async () => {
  const email = (await asyncPrompt('Nhập email đã đăng ký key', getSavedLicenseEmail()))?.trim().toLowerCase();
  if (!email) return;
  if (!isValidEmail(email)) {
    return toast('Email không hợp lệ.', 'error');
  }

  setSavedLicenseEmail(email);
  const result = await api.resendLicenseEmail(email);
  if (!result?.success || !result?.data?.key) {
    return toast(result.error || 'Không tìm thấy key theo email.', 'error');
  }

  const key = result.data.key;
  dom.inputKey.value = key;
  const exportRes = await api.exportKeyTxt(email, key);
  if (exportRes?.canceled) {
    toast('Đã lấy key theo email. Bạn đã hủy lưu file TXT.', 'info');
    return;
  }
  if (!exportRes?.success) {
    toast(exportRes?.error || 'Lấy key thành công nhưng không xuất được TXT.', 'error');
    return;
  }
  toast(`Đã lấy key và lưu TXT: ${exportRes.path}`, 'success');
});

async function initializeSavedKey() {
  const result = await api.getSavedKey();
  if (!result?.success || !result.key) return;

  dom.inputKey.value = result.key;
  await loginWithKey(result.key, { silent: true });
}

initializeSavedKey();

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
      loadTemplates();
    } else {
      toast(result.error, 'error');
    }
  } catch {
    toast('Không thể tải dữ liệu.', 'error');
  }
}

// ══════════════════════════════════════════════════════════════
//  TEMPLATES
// ══════════════════════════════════════════════════════════════
async function loadTemplates() {
  try {
    const result = await api.getTemplates(currentKeyId);
    if (result.success) {
      templates = result.data;
      renderTemplates();
    } else {
      console.error('Failed to load templates:', result.error);
    }
  } catch (err) {
    console.error('Failed to load templates:', err);
  }
}

function renderTemplates() {
  dom.templateSelect.innerHTML = '<option value="">-- Chọn template --</option>';
  templates.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t._id;
    opt.textContent = `${t.name} (${t.accountIds.length} acc)`;
    dom.templateSelect.appendChild(opt);
  });
  dom.btnDeleteTemplate.classList.add('hidden');
  dom.btnRenameTemplate.classList.add('hidden');
  dom.btnCreateTemplate.classList.remove('hidden');
}

// ── Custom Prompt ───────────────────────────────────────────────
// ── Custom Prompt ───────────────────────────────────────────────
function asyncPrompt(title, defaultValue = '') {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-prompt');
    const titleEl = document.getElementById('prompt-title');
    const inputEl = document.getElementById('input-prompt');
    const btnClose = document.getElementById('btn-close-prompt');
    const btnCancel = document.getElementById('btn-cancel-prompt');
    const btnSubmit = document.getElementById('btn-submit-prompt');

    if (!modal) {
      console.error('Modal prompt element not found!');
      return resolve(prompt(title, defaultValue)); // fallback
    }

    titleEl.textContent = title;
    inputEl.value = defaultValue;
    modal.classList.remove('hidden');
    inputEl.focus();
    inputEl.select();

    const cleanup = () => {
      modal.classList.add('hidden');
      btnClose.removeEventListener('click', onCancel);
      btnCancel.removeEventListener('click', onCancel);
      btnSubmit.removeEventListener('click', onSubmit);
      inputEl.removeEventListener('keydown', onKeydown);
    };

    const onCancel = () => { cleanup(); resolve(null); };
    const onSubmit = () => { cleanup(); resolve(inputEl.value); };
    const onKeydown = (e) => {
      if (e.key === 'Enter') onSubmit();
      if (e.key === 'Escape') onCancel();
    };

    btnClose.addEventListener('click', onCancel);
    btnCancel.addEventListener('click', onCancel);
    btnSubmit.addEventListener('click', onSubmit);
    inputEl.addEventListener('keydown', onKeydown);
  });
}

dom.templateSelect.addEventListener('change', () => {
  const selectedId = dom.templateSelect.value;
  if (!selectedId) {
    dom.btnDeleteTemplate.classList.add('hidden');
    dom.btnRenameTemplate.classList.add('hidden');
    dom.btnCreateTemplate.classList.remove('hidden');
    accounts.forEach(a => a.isChecked = false);
    renderAccounts();
    return;
  }

  dom.btnDeleteTemplate.classList.remove('hidden');
  dom.btnRenameTemplate.classList.remove('hidden');
  dom.btnCreateTemplate.classList.add('hidden');
  const t = templates.find(x => x._id === selectedId);
  if (t) {
    accounts.forEach(a => {
      a.isChecked = t.accountIds.includes(a._id);
    });
    renderAccounts();
  }
});

dom.btnCreateTemplate.addEventListener('click', async () => {
  const checkedAccounts = accounts.filter(acc => acc.isChecked);

  if (checkedAccounts.length === 0) {
    return toast('Vui lòng tick chọn ít nhất 1 account để tạo template.', 'warning');
  }

  const name = await asyncPrompt(`Nhập tên template (${checkedAccounts.length} acc):`);
  
  if (!name || !name.trim()) return;

  const data = {
    keyId: currentKeyId,
    name: name.trim(),
    accountIds: checkedAccounts.map(a => a._id)
  };

  const result = await api.createTemplate(data);
  if (result.success) {
    toast(`Tạo template "${data.name}" thành công!`, 'success');
    accounts.forEach(a => a.isChecked = false);
    renderAccounts();
    loadTemplates();
  } else {
    toast(result.error, 'error');
  }
});

dom.btnDeleteTemplate.addEventListener('click', async () => {
  const selectedId = dom.templateSelect.value;
  if (!selectedId) return;

  if (!confirm('Bạn có chắc muốn xóa template này?')) return;

  const result = await api.deleteTemplate(selectedId);
  if (result.success) {
    toast('Đã xóa template.', 'success');
    loadTemplates();
  } else {
    toast(result.error, 'error');
  }
});

dom.btnRenameTemplate.addEventListener('click', async () => {
  const selectedId = dom.templateSelect.value;
  if (!selectedId) return;

  const t = templates.find(x => x._id === selectedId);
  if (!t) return;

  const newName = await asyncPrompt(`Nhập tên mới cho template:`, t.name);
  if (!newName || !newName.trim() || newName.trim() === t.name) return;

  const result = await api.updateTemplate(selectedId, { name: newName.trim() });
  if (result.success) {
    toast('Đã đổi tên template.', 'success');
    loadTemplates();
  } else {
    toast(result.error, 'error');
  }
});

function renderAccounts() {
  const query = dom.inputSearchAccount?.value.trim().toLowerCase() || '';
  const filteredAccounts = accounts.filter(acc => acc.username.toLowerCase().includes(query));

  dom.accountCount.textContent = `Danh sách (${filteredAccounts.length})`;

  if (filteredAccounts.length === 0) {
    dom.accountsTbody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-gray-500 text-sm">Chưa có tài khoản nào.</td></tr>`;
    if (dom.chkSelectAll) {
      dom.chkSelectAll.checked = false;
      dom.chkSelectAll.indeterminate = false;
    }
    return;
  }

  if (dom.chkSelectAll) {
    dom.chkSelectAll.checked = filteredAccounts.length > 0 && filteredAccounts.every((a) => a.isChecked);
    dom.chkSelectAll.indeterminate = filteredAccounts.some((a) => a.isChecked) && !dom.chkSelectAll.checked;
  }

  dom.accountsTbody.innerHTML = filteredAccounts
    .map(
      (acc, idx) => {
        const i = accounts.indexOf(acc);
        return `
    <tr data-index="${i}" class="cursor-pointer transition-colors hover:bg-brand-400/10 ${i === selectedIndex ? 'selected' : ''} ${idx % 2 === 0 ? '' : 'bg-white/[0.02]'}">
      <td class="px-2 py-1 border-b border-white/[0.03] text-center w-6" onclick="event.stopPropagation()">
        <input
          type="checkbox"
          class="acc-chk cursor-pointer
                w-4 h-4
                rounded-md
                border border-white/30
                bg-white/5
                text-brand-500
                checked:bg-brand-500
                checked:border-brand-500
                focus:ring-2
                focus:ring-brand-400/40
                focus:ring-offset-0
                transition-all duration-200"
          data-index="${i}"
          ${acc.isChecked ? 'checked' : ''}
        />
      </td>
      <td class="px-2 py-1 border-b border-white/[0.03] text-xs truncate" title="${esc(acc.username)}">${esc(acc.username)}</td>
      <td class="px-2 py-1 border-b border-white/[0.03] text-xs">${acc.server}</td>
      <td class="px-2 py-1 border-b border-white/[0.03] text-xs truncate text-gray-400" title="${esc(acc.note || '')}">${esc(acc.note || '')}</td>
      <td class="px-2 py-1 border-b border-white/[0.03] text-xs text-gray-400">${acc.accountType}</td>
    </tr>`;
      }
    )
    .join('');
}

// ── Table click → select row ───────────────────────────────────
if (dom.inputSearchAccount) {
  dom.inputSearchAccount.addEventListener('input', () => {
    renderAccounts();
  });
}

if (dom.chkSelectAll) {
  dom.chkSelectAll.addEventListener('change', (e) => {
    const checked = e.target.checked;
    const query = dom.inputSearchAccount?.value.trim().toLowerCase() || '';
    const filteredAccounts = accounts.filter((acc) => acc.username.toLowerCase().includes(query));
    filteredAccounts.forEach((acc) => (acc.isChecked = checked));
    renderAccounts();
  });
}

dom.accountsTbody.addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-index]');
  if (!tr) return;
  selectAccount(parseInt(tr.dataset.index, 10));
});

dom.accountsTbody.addEventListener('change', (e) => {
  if (e.target.classList.contains('acc-chk')) {
    const idx = parseInt(e.target.dataset.index, 10);
    accounts[idx].isChecked = e.target.checked;

    const query = dom.inputSearchAccount?.value.trim().toLowerCase() || '';
    const filteredAccounts = accounts.filter((acc) => acc.username.toLowerCase().includes(query));
    if (dom.chkSelectAll) {
      dom.chkSelectAll.checked = filteredAccounts.length > 0 && filteredAccounts.every((a) => a.isChecked);
      dom.chkSelectAll.indeterminate = filteredAccounts.some((a) => a.isChecked) && !dom.chkSelectAll.checked;
    }
  }
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
  const checkedAccounts = accounts.filter((acc) => acc.isChecked);
  if (checkedAccounts.length > 0) {
    const confirmed = await asyncConfirm(
      `Bạn có chắc chắn muốn xóa ${checkedAccounts.length} tài khoản đã chọn không?\nThao tác này không thể hoàn tác.`,
      { title: 'Xóa nhiều tài khoản', okText: `Xóa ${checkedAccounts.length} acc`, cancelText: 'Hủy' }
    );
    if (!confirmed) return;

    const ids = checkedAccounts.map((a) => a._id);
    const result = await api.deleteAccountsBatch(ids);
    if (result.success) {
      toast(`Đã xóa ${result.count || ids.length} tài khoản thành công.`, 'success');
      clearForm();
      await loadAccounts();
    } else {
      toast(result.error || 'Lỗi khi xóa tài khoản.', 'error');
    }
    return;
  }

  const id = dom.formId.value;
  if (!id) return toast('Vui lòng chọn hoặc tick tài khoản cần xóa.', 'warning');

  const username = dom.formUsername.value || 'tài khoản này';
  const confirmed = await asyncConfirm(
    `Xóa tài khoản "${username}"?`,
    { title: 'Xác nhận xóa', okText: 'Xóa', cancelText: 'Hủy' }
  );
  if (!confirmed) return;

  const result = await api.deleteAccount(id);
  if (result.success) {
    toast(`Đã xóa tài khoản "${username}".`, 'success');
    clearForm();
    await loadAccounts();
  } else {
    toast(result.error || 'Không thể xóa tài khoản.', 'error');
  }
});

// ── Login Launcher ─────────────────────────────────────────────
dom.btnLoginLauncher.addEventListener('click', async () => {
  const checkedAccounts = accounts.filter(acc => acc.isChecked);

  if (checkedAccounts.length > 0) {
    toast(`Đang login ${checkedAccounts.length} account...`, 'info');
    let loggedInPids = [];

    dom.btnLoginLauncher.disabled = true;
    for (let acc of checkedAccounts) {
      if (!acc.server) {
        toast(`Account ${acc.username} chưa có server.`, 'error');
        continue;
      }
      try {
        const result = await api.loginGame(acc.username, acc.password, acc.server, acc.accountType, config.regPrefix, 14, config.regCheckEnable);
        if (result.success) {
          const sName = getServerName(acc.server);
          const hwidSuffix = result.pid ? ` - ${result.pid}` : '';
          await api.renameWindow(result.pid, `${acc.username} - ${sName}${hwidSuffix}`);
          loggedInPids.push(result.pid);
        } else {
          toast(`Lỗi log ${acc.username}: ${result.msg}`, 'error');
        }
      } catch (err) {
        toast(`Lỗi log ${acc.username}.`, 'error');
      }
    }
    dom.btnLoginLauncher.disabled = false;

    toast(`Đã mở ${loggedInPids.length} game.`, 'success');

    if (loggedInPids.length === 4) {
      toast('Đang dàn 4 khung 100%...', 'info');
      await api.arrangeLaunchers100(loggedInPids);
    }

    // Reset ticks
    accounts.forEach(a => a.isChecked = false);
    renderAccounts();
    return;
  }

  const data = getFormData();
  if (!data.username || !data.password || !data.server) {
    return toast('Vui lòng chọn tài khoản và server hợp lệ.', 'error');
  }

  toast('Đang mở Launcher...', 'info');
  try {
    const result = await api.loginGame(data.username, data.password, data.server, data.accountType || 2, config.regPrefix, 14, config.regCheckEnable);
    if (result.success) {
      toast('Đã mở Game Launcher.', 'success');
      const sName = getServerName(data.server);
      const hwidSuffix = result.pid ? ` - ${result.pid}` : '';
      await api.renameWindow(result.pid, `${data.username} - ${sName}${hwidSuffix}`);
    } else {
      toast(result.msg || 'Không thể đăng nhập game.', 'error');
    }
  } catch (err) {
    toast('Lỗi khi mở Game Launcher.', 'error');
  }
});

// ── Arrange Launchers ──────────────────────────────────────────
dom.btnArrangeLauncher.addEventListener('click', async () => {
  toast('Đang sắp xếp cửa sổ 50%...', 'info');
  const result = await api.arrangeLaunchers();
  if (result.success) {
    toast('Đã sắp xếp 50% xong.', 'success');
  } else {
    toast(result.msg || 'Không thể sắp xếp.', 'error');
  }
});

if (dom.btnArrangeLauncher100) {
  dom.btnArrangeLauncher100.addEventListener('click', async () => {
    toast('Đang sắp xếp cửa sổ 100% (4 góc)...', 'info');
    const result = await api.arrangeLaunchers100();
    if (result.success) {
      toast('Đã sắp xếp 100% xong.', 'success');
    } else {
      toast(result.msg || 'Không thể sắp xếp.', 'error');
    }
  });
}

// ── Xóa Cache game (Flash + shader) ─────────────────────────────
dom.btnClearCache.addEventListener('click', async () => {
  const proceed = await asyncConfirm(
    'Xoá cache game (Flash + shader)?\nNên đóng game trước khi xoá, rồi đăng nhập lại.',
    { title: 'Xóa Cache', okText: 'Xoá cache', cancelText: 'Hủy' }
  );
  if (!proceed) return;

  dom.btnClearCache.disabled = true;
  try {
    const res = await api.clearCache();
    if (res?.success) {
      const n = res.data?.cleared?.length ?? 0;
      toast(n > 0 ? `Đã xoá cache game (${n} mục).` : 'Không có cache nào để xoá.', 'success');
    } else {
      toast(res?.error || 'Không xoá được cache.', 'error');
    }
  } finally {
    dom.btnClearCache.disabled = false;
  }
});

// ── Reg Acc Modal (Admin) ──────────────────────────────────────
let isRegAccRunning = false;
let stopRegAccRequested = false;
let currentRegAccTab = 'checked'; // 'checked' | 'quick'

function switchRegAccTab(tab) {
  currentRegAccTab = tab;
  if (tab === 'checked') {
    dom.tabRegChecked?.classList.add('text-white', 'bg-emerald-500/20', 'border-emerald-500/30');
    dom.tabRegChecked?.classList.remove('text-gray-400', 'hover:text-gray-200', 'border-transparent');
    dom.tabRegQuick?.classList.remove('text-white', 'bg-emerald-500/20', 'border-emerald-500/30');
    dom.tabRegQuick?.classList.add('text-gray-400', 'hover:text-gray-200', 'border-transparent');

    dom.viewRegChecked?.classList.remove('hidden');
    dom.viewRegChecked?.classList.add('flex');
    dom.viewRegQuick?.classList.add('hidden');
    dom.viewRegQuick?.classList.remove('flex');
    if (dom.btnStartRegAcc) dom.btnStartRegAcc.textContent = 'Tạo nhân vật';
  } else {
    dom.tabRegQuick?.classList.add('text-white', 'bg-emerald-500/20', 'border-emerald-500/30');
    dom.tabRegQuick?.classList.remove('text-gray-400', 'hover:text-gray-200', 'border-transparent');
    dom.tabRegChecked?.classList.remove('text-white', 'bg-emerald-500/20', 'border-emerald-500/30');
    dom.tabRegChecked?.classList.add('text-gray-400', 'hover:text-gray-200', 'border-transparent');

    dom.viewRegQuick?.classList.remove('hidden');
    dom.viewRegQuick?.classList.add('flex');
    dom.viewRegChecked?.classList.add('hidden');
    dom.viewRegChecked?.classList.remove('flex');
    if (dom.btnStartRegAcc) dom.btnStartRegAcc.textContent = 'Bắt đầu Reg';
  }
}

dom.tabRegChecked?.addEventListener('click', () => switchRegAccTab('checked'));
dom.tabRegQuick?.addEventListener('click', () => switchRegAccTab('quick'));

function updateRegCheckedCounts() {
  const count = accounts.filter((a) => a.isChecked).length;
  if (dom.regCheckedCount) dom.regCheckedCount.textContent = count;
  if (dom.regCheckedListCount) dom.regCheckedListCount.textContent = `${count} account`;
  return count;
}

dom.btnRegAcc?.addEventListener('click', () => {
  const checkedCount = updateRegCheckedCounts();
  populateServerDropdown();
  dom.regAccProgressContainer?.classList.add('hidden');
  dom.regAccProgressContainer?.classList.remove('flex');
  dom.btnStopRegAcc?.classList.add('hidden');
  dom.btnStartRegAcc?.classList.remove('hidden');
  dom.btnCancelRegAcc?.classList.remove('hidden');

  if (checkedCount > 0) {
    switchRegAccTab('checked');
  } else {
    switchRegAccTab('quick');
  }

  dom.modalRegAcc?.classList.remove('hidden');
  refreshIcons();
});

dom.btnCloseRegAcc?.addEventListener('click', () => {
  if (isRegAccRunning) stopRegAccRequested = true;
  dom.modalRegAcc?.classList.add('hidden');
});

dom.btnCancelRegAcc?.addEventListener('click', () => {
  if (isRegAccRunning) stopRegAccRequested = true;
  dom.modalRegAcc?.classList.add('hidden');
});

dom.btnStopRegAcc?.addEventListener('click', () => {
  stopRegAccRequested = true;
  if (dom.regAccProgressLog) {
    dom.regAccProgressLog.textContent = 'Đang dừng... vui lòng chờ lượt hiện tại kết thúc.';
  }
});

dom.btnStartRegAcc?.addEventListener('click', async () => {
  if (isRegAccRunning) return;

  if (currentRegAccTab === 'checked') {
    const checkedAccounts = accounts.filter((a) => a.isChecked);
    if (checkedAccounts.length === 0) {
      return toast('Vui lòng tick chọn ít nhất 1 account trên bảng.', 'warning');
    }

    isRegAccRunning = true;
    stopRegAccRequested = false;

    dom.btnStartRegAcc?.classList.add('hidden');
    dom.btnCancelRegAcc?.classList.add('hidden');
    dom.btnStopRegAcc?.classList.remove('hidden');
    dom.regAccProgressContainer?.classList.remove('hidden');
    dom.regAccProgressContainer?.classList.add('flex');

    const total = checkedAccounts.length;
    let okCount = 0;
    let failCount = 0;
    const selectedOverrideServer = dom.selectCheckedServer?.value;

    for (let i = 0; i < total; i++) {
      if (stopRegAccRequested) {
        toast('Đã dừng tạo nhân vật theo yêu cầu.', 'info');
        break;
      }

      const acc = checkedAccounts[i];
      const targetServer = selectedOverrideServer
        ? parseInt(selectedOverrideServer, 10)
        : (acc.server || (serverList[0]?.serverId ?? 2));
      const percent = Math.round(((i) / total) * 100);
      if (dom.regAccProgressTitle) dom.regAccProgressTitle.textContent = `Tiến trình: ${i + 1}/${total}`;
      if (dom.regAccProgressPercent) dom.regAccProgressPercent.textContent = `${percent}%`;
      if (dom.regAccProgressBar) dom.regAccProgressBar.style.width = `${percent}%`;
      if (dom.regAccProgressLog) dom.regAccProgressLog.textContent = `[${i + 1}/${total}] ${acc.username} -> Đang tạo NV server ${targetServer}...`;

      try {
        const charRes = await api.registerCharacter(acc.username, acc.password, targetServer, config.regPrefix, 14);
        if (charRes.success) {
          okCount++;
          if (charRes.alreadyExists) {
            if (dom.regAccProgressLog) dom.regAccProgressLog.textContent = `[${i + 1}/${total}] ${acc.username} -> Đã có NV (Server ${targetServer})`;
          } else {
            if (dom.regAccProgressLog) dom.regAccProgressLog.textContent = `[${i + 1}/${total}] ${acc.username} -> NV: ${charRes.nick || 'OK'} (Server ${targetServer})`;
          }
        } else {
          failCount++;
          if (dom.regAccProgressLog) dom.regAccProgressLog.textContent = `[${i + 1}/${total}] ${acc.username} -> ${charRes.msg || 'Thất bại'}`;
        }
      } catch (err) {
        failCount++;
        if (dom.regAccProgressLog) dom.regAccProgressLog.textContent = `[${i + 1}/${total}] ${acc.username} -> Lỗi: ${err.message}`;
      }

      if (i < total - 1) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    if (dom.regAccProgressBar) dom.regAccProgressBar.style.width = '100%';
    if (dom.regAccProgressPercent) dom.regAccProgressPercent.textContent = '100%';
    if (dom.regAccProgressTitle) dom.regAccProgressTitle.textContent = `Hoàn tất: ${okCount} thành công, ${failCount} thất bại`;
    toast(`Đã xử lý xong: ${okCount} thành công, ${failCount} thất bại`, okCount > 0 ? 'success' : 'error');

    isRegAccRunning = false;
    dom.btnStopRegAcc?.classList.add('hidden');
    dom.btnCancelRegAcc?.classList.remove('hidden');
    dom.btnStartRegAcc?.classList.remove('hidden');

    accounts.forEach((a) => (a.isChecked = false));
    renderAccounts();
    return;
  }

  // TAB 2: Tạo mới hàng loạt
  const prefix = dom.inputQuickPrefix?.value.trim() || 's2myt';
  const count = parseInt(dom.inputQuickCount?.value, 10) || 10;
  const start = parseInt(dom.inputQuickStart?.value, 10) || 1;
  const pad = parseInt(dom.inputQuickPad?.value, 10) || 4;
  const commonPassword = dom.inputQuickPassword?.value.trim();
  const server = dom.selectQuickServer?.value || (serverList[0]?.serverId ?? '2');
  const shouldCreateChar = dom.quickCreateChar?.checked !== false;
  const shouldSaveTool = dom.quickSaveTool?.checked !== false;

  if (count <= 0 || count > 100) {
    return toast('Số lượng tài khoản cần từ 1 đến 100.', 'error');
  }

  isRegAccRunning = true;
  stopRegAccRequested = false;

  dom.btnStartRegAcc?.classList.add('hidden');
  dom.btnCancelRegAcc?.classList.add('hidden');
  dom.btnStopRegAcc?.classList.remove('hidden');
  dom.regAccProgressContainer?.classList.remove('hidden');
  dom.regAccProgressContainer?.classList.add('flex');

  const generatedList = [];
  for (let i = 0; i < count; i++) {
    const num = String(start + i).padStart(pad, '0');
    const username = `${prefix}${num}`;
    const password = commonPassword || (Math.random().toString(36).slice(2, 10) + 'A1');
    generatedList.push({
      keyId: currentKeyId,
      username,
      password,
      server: parseInt(server, 10),
      accountType: 2,
      note: 'Auto Clone',
    });
  }

  if (shouldSaveTool) {
    if (dom.regAccProgressLog) dom.regAccProgressLog.textContent = `Đang lưu ${generatedList.length} tài khoản vào Tool...`;
    await api.createAccountsBatch(generatedList);
    await loadAccounts();
  }

  let okCount = 0;
  let failCount = 0;
  for (let i = 0; i < generatedList.length; i++) {
    if (stopRegAccRequested) {
      toast('Đã dừng đăng ký theo yêu cầu.', 'info');
      break;
    }

    const acc = generatedList[i];
    const percent = Math.round(((i) / count) * 100);
    if (dom.regAccProgressTitle) dom.regAccProgressTitle.textContent = `Tiến trình: ${i + 1}/${count}`;
    if (dom.regAccProgressPercent) dom.regAccProgressPercent.textContent = `${percent}%`;
    if (dom.regAccProgressBar) dom.regAccProgressBar.style.width = `${percent}%`;
    if (dom.regAccProgressLog) dom.regAccProgressLog.textContent = `[${i + 1}/${count}] Đang reg ${acc.username}...`;

    try {
      const regRes = await api.registerAccount(acc.username, acc.password);
      if (regRes.success) {
        okCount++;
        if (dom.regAccProgressLog) dom.regAccProgressLog.textContent = `[${i + 1}/${count}] ${acc.username} -> Đăng ký OK!`;

        if (shouldCreateChar) {
          if (dom.regAccProgressLog) dom.regAccProgressLog.textContent = `[${i + 1}/${count}] ${acc.username} -> Đang tạo NV server ${server}...`;
          const charRes = await api.registerCharacter(acc.username, acc.password, server, config.regPrefix, 14);
          if (charRes.success) {
            if (dom.regAccProgressLog) dom.regAccProgressLog.textContent = `[${i + 1}/${count}] ${acc.username} -> NV: ${charRes.nick || 'OK'}`;
          }
        }
      } else {
        failCount++;
        if (dom.regAccProgressLog) dom.regAccProgressLog.textContent = `[${i + 1}/${count}] ${acc.username} -> ${regRes.msg || 'Thất bại'}`;
      }
    } catch (err) {
      failCount++;
      if (dom.regAccProgressLog) dom.regAccProgressLog.textContent = `[${i + 1}/${count}] ${acc.username} -> Lỗi: ${err.message}`;
    }

    if (i < generatedList.length - 1) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  if (dom.regAccProgressBar) dom.regAccProgressBar.style.width = '100%';
  if (dom.regAccProgressPercent) dom.regAccProgressPercent.textContent = '100%';
  if (dom.regAccProgressTitle) dom.regAccProgressTitle.textContent = `Hoàn tất: ${okCount} thành công, ${failCount} thất bại`;
  toast(`Đã tạo xong ${count} acc: ${okCount} OK, ${failCount} thất bại`, 'success');

  isRegAccRunning = false;
  dom.btnStopRegAcc?.classList.add('hidden');
  dom.btnCancelRegAcc?.classList.remove('hidden');
  dom.btnStartRegAcc?.classList.remove('hidden');

  await loadAccounts();
});

// ── Config Modal ───────────────────────────────────────────────
dom.btnConfig.addEventListener('click', () => {
  dom.inputRegPrefix.value = config.regPrefix;
  if (dom.inputRegCheckEnable) dom.inputRegCheckEnable.checked = config.regCheckEnable !== false;
  dom.modalConfig.classList.remove('hidden');
});

dom.btnCloseConfig.addEventListener('click', () => {
  dom.modalConfig.classList.add('hidden');
});

dom.btnSaveConfig.addEventListener('click', () => {
  config.regPrefix = dom.inputRegPrefix.value.trim() || 'GNLM';
  if (dom.inputRegCheckEnable) config.regCheckEnable = dom.inputRegCheckEnable.checked;
  localStorage.setItem('tt_config', JSON.stringify(config));
  dom.modalConfig.classList.add('hidden');
  toast('Đã lưu cấu hình.', 'success');
});

// ── Log Window ──────────────────────────────────────────────────
dom.btnLog.addEventListener('click', async () => {
  await api.openLogWindow();
});

// ── Placeholder buttons ────────────────────────────────────────

const placeholderIds = [
  'btn-flash-login', 'btn-sort', 'btn-kill-all',

  'btn-clipboard', 
  'btn-import-json', 'btn-export-json', 'btn-export-txt'
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

// Listen for show-dialog requests from Main
api.onShowDialog(async (data) => {
  const { title, message, type, responseChannel } = data;
  await asyncAlert(message, { title, type });
  if (responseChannel && api.sendDialogResponse) {
    api.sendDialogResponse(responseChannel);
  }
});

// btn-script-auto
dom.btnScriptAuto.addEventListener('click', async () => {
  toast('Đang chạy script auto...', 'info');
  await api.openBatFile();
});

// btn-setup-first-run
dom.btnSetupFirstRun.addEventListener('click', async () => {
  toast('Đang mở Setup Auto (quyền Admin)...', 'info');
  const res = await api.setupFirstRun();
  if (!res.success) {
    toast(`Lỗi: ${res.error}`, 'error');
  } else {
    toast('Đã mở Clickermann bằng quyền Admin.', 'success');
  }
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
      if (!isAutoRunning && !isWeeklyAutoRunning && !isResetMarkRunning && !isVipRewardRunning) {
        dom.autoProgressContainer.classList.add('hidden');
      }
    }, 5000);
  }
});

let isWeeklyAutoRunning = false;

dom.btnCodeTuan.addEventListener('click', async () => {
  if (isWeeklyAutoRunning) {
    const res = await api.stopGetWeeklyCode();
    if (res.success) toast('Đã gửi yêu cầu dừng code tuần...', 'info');
    return;
  }

  toast('Đang mở file txt, vui lòng điền code -> lưu lại -> ĐÓNG file txt...', 'info');
  const txtRes = await api.openWeeklyCodeTxt();
  if (!txtRes.success) {
    return toast('Không mở được file txt.', 'error');
  }

  const { codes } = txtRes;
  if (!codes || codes.length === 0) {
    return toast('Danh sách code trống, đã hủy!', 'error');
  }

  isWeeklyAutoRunning = true;
  dom.btnCodeTuan.classList.add('bg-red-500', 'hover:bg-red-400');
  dom.btnCodeTuan.classList.remove('bg-surface');
  dom.btnCodeTuan.innerHTML = '<i data-lucide="square" class="w-3.5 h-3.5"></i> Dừng Code tuần';
  refreshIcons();

  dom.autoProgressContainer.classList.remove('hidden');
  dom.autoProgressMsg.textContent = `Đang bắt đầu... (Có ${codes.length} mã code)`;
  dom.autoProgressBar.style.width = '0%';

  try {
    await api.getWeeklyCode(currentKeyId, codes);
  } catch (err) {
    toast('Lỗi khi chạy code tuần.', 'error');
  } finally {
    isWeeklyAutoRunning = false;
    dom.btnCodeTuan.classList.remove('bg-red-500', 'hover:bg-red-400');
    dom.btnCodeTuan.classList.add('bg-surface');
    dom.btnCodeTuan.innerHTML = '<i data-lucide="calendar" class="w-3.5 h-3.5"></i> Code tuần';
    refreshIcons();
    toast('Tiến trình Code tuần đã kết thúc.', 'info');
    setTimeout(() => {
      if (!isAutoRunning && !isWeeklyAutoRunning && !isResetMarkRunning && !isVipRewardRunning) {
        dom.autoProgressContainer.classList.add('hidden');
      }
    }, 5000);
  }
});

// ── Reset Ấn ────────────────────────────────────────────────────
let isResetMarkRunning = false;

dom.btnResetAn.addEventListener('click', async () => {
  if (isResetMarkRunning) {
    const res = await api.stopResetMark();
    if (res.success) toast('Đã gửi yêu cầu dừng reset ấn...', 'info');
    return;
  }

  const checkedAccounts = accounts.filter(acc => acc.isChecked);
  if (checkedAccounts.length === 0) {
    return toast('Vui lòng chọn ít nhất 1 tài khoản để reset ấn.', 'warning');
  }

  isResetMarkRunning = true;
  dom.btnResetAn.classList.add('bg-red-500', 'hover:bg-red-400');
  dom.btnResetAn.classList.remove('bg-surface');
  dom.btnResetAn.innerHTML = '<i data-lucide="square" class="w-3.5 h-3.5"></i> Dừng reset ấn';
  refreshIcons();

  dom.autoProgressContainer.classList.remove('hidden');
  dom.autoProgressMsg.textContent = 'Đang bắt đầu reset ấn...';
  dom.autoProgressBar.style.width = '0%';
  dom.autoProgressAcc.textContent = `Acc: 0/${checkedAccounts.length}`;
  dom.autoProgressCode.textContent = 'Ấn: --';

  try {
    const res = await api.resetMark(checkedAccounts);
    if (!res.success) {
        toast(`Lỗi: ${res.error}`, 'error');
    }
  } catch (err) {
    toast('Lỗi khi chạy reset ấn.', 'error');
  } finally {
    isResetMarkRunning = false;
    dom.btnResetAn.classList.remove('bg-red-500', 'hover:bg-red-400');
    dom.btnResetAn.classList.add('bg-surface');
    dom.btnResetAn.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Reset ấn V15';
    refreshIcons();
    toast('Tiến trình reset ấn đã kết thúc.', 'info');
    setTimeout(() => {
      if (!isAutoRunning && !isWeeklyAutoRunning && !isResetMarkRunning && !isVipRewardRunning) {
        dom.autoProgressContainer.classList.add('hidden');
      }
    }, 5000);
  }
});

// ── Quà V10 Tuần ────────────────────────────────────────────────
let isVipRewardRunning = false;

dom.btnVipRewardWeek.addEventListener('click', async () => {
  if (isVipRewardRunning) {
    const res = await api.stopVipRewardWeek();
    if (res.success) toast('Đã gửi yêu cầu dừng nhận quà V10 tuần...', 'info');
    return;
  }

  const checkedAccounts = accounts.filter(acc => acc.isChecked);
  if (checkedAccounts.length === 0) {
    return toast('Vui lòng chọn ít nhất 1 tài khoản để nhận quà V10 tuần.', 'warning');
  }

  isVipRewardRunning = true;
  dom.btnVipRewardWeek.classList.add('bg-red-500', 'hover:bg-red-400');
  dom.btnVipRewardWeek.classList.remove('bg-surface');
  dom.btnVipRewardWeek.innerHTML = '<i data-lucide="square" class="w-3.5 h-3.5"></i> Dừng nhận V10';
  refreshIcons();

  dom.autoProgressContainer.classList.remove('hidden');
  dom.autoProgressMsg.textContent = 'Đang bắt đầu nhận quà V10 tuần...';
  dom.autoProgressBar.style.width = '0%';
  dom.autoProgressAcc.textContent = `Acc: 0/${checkedAccounts.length}`;
  dom.autoProgressCode.textContent = 'V10: --';

  try {
    const res = await api.claimVipRewardWeek(checkedAccounts);
    if (!res.success) {
      toast(`Lỗi: ${res.error}`, 'error');
    }
  } catch (err) {
    toast('Lỗi khi chạy nhận quà V10 tuần.', 'error');
  } finally {
    isVipRewardRunning = false;
    dom.btnVipRewardWeek.classList.remove('bg-red-500', 'hover:bg-red-400');
    dom.btnVipRewardWeek.classList.add('bg-surface');
    dom.btnVipRewardWeek.innerHTML = '<i data-lucide="crown" class="w-3.5 h-3.5 text-yellow-400"></i> Nhận quà V10 tuần';
    refreshIcons();
    toast('Tiến trình nhận quà V10 tuần đã kết thúc.', 'info');
    setTimeout(() => {
      if (!isAutoRunning && !isWeeklyAutoRunning && !isResetMarkRunning && !isVipRewardRunning) {
        dom.autoProgressContainer.classList.add('hidden');
      }
    }, 5000);
  }
});

dom.btnOpenWebshop.addEventListener('click', async () => {
  const data = getFormData();

  if (!data.username || !data.password) {
    return toast('Chọn tài khoản trước.', 'error');
  }

  toast('Đang mở webshop...', 'info');

  const login = await api.getTokenApi(data.username, data.password);

  if (!login.token) {
    return toast('Login thất bại.', 'error');
  }

  await api.openWebshop(login.token);

  toast('Đã mở webshop.', 'success');
});

// ── Helpers ────────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Auto Update ────────────────────────────────────────────────
if (api.onUpdateAvailable) {
  const modalUpdate = document.getElementById('modal-update');
  const updateSpeed = document.getElementById('update-speed');
  const updateEst = document.getElementById('update-est');
  const updateProgressBar = document.getElementById('update-progress-bar');
  const updateTransferred = document.getElementById('update-transferred');
  const updatePercent = document.getElementById('update-percent');
  const btnInstallUpdate = document.getElementById('btn-install-update');

  api.onUpdateAvailable((info) => {
    if (modalUpdate) {
      modalUpdate.classList.remove('hidden');
    }
    toast('Đang tải bản cập nhật mới...', 'info');
  });

  api.onUpdateProgress((progressObj) => {
    if (!modalUpdate) return;
    
    const speedMB = (progressObj.bytesPerSecond / (1024 * 1024)).toFixed(2);
    const transferredMB = (progressObj.transferred / (1024 * 1024)).toFixed(2);
    const totalMB = (progressObj.total / (1024 * 1024)).toFixed(2);
    const percent = Math.floor(progressObj.percent);

    const remainingBytes = progressObj.total - progressObj.transferred;
    let estTimeStr = 'Đang tính...';
    if (progressObj.bytesPerSecond > 0) {
      const estSeconds = Math.floor(remainingBytes / progressObj.bytesPerSecond);
      if (estSeconds < 60) {
        estTimeStr = `${estSeconds}s`;
      } else {
        estTimeStr = `${Math.floor(estSeconds / 60)}m ${estSeconds % 60}s`;
      }
    }

    updateSpeed.textContent = `Tốc độ: ${speedMB} MB/s`;
    updateEst.textContent = `Ước tính: ${estTimeStr}`;
    updateProgressBar.style.width = `${percent}%`;
    updateTransferred.textContent = `${transferredMB} / ${totalMB} MB`;
    updatePercent.textContent = `${percent}%`;
  });

  api.onUpdateDownloaded((info) => {
    if (!modalUpdate) return;
    
    updateSpeed.textContent = 'Hoàn tất tải xuống';
    updateEst.textContent = '';
    updateProgressBar.style.width = '100%';
    updateProgressBar.classList.replace('bg-brand-400', 'bg-green-500');
    updatePercent.textContent = '100%';
    
    if (btnInstallUpdate) {
      btnInstallUpdate.classList.remove('hidden');
    }
    toast('Đã tải xong bản cập nhật, sẵn sàng cài đặt.', 'success');
  });

  if (btnInstallUpdate) {
    btnInstallUpdate.addEventListener('click', () => {
      api.installUpdate();
    });
  }
}
