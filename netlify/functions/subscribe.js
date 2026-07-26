const { sendNight } = require('./_mail.js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  let email, tz;
  try { ({ email, tz } = JSON.parse(event.body || '{}')); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) }; }
  const valid = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  if (!valid) return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email' }) };
  email = email.trim().toLowerCase();
  tz = (typeof tz === 'string' && tz.length > 1) ? tz : 'America/New_York';
  console.log('[subscribe] email:', email, 'tz:', tz);

  const pubId = process.env.BEEHIIV_PUBLICATION_ID;
  const apiKey = process.env.BEEHIIV_API_KEY;

  let subId = null;
  let alreadyExists = false;
  try {
    const bRes = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, reactivate_existing: false, send_welcome_email: false, utm_source: 'dreamcoherence.com', utm_medium: 'website' }),
    });
    const bData = await bRes.json();
    console.log('[subscribe] beehiiv status:', bRes.status);
    subId = bData?.data?.id;
    if (bRes.status === 409 || !subId) {
      const lookup = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions?email=${encodeURIComponent(email)}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      const lData = await lookup.json();
      subId = lData?.data?.[0]?.id;
      const tags = lData?.data?.[0]?.tags || [];
      if (tags.some(t => t.startsWith('night-'))) {
        console.log('[subscribe] already in drip');
        alreadyExists = true;
      }
    }
  } catch (e) { console.log('[subscribe] beehiiv error:', e.message); }

  if (alreadyExists) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, status: 'exists' }) };
  }

  // Send orientation (email index 0) immediately
  let emailSent = false;
  try {
    const sent = await sendNight(email, 0);
    console.log('[subscribe] orientation result:', JSON.stringify(sent));
    emailSent = sent.ok;
  } catch (e) {
    console.log('[subscribe] send error:', e.message);
  }

  // Tag with drip state + timezone
  if (subId) {
    try {
      await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions/${subId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: ['night-0', `drip-start-${Date.now()}`, `tz-${tz}`] }),
      });
      console.log('[subscribe] tagged: night-0, tz-' + tz);
    } catch (e) { console.log('[subscribe] tag error:', e.message); }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, sent: emailSent }) };
};
