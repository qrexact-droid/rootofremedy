// POST /api/checkout — creates Stripe checkout session
// Body: { plan: 'monthly' | 'annual' }
const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const origin = process.env.SITE_URL || 'https://rootofremedy.com';

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const plan = body.plan === 'annual' ? 'annual' : 'monthly';
  const priceId = plan === 'annual'
    ? process.env.STRIPE_ANNUAL_PRICE_ID
    : process.env.STRIPE_PRICE_ID;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 7 },
      success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?cancelled=1`,
      allow_promotion_codes: true,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
