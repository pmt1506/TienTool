const nodemailer = require('nodemailer');

let transporter = null;

function getMailConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('Missing SMTP_HOST, SMTP_USER or SMTP_PASS.');
  }

  return {
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: { user, pass },
    from: process.env.SMTP_FROM || user,
    fromName: process.env.SMTP_FROM_NAME || 'TienTool',
  };
}

function getTransporter() {
  if (!transporter) {
    const config = getMailConfig();
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });
  }

  return transporter;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}

async function sendLicenseEmail({ to, key, expiredAt, mode = 'register' }) {
  const transport = getTransporter();
  const { from, fromName } = getMailConfig();
  const subjectMap = {
    register: 'TienTool - Key kich hoat moi',
    renew: 'TienTool - Gia han license key',
  };
  const titleMap = {
    register: 'Key cua ban da duoc kich hoat',
    renew: 'Key cua ban da duoc gia han',
  };

  await transport.sendMail({
    from: `"${fromName}" <${from}>`,
    to,
    subject: subjectMap[mode] || subjectMap.register,
    text: `${titleMap[mode] || titleMap.register}\nKey: ${key}\nHan su dung: ${formatDateTime(expiredAt)}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2>${titleMap[mode] || titleMap.register}</h2>
        <p><strong>Key:</strong> <code>${key}</code></p>
        <p><strong>Han su dung:</strong> ${formatDateTime(expiredAt)}</p>
      </div>
    `,
  });
}

module.exports = { sendLicenseEmail };
