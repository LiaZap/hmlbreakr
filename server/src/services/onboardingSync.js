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

async function syncPartners(prisma, clientId, partners) {
  if (!Array.isArray(partners)) return;

  const existing = await prisma.bpoPartner.findMany({ where: { clientId } });
  const byCpf = new Map(existing.filter(p => p.cpf).map(p => [p.cpf, p]));
  const byName = new Map(existing.map(p => [norm(p.name), p]));

  for (const p of partners) {
    if (!p?.name) continue;

    const data = {
      name: p.name,
      cpf: p.cpf || null,
      prolaboreAmount: parseCurrency(p.pro_labore),
    };

    const match = (p.cpf && byCpf.get(p.cpf)) || byName.get(norm(p.name));
    if (match) {
      await prisma.bpoPartner.update({ where: { id: match.id }, data });
    } else {
      await prisma.bpoPartner.create({ data: { ...data, clientId } });
    }
  }
}

async function syncEmployees(prisma, clientId, employees) {
  if (!Array.isArray(employees)) return;

  const existing = await prisma.bpoEmployee.findMany({ where: { clientId } });
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
    };

    const match = (e.cpf && byCpf.get(e.cpf)) || byName.get(norm(e.name));
    if (match) {
      await prisma.bpoEmployee.update({ where: { id: match.id }, data });
    } else {
      await prisma.bpoEmployee.create({ data: { ...data, clientId } });
    }
  }
}

async function syncPaymentMethods(prisma, clientId, formData) {
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

  const existing = await prisma.paymentMethod.findMany({ where: { clientId } });
  const byKey = new Map(existing.map(m => [`${norm(m.name)}|${m.type}`, m]));

  for (const m of methods) {
    const key = `${norm(m.name)}|${m.type}`;
    const match = byKey.get(key);
    if (match) {
      await prisma.paymentMethod.update({
        where: { id: match.id },
        data: { feePercent: m.feePercent, name: m.name },
      });
    } else {
      await prisma.paymentMethod.create({ data: { ...m, clientId } });
    }
  }
}

async function syncOnboardingToBpo(prisma, clientId, formData) {
  if (!formData || typeof formData !== 'object') return;

  const stats = {
    partners: Array.isArray(formData.partners) ? formData.partners.filter(p => p?.name).length : 0,
    employees: Array.isArray(formData.employees) ? formData.employees.filter(e => e?.name).length : 0,
    marketplaces: Array.isArray(formData.fees_marketplaces) ? formData.fees_marketplaces.length : 0,
    cards: Array.isArray(formData.fees_cards) ? formData.fees_cards.length : 0,
  };

  try {
    await syncPartners(prisma, clientId, formData.partners);
    await syncEmployees(prisma, clientId, formData.employees);
    await syncPaymentMethods(prisma, clientId, formData);
    console.log(`[onboardingSync] OK client=${clientId} partners=${stats.partners} employees=${stats.employees} marketplaces=${stats.marketplaces} cards=${stats.cards}`);
  } catch (err) {
    // Sync é best-effort — não quebra o save do cliente se falhar
    console.error(`[onboardingSync] FAIL client=${clientId}`, err);
  }
}

/**
 * Diagnóstico: compara o que tá no formData (onboarding) com o que tá nas
 * tabelas BPO. Útil pra admin verificar se sync rodou.
 */
async function diffOnboardingVsBpo(prisma, clientId, formData) {
  formData = formData || {};
  const [bpoPartners, bpoEmployees, bpoPaymentMethods] = await Promise.all([
    prisma.bpoPartner.findMany({ where: { clientId } }),
    prisma.bpoEmployee.findMany({ where: { clientId } }),
    prisma.paymentMethod.findMany({ where: { clientId } }),
  ]);

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
      },
      bpo: {
        partners: bpo.partners.length,
        employees: bpo.employees.length,
        marketplaces: bpo.marketplaces.length,
        cards: bpo.cards.length,
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

module.exports = { syncOnboardingToBpo, diffOnboardingVsBpo };
