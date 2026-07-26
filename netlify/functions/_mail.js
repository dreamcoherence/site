const crypto = require('crypto');
const { NIGHTS } = require('./letters-content.js');

const token = (email) =>
  crypto.createHash('sha256').update(email.toLowerCase().trim() + (process.env.UNSUB_SECRET || '')).digest('hex').slice(0, 24);

const unsubUrl = (email) =>
  `https://dreamcoherence.com/.netlify/functions/unsubscribe?e=${encodeURIComponent(email)}&t=${token(email)}`;

async function sendNight(email, n) {
  const night = NIGHTS[n];
  if (!night) return { ok: false, error: 'no such night' };
  const html = night.html.replaceAll('{{UNSUB_URL}}', unsubUrl(email));
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'Dream Coherence <night@dreamcoherence.com>',
      to: [email],
      subject: night.subject,
      html,
      headers: { 'List-Unsubscribe': `<${unsubUrl(email)}>` },
    }),
  });
  if (!res.ok) return { ok: false, error: await res.text() };
  return { ok: true };
}

module.exports = { token, unsubUrl, sendNight };
