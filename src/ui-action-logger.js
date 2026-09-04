// ═══════════════════════════════════════════════════════════════
// Ghi lại thao tác trên giao diện vào cửa sổ "Application Logs"
// ═══════════════════════════════════════════════════════════════
// Bắt sự kiện ở pha capture trên document nên không cần đụng vào từng handler
// sẵn có: nút nào thêm sau này cũng tự được ghi.

const MAX_LABEL = 60;

// Ô nhập bí mật: không bao giờ ghi giá trị, kể cả tên nhãn của chúng.
const SECRET_IDS = new Set(['input-key', 'form-password', 'input-password']);

function clean(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length > MAX_LABEL ? `${t.slice(0, MAX_LABEL)}…` : t;
}

// Tên gọi dễ đọc của phần tử: ưu tiên nhãn người dùng nhìn thấy, cuối cùng
// mới rơi về id kỹ thuật.
function labelOf(el) {
  if (el.dataset.log) return clean(el.dataset.log);

  // Checkbox trong bảng tài khoản: lấy username ở cột thứ hai của dòng.
  if (el.classList.contains('acc-chk')) {
    const username = el.closest('tr')?.querySelector('td:nth-child(2)')?.textContent;
    if (username) return `tài khoản ${clean(username)}`;
  }

  return (
    clean(el.textContent) ||
    clean(el.getAttribute('aria-label')) ||
    clean(el.getAttribute('title')) ||
    el.id ||
    el.tagName.toLowerCase()
  );
}

export function initActionLogger(api) {
  if (!api?.logAction) return;

  document.addEventListener(
    'click',
    (event) => {
      const el = event.target.closest('button, a[href], [role="tab"], [data-log]');
      if (!el || el.hasAttribute('data-no-log')) return;
      api.logAction(`Bấm: ${labelOf(el)}`);
    },
    true
  );

  document.addEventListener(
    'change',
    (event) => {
      const el = event.target;
      if (el.hasAttribute('data-no-log') || SECRET_IDS.has(el.id)) return;

      if (el.tagName === 'SELECT') {
        const shown = el.options[el.selectedIndex]?.text ?? el.value;
        api.logAction(`Chọn ${el.id || labelOf(el)}: ${clean(shown)}`);
      } else if (el.type === 'checkbox') {
        api.logAction(`${el.checked ? 'Tích' : 'Bỏ tích'}: ${labelOf(el)}`);
      }
    },
    true
  );
}
