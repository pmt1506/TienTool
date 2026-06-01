import nodemailer from 'nodemailer';

let transporterPromise = null;

function getMailConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('Chua cau hinh SMTP_HOST, SMTP_USER, SMTP_PASS.');
  }

  return {
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: { user, pass },
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    fromName: process.env.SMTP_FROM_NAME || 'TienTool',
  };
}

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = Promise.resolve().then(() => {
      const config = getMailConfig();
      return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.auth,
      });
    });
  }

  return transporterPromise;
}

function formatDateTime(value) {
  if (!value) return 'Khong xac dinh';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}

export async function sendLicenseEmail({ to, key, expiredAt, mode = 'register' }) {
  const transporter = await getTransporter();
  const { from, fromName } = getMailConfig();

  const subjectMap = {
    register: 'TienTool - Key kich hoat moi',
    resend: 'TienTool - Gui lai license key',
    renew: 'TienTool - Gia han license key',
  };

  const titleMap = {
    register: 'Key cua ban da duoc kich hoat',
    resend: 'Gui lai thong tin key',
    renew: 'Key cua ban da duoc gia han',
  };

  const subject = subjectMap[mode] || subjectMap.register;
  const title = titleMap[mode] || titleMap.register;
  const expiredAtText = formatDateTime(expiredAt);

  await transporter.sendMail({
    from: `"${fromName}" <${from}>`,
    to,
    subject,
    text: `${title}\nKey: ${key}\nHan su dung: ${expiredAtText}\nBan co the dang nhap TienTool va key se duoc luu tren may sau lan dau tien.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2 style="margin-bottom:12px">${title}</h2>
        <p>Thong tin license cua ban:</p>
        <div style="padding:12px 16px;border:1px solid #d1d5db;border-radius:8px;background:#f9fafb">
          <div><strong>Key:</strong> <code style="font-size:15px">${key}</code></div>
          <div><strong>Han su dung:</strong> ${expiredAtText}</div>
        </div>
        <p style="margin-top:16px">Sau khi dang nhap thanh cong, ung dung se tu luu key tren may de cac lan sau va sau khi update khong can nhap lai.</p>
      </div>
    `,
  });
}
