/**
 * onboardingSync — espelha dados preenchidos no onboarding (Client.data.formData)
 * para as tabelas relacionais do BPO.
 *
 * Roda a cada save de cliente (POST /client/:hash/sync). Idempotente:
 * - Match por CPF quando ambos têm CPF
 * - Match por nome (case-insensitive) quando CPF ausente
 * - Atualiza se existe, cria se não existe
 * - Não apaga registros existentes do BPO (evita perder edições manuais
 *   feitas direto na BPO depois do onboarding)
 */

const { db } = require('../db/client');
const t = require('../db/schema-bpo');
const { eq, and, sql } = require('drizzle-orm');
const crypto = require('crypto');

const parseCurrency = (value) => {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  let str = String(value).replace(/R\$/g, '').trim();
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  return parseFloat(str) || 0;
};

const parsePercent = (value) => {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  let str = String(value).replace(/%/g, '').replace(',', '.').trim();
  return parseFloat(str) || 0;
};

const norm = (s) => String(s || '').toLowerCase().trim();

async function syncPartners(clientId, partners) {
  if (!Array.isArray(partners)) return;

  const existing = await db.select().from(t.bpoPartner).where(eq(t.bpoPartner.clientId, clientId));
  const byCpf = new Map(existing.filter(p => p.cpf).map(p => [p.cpf, p]));
  const byName = new Map(existing.map(p => [norm(p.name), p]));

  for (const p of partners) {
    if (!p?.name) continue;

    const data = {
      name: p.name,
      cpf: p.cpf || null,
      prolaboreAmount: parseCurrency(p.pro_labore),
      updatedAt: new Date(),
    };

    const match = (p.cpf && byCpf.get(p.cpf)) || byName.get(norm(p.name));
    if (match) {
      await db.update(t.bpoPartner).set(data).where(eq(t.bpoPartner.id, match.id));
    } else {
      await db.insert(t.bpoPartner).values({ id: crypto.randomUUID(), ...data, clientId });
    }
  }
}

async function syncEmployees(clientId, employees) {
  if (!Array.isArray(employees)) return;

  const existing = await db.select().from(t.bpoEmployee).where(eq(t.bpoEmployee.clientId, clientId));
  const byCpf = new Map(existing.filter(e => e.cpf).map(e => [e.cpf, e]));
  const byName = new Map(existing.map(e => [norm(e.name), e]));

  for (const e of employees) {
    if (!e?.name) continue;

    const data = {
      name: e.name,
      cpf: e.cpf || null,
      role: e.role || 'Cozinha',
      isFreelancer: e.regime === 'Freelancer',
      baseSalary: parseCurrency(e.base_salary),
      updatedAt: new Date(),
    };

    const match = (e.cpf && byCpf.get(e.cpf)) || byName.get(norm(e.name));
    if (match) {
      await db.update(t.bpoEmployee).set(data).where(eq(t.bpoEmployee.id, match.id));
    } else {
      await db.insert(t.bpoEmployee).values({ id: crypto.randomUUID(), ...data, clientId });
    }
  }
}

async function syncPaymentMethods(clientId, formData) {
  const methods = [];

  // Marketplaces (iFood, Rappi, etc)
  if (Array.isArray(formData.fees_marketplaces)) {
    for (const m of formData.fees_marketplaces) {
      const name = m.provider === 'Outro' ? m.custom_provider : m.provider;
      if (!name) continue;
      methods.push({
        name,
        type: 'marketplace',
        feePercent: parsePercent(m.commission),
      });
    }
  }

  // Cartões — gera 1 entrada de débito e 1 de crédito por operadora
  if (Array.isArray(formData.fees_cards)) {
    for (const c of formData.fees_cards) {
      const provider = c.provider === 'Outra' ? c.custom_provider : c.provider;
      if (!provider) continue;
      if (c.debit_rate != null && c.debit_rate !== '') {
        methods.push({
          name: `${provider} Débito`,
          type: 'card_debit',
          feePercent: parsePercent(c.debit_rate),
        });
      }
      if (c.credit_rate != null && c.credit_rate !== '') {
        methods.push({
          name: `${provider} Crédito`,
          type: 'card_credit',
          feePercent: parsePercent(c.credit_rate),
        });
      }
    }
  }

  if (methods.length === 0) return;

  const existing = await db.select().from(t.paymentMethod).where(eq(t.paymentMethod.clientId, clientId));
  const byKey = new Map(existing.map(m => [`${norm(m.name)}|${m.type}`, m]));

  for (const m of methods) {
    const key = `${norm(m.name)}|${m.type}`;
    const match = byKey.get(key);
    if (match) {
      await db.update(t.paymentMethod)
        .set({ feePercent: m.feePercent, name: m.name, updatedAt: new Date() })
        .where(eq(t.paymentMethod.id, match.id));
    } else {
      await db.insert(t.paymentMethod).values({ id: crypto.randomUUID(), ...m, clientId, updatedAt: new Date() });
    }
  }
}

// ====================================================================
// CUSTOS FIXOS — espelha despesas recorrentes do onboarding pro BPO.
//
// O painel financeiro de Contas a Pagar é a fonte de verdade: cada custo
// fixo preenchido no onboarding vira um Payable recorrente (mensal).
//
// Idempotência:
//   - Cada custo tem uma CHAVE DETERMINÍSTICA (syncKey) — ex: "rent".
//   - O Payable é identificado por uma tag invisível no campo `description`
//     ("[onb:<syncKey>]"). Match por essa tag → update; senão → create.
//   - Não duplica a cada save. Não apaga Payables criados/editados à mão.
//   - Custos zerados/removidos no onboarding têm o Payable do mês corrente
//     cancelado (status 'cancelled'), nunca deletado.
// ====================================================================

// Marcador determinístico embutido na descrição do Payable.
const ONB_TAG = (key) => `[onb:${key}]`;
const hasOnbTag = (desc, key) => typeof desc === 'string' && desc.includes(ONB_TAG(key));

// Remove qualquer tag [onb:<key>] de uma descrição — uso só para EXIBIÇÃO.
// A tag PERMANECE gravada no banco (o sync depende dela para idempotência);
// este helper limpa o texto nas respostas de API para o usuário não ver o
// marcador interno (ex.: "Internet [onb:internet]" → "Internet").
const stripOnbTag = (desc) =>
  typeof desc === 'string' ? desc.replace(/\s*\[onb:[^\]]*\]/g, '').trim() : desc;

// Dia de vencimento padrão pros custos fixos sincronizados (dia 10 do mês).
const SYNC_DUE_DAY = 10;

// Vencimento do mês corrente. Se o dia 10 já passou, usa o próximo mês —
// assim a conta fica sempre visível na janela de 30 dias do dashboard.
function currentRecurringDueDate() {
  const now = new Date();
  let due = new Date(now.getFullYear(), now.getMonth(), SYNC_DUE_DAY, 12, 0, 0);
  if (due < now) {
    due = new Date(now.getFullYear(), now.getMonth() + 1, SYNC_DUE_DAY, 12, 0, 0);
  }
  return due;
}

// Catálogo de custos fixos do onboarding → categoria DRE do BPO.
// value: função que extrai o valor mensal (R$) do formData.
// Custos anuais são convertidos pra mensal (÷12) quando o ticket pede recorrência.
function collectFixedCosts(formData) {
  const lc = formData.location_costs || {};
  const ut = formData.utilities || {};
  const rs = formData.recurring_services || {};
  const of = formData.operational_fixed || {};
  const as = formData.admin_systems || {};
  const ms = formData.marketing_structure || {};

  const items = [
    { key: 'rent',          label: 'Aluguel',                       dreGroup: 'despesa_op', amount: parseCurrency(lc.rent) },
    // IPTU é anual no onboarding → rateio mensal pra recorrência mensal.
    { key: 'iptu',          label: 'IPTU',                          dreGroup: 'imposto',    amount: parseCurrency(lc.iptu_annual) / 12 },
    { key: 'internet',      label: 'Internet',                      dreGroup: 'despesa_op', amount: parseCurrency(ut.internet) },
    { key: 'alarm',         label: 'Alarme',                        dreGroup: 'despesa_op', amount: parseCurrency(ut.security) },
    { key: 'security',      label: 'Segurança / Ronda / Vigia',     dreGroup: 'despesa_op', amount: parseCurrency(ut.security_guard) },
    { key: 'kitchen_gas',   label: 'Gás de Cozinha',                dreGroup: 'despesa_op', amount: parseCurrency(of.kitchen_gas) },
    { key: 'kitchen_oil',   label: 'Óleo / Gordura',                dreGroup: 'despesa_op', amount: parseCurrency(of.kitchen_oil) },
    { key: 'systems',       label: 'Sistemas',                      dreGroup: 'despesa_op', amount: parseCurrency(as.software_pdv) },
    { key: 'accountant',    label: 'Contabilidade',                 dreGroup: 'despesa_op', amount: parseCurrency(as.accountant) },
    { key: 'card_machine',  label: 'Aluguel de Maquininha',         dreGroup: 'taxa_venda', amount: parseCurrency(as.card_machine_rent) },
    { key: 'mkt_agency',    label: 'Agência de Marketing',          dreGroup: 'despesa_op', amount: parseCurrency(ms.agency) },
    { key: 'mkt_ads',       label: 'Investimento em Tráfego Pago',  dreGroup: 'despesa_op', amount: parseCurrency(ms.ads_budget) },
  ];

  return items;
}

// Garante que existe uma FinancialCategory de despesa pro custo fixo.
// Idempotente: match por nome (case-insensitive) + type 'despesa'.
async function ensureCategory(clientId, categoryCache, label, dreGroup) {
  const cacheKey = norm(label);
  if (categoryCache.has(cacheKey)) return categoryCache.get(cacheKey);

  let [cat] = await db.select().from(t.financialCategory)
    .where(and(
      eq(t.financialCategory.clientId, clientId),
      eq(t.financialCategory.type, 'despesa'),
      sql`${t.financialCategory.name} ILIKE ${label}`,
    ))
    .limit(1);
  if (!cat) {
    [cat] = await db.insert(t.financialCategory).values({
      id: crypto.randomUUID(),
      clientId,
      name: label,
      type: 'despesa',
      dreGroup: dreGroup || 'despesa_op',
      updatedAt: new Date(),
    }).returning();
  }
  categoryCache.set(cacheKey, cat);
  return cat;
}

async function syncFixedCosts(clientId, formData) {
  const costs = collectFixedCosts(formData);

  // Payables já sincronizados pelo onboarding (têm a tag [onb:*]).
  const existing = await db.select().from(t.payable)
    .where(and(
      eq(t.payable.clientId, clientId),
      sql`${t.payable.description} ILIKE ${'%[onb:%'}`,
    ));
  const byKey = new Map();
  for (const p of existing) {
    const c = costs.find((x) => hasOnbTag(p.description, x.key));
    if (c) byKey.set(c.key, p);
  }

  const categoryCache = new Map();
  const dueDate = currentRecurringDueDate();
  let synced = 0;
  let cancelled = 0;

  for (const cost of costs) {
    const match = byKey.get(cost.key);
    const amount = Math.round((cost.amount || 0) * 100) / 100;
    const description = `${cost.label} ${ONB_TAG(cost.key)}`;

    // Custo zerado/ausente: não cria. Se já existe um Payable pendente
    // desse custo, cancela (cliente apagou o valor no onboarding).
    if (amount <= 0) {
      if (match && match.status === 'pending') {
        await db.update(t.payable)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(t.payable.id, match.id));
        cancelled++;
      }
      continue;
    }

    const category = await ensureCategory(clientId, categoryCache, cost.label, cost.dreGroup);

    if (match) {
      // Atualiza valor/categoria. Só mexe em dueDate/status se ainda
      // estiver pendente — não sobrescreve uma conta já paga/agendada à mão.
      const data = {
        amount,
        description,
        categoryId: category.id,
        updatedAt: new Date(),
      };
      if (match.status === 'pending' || match.status === 'cancelled') {
        data.remainingAmount = amount;
        data.dueDate = dueDate;
        data.paymentForecast = dueDate;
        data.status = 'pending';
      }
      await db.update(t.payable).set(data).where(eq(t.payable.id, match.id));
      synced++;
    } else {
      // Cria o Payable recorrente mensal (recorrência indefinida).
      const [recurrence] = await db.insert(t.recurrence).values({
        id: crypto.randomUUID(),
        frequency: 'monthly',
        intervalCount: 1,
        startDate: dueDate,
      }).returning();
      await db.insert(t.payable).values({
        id: crypto.randomUUID(),
        clientId,
        amount,
        remainingAmount: amount,
        dueDate,
        paymentForecast: dueDate,
        description,
        categoryId: category.id,
        status: 'pending',
        recurrenceId: recurrence.id,
        updatedAt: new Date(),
      });
      synced++;
    }
  }

  return { synced, cancelled };
}

async function syncOnboardingToBpo(_prisma, clientId, formData) {
  if (!formData || typeof formData !== 'object') return;

  const stats = {
    partners: Array.isArray(formData.partners) ? formData.partners.filter(p => p?.name).length : 0,
    employees: Array.isArray(formData.employees) ? formData.employees.filter(e => e?.name).length : 0,
    marketplaces: Array.isArray(formData.fees_marketplaces) ? formData.fees_marketplaces.length : 0,
    cards: Array.isArray(formData.fees_cards) ? formData.fees_cards.length : 0,
  };

  try {
    await syncPartners(clientId, formData.partners);
    await syncEmployees(clientId, formData.employees);
    await syncPaymentMethods(clientId, formData);
    const fixed = await syncFixedCosts(clientId, formData);
    console.log(`[onboardingSync] OK client=${clientId} partners=${stats.partners} employees=${stats.employees} marketplaces=${stats.marketplaces} cards=${stats.cards} fixedCosts=${fixed.synced} cancelled=${fixed.cancelled}`);
  } catch (err) {
    // Sync é best-effort — não quebra o save do cliente se falhar.
    // PII-safe: este fluxo mexe com partners (CPF) e employees (CPF/salário);
    // o driver pg em conflito de unique pode vazar detalhe. Loga só message
    // + code categórico (pii-auditor #7).
    console.error(`[onboardingSync] FAIL client=${clientId}: ${err?.message || err} (code=${err?.code || 'unknown'})`);
  }
}

/**
 * Diagnóstico: compara o que tá no formData (onboarding) com o que tá nas
 * tabelas BPO. Útil pra admin verificar se sync rodou.
 */
async function diffOnboardingVsBpo(_prisma, clientId, formData) {
  formData = formData || {};
  const [bpoPartners, bpoEmployees, bpoPaymentMethods, bpoFixedPayables] = await Promise.all([
    db.select().from(t.bpoPartner).where(eq(t.bpoPartner.clientId, clientId)),
    db.select().from(t.bpoEmployee).where(eq(t.bpoEmployee.clientId, clientId)),
    db.select().from(t.paymentMethod).where(eq(t.paymentMethod.clientId, clientId)),
    db.select().from(t.payable).where(and(
      eq(t.payable.clientId, clientId),
      sql`${t.payable.description} ILIKE ${'%[onb:%'}`,
    )),
  ]);

  const fixedCosts = collectFixedCosts(formData).filter((c) => (c.amount || 0) > 0);
  const syncedFixed = bpoFixedPayables.filter((p) => p.status !== 'cancelled');

  const onboarding = {
    partners: (formData.partners || []).filter(p => p?.name).map(p => p.name),
    employees: (formData.employees || []).filter(e => e?.name).map(e => e.name),
    marketplaces: (formData.fees_marketplaces || [])
      .map(m => m.provider === 'Outro' ? m.custom_provider : m.provider)
      .filter(Boolean),
    cards: (formData.fees_cards || [])
      .map(c => c.provider === 'Outra' ? c.custom_provider : c.provider)
      .filter(Boolean),
  };

  const bpo = {
    partners: bpoPartners.map(p => p.name),
    employees: bpoEmployees.map(e => e.name),
    marketplaces: bpoPaymentMethods.filter(m => m.type === 'marketplace').map(m => m.name),
    cards: bpoPaymentMethods
      .filter(m => m.type === 'card_credit' || m.type === 'card_debit')
      .map(m => m.name),
  };

  const inOnboardingNotBpo = (a, b) => a.filter(x => !b.some(y => y.toLowerCase() === x.toLowerCase()));

  return {
    counts: {
      onboarding: {
        partners: onboarding.partners.length,
        employees: onboarding.employees.length,
        marketplaces: onboarding.marketplaces.length,
        cards: onboarding.cards.length,
        fixedCosts: fixedCosts.length,
      },
      bpo: {
        partners: bpo.partners.length,
        employees: bpo.employees.length,
        marketplaces: bpo.marketplaces.length,
        cards: bpo.cards.length,
        fixedCosts: syncedFixed.length,
      },
    },
    missing: {
      partners: inOnboardingNotBpo(onboarding.partners, bpo.partners),
      employees: inOnboardingNotBpo(onboarding.employees, bpo.employees),
      marketplaces: inOnboardingNotBpo(onboarding.marketplaces, bpo.marketplaces),
    },
    bpoLists: bpo,
    onboardingLists: onboarding,
  };
}

module.exports = { syncOnboardingToBpo, diffOnboardingVsBpo, stripOnbTag };
