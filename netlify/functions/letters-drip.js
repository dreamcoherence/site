// Drip: hourly. Reads drip_night, drip_start, drip_tz from Beehiiv custom fields.
const { sendNight } = require('./_mail.js');
const BATCH_CAP = 40;

function isTimeToSend(tz, emailIndex) {
  try {
    const now = new Date();
    const localHour = parseInt(new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', hour12: false
    }).format(now), 10);
    if (emailIndex <= 7) return localHour === 15;
    return localHour === 10;
  } catch { return true; }
}

function daysSince(startTime) {
  return Math.floor((Date.now() - startTime) / (24 * 60 * 60 * 1000));
}

exports.handler = async () => {
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;
  const apiKey = process.env.BEEHIIV_API_KEY;
  if (!pubId || !apiKey) { console.log('[drip] missing credentials'); return { statusCode: 200, body: '{}' }; }

  let sentCount = 0;
  let scanned = 0;
  let cursor = null;

  try {
    for (let iter = 0; iter < 10 && sentCount < BATCH_CAP; iter++) {
      const url = new URL(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`);
      url.searchParams.set('status', 'active');
      url.searchParams.set('limit', '100');
      url.searchParams.set('expand', 'custom_fields');
      if (cursor) url.searchParams.set('cursor', cursor);

      const res = await fetch(url.toString(), { headers: { 'Authorization': `Bearer ${apiKey}` } });
      const data = await res.json();
      const subs = data?.data || [];
      console.log(`[drip] page ${iter+1}: ${subs.length} subs`);
      if (subs.length === 0) break;
      scanned += subs.length;

      for (const sub of subs) {
        if (sentCount >= BATCH_CAP) break;
        const fields = sub.custom_fields || [];
        const nightField = fields.find(f => f.name === 'drip_night');
        const startField = fields.find(f => f.name === 'drip_start');
        const tzField    = fields.find(f => f.name === 'drip_tz');
        if (!nightField || !startField) continue;

        const lastSent = parseInt(String(nightField.value ?? ''), 10);
        const startTime = parseInt(String(startField.value ?? ''), 10);
        if (isNaN(lastSent) || isNaN(startTime) || lastSent >= 8) continue;

        const next = lastSent + 1;
        if (daysSince(startTime) < next) continue;

        const tz = (tzField && tzField.value) ? tzField.value : 'America/New_York';
        if (!isTimeToSend(tz, next)) continue;

        console.log(`[drip] sending email ${next} to ${sub.email} (tz: ${tz})`);
        const sent = await sendNight(sub.email, next);
        if (sent.ok) {
          const patchRes = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions/${sub.id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ custom_fields: [{ name: 'drip_night', value: String(next) }] }),
          });
          console.log(`[drip] patch status: ${patchRes.status}`);
          sentCount++;
        } else {
          console.log(`[drip] send failed:`, sent.error);
        }
      }

      cursor = data?.pagination?.next_cursor || null;
      if (!cursor) break;
    }
  } catch (e) {
    console.log('[drip] error:', e.message);
  }

  console.log(`[drip] scanned ${scanned}, sent ${sentCount}`);
  return { statusCode: 200, body: JSON.stringify({ scanned, sent: sentCount }) };
};
