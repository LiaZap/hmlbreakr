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

// ────────────────────────────────────────────────────────────────────────────
// CATÁLOGO DE PLANOS — Breakr [Hub]
// ────────────────────────────────────────────────────────────────────────────
//
// Cada plano tem:
//   - slug:        identificador interno usado em APIs ('fispal' / 'monthly' / 'annual')
//   - priceId:     Stripe Price ID (env var override)
//   - productId:   Stripe Product ID (referência)
//   - label:       nome amigável exibido no UI
//   - priceLabel:  preço formatado (BRL)
//   - cycle:       'monthly' | 'yearly'
//   - paymentLink: URL do Payment Link Stripe (atalho pra checkout sem backend)
//   - tag:         badge opcional ('Promocional' / 'Mais popular' / 'Melhor custo')
//
// IDs default são os de PRODUÇÃO (já criados no Dashboard). Em dev sobrescreva
// via env vars STRIPE_PRICE_FISPAL / STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL
// com IDs de teste pra não cobrar de verdade.
const CLIENT_PLANS = [
  {
    slug: 'fispal',
    priceId: process.env.STRIPE_PRICE_FISPAL || 'price_1TMEaBQBLcH7ZdgdFS90OFVT',
    productId: 'prod_UKuOi6X6kluVrQ',
    label: 'Breakr [Hub] | FISPAL',
    priceLabel: 'R$ 996,00/ano',
    priceCents: 99600,
    cycle: 'yearly',
    paymentLink: 'https://buy.stripe.com/9B6bJ3chNdRCgnh3d5dnW00',
    tag: 'Promocional',
    description: 'Oferta especial FISPAL 2026',
  },
  {
    slug: 'monthly',
    priceId: process.env.STRIPE_PRICE_MONTHLY || 'price_1TYpOpQBLcH7ZdgdAoy49KsD',
    productId: 'prod_UKuN334E3RkWRd',
    label: 'Breakr [Hub] | Mensal',
    priceLabel: 'R$ 169,00/mês',
    priceCents: 16900,
    cycle: 'monthly',
    paymentLink: 'https://buy.stripe.com/9B69AV1D94h25IDdRJdnW01',
    tag: null,
    description: 'Flexibilidade — cancele quando quiser',
  },
  {
    slug: 'annual',
    priceId: process.env.STRIPE_PRICE_ANNUAL || 'price_1TYpS0QBLcH7Zdgd22TqOKG0',
    productId: 'prod_UXvIuoKdcaYISi',
    label: 'Breakr [Hub] | Anual',
    priceLabel: 'R$ 1.548,00/ano',
    priceLabelExtra: 'equivale a R$ 129/mês',
    priceCents: 154800,
    cycle: 'yearly',
    paymentLink: 'https://buy.stripe.com/00w9AVa9FbJuef9291dnW03',
    tag: 'Melhor custo',
    description: '24% de desconto vs mensal',
  },
];

// Helper rápido pra mapear slug → plano
const CLIENT_PLAN_BY_SLUG = Object.fromEntries(CLIENT_PLANS.map(p => [p.slug, p]));

// Helper pra mapear priceId → plano (usado pra reconhecer o plano em curso
// a partir do que vem do Stripe Subscription, ex: no buildSubscriptionInfo)
const CLIENT_PLAN_BY_PRICE_ID = Object.fromEntries(CLIENT_PLANS.map(p => [p.priceId, p]));

function getClientPlanBySlug(slug) {
  return CLIENT_PLAN_BY_SLUG[slug] || null;
}

function getClientPlanByPriceId(priceId) {
  return CLIENT_PLAN_BY_PRICE_ID[priceId] || null;
}

// PRICES — mapa legado (usado por createAgencyCheckout). client_monthly mantido
// como alias do plano monthly pra não quebrar código que ainda usa essa chave.
const PRICES = {
  client_monthly:   process.env.STRIPE_PRICE_CLIENT || CLIENT_PLAN_BY_SLUG.monthly.priceId,
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
async function createClientCheckout({ clientHash, email, name, client, billing, planSlug = 'monthly' }) {
  const stripe = getStripe();

  // Resolve o plano. Default = monthly (compat com fluxo antigo que
  // não passava planSlug). Se passou slug inválido, joga 400.
  const plan = getClientPlanBySlug(planSlug);
  if (!plan) {
    const valid = CLIENT_PLANS.map(p => p.slug).join('/');
    throw new Error(`planSlug inválido: "${planSlug}". Valores aceitos: ${valid}`);
  }

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
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: `${APP_URL}?hash=${clientHash}&subscribed=true&plan=${plan.slug}`,
    cancel_url:  `${APP_URL}?hash=${clientHash}&subscribed=false`,
    metadata: { clientHash, type: 'client', planSlug: plan.slug },
    subscription_data: { metadata: { clientHash, type: 'client', planSlug: plan.slug } },
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
  // Catálogo de planos
  CLIENT_PLANS,
  getClientPlanBySlug,
  getClientPlanByPriceId,
  createAgencyCheckout,
  createPortalSession,
  // Constantes úteis pra outros módulos saberem o que pedimos:
  PAYMENT_METHODS_BR,
  PRICES,
};
