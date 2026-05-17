// POST /api/verify — verify Stripe session and issue access token
// GET  /api/verify — validate existing token
const Stripe = require('stripe');
const crypto = require('crypto');

function makeToken(customerId, secret) {
  const day = Math.floor(Date.now() / 86400000); // rotates daily
  return crypto.createHmac('sha256', secret).update(`${customerId}:${day}`).digest('hex');
}

function checkToken(customerId, token, secret) {
  // Check today and yesterday (grace period across midnight)
  const day = Math.floor(Date.now() / 86400000);
  for (const d of [day, day - 1]) {
    const expected = crypto.createHmac('sha256', secret).update(`${customerId}:${d}`).digest('hex');
    if (crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))) return true;
  }
  return false;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const secret = process.env.JWT_SECRET;

  // POST: new session from Stripe checkout redirect
  if (req.method === 'POST') {
    const { session_id, token, customer_id } = req.body || {};

    // Validate existing token
    if (token && customer_id) {
      const valid = checkToken(customer_id, token, secret);
      return res.status(200).json({ valid });
    }

    // New session: look up Stripe
    if (!session_id) return res.status(400).json({ error: 'session_id required' });

    try {
      const session = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ['customer', 'subscription'],
      });

      if (!['active', 'trialing', 'complete'].includes(session.status) &&
          session.payment_status !== 'paid') {
        // Check sub status
        const sub = session.subscription;
        if (!sub || !['active', 'trialing'].includes(sub.status)) {
          return res.status(403).json({ error: 'Subscription not active' });
        }
      }

      const customer = session.customer;
      const customerId = typeof customer === 'string' ? customer : customer?.id;
      const email = typeof customer === 'string' ? session.customer_email : customer?.email;
      const name = typeof customer === 'object' ? customer?.name : null;

      const newToken = makeToken(customerId, secret);

      return res.status(200).json({
        valid: true,
        token: newToken,
        customer_id: customerId,
        email: email || session.customer_email,
        name: name || '',
      });
    } catch (err) {
      console.error('Verify error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
