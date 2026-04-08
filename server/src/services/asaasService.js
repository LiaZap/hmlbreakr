const axios = require('axios');

const APP_URL = process.env.APP_URL || 'https://app.breakr.com.br';

// Asaas API base URL — use sandbox for dev, production for prod
const ASAAS_BASE_URL = process.env.ASAAS_ENV === 'production'
  ? 'https://api.asaas.com/v3'
  : 'https://sandbox.asaas.com/api/v3';

// Plans value in BRL
const PLAN_VALUES = {
  client_monthly: parseFloat(process.env.ASAAS_VALUE_CLIENT || '49.00'),
  agency_basic: parseFloat(process.env.ASAAS_VALUE_AGENCY_BASIC || '197.00'),
  agency_unlimited: parseFloat(process.env.ASAAS_VALUE_AGENCY_UNLIMITED || '397.00'),
};

function getApi() {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error('ASAAS_API_KEY não configurada nas variáveis de ambiente.');
  return axios.create({
    baseURL: ASAAS_BASE_URL,
    headers: {
      'access_token': key,
      'Content-Type': 'application/json',
    }
  });
}

/**
 * Create or retrieve an Asaas customer by email.
 * Returns the customer id (cus_xxx).
 */
async function getOrCreateCustomer({ name, email, cpfCnpj }) {
  const api = getApi();

  // Try to find existing customer by email
  const search = await api.get('/customers', { params: { email } });
  if (search.data.data && search.data.data.length > 0) {
    return search.data.data[0].id;
  }

  // Create new customer
  const payload = { name, email };
  if (cpfCnpj) payload.cpfCnpj = cpfCnpj.replace(/\D/g, '');

  const created = await api.post('/customers', payload);
  return created.data.id;
}

/**
 * Create a subscription (assinatura) in Asaas.
 * Returns the subscription object with id and payment link.
 */
async function createSubscription({ customerId, value, description, externalReference }) {
  const api = getApi();

  const today = new Date();
  const nextDueDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const payload = {
    customer: customerId,
    billingType: 'CREDIT_CARD',  // will be overridden by payment link — accepts PIX/boleto/card
    value,
    nextDueDate,
    cycle: 'MONTHLY',
    description,
    externalReference,
  };

  const res = await api.post('/subscriptions', payload);
  return res.data;
}

/**
 * Create a payment link (cobrança avulsa via link) for subscription.
 * This is the recommended flow for Asaas — customer chooses payment method.
 */
async function createPaymentLink({ name, value, description, redirectUrl, externalReference }) {
  const api = getApi();

  const payload = {
    name,
    value,
    billingType: 'UNDEFINED', // accepts all methods (PIX, boleto, card)
    chargeType: 'RECURRENT',
    cycle: 'MONTHLY',
    description,
    redirectLink: redirectUrl,
    externalReference,
    endDate: null,
  };

  const res = await api.post('/paymentLinks', payload);
  return res.data; // { id, url, ... }
}

/**
 * Create checkout for client subscription.
 * Returns { url } to redirect the client.
 */
async function createClientCheckout({ clientHash, email, name }) {
  const link = await createPaymentLink({
    name: `Breakr — Plano Restaurante`,
    value: PLAN_VALUES.client_monthly,
    description: `Assinatura mensal Breakr — ${name}`,
    redirectUrl: `${APP_URL}?hash=${clientHash}&subscribed=true`,
    externalReference: `client:${clientHash}`,
  });
  return { url: link.url };
}

/**
 * Create checkout for agency subscription.
 * Returns { url } to redirect the agency.
 */
async function createAgencyCheckout({ agencyHash, email, plan, name }) {
  const value = plan === 'unlimited' ? PLAN_VALUES.agency_unlimited : PLAN_VALUES.agency_basic;
  const planLabel = plan === 'unlimited' ? 'Ilimitado' : 'Básico';

  const link = await createPaymentLink({
    name: `Breakr — Plano Agência ${planLabel}`,
    value,
    description: `Assinatura mensal Breakr Agência ${planLabel} — ${name || email}`,
    redirectUrl: `${APP_URL}?agency=${agencyHash}&subscribed=true`,
    externalReference: `agency:${agencyHash}:${plan}`,
  });
  return { url: link.url };
}

/**
 * Get customer portal URL — Asaas doesn't have a hosted portal,
 * so we return the Asaas customer URL for self-service.
 */
async function getPortalUrl({ asaasCustomerId }) {
  // Asaas doesn't have a hosted billing portal like Stripe.
  // Best option: return a link to the customer's payment history on Asaas.
  // Alternatively, build an internal page. For now, return null.
  return null;
}

/**
 * Validate Asaas webhook signature.
 * Asaas uses a token in the header: asaas-access-token
 */
function validateWebhook(req) {
  const token = req.headers['asaas-access-token'];
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected) return true; // skip validation if not configured
  return token === expected;
}

module.exports = {
  createClientCheckout,
  createAgencyCheckout,
  getPortalUrl,
  validateWebhook,
  getOrCreateCustomer,
  createSubscription,
};
