const Stripe = require('stripe');

const APP_URL = process.env.APP_URL || 'https://app.breakr.com.br';

// Price IDs — set these in environment variables after creating products in Stripe Dashboard
const PRICES = {
  client_monthly: process.env.STRIPE_PRICE_CLIENT || '',
  agency_basic: process.env.STRIPE_PRICE_AGENCY_BASIC || '',
  agency_unlimited: process.env.STRIPE_PRICE_AGENCY_UNLIMITED || '',
};

// Lazy init — only instantiate Stripe when STRIPE_SECRET_KEY is present
let _stripe = null;
function getStripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY não configurada nas variáveis de ambiente.');
    _stripe = Stripe(key);
  }
  return _stripe;
}

async function createClientCheckout({ clientHash, email, name }) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{ price: PRICES.client_monthly, quantity: 1 }],
    success_url: `${APP_URL}?hash=${clientHash}&subscribed=true`,
    cancel_url: `${APP_URL}?hash=${clientHash}&subscribed=false`,
    metadata: { clientHash, type: 'client' },
    subscription_data: { metadata: { clientHash, type: 'client' } }
  });
  return session;
}

async function createAgencyCheckout({ agencyHash, email, plan }) {
  const stripe = getStripe();
  const priceId = plan === 'unlimited' ? PRICES.agency_unlimited : PRICES.agency_basic;
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}?agency=${agencyHash}&subscribed=true`,
    cancel_url: `${APP_URL}?agency=${agencyHash}&subscribed=false`,
    metadata: { agencyHash, plan, type: 'agency' },
    subscription_data: { metadata: { agencyHash, plan, type: 'agency' } }
  });
  return session;
}

async function createPortalSession({ stripeCustomerId, returnUrl }) {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
  return session;
}

module.exports = { getStripe, createClientCheckout, createAgencyCheckout, createPortalSession };
