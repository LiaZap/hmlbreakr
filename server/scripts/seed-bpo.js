/**
 * seed-bpo.js — Seed completo pro módulo BPO Financeiro
 *
 * Cria 3 clientes BPO com perfis diferentes pra desbloquear E2E:
 *   1. Burger Brothers — operação madura, 6 meses de histórico
 *   2. Pizzaria da Esquina — recém-cadastrado, dados mínimos
 *   3. Sushi Premium — operação grande, muito volume
 *
 * Uso:
 *   node scripts/seed-bpo.js              # cria/upserta tudo
 *   node scripts/seed-bpo.js --clean      # apaga seed (mantém outros clientes)
 *   node scripts/seed-bpo.js --only=burger|pizzaria|sushi  # só 1 cliente
 *
 * Idempotente: roda 2x sem duplicar (usa hash conhecido + cleanup interno).
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// ============================================================================
// Hashes FIXOS (pra E2E sempre achar) — não usar em produção!
// ============================================================================
const SEED_HASHES = {
  burger: 'seedburgerbros000000000',
  pizzaria: 'seedpizzariaesq00000000',
  sushi: 'seedsushiprem0000000000',
};

const SEED_TAG = '[seed-bpo]'; // marcador interno em notes/descriptions pra cleanup seguro

// ============================================================================
// Helpers
// ============================================================================
function log(...args) {
  console.log('[seed]', ...args);
}

function ok(...args) {
  console.log('[seed] ✓', ...args);
}

function err(...args) {
  console.error('[seed] ✗', ...args);
}

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d;
}

function monthsFromNow(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  d.setHours(12, 0, 0, 0);
  return d;
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function money(min, max) {
  // Retorna Decimal-friendly string com 2 casas
  return (Math.random() * (max - min) + min).toFixed(2);
}

// ----------------------------------------------------------------------------
// CNPJ: gera CNPJ aleatório com DV válido
// ----------------------------------------------------------------------------
function genCnpj() {
  const n = () => Math.floor(Math.random() * 10);
  const base = [n(), n(), n(), n(), n(), n(), n(), n(), 0, 0, 0, 1];

  const calcDv = (digits, weights) => {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) sum += digits[i] * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const dv1 = calcDv(base, w1);
  const dv2 = calcDv([...base, dv1], w2);

  const all = [...base, dv1, dv2].join('');
  return `${all.slice(0, 2)}.${all.slice(2, 5)}.${all.slice(5, 8)}/${all.slice(8, 12)}-${all.slice(12)}`;
}

// CPF aleatório com DV válido
function genCpf() {
  const n = () => Math.floor(Math.random() * 10);
  const base = [n(), n(), n(), n(), n(), n(), n(), n(), n()];

  const dv = (digits, start) => {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) sum += digits[i] * (start - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };

  const dv1 = dv(base, 10);
  const dv2 = dv([...base, dv1], 11);
  const all = [...base, dv1, dv2].join('');
  return `${all.slice(0, 3)}.${all.slice(3, 6)}.${all.slice(6, 9)}-${all.slice(9)}`;
}

// ============================================================================
// Cleanup de seed anterior (cascata via Client.delete)
// ============================================================================
async function cleanupClient(hash) {
  const existing = await prisma.client.findUnique({ where: { hash } });
  if (!existing) return false;

  log(`Removendo cliente existente "${existing.name}" (hash=${hash})...`);

  // PaymentTransaction.bankAccountId nao tem onDelete:Cascade — limpar antes
  // (e BankTransaction tambem cascateia via BankAccount, mas precisamos garantir)
  const banks = await prisma.bankAccount.findMany({ where: { clientId: existing.id }, select: { id: true } });
  const bankIds = banks.map((b) => b.id);
  if (bankIds.length > 0) {
    await prisma.paymentTransaction.deleteMany({ where: { bankAccountId: { in: bankIds } } });
    await prisma.bankTransfer.deleteMany({ where: { OR: [{ fromAccountId: { in: bankIds } }, { toAccountId: { in: bankIds } }] } });
    await prisma.bankTransaction.deleteMany({ where: { bankAccountId: { in: bankIds } } });
  }

  // Cascade deletes via onDelete: Cascade nos demais modelos BPO via Client
  await prisma.client.delete({ where: { id: existing.id } });
  return true;
}

async function cleanupAll() {
  for (const hash of Object.values(SEED_HASHES)) {
    await cleanupClient(hash);
  }
  ok('Limpeza concluida.');
}

// ============================================================================
// DEFAULT CLIENT.data BLOB (mínimo pra app não quebrar)
// ============================================================================
function defaultClientData(name, category) {
  return JSON.stringify({
    restaurant: { name, logo: null, category: category || 'Hamburgueria' },
    user: { name: 'Proprietário', photo: null, role: 'Proprietário da Conta', initials: 'P', isOwner: true },
    period: { date: new Date().toLocaleDateString('pt-BR'), status: 'Lucrativo', statusColor: '#E2FD89' },
    overview: {
      title: name,
      subtitle: 'Cliente seed BPO — gerado por seed-bpo.js',
      tags: [],
    },
    revenue: { total: '0,00', month: 'Mês Atual' },
    onboarding: { completed: true, step: 16 },
    fichas: [],
    insumos: [],
    products: [],
  });
}

// ============================================================================
// SEED CLIENTE 1 — Burger Brothers (operação madura)
// ============================================================================
async function seedBurger() {
  const hash = SEED_HASHES.burger;
  log('Criando Cliente 1: Burger Brothers...');

  await cleanupClient(hash);

  const client = await prisma.client.create({
    data: {
      name: 'Burger Brothers',
      hash,
      email: `burger-${hash.slice(0, 6)}@seed.local`,
      data: defaultClientData('Burger Brothers', 'Hamburgueria'),
      bpoEnabled: true,
      bpoActivatedAt: monthsFromNow(-6),
      active: true,
    },
  });

  // ---- Categorias (12) ----
  const catData = [
    { name: 'CMV - Carnes', type: 'despesa', dreGroup: 'cmv', color: '#DC2626' },
    { name: 'CMV - Bebidas', type: 'despesa', dreGroup: 'cmv', color: '#F59E0B' },
    { name: 'CMV - Hortifruti', type: 'despesa', dreGroup: 'cmv', color: '#84CC16' },
    { name: 'Salários', type: 'despesa', dreGroup: 'despesa_op', color: '#3B82F6' },
    { name: 'Aluguel', type: 'despesa', dreGroup: 'despesa_op', color: '#6366F1' },
    { name: 'Marketing', type: 'despesa', dreGroup: 'despesa_op', color: '#EC4899' },
    { name: 'Manutenção', type: 'despesa', dreGroup: 'despesa_op', color: '#8B5CF6' },
    { name: 'Impostos', type: 'despesa', dreGroup: 'imposto', color: '#A855F7' },
    { name: 'Outros - Despesa', type: 'despesa', dreGroup: 'outros', color: '#64748B' },
    { name: 'Vendas - Loja', type: 'receita', dreGroup: 'receita', color: '#22C55E' },
    { name: 'Vendas - iFood', type: 'receita', dreGroup: 'receita', color: '#EF4444' },
    { name: 'Vendas - Aiqfome', type: 'receita', dreGroup: 'receita', color: '#F97316' },
  ];
  const cats = [];
  for (const c of catData) {
    cats.push(await prisma.financialCategory.create({ data: { ...c, clientId: client.id } }));
  }
  ok(`${cats.length} categorias`);

  // ---- Bancos (3) ----
  const banks = await Promise.all([
    prisma.bankAccount.create({
      data: {
        clientId: client.id,
        bankCode: '341',
        bankName: 'Itaú',
        agency: '1234',
        account: '12345-6',
        type: 'corrente',
        currentBalance: '45000.00',
      },
    }),
    prisma.bankAccount.create({
      data: {
        clientId: client.id,
        bankCode: '237',
        bankName: 'Bradesco',
        agency: '0001',
        account: '9876-5',
        type: 'corrente',
        currentBalance: '12500.00',
      },
    }),
    prisma.bankAccount.create({
      data: {
        clientId: client.id,
        bankCode: '260',
        bankName: 'Nubank',
        agency: '0001',
        account: '5555555-5',
        type: 'pagamento',
        currentBalance: '8000.00',
      },
    }),
  ]);
  ok(`${banks.length} bancos`);

  // ---- Fornecedores (10) ----
  const supplierData = [
    { name: 'Distribuidora de Carnes Premium LTDA', type: 'cmv', catIdx: 0, notes: 'Carne bovina e suína - entrega 2x/semana' },
    { name: 'Hortifruti São Paulo Ltda', type: 'cmv', catIdx: 2, notes: 'Verduras e legumes - entrega diária' },
    { name: 'Distribuidora Bebidas SP LTDA', type: 'cmv', catIdx: 1, notes: 'Refrigerantes, sucos, cervejas' },
    { name: 'Embalagens Express Ltda', type: 'op', catIdx: 8, notes: 'Caixas, sacolas, copos' },
    { name: 'Liquigás Comercial', type: 'op', catIdx: 8, notes: 'Botijões P45 - 2x/mês' },
    { name: 'Enel Distribuição SP', type: 'op', catIdx: 8, notes: 'Energia elétrica' },
    { name: 'Vivo Empresas', type: 'op', catIdx: 8, notes: 'Internet 500MB + telefonia' },
    { name: 'Contabilidade Silva & Associados', type: 'op', catIdx: 8, notes: 'Honorários contábeis mensais' },
    { name: 'Agência Marketing Digital MX', type: 'op', catIdx: 5, notes: 'Gestão de mídias sociais' },
    { name: 'Manutenção Refrigeração Frio Já', type: 'op', catIdx: 6, notes: 'Manutenção câmaras e freezers' },
  ];
  const suppliers = [];
  for (const s of supplierData) {
    const sup = await prisma.supplier.create({
      data: {
        clientId: client.id,
        name: s.name,
        cnpj: genCnpj(),
        email: `contato@${s.name.split(' ')[0].toLowerCase()}.com.br`,
        phone: `(11) 9${rand(1000, 9999)}-${rand(1000, 9999)}`,
        defaultCategoryId: cats[s.catIdx].id,
        defaultBankAccountId: banks[0].id,
        notes: `${SEED_TAG} ${s.notes}`,
      },
    });
    suppliers.push(sup);
  }
  ok(`${suppliers.length} fornecedores`);

  // ---- Funcionários (5) ----
  const empData = [
    { name: 'Carlos Souza', role: 'Cozinha', salary: '2200.00', isMotoboy: false },
    { name: 'Marina Lima', role: 'Cozinha', salary: '2800.00', isMotoboy: false },
    { name: 'Pedro Almeida', role: 'Salão', salary: '1800.00', isMotoboy: false, commission: '5.00' },
    { name: 'Ana Beatriz Silva', role: 'Salão', salary: '1800.00', isMotoboy: false, commission: '5.00' },
    { name: 'Roberto Mota', role: 'Entrega', salary: '1500.00', isMotoboy: true },
  ];
  const employees = [];
  for (const e of empData) {
    const emp = await prisma.bpoEmployee.create({
      data: {
        clientId: client.id,
        name: e.name,
        cpf: genCpf(),
        email: `${e.name.toLowerCase().replace(/\s+/g, '.')}@burgerbros.com.br`,
        phone: `(11) 9${rand(1000, 9999)}-${rand(1000, 9999)}`,
        role: e.role,
        baseSalary: e.salary,
        commissionPct: e.commission || null,
        isMotoboy: e.isMotoboy,
        isFreelancer: false,
        active: true,
        hiredAt: monthsFromNow(-rand(2, 12)),
      },
    });
    employees.push(emp);
  }
  ok(`${employees.length} funcionarios`);

  // ---- Sócios (2) ----
  const partners = await Promise.all([
    prisma.bpoPartner.create({
      data: {
        clientId: client.id,
        name: 'Bruno Burger',
        cpf: genCpf(),
        email: 'bruno@burgerbros.com.br',
        phone: '(11) 99999-1111',
        prolaboreAmount: '8000.00',
        personalAccountBank: '341',
        personalAccountAgency: '1234',
        personalAccountNumber: '00001-1',
      },
    }),
    prisma.bpoPartner.create({
      data: {
        clientId: client.id,
        name: 'Beatriz Brothers',
        cpf: genCpf(),
        email: 'beatriz@burgerbros.com.br',
        phone: '(11) 99999-2222',
        prolaboreAmount: '8000.00',
        personalAccountBank: '237',
        personalAccountAgency: '0001',
        personalAccountNumber: '00002-2',
      },
    }),
  ]);
  ok(`${partners.length} socios`);

  // ---- Meios de pagamento (6) ----
  const pmData = [
    { name: 'iFood', type: 'marketplace', fee: '27.00', settle: 30 },
    { name: 'Aiqfome', type: 'marketplace', fee: '15.00', settle: 14 },
    { name: 'Crédito (Stone)', type: 'card_credit', fee: '3.20', settle: 30 },
    { name: 'Débito (Stone)', type: 'card_debit', fee: '1.80', settle: 1 },
    { name: 'PIX', type: 'pix', fee: '0.00', settle: 0 },
    { name: 'Dinheiro', type: 'cash', fee: '0.00', settle: 0 },
  ];
  const pms = [];
  for (const p of pmData) {
    pms.push(await prisma.paymentMethod.create({
      data: { clientId: client.id, name: p.name, type: p.type, feePercent: p.fee, settlementDays: p.settle },
    }));
  }
  ok(`${pms.length} meios pagamento`);

  // ---- Payables (30 distribuídos por status) ----
  const payables = [];

  // 10 PAGOS no passado (com PaymentTransaction)
  for (let i = 0; i < 10; i++) {
    const sup = pick(suppliers);
    const amount = money(150, 5000);
    const dueDate = daysFromNow(-rand(5, 90));
    const pay = await prisma.payable.create({
      data: {
        clientId: client.id,
        supplierId: sup.id,
        amount,
        remainingAmount: '0.00',
        dueDate,
        paymentForecast: dueDate,
        emissionDate: new Date(dueDate.getTime() - 7 * 86400000),
        invoiceNumber: `NF-${10000 + i}`,
        description: `${SEED_TAG} Compra historica ${i + 1}`,
        categoryId: sup.defaultCategoryId,
        status: 'paid',
      },
    });
    await prisma.paymentTransaction.create({
      data: {
        payableId: pay.id,
        amount,
        paidAt: dueDate,
        bankAccountId: pick(banks).id,
        notes: `${SEED_TAG} pagamento`,
      },
    });
    payables.push(pay);
  }

  // 8 PENDENTES (vencendo nos próximos 30 dias)
  for (let i = 0; i < 8; i++) {
    const sup = pick(suppliers);
    const amount = money(200, 4500);
    const dueDate = daysFromNow(rand(1, 30));
    const pay = await prisma.payable.create({
      data: {
        clientId: client.id,
        supplierId: sup.id,
        amount,
        remainingAmount: amount,
        dueDate,
        paymentForecast: dueDate,
        invoiceNumber: `NF-${20000 + i}`,
        description: `${SEED_TAG} Conta a vencer ${i + 1}`,
        categoryId: sup.defaultCategoryId,
        status: 'pending',
      },
    });
    payables.push(pay);
  }

  // 5 VENCIDOS (overdue)
  for (let i = 0; i < 5; i++) {
    const sup = pick(suppliers);
    const amount = money(100, 2000);
    const dueDate = daysFromNow(-rand(1, 20));
    const pay = await prisma.payable.create({
      data: {
        clientId: client.id,
        supplierId: sup.id,
        amount,
        remainingAmount: amount,
        dueDate,
        paymentForecast: dueDate,
        invoiceNumber: `NF-${30000 + i}`,
        description: `${SEED_TAG} VENCIDA - urgencia ${i + 1}`,
        categoryId: sup.defaultCategoryId,
        status: 'pending',
      },
    });
    payables.push(pay);
  }

  // 5 AGENDADOS com requiresApproval=true
  for (let i = 0; i < 5; i++) {
    const sup = pick(suppliers);
    const amount = money(500, 8000);
    const dueDate = daysFromNow(rand(3, 15));
    const pay = await prisma.payable.create({
      data: {
        clientId: client.id,
        supplierId: sup.id,
        amount,
        remainingAmount: amount,
        dueDate,
        paymentForecast: dueDate,
        invoiceNumber: `NF-${40000 + i}`,
        description: `${SEED_TAG} Aguardando aprovacao dono ${i + 1}`,
        categoryId: sup.defaultCategoryId,
        status: 'scheduled',
        scheduledAt: dueDate,
        scheduledBankId: banks[0].id,
        scheduledStatus: 'sent',
        requiresApproval: true,
      },
    });
    payables.push(pay);
  }

  // 2 RECORRENTES mensais (12 parcelas cada)
  const recurrenceConfigs = [
    { sup: suppliers[5], amount: '850.00', desc: 'Energia mensal recorrente', cat: cats[8] },
    { sup: suppliers[7], amount: '1200.00', desc: 'Honorarios contabeis mensal', cat: cats[8] },
  ];

  for (const cfg of recurrenceConfigs) {
    const recurrence = await prisma.recurrence.create({
      data: { frequency: 'monthly', intervalCount: 1, startDate: daysFromNow(0), occurrencesCount: 12 },
    });
    let parent = null;
    for (let m = 0; m < 12; m++) {
      const dueDate = monthsFromNow(m);
      const isPast = dueDate < new Date();
      const pay = await prisma.payable.create({
        data: {
          clientId: client.id,
          supplierId: cfg.sup.id,
          amount: cfg.amount,
          remainingAmount: isPast ? '0.00' : cfg.amount,
          dueDate,
          paymentForecast: dueDate,
          invoiceNumber: `REC-${m + 1}`,
          description: `${SEED_TAG} ${cfg.desc} (${m + 1}/12)`,
          categoryId: cfg.cat.id,
          status: isPast ? 'paid' : 'pending',
          recurrenceId: recurrence.id,
          parentId: parent ? parent.id : null,
          installmentNumber: m + 1,
        },
      });
      if (m === 0) parent = pay;
      payables.push(pay);
    }
  }
  ok(`${payables.length} payables`);

  // ---- Receivables (25) ----
  const receivables = [];
  const ifoodPm = pms.find((p) => p.name === 'iFood');
  const aiqPm = pms.find((p) => p.name === 'Aiqfome');
  const pixPm = pms.find((p) => p.name === 'PIX');

  for (let i = 0; i < 25; i++) {
    const pm = pick([ifoodPm, aiqPm, pixPm, ifoodPm]); // mais ifood
    const amount = money(50, 800);
    const sale = daysFromNow(-rand(0, 60));
    const receipt = new Date(sale.getTime() + pm.settlementDays * 86400000);
    const isPast = receipt < new Date();
    const rec = await prisma.receivable.create({
      data: {
        clientId: client.id,
        payerName: pm.name === 'PIX' ? `Cliente avulso ${i + 1}` : pm.name,
        amount,
        remainingAmount: isPast ? '0.00' : amount,
        dueDate: receipt,
        receiptForecast: receipt,
        emissionDate: sale,
        invoiceNumber: `VND-${50000 + i}`,
        description: `${SEED_TAG} Venda ${pm.name}`,
        categoryId: pm.name === 'iFood' ? cats[10].id : pm.name === 'Aiqfome' ? cats[11].id : cats[9].id,
        paymentMethodId: pm.id,
        status: isPast ? 'received' : 'pending',
      },
    });
    receivables.push(rec);
  }
  ok(`${receivables.length} receivables`);

  // ---- BankTransactions não conciliadas (5 pra testar conciliação) ----
  let txCount = 0;
  for (let i = 0; i < 5; i++) {
    await prisma.bankTransaction.create({
      data: {
        bankAccountId: banks[0].id,
        externalId: `OFX-SEED-${Date.now()}-${i}`,
        amount: money(100, 1500),
        date: daysFromNow(-rand(1, 15)),
        description: `${SEED_TAG} ${pick(['PIX RECEBIDO', 'TED RECEBIDA', 'PAGAMENTO PIX', 'TARIFA BANCARIA', 'COMPRA DEBITO'])}`,
        type: pick(['debit', 'credit']),
        source: 'ofx',
      },
    });
    txCount++;
  }
  ok(`${txCount} bank transactions nao conciliadas`);

  return { name: 'Burger Brothers', hash, id: client.id };
}

// ============================================================================
// SEED CLIENTE 2 — Pizzaria da Esquina (mínimo)
// ============================================================================
async function seedPizzaria() {
  const hash = SEED_HASHES.pizzaria;
  log('Criando Cliente 2: Pizzaria da Esquina...');
  await cleanupClient(hash);

  const client = await prisma.client.create({
    data: {
      name: 'Pizzaria da Esquina',
      hash,
      email: `pizza-${hash.slice(0, 6)}@seed.local`,
      data: defaultClientData('Pizzaria da Esquina', 'Pizzaria'),
      bpoEnabled: true,
      bpoActivatedAt: daysFromNow(-3),
      active: true,
    },
  });

  const cats = [];
  for (const c of [
    { name: 'CMV - Insumos', type: 'despesa', dreGroup: 'cmv', color: '#DC2626' },
    { name: 'Salários', type: 'despesa', dreGroup: 'despesa_op', color: '#3B82F6' },
    { name: 'Aluguel', type: 'despesa', dreGroup: 'despesa_op', color: '#6366F1' },
    { name: 'Outros - Despesa', type: 'despesa', dreGroup: 'outros', color: '#64748B' },
    { name: 'Vendas - Salão', type: 'receita', dreGroup: 'receita', color: '#22C55E' },
  ]) {
    cats.push(await prisma.financialCategory.create({ data: { ...c, clientId: client.id } }));
  }

  const bank = await prisma.bankAccount.create({
    data: {
      clientId: client.id,
      bankCode: '001',
      bankName: 'Banco do Brasil',
      agency: '0001',
      account: '11111-1',
      currentBalance: '3500.00',
    },
  });

  const suppliers = [];
  for (const sName of ['Atacadão Insumos', 'Distribuidora Queijo Mineiro', 'Forno e Cia']) {
    suppliers.push(await prisma.supplier.create({
      data: {
        clientId: client.id,
        name: sName,
        cnpj: genCnpj(),
        defaultCategoryId: cats[0].id,
        defaultBankAccountId: bank.id,
        notes: SEED_TAG,
      },
    }));
  }

  await prisma.bpoEmployee.create({
    data: {
      clientId: client.id,
      name: 'José Pizzaiolo',
      cpf: genCpf(),
      role: 'Cozinha',
      baseSalary: '2500.00',
      hiredAt: daysFromNow(-30),
    },
  });

  await prisma.bpoPartner.create({
    data: {
      clientId: client.id,
      name: 'Antonio Esquina',
      cpf: genCpf(),
      prolaboreAmount: '5000.00',
    },
  });

  // 5 payables variados
  for (let i = 0; i < 5; i++) {
    const sup = pick(suppliers);
    const amount = money(100, 1000);
    const dueDate = daysFromNow(rand(-5, 20));
    await prisma.payable.create({
      data: {
        clientId: client.id,
        supplierId: sup.id,
        amount,
        remainingAmount: amount,
        dueDate,
        paymentForecast: dueDate,
        description: `${SEED_TAG} Conta inicial ${i + 1}`,
        categoryId: cats[0].id,
        status: 'pending',
      },
    });
  }

  // 3 receivables
  for (let i = 0; i < 3; i++) {
    const amount = money(80, 300);
    const date = daysFromNow(-rand(1, 5));
    await prisma.receivable.create({
      data: {
        clientId: client.id,
        payerName: 'Cliente Avulso',
        amount,
        remainingAmount: '0.00',
        dueDate: date,
        receiptForecast: date,
        description: `${SEED_TAG} Venda ${i + 1}`,
        categoryId: cats[4].id,
        status: 'received',
      },
    });
  }

  ok('Pizzaria criada (3 fornecedores, 5 payables, 3 receivables)');
  return { name: 'Pizzaria da Esquina', hash, id: client.id };
}

// ============================================================================
// SEED CLIENTE 3 — Sushi Premium (alto volume)
// ============================================================================
async function seedSushi() {
  const hash = SEED_HASHES.sushi;
  log('Criando Cliente 3: Sushi Premium...');
  await cleanupClient(hash);

  const client = await prisma.client.create({
    data: {
      name: 'Sushi Premium',
      hash,
      email: `sushi-${hash.slice(0, 6)}@seed.local`,
      data: defaultClientData('Sushi Premium', 'Japonês'),
      bpoEnabled: true,
      bpoActivatedAt: monthsFromNow(-12),
      active: true,
    },
  });

  // 15 categorias
  const catData = [
    { name: 'CMV - Peixes', type: 'despesa', dreGroup: 'cmv', color: '#DC2626' },
    { name: 'CMV - Arroz/Algas', type: 'despesa', dreGroup: 'cmv', color: '#F59E0B' },
    { name: 'CMV - Bebidas', type: 'despesa', dreGroup: 'cmv', color: '#84CC16' },
    { name: 'CMV - Embalagens', type: 'despesa', dreGroup: 'cmv', color: '#10B981' },
    { name: 'Salários Cozinha', type: 'despesa', dreGroup: 'despesa_op', color: '#3B82F6' },
    { name: 'Salários Salão', type: 'despesa', dreGroup: 'despesa_op', color: '#6366F1' },
    { name: 'Aluguel + Condomínio', type: 'despesa', dreGroup: 'despesa_op', color: '#8B5CF6' },
    { name: 'Marketing', type: 'despesa', dreGroup: 'despesa_op', color: '#EC4899' },
    { name: 'Manutenção', type: 'despesa', dreGroup: 'despesa_op', color: '#F472B6' },
    { name: 'Impostos', type: 'despesa', dreGroup: 'imposto', color: '#A855F7' },
    { name: 'Pró-labore', type: 'despesa', dreGroup: 'pro_labore', color: '#14B8A6' },
    { name: 'Outros - Despesa', type: 'despesa', dreGroup: 'outros', color: '#64748B' },
    { name: 'Vendas - Salão', type: 'receita', dreGroup: 'receita', color: '#22C55E' },
    { name: 'Vendas - iFood', type: 'receita', dreGroup: 'receita', color: '#EF4444' },
    { name: 'Vendas - Rappi', type: 'receita', dreGroup: 'receita', color: '#F97316' },
  ];
  const cats = [];
  for (const c of catData) {
    cats.push(await prisma.financialCategory.create({ data: { ...c, clientId: client.id } }));
  }

  // 5 bancos
  const bankConfigs = [
    { code: '341', name: 'Itaú', agency: '1234', account: '12345-6', balance: '85000.00' },
    { code: '237', name: 'Bradesco', agency: '0001', account: '9876-5', balance: '32000.00' },
    { code: '001', name: 'Banco do Brasil', agency: '0001', account: '11111-1', balance: '15000.00' },
    { code: '260', name: 'Nubank', agency: '0001', account: '5555-5', balance: '18000.00' },
    { code: '077', name: 'Inter', agency: '0001', account: '7777-7', balance: '22000.00' },
  ];
  const banks = [];
  for (const b of bankConfigs) {
    banks.push(await prisma.bankAccount.create({
      data: {
        clientId: client.id,
        bankCode: b.code,
        bankName: b.name,
        agency: b.agency,
        account: b.account,
        currentBalance: b.balance,
      },
    }));
  }

  // 20 fornecedores
  const supTypes = [
    'Pesca Atacado SP', 'Sushiman Importados', 'Distribuidora Saquê', 'Embalagens Asia', 'Arroz Premium SA',
    'Hortifruti Oriental', 'Bebidas & Cia', 'Liquigás Empresas', 'Enel Distribuição', 'Vivo Empresas',
    'Sabesp Comercial', 'Contabilidade Tanaka', 'Marketing Digital JP', 'Manutenção Sushi', 'Limpeza Total',
    'Uniformes Premium', 'Software ERP Cloud', 'Seguros Empresariais', 'Aluguel Imobiliária', 'Material Limpeza Pro',
  ];
  const suppliers = [];
  for (let i = 0; i < supTypes.length; i++) {
    const sup = await prisma.supplier.create({
      data: {
        clientId: client.id,
        name: `${supTypes[i]} LTDA`,
        cnpj: genCnpj(),
        email: `vendas${i}@${supTypes[i].split(' ')[0].toLowerCase()}.com.br`,
        phone: `(11) 9${rand(1000, 9999)}-${rand(1000, 9999)}`,
        defaultCategoryId: cats[i % 12].id,
        defaultBankAccountId: pick(banks).id,
        notes: SEED_TAG,
      },
    });
    suppliers.push(sup);
  }

  // 12 funcionários
  const empNames = ['Hiroshi Tanaka', 'Yuki Sato', 'Ana Pereira', 'João Cardoso', 'Maria Yamashita',
    'Pedro Oliveira', 'Carla Endo', 'Roberto Silva', 'Letícia Maeda', 'Bruno Santos', 'Camila Inoue', 'Felipe Reis'];
  const roles = ['Cozinha', 'Cozinha', 'Cozinha', 'Cozinha', 'Salão', 'Salão', 'Salão', 'Administrativo', 'Entrega', 'Entrega', 'Entrega', 'Entrega'];
  for (let i = 0; i < empNames.length; i++) {
    await prisma.bpoEmployee.create({
      data: {
        clientId: client.id,
        name: empNames[i],
        cpf: genCpf(),
        role: roles[i],
        baseSalary: roles[i] === 'Cozinha' ? '3200.00' : roles[i] === 'Administrativo' ? '4500.00' : '2000.00',
        commissionPct: roles[i] === 'Salão' ? '5.00' : null,
        isMotoboy: roles[i] === 'Entrega',
        hiredAt: monthsFromNow(-rand(1, 24)),
      },
    });
  }

  // 3 sócios
  for (let i = 0; i < 3; i++) {
    await prisma.bpoPartner.create({
      data: {
        clientId: client.id,
        name: `Sócio Sushi ${i + 1}`,
        cpf: genCpf(),
        prolaboreAmount: '12000.00',
      },
    });
  }

  // 6 meios pagamento
  const pms = await Promise.all([
    prisma.paymentMethod.create({ data: { clientId: client.id, name: 'iFood', type: 'marketplace', feePercent: '27.00', settlementDays: 30 } }),
    prisma.paymentMethod.create({ data: { clientId: client.id, name: 'Rappi', type: 'marketplace', feePercent: '23.00', settlementDays: 14 } }),
    prisma.paymentMethod.create({ data: { clientId: client.id, name: 'Crédito', type: 'card_credit', feePercent: '3.20', settlementDays: 30 } }),
    prisma.paymentMethod.create({ data: { clientId: client.id, name: 'Débito', type: 'card_debit', feePercent: '1.80', settlementDays: 1 } }),
    prisma.paymentMethod.create({ data: { clientId: client.id, name: 'PIX', type: 'pix', feePercent: '0.00', settlementDays: 0 } }),
    prisma.paymentMethod.create({ data: { clientId: client.id, name: 'Dinheiro', type: 'cash', feePercent: '0.00', settlementDays: 0 } }),
  ]);

  // 80 payables
  for (let i = 0; i < 80; i++) {
    const sup = pick(suppliers);
    const amount = money(100, 15000);
    const offset = rand(-90, 30);
    const dueDate = daysFromNow(offset);
    const isPast = offset < -2;
    const pay = await prisma.payable.create({
      data: {
        clientId: client.id,
        supplierId: sup.id,
        amount,
        remainingAmount: isPast ? '0.00' : amount,
        dueDate,
        paymentForecast: dueDate,
        invoiceNumber: `NF-${100000 + i}`,
        description: `${SEED_TAG} Lancamento volume ${i + 1}`,
        categoryId: sup.defaultCategoryId,
        status: isPast ? 'paid' : (offset < 0 ? 'pending' : 'pending'),
      },
    });
    if (isPast) {
      await prisma.paymentTransaction.create({
        data: { payableId: pay.id, amount, paidAt: dueDate, bankAccountId: pick(banks).id },
      });
    }
  }

  // 60 receivables
  for (let i = 0; i < 60; i++) {
    const pm = pick(pms);
    const amount = money(80, 1500);
    const sale = daysFromNow(-rand(0, 90));
    const receipt = new Date(sale.getTime() + pm.settlementDays * 86400000);
    const isPast = receipt < new Date();
    await prisma.receivable.create({
      data: {
        clientId: client.id,
        payerName: pm.name === 'PIX' || pm.name === 'Dinheiro' ? `Cliente ${i + 1}` : pm.name,
        amount,
        remainingAmount: isPast ? '0.00' : amount,
        dueDate: receipt,
        receiptForecast: receipt,
        emissionDate: sale,
        description: `${SEED_TAG} Venda ${pm.name}`,
        categoryId: pm.name.startsWith('Vendas') ? cats[12].id : cats[12].id,
        paymentMethodId: pm.id,
        status: isPast ? 'received' : 'pending',
      },
    });
  }

  // 1 BankTransfer
  await prisma.bankTransfer.create({
    data: {
      clientId: client.id,
      fromAccountId: banks[0].id,
      toAccountId: banks[1].id,
      amount: '5000.00',
      date: daysFromNow(-2),
      description: `${SEED_TAG} Transferencia operacional`,
      fee: '8.50',
    },
  });

  // 3 ReconciliationRule
  await prisma.reconciliationRule.create({
    data: {
      clientId: client.id,
      keyword: 'PESCA ATACADO',
      matchType: 'contains',
      supplierId: suppliers[0].id,
      categoryId: cats[0].id,
    },
  });
  await prisma.reconciliationRule.create({
    data: {
      clientId: client.id,
      keyword: 'IFOOD REPASSE',
      matchType: 'starts',
      payerName: 'iFood',
      categoryId: cats[13].id,
    },
  });
  await prisma.reconciliationRule.create({
    data: {
      clientId: client.id,
      keyword: 'TARIFA',
      matchType: 'contains',
      categoryId: cats[11].id,
    },
  });

  ok('Sushi Premium criado (20 fornec, 80 payables, 60 receivables, 1 transfer, 3 regras)');
  return { name: 'Sushi Premium', hash, id: client.id };
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  const args = process.argv.slice(2);
  const isClean = args.includes('--clean');
  const onlyArg = args.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.split('=')[1] : null;

  log('====================================================');
  log('Seed BPO Financeiro — Breaker');
  log('====================================================');
  log(`DATABASE_URL: ${process.env.DATABASE_URL ? '***configurado***' : 'NAO ENCONTRADO'}`);

  // Sanity check: db reachable?
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    err('Falha ao conectar no Postgres. Verifique:');
    err('  1. Docker rodando? -> docker ps');
    err('  2. Container breakr_local_db ativo na porta 5433?');
    err('  3. server/.env aponta pra postgresql://breakr:breakr_local_pass@localhost:5433/breakr_local');
    err('Erro original:', e.message);
    process.exit(1);
  }

  if (isClean) {
    log('Modo CLEAN: removendo seed sem recriar...');
    await cleanupAll();
    return;
  }

  const created = [];
  if (!only || only === 'burger') created.push(await seedBurger());
  if (!only || only === 'pizzaria') created.push(await seedPizzaria());
  if (!only || only === 'sushi') created.push(await seedSushi());

  log('');
  log('====================================================');
  log('SEED CONCLUIDO');
  log('====================================================');
  for (const c of created) {
    log(`  ${c.name}: hash=${c.hash}`);
    log(`    -> http://localhost:5173/?hash=${c.hash}`);
  }
  log('');
  log('Pra limpar tudo: node scripts/seed-bpo.js --clean');
}

main()
  .catch((e) => {
    err('Erro fatal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
