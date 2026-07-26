const { sendNight } = require('./_mail.js');
const BATCH_CAP = 40;

function isTimeToSend(tz, nightIndex) {
  try {
    const now = new Date();
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const hour = localTime.getHours();
    const minute = localTime.getMinutes();

    if (nightIndex <= 7) {
      // Nights 1-7: send at 3:33pm local (15:33), allow window 15:00-15:59
      return hour === 15;
    } else {
      // Night 8 (post): send at 10:10am local, allow window 10:00-10:59
      return hour === 10;
    }
  } catch {
    // Invalid timezone: fall back to always-send (the hourly run acts as the gate)
    return true;
  }
}

function getDaysSinceStart(startTime) {
  return Math.floor((Date.now() - startTime) / (24 * 60 * 60 * 1000));
}

exports.handler = async () => {
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;
  const apiKey = process.env.BEEHIIV_API_KEY;
  if (!pubId || !apiKey) return { statusCode: 200, body: '{}' };

  let sentCount = 0;
  let page = 1;

  try {
    while (sentCount < BATCH_CAP && page <= 10) {
      const res = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions?status=active&limit=100&page=${page}&expand=tags`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      const data = await res.json();
      const subs = data?.data || [];
      if (subs.length === 0) break;

      for (const sub of subs) {
        if (sentCount >= BATCH_CAP) break;
        const tags = sub.tags || [];

        const nightTag = tags.filter(t => t.match(/^night-\d$/)).sort().pop();
        if (!nightTag) continue;
        const lastSent = parseInt(nightTag.split('-')[1], 10);
        if (isNaN(lastSent) || lastSent >= 8) continue; // 0-8 range now (9 emails total)

        const startTag = tags.find(t => t.startsWith('drip-start-'));
        if (!startTag) continue;
        const startTime = parseInt(startTag.split('drip-start-')[1], 10);
        if (isNaN(startTime)) continue;

        // Next email index in the NIGHTS array
        const next = lastSent + 1;
        if (next > 8) continue;

        // Check enough days have passed (night-0 sent instantly, night-1 on day 1, etc.)
        const daysSince = getDaysSinceStart(startTime);
        if (daysSince < lastSent) continue; // Not enough days elapsed

        // Check timezone window
        const tzTag = tags.find(t => t.startsWith('tz-'));
        const tz = tzTag ? tzTag.split('tz-')[1] : 'America/New_York';
        if (!isTimeToSend(tz, next)) continue;

        console.log(`[drip] sending email ${next} to ${sub.email} (tz: ${tz})`);
        const sent = await sendNight(sub.email, next);
        if (sent.ok) {
          const newTags = tags.filter(t => !t.match(/^night-\d$/));
          newTags.push(`night-${next}`);
          await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions/${sub.id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: newTags }),
          });
          sentCount++;
        } else {
          console.log(`[drip] failed:`, sent.error);
        }
      }

      if (!data.total_pages || page >= data.total_pages) break;
      page++;
    }
  } catch (e) {
    console.log('[drip] error:', e.message);
  }

  console.log(`[drip] sent ${sentCount} emails`);
  return { statusCode: 200, body: JSON.stringify({ sent: sentCount }) };
};
