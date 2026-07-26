// Inquire function: receives interest signals from Threshold + Retreat + Immersions buttons.
// Sends an email to desk@ via Resend. No mailto dependency — works for every visitor.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  let email, topic, tz;
  try { ({ email, topic, tz } = JSON.parse(event.body || '{}')); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) }; }
  const valid = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  if (!valid) return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email' }) };
  email = email.trim().toLowerCase();
  topic = (topic === 'threshold' || topic === 'retreat' || topic === 'immersion') ? topic : 'inquiry';
  tz = (typeof tz === 'string' && tz.length > 1) ? tz : '';
  console.log('[inquire]', email, topic);

  const topicMap = {
    threshold: { subject: 'Threshold inquiry', label: 'THRESHOLD' },
    retreat:   { subject: 'Dream Coherence Retreat inquiry', label: 'DARK ROOM RETREAT' },
    immersion: { subject: 'Immersion inquiry', label: 'IMMERSION' },
    inquiry:   { subject: 'Dream Coherence inquiry', label: 'INQUIRY' },
  };
  const t = topicMap[topic];

  // Compose the email to desk@
  const html = `<div style="font-family:Georgia,serif;max-width:520px;margin:20px auto;color:#22252e;">
<p style="font-size:11px;letter-spacing:0.2em;color:#a8843c;">${t.label}</p>
<p style="font-size:16px;margin:16px 0;"><strong>${email}</strong> has expressed interest.</p>
${tz ? `<p style="font-size:13px;color:#888;">Timezone: ${tz}</p>` : ''}
<p style="font-size:13px;color:#888;">Reply directly to this email to open the conversation.</p>
</div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'Dream Coherence <night@dreamcoherence.com>',
        to: ['desk@dreamcoherence.com'],
        reply_to: email,
        subject: t.subject,
        html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.log('[inquire] resend error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Send failed' }) };
    }
  } catch (e) {
    console.log('[inquire] error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Send failed' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
