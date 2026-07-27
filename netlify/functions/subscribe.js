// Subscribe: add to Beehiiv, send orientation, store drip state in custom fields
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
  const now = Date.now();

  let subId = null;
  let alreadyInDrip = false;
  try {
    const createRes = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        reactivate_existing: false,
        send_welcome_email: false,
        utm_source: 'dreamcoherence.com',
        utm_medium: 'website',
        custom_fields: [
          { name: 'drip_night', value: '0' },
          { name: 'drip_start', value: String(now) },
          { name: 'drip_tz', value: tz },
        ],
      }),
    });
    const createBody = await createRes.text();
    console.log('[subscribe] create status:', createRes.status, 'body:', createBody.slice(0, 200));
    let createData = {};
    try { createData = JSON.parse(createBody); } catch {}
    subId = createData?.data?.id;

    if (!subId) {
      // Look up existing subscriber
      const lookupUrl = `https://api.beehiiv.com/v2/publications/${pubId}/subscriptions/by_email/${encodeURIComponent(email)}?expand=custom_fields`;
      const lookup = await fetch(lookupUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      const lookupData = await lookup.json();
      subId = lookupData?.data?.id;
      console.log('[subscribe] lookup found id:', subId);
      const fields = lookupData?.data?.custom_fields || [];
      const nightField = fields.find(f => f.name === 'drip_night');
      if (nightField && nightField.value && String(nightField.value) !== '0') {
        console.log('[subscribe] already in drip at night', nightField.value);
        alreadyInDrip = true;
      }
    }
  } catch (e) { console.log('[subscribe] beehiiv error:', e.message); }

  if (alreadyInDrip) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, status: 'exists' }) };
  }

  // For existing subs, ensure drip fields are set via PATCH
  if (subId) {
    try {
      const patchRes = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions/${subId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_fields: [
            { name: 'drip_night', value: '0' },
            { name: 'drip_start', value: String(now) },
            { name: 'drip_tz', value: tz },
          ],
        }),
      });
      console.log('[subscribe] PATCH status:', patchRes.status);
    } catch (e) { console.log('[subscribe] PATCH error:', e.message); }
  }

  // Send orientation
  let emailSent = false;
  try {
    const sent = await sendNight(email, 0);
    console.log('[subscribe] orientation result:', JSON.stringify(sent));
    emailSent = sent.ok;
  } catch (e) {
    console.log('[subscribe] send error:', e.message);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, sent: emailSent }) };
};
