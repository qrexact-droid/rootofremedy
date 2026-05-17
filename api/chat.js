// POST /api/chat — Claude proxy for both landing demo and member dashboard
const crypto = require('crypto');

function checkToken(customerId, token, secret) {
  const day = Math.floor(Date.now() / 86400000);
  for (const d of [day, day - 1]) {
    const expected = crypto.createHmac('sha256', secret).update(`${customerId}:${d}`).digest('hex');
    try {
      if (crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))) return true;
    } catch { continue; }
  }
  return false;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, customer_id, token: authToken, is_demo } = req.body || {};

  // Check auth for dashboard (not required for landing demo)
  let isAuthenticated = false;
  if (authToken && customer_id) {
    isAuthenticated = checkToken(customer_id, authToken, process.env.JWT_SECRET);
  }

  const systemPrompt = isAuthenticated
    ? `You are a knowledgeable natural remedy and holistic wellness AI consultant inside the Root of Remedy member dashboard. You provide warm, personalized, specific natural remedy advice. Keep responses to 2-4 sentences. Always recommend consulting a doctor for serious medical concerns. Use emojis sparingly. Never claim to cure diseases. Say "support", "may help", "natural approach".`
    : `You are a knowledgeable natural remedy and holistic wellness AI consultant for Root of Remedy (rootofremedy.com). You provide helpful natural health suggestions. Keep responses concise (2-3 sentences). At the end of your response, add a line break and a subtle CTA: "🌿 Get your personalized protocol → rootofremedy.com ($5.99/mo, 7-day free trial)". Always recommend consulting a doctor for serious concerns.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        system: systemPrompt,
        messages: messages || [],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || 'I\'d recommend starting with a personalized wellness consultation. What are your main health goals?';

    res.status(200).json({ text, authenticated: isAuthenticated });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
