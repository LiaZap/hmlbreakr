const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY || '');

const APP_URL = process.env.APP_URL || 'https://app.breakr.com.br';

// Price IDs — set these in environment variables after creating products in Stripe Dashboard
const PRICES = {
  client_monthly: process.env.STRIPE_PRICE_CLIENT || '',       // R$ 49/mês
  agency_basic: process.env.STRIPE_PRICE_AGENCY_BASIC || '',   // R$ 197/mês (até 10 clientes)
  agency_unlimited: process.env.STRIPE_PRICE_AGENCY_UNLIMITED || '', // R$ 397/mês
};

/**
 * Create a Stripe Checkout Session for a client subscription.
 */
async function createClientCheckout({ clientHash, email, name }) {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{ price: PRICES.client_monthly, quantity: 1 }],
    success_url: `${APP_URL}?hash=${clientHash}&subscribed=true`,
    cancel_url: `${APP_URL}?hash=${clientHash}&subscribed=false`,
    metadata: { clientHash, type: 'client' },
    subscription_data: {
      metadata: { clientHash, type: 'client' }
    }
  });
  return session;
}

/**
 * Create a Stripe Checkout Session for an agency subscription.
 */
async function createAgencyCheckout({ agencyHash, email, plan }) {
  const priceId = plan === 'unlimited' ? PRICES.agency_unlimited : PRICES.agency_basic;
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}?agency=${agencyHash}&subscribed=true`,
    cancel_url: `${APP_URL}?agency=${agencyHash}&subscribed=false`,
    metadata: { agencyHash, plan, type: 'agency' },
    subscription_data: {
      metadata: { agencyHash, plan, type: 'agency' }
    }
  });
  return session;
}

/**
 * Create a Stripe Customer Portal session for managing subscription.
 */
async function createPortalSession({ stripeCustomerId, returnUrl }) {
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
  return session;
}

module.exports = { stripe, createClientCheckout, createAgencyCheckout, createPortalSession };
