/**
 * Stripe — assinaturas e cobrança.
 *
 * F1 (atual): pré-fill do Customer com dados do formulário + Pix/Boleto/Cartão.
 * F2 (próxima): webhook handler (idempotente, signed) que sincroniza o status
 *               da assinatura no Client.
 * F3+: guarda de acesso, modais, tela admin.
 *
 * Métodos de pagamento BR: Pix (40% do mercado online), Boleto (20%+), cartão.
 * Sem isso a gente corta ~60% dos clientes brasileiros.
 */

const Stripe = require('stripe');

const APP_URL = process.env.APP_URL || 'https://app.breakr.com.br';

// Price IDs — defina nas variáveis de ambiente após criar produtos no Dashboard.
const PRICES = {
  client_monthly:   process.env.STRIPE_PRICE_CLIENT          || '',
  agency_basic:     process.env.STRIPE_PRICE_AGENCY_BASIC    || '',
  agency_unlimited: process.env.STRIPE_PRICE_AGENCY_UNLIMITED|| '',
};

// Métodos de pagamento aceitos no Checkout (Brasil).
// Boleto e Pix só funcionam com BRL — o produto/price deve estar em BRL no Dashboard.
const PAYMENT_METHODS_BR = ['card', 'boleto'];
// Pix entra quando o Stripe Pix Automático (recorrente) estiver liberado pra conta;
// por enquanto a string permanece 'card,boleto' e 'pix' será adicionado quando
// confirmado no Dashboard (Stripe → Payments → Methods).

// Lazy init — só instancia o SDK quando STRIPE_SECRET_KEY está configurada.
let _stripe = null;
function getStripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY não configurada nas variáveis de ambiente.');
    _stripe = Stripe(key);
  }
  return _stripe;
}

/**
 * Limpa CPF/CNPJ deixando só dígitos. Stripe exige só números no `tax_id_data.value`.
 */
const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

/**
 * Detecta se um documento é CPF (11) ou CNPJ (14) — pelo tamanho dos dígitos.
 * Retorna { type, value } no formato que o Stripe aceita, ou null se inválido.
 */
function brTaxId(doc) {
  const v = onlyDigits(doc);
  if (v.length === 11) return { type: 'br_cpf', value: v };
  if (v.length === 14) return { type: 'br_cnpj', value: v };
  return null;
}

/**
 * Cria (ou recupera) o Customer no Stripe com TUDO que tivermos no formulário.
 * Quanto mais campos pré-fornecidos, menos o cliente digita no Checkout.
 *
 * Idempotência: se o Client já tem `stripeCustomerId`, recupera o existente
 * e ATUALIZA com qualquer campo novo (Customer.update). Evita criar duplicado.
 *
 * @param {object} client — registro do Prisma (Client). Precisa de id, hash, email/name.
 * @param {object} billing — dados de cobrança vindos do formulário/onboarding.
 *   { name, email, phone, address: { line1, line2, city, state, postal_code, country },
 *     taxId: 'CPF/CNPJ' }
 * @returns {Promise<{ id: string }>} stripe customer
 */
async function getOrCreateCustomer(client, billing = {}) {
  const stripe = getStripe();

  // Monta o objeto de dados a partir do que tiver — Stripe ignora undefined.
  const data = {
    name: billing.name || client.name || undefined,
    email: billing.email || client.email || undefined,
    phone: billing.phone || undefined,
    address: billing.address && (billing.address.line1 || billing.address.postal_code)
      ? {
          line1: billing.address.line1 || undefined,
          line2: billing.address.line2 || undefined,
          city: billing.address.city || undefined,
          state: billing.address.state || undefined,
          postal_code: onlyDigits(billing.address.postal_code) || undefined,
          country: billing.address.country || 'BR',
        }
      : undefined,
    metadata: {
      clientId: client.id,
      clientHash: client.hash,
    },
  };

  const tax = brTaxId(billing.taxId);

  // Já tem customer? Atualiza com qualquer dado novo (não força tax_id_data
  // — Stripe.update não aceita; tax_ids são gerenciados em endpoint separado).
  if (client.stripeCustomerId) {
    try {
      const updated = await stripe.customers.update(client.stripeCustomerId, data);
      // Garante o tax_id (idempotente: cria se ainda não estiver lá).
      if (tax) await ensureTaxId(stripe, client.stripeCustomerId, tax);
      return updated;
    } catch (err) {
      // Customer não existe mais no Stripe (ex: ambiente test trocado) → cai pro create.
      console.warn('[stripe] customers.update falhou — criando novo', err.message);
    }
  }

  // Criação nova — aqui sim tax_id_data vai junto.
  const created = await stripe.customers.create({
    ...data,
    ...(tax ? { tax_id_data: [tax] } : {}),
  });
  return created;
}

/**
 * Garante que o customer tem aquele tax_id (CPF/CNPJ) cadastrado.
 * Lista os existentes; se já tiver, no-op; senão cria.
 */
async function ensureTaxId(stripe, customerId, tax) {
  try {
    const list = await stripe.customers.listTaxIds(customerId, { limit: 10 });
    const found = (list.data || []).find(t => t.type === tax.type && t.value === tax.value);
    if (found) return found;
    return await stripe.customers.createTaxId(customerId, tax);
  } catch (err) {
    console.warn('[stripe] ensureTaxId falhou:', err.message);
    return null;
  }
}

/**
 * Cria a Checkout Session do cliente. Se `client` for passado, usa o Customer
 * pré-criado (com pré-fill de tudo); senão cai no modo legado por email.
 *
 * Métodos de pagamento: cartão + boleto (Pix entra quando confirmado).
 */
async function createClientCheckout({ clientHash, email, name, client, billing }) {
  const stripe = getStripe();

  // Garante o Customer com pré-fill se temos o registro do banco.
  let customerId = null;
  if (client) {
    const c = await getOrCreateCustomer(client, billing || { name, email });
    customerId = c.id;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: PAYMENT_METHODS_BR,
    ...(customerId ? { customer: customerId } : { customer_email: email }),
    line_items: [{ price: PRICES.client_monthly, quantity: 1 }],
    success_url: `${APP_URL}?hash=${clientHash}&subscribed=true`,
    cancel_url:  `${APP_URL}?hash=${clientHash}&subscribed=false`,
    metadata: { clientHash, type: 'client' },
    subscription_data: { metadata: { clientHash, type: 'client' } },
  });
  return session;
}

async function createAgencyCheckout({ agencyHash, email, plan }) {
  const stripe = getStripe();
  const priceId = plan === 'unlimited' ? PRICES.agency_unlimited : PRICES.agency_basic;
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: PAYMENT_METHODS_BR,
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}?agency=${agencyHash}&subscribed=true`,
    cancel_url:  `${APP_URL}?agency=${agencyHash}&subscribed=false`,
    metadata: { agencyHash, plan, type: 'agency' },
    subscription_data: { metadata: { agencyHash, plan, type: 'agency' } },
  });
  return session;
}

async function createPortalSession({ stripeCustomerId, returnUrl }) {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
}

module.exports = {
  getStripe,
  getOrCreateCustomer,
  createClientCheckout,
  createAgencyCheckout,
  createPortalSession,
  // Constantes úteis pra outros módulos saberem o que pedimos:
  PAYMENT_METHODS_BR,
  PRICES,
};
