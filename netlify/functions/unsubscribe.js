const { token } = require('./_mail.js');

exports.handler = async (event) => {
  const { e, t } = event.queryStringParameters || {};
  if (!e || !t || token(e) !== t) return { statusCode: 400, body: 'Invalid link.' };

  const pubId = process.env.BEEHIIV_PUBLICATION_ID;
  const apiKey = process.env.BEEHIIV_API_KEY;
  try {
    const search = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions?email=${encodeURIComponent(e.toLowerCase())}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const sData = await search.json();
    const sub = sData?.data?.[0];
    if (sub) {
      const newTags = (sub.tags || []).filter(t => !t.match(/^night-\d$/));
      newTags.push('night-8');
      await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTags }),
      });
    }
  } catch (err) { console.log('[unsub] error:', err.message); }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: '<html><body style="margin:0;background:#0A0E1A;min-height:100vh;display:flex;align-items:center;justify-content:center;"><div style="font-family:Georgia,serif;max-width:480px;text-align:center;color:#F0EFE8;padding:40px;"><p>The practice pauses here.</p><p style="color:#8a8f9c;margin-top:16px;">Whenever it calls again, the door stays open at <a href="https://dreamcoherence.com" style="color:#C49A4F;">dreamcoherence.com</a>.</p></div></body></html>',
  };
};
