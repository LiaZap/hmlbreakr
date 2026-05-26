/**
 * seed-italico.js — popula o cliente seed "Itálico | Gastronomia Italiana".
 *
 * Cliente DEMO criado especialmente pra apresentação no evento FISPAL.
 * Estrutura completa: BPO + Dashboard (formData, fichas, insumos,
 * revenue_history, fornecedores italianos reais, payables, receivables).
 *
 * Idempotente: roda quantas vezes precisar; apaga e recria.
 *
 *   node scripts/seed-italico.js
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const HASH = 'seeditalico00000000000';
const NAME = 'Itálico | Gastronomia Italiana';
const CATEGORY = 'Italiana';

// Credenciais de login do cliente demo (FISPAL). Email vai no `client.email`
// e a senha em `client.password` (bcrypt hash, 10 rounds — mesmo padrao do
// resto do sistema). Ambos sao sobrescritos a cada execucao do seed.
const LOGIN_EMAIL = 'giuseppe@italico.com.br';
const LOGIN_PASSWORD = 'italico2026';

const log = (...a) => console.log('[seed-italico]', ...a);
const ok = (...a) => console.log('[seed-italico] OK', ...a);
const err = (...a) => console.error('[seed-italico] ERRO', ...a);

// ── Helpers ────────────────────────────────────────────────────────────────
const brl = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthsFromNow = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d; };
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

function lastMonths(n) {
  const out = []; const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  for (let i = 0; i < n; i++) {
    out.unshift(`${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
    d = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  }
  return out;
}

function dailyRevenueCurrentMonth(totalSoFar) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = now.getDate();
  const days = Math.max(1, today - 1);
  const out = {};
  const perDay = totalSoFar / days;
  for (let day = 1; day <= days; day++) {
    const dow = new Date(year, month - 1, day).getDay();
    const weight = dow === 5 || dow === 6 ? 1.40 : dow === 0 ? 1.20 : 0.85;
    out[`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`] = Math.round(perDay * weight * 100) / 100;
  }
  return out;
}

// Formato ficha técnica consumido pelo dashboard
function ficha(id, name, type, custoInsumos, custoEmbalagem, precoVenda, vendasMes, ingredients) {
  const custoTotal = custoInsumos + custoEmbalagem;
  return {
    id, name, type, progress: 100, insumos: ingredients.length, ingredients,
    custoInsumos: brl(custoInsumos), custoEmbalagem: brl(custoEmbalagem),
    rendimento: '1 porção', custoTotal: brl(custoTotal), precoVenda: brl(precoVenda),
    vendasMes: String(vendasMes), isImported: false, tempoPreparo: '15 min',
    utensilios: '', fotoPrato: null, modoPreparo: [], finalizacao: '',
    lastUpdated: Date.now(),
  };
}

function insumo(id, name, category, unit, price, defaultQty) {
  return {
    id, name, category, defaultQty: String(defaultQty), qty: String(defaultQty),
    netQty: String(defaultQty), grossQty: String(defaultQty), fc: '1.00',
    unit, price: Number(price).toFixed(2).replace('.', ','),
    rendimento: `${defaultQty}${unit}`, custo: brl(price), lastUpdated: Date.now(),
  };
}

function ing(insObj, usageQty, usageUnit) {
  return { ...insObj, purchaseUnit: insObj.unit, originalUnit: insObj.unit, usageUnit, qty: String(usageQty), netQty: String(usageQty), grossQty: String(usageQty), fc: '1.00' };
}

function menuFromFichas(fichas) {
  return fichas.map(f => ({
    name: f.name, category: f.type, sales: parseInt(f.vendasMes, 10) || 0,
    price: parseFloat(f.precoVenda.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.')) || 0,
    cost: parseFloat(f.custoTotal.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.')) || 0,
  }));
}

// ── Cleanup idempotente ────────────────────────────────────────────────────
async function cleanup() {
  const existing = await prisma.client.findUnique({ where: { hash: HASH } });
  if (!existing) return;
  log('Cliente existente — limpando para recriar...');
  const banks = await prisma.bankAccount.findMany({ where: { clientId: existing.id }, select: { id: true } });
  const bankIds = banks.map(b => b.id);
  if (bankIds.length) {
    await prisma.paymentTransaction.deleteMany({ where: { bankAccountId: { in: bankIds } } });
    await prisma.bankTransfer.deleteMany({ where: { OR: [{ fromAccountId: { in: bankIds } }, { toAccountId: { in: bankIds } }] } });
    await prisma.bankTransaction.deleteMany({ where: { bankAccountId: { in: bankIds } } });
  }
  await prisma.client.delete({ where: { id: existing.id } });
  ok('Limpeza concluída');
}

// ── INSUMOS ITALIANOS ──────────────────────────────────────────────────────
function buildInsumos() {
  return {
    espaguete:    insumo('i-ins-1',  'Espaguete (Pasta La Buona)',     'Grãos',       'kg',  16.0, 1000),
    lasanhaMassa: insumo('i-ins-2',  'Massa de Lasanha Fresca',        'Grãos',       'kg',  22.0, 1000),
    penne:        insumo('i-ins-3',  'Penne Rigate',                   'Grãos',       'kg',  15.0, 1000),
    fettuccine:   insumo('i-ins-4',  'Fettuccine Fresco',              'Grãos',       'kg',  24.0, 1000),
    arborio:      insumo('i-ins-5',  'Arroz Arbóreo',                  'Grãos',       'kg',  28.0, 1000),
    tomateSan:    insumo('i-ins-6',  'Tomate San Marzano (lata 400g)', 'Legumes',     'un',   9.5, 1),
    manjericao:   insumo('i-ins-7',  'Manjericão Fresco',              'Temperos',    'kg',  42.0, 1000),
    mussBufala:   insumo('i-ins-8',  'Mussarela de Búfala',            'Laticínios',  'kg',  68.0, 1000),
    parmesao:     insumo('i-ins-9',  'Parmesão Reggiano (24 meses)',   'Laticínios',  'kg', 145.0, 1000),
    mascarpone:   insumo('i-ins-10', 'Mascarpone Italiano',            'Laticínios',  'kg',  82.0, 1000),
    ricota:       insumo('i-ins-11', 'Ricota Fresca',                  'Laticínios',  'kg',  28.0, 1000),
    provolone:    insumo('i-ins-12', 'Provolone Defumado',             'Laticínios',  'kg',  58.0, 1000),
    azeite:       insumo('i-ins-13', 'Azeite Extra Virgem (Olio Carli)','Óleos',      'lt',  72.0, 1000),
    vinhoBranco:  insumo('i-ins-14', 'Vinho Branco Pinot (cozinha)',   'Vinhos',      'lt',  38.0, 1000),
    vinhoChianti: insumo('i-ins-15', 'Vinho Chianti DOCG',             'Vinhos',      'un',  98.0, 1),
    pancetta:     insumo('i-ins-16', 'Pancetta Italiana',              'Proteínas',   'kg',  88.0, 1000),
    bovinoMoido:  insumo('i-ins-17', 'Carne Bovina Moída Premium',     'Proteínas',   'kg',  54.0, 1000),
    ossoBuco:     insumo('i-ins-18', 'Ossobuco Bovino',                'Proteínas',   'kg',  72.0, 1000),
    cebola:       insumo('i-ins-19', 'Cebola Roxa',                    'Legumes',     'kg',   8.5, 1000),
    alho:         insumo('i-ins-20', 'Alho Roxo',                      'Legumes',     'kg',  28.0, 1000),
    funghi:       insumo('i-ins-21', 'Funghi Secchi (porcini)',        'Legumes',     'kg', 320.0, 1000),
    manteiga:     insumo('i-ins-22', 'Manteiga Italiana sem Sal',      'Laticínios',  'kg',  62.0, 1000),
    creme:        insumo('i-ins-23', 'Creme de Leite Fresco',          'Laticínios',  'lt',  18.0, 1000),
    espresso:     insumo('i-ins-24', 'Café Espresso (grãos)',          'Outros',      'kg',  78.0, 1000),
    champanhe:    insumo('i-ins-25', 'Biscoito Champagne (Savoiardi)', 'Grãos',       'kg',  48.0, 1000),
    cacau:        insumo('i-ins-26', 'Cacau em Pó (importado)',        'Outros',      'kg',  86.0, 1000),
    paoItaliano:  insumo('i-ins-27', 'Pão Italiano (Ciabatta)',        'Grãos',       'kg',  18.0, 1000),
    gemas:        insumo('i-ins-28', 'Ovos Caipiras (gema)',           'Proteínas',   'un',   1.2, 1),
    pimentaReino: insumo('i-ins-29', 'Pimenta-do-reino em grão',       'Temperos',    'kg', 165.0, 1000),
    acafrao:      insumo('i-ins-30', 'Açafrão em Pistilo',             'Temperos',    'kg',1850.0, 1000),
  };
}

// ── FICHAS — Pratos Italianos Clássicos ────────────────────────────────────
function buildFichas(ins) {
  return [
    // Pratos principais (massas e risotos)
    ficha('i-f-1', 'Spaghetti alla Carbonara', 'Prato Principal', 7.80, 1.20, 58.0, 380, [
      ing(ins.espaguete, 120, 'gr'), ing(ins.pancetta, 80, 'gr'),
      ing(ins.gemas, 2, 'un'), ing(ins.parmesao, 50, 'gr'),
      ing(ins.pimentaReino, 2, 'gr'),
    ]),
    ficha('i-f-2', 'Lasanha alla Bolognese', 'Prato Principal', 14.20, 1.50, 72.0, 295, [
      ing(ins.lasanhaMassa, 200, 'gr'), ing(ins.bovinoMoido, 150, 'gr'),
      ing(ins.tomateSan, 1, 'un'), ing(ins.mussBufala, 100, 'gr'),
      ing(ins.parmesao, 30, 'gr'), ing(ins.cebola, 30, 'gr'),
    ]),
    ficha('i-f-3', 'Risotto ai Funghi Porcini', 'Prato Principal', 18.40, 1.30, 84.0, 220, [
      ing(ins.arborio, 100, 'gr'), ing(ins.funghi, 30, 'gr'),
      ing(ins.vinhoBranco, 50, 'ml'), ing(ins.manteiga, 30, 'gr'),
      ing(ins.parmesao, 40, 'gr'),
    ]),
    ficha('i-f-4', 'Pizza Margherita D.O.P.', 'Prato Principal', 9.80, 2.00, 52.0, 540, [
      ing(ins.tomateSan, 1, 'un'), ing(ins.mussBufala, 120, 'gr'),
      ing(ins.manjericao, 10, 'gr'), ing(ins.azeite, 15, 'ml'),
    ]),
    ficha('i-f-5', 'Pizza Quattro Formaggi', 'Prato Principal', 13.60, 2.00, 64.0, 310, [
      ing(ins.mussBufala, 80, 'gr'), ing(ins.parmesao, 40, 'gr'),
      ing(ins.provolone, 60, 'gr'), ing(ins.mascarpone, 40, 'gr'),
    ]),
    ficha('i-f-6', 'Fettuccine Alfredo', 'Prato Principal', 8.60, 1.20, 56.0, 285, [
      ing(ins.fettuccine, 120, 'gr'), ing(ins.manteiga, 40, 'gr'),
      ing(ins.creme, 80, 'ml'), ing(ins.parmesao, 60, 'gr'),
    ]),
    ficha('i-f-7', 'Penne all\'Arrabbiata', 'Prato Principal', 5.40, 1.20, 48.0, 240, [
      ing(ins.penne, 120, 'gr'), ing(ins.tomateSan, 1, 'un'),
      ing(ins.alho, 5, 'gr'), ing(ins.pimentaReino, 2, 'gr'),
      ing(ins.azeite, 15, 'ml'),
    ]),
    ficha('i-f-8', 'Tagliatelle al Ragù', 'Prato Principal', 11.20, 1.30, 62.0, 195, [
      ing(ins.fettuccine, 120, 'gr'), ing(ins.bovinoMoido, 100, 'gr'),
      ing(ins.tomateSan, 1, 'un'), ing(ins.cebola, 20, 'gr'),
      ing(ins.parmesao, 30, 'gr'),
    ]),
    ficha('i-f-9', 'Osso Buco com Risotto Milanese', 'Prato Principal', 32.50, 1.80, 128.0, 95, [
      ing(ins.ossoBuco, 350, 'gr'), ing(ins.cebola, 50, 'gr'),
      ing(ins.vinhoBranco, 100, 'ml'), ing(ins.arborio, 100, 'gr'),
      ing(ins.acafrao, 0.2, 'gr'), ing(ins.manteiga, 25, 'gr'),
    ]),
    // Entradas
    ficha('i-f-10', 'Bruschetta al Pomodoro (4un)', 'Entrada', 4.20, 0.60, 28.0, 410, [
      ing(ins.paoItaliano, 80, 'gr'), ing(ins.tomateSan, 1, 'un'),
      ing(ins.manjericao, 5, 'gr'), ing(ins.azeite, 10, 'ml'),
      ing(ins.alho, 3, 'gr'),
    ]),
    ficha('i-f-11', 'Burrata con Prosciutto', 'Entrada', 18.80, 0.60, 64.0, 165, [
      ing(ins.mussBufala, 150, 'gr'), ing(ins.pancetta, 60, 'gr'),
      ing(ins.azeite, 10, 'ml'), ing(ins.paoItaliano, 50, 'gr'),
    ]),
    // Sobremesas
    ficha('i-f-12', 'Tiramisù della Casa', 'Sobremesa', 7.60, 0.80, 32.0, 320, [
      ing(ins.champanhe, 50, 'gr'), ing(ins.espresso, 5, 'gr'),
      ing(ins.mascarpone, 80, 'gr'), ing(ins.gemas, 1, 'un'),
      ing(ins.cacau, 5, 'gr'),
    ]),
    ficha('i-f-13', 'Panna Cotta com Frutas Vermelhas', 'Sobremesa', 4.80, 0.80, 26.0, 180, [
      ing(ins.creme, 150, 'ml'), ing(ins.manteiga, 10, 'gr'),
    ]),
    // Drinks
    ficha('i-f-14', 'Espresso Italiano', 'Drinks, Coquetéis e Sucos', 1.40, 0.0, 9.0, 680, [
      ing(ins.espresso, 8, 'gr'),
    ]),
    ficha('i-f-15', 'Taça Chianti DOCG', 'Drinks, Coquetéis e Sucos', 19.60, 0.0, 48.0, 220, [
      ing(ins.vinhoChianti, 0.2, 'un'),
    ]),
  ];
}

// ── formData do Onboarding (16 steps) ──────────────────────────────────────
function buildFormData() {
  const revenues = [218000, 232000, 245000, 251000, 268000, 284000];
  const monthLabels = lastMonths(6);
  return {
    onboarding_completed: true,
    user_info: { user_name: 'Giuseppe Ferraro', user_phone: '(11) 99988-7766' },
    identity: {
      restaurant_name: NAME,
      cuisine_type: 'Italiana',
      tax_regime: 'Lucro Presumido',
      is_mei: 'Não',
    },
    partners: [
      { name: 'Giuseppe Ferraro', role: 'Chef Executivo / Sócio', pro_labore: 'R$ 12.000,00' },
      { name: 'Sofia Bianchi',    role: 'Diretora Operacional', pro_labore: 'R$ 10.000,00' },
    ],
    employees: [
      { name: 'Marco Rossi',     role: 'Sous Chef',      base_salary: 'R$ 4.200,00', premio: 'R$ 400,00', regime: 'CLT', transport_value: 'R$ 9,20', transport_qty: '2', work_days: '24', food_cost: 'R$ 15,00' },
      { name: 'Luca Esposito',   role: 'Cozinheiro',     base_salary: 'R$ 2.800,00', premio: 'R$ 200,00', regime: 'CLT', transport_value: 'R$ 9,20', transport_qty: '2', work_days: '24', food_cost: 'R$ 15,00' },
      { name: 'Anna Romano',     role: 'Maître',         base_salary: 'R$ 3.500,00', premio: 'R$ 500,00', regime: 'CLT', transport_value: 'R$ 9,20', transport_qty: '2', work_days: '24', food_cost: 'R$ 15,00' },
      { name: 'Paolo Conti',     role: 'Garçom Sênior',  base_salary: 'R$ 2.200,00', premio: 'R$ 0,00',   regime: 'CLT', transport_value: 'R$ 9,20', transport_qty: '2', work_days: '24', food_cost: 'R$ 15,00' },
      { name: 'Carla Moretti',   role: 'Garçonete',      base_salary: 'R$ 2.200,00', premio: 'R$ 0,00',   regime: 'CLT', transport_value: 'R$ 9,20', transport_qty: '2', work_days: '24', food_cost: 'R$ 15,00' },
      { name: 'Dario Lombardi',  role: 'Sommelier',      base_salary: 'R$ 3.800,00', premio: 'R$ 600,00', regime: 'CLT', transport_value: 'R$ 9,20', transport_qty: '2', work_days: '24', food_cost: 'R$ 15,00' },
    ],
    location_costs: { rent: 'R$ 14.500,00', iptu_annual: 'R$ 7.200,00' },
    utilities: {
      energy: 'R$ 4.800,00', water: 'R$ 920,00', internet: 'R$ 320,00',
      telefone: 'R$ 180,00', security: 'R$ 280,00', security_guard: 'R$ 0,00',
    },
    recurring_services: { pest_control: 'R$ 180,00', waste_removal: 'R$ 120,00', cleaning_supplies: 'R$ 680,00' },
    operational_fixed: { kitchen_gas: 'R$ 1.420,00', kitchen_oil: 'R$ 880,00', disposables: 'R$ 950,00' },
    monthly_services: [
      { name: 'Manutenção forno a lenha',    value: 'R$ 480,00' },
      { name: 'Curadoria carta de vinhos',   value: 'R$ 350,00' },
      { name: 'Música ambiente (licença)',   value: 'R$ 120,00' },
    ],
    equipment: [
      { name: 'Forno a Lenha Italiano',        value: 'R$ 28.000,00', lifespan: '5' },
      { name: 'Máquina de Massa Industrial',   value: 'R$ 9.500,00',  lifespan: '5' },
      { name: 'Câmara Fria Premium',           value: 'R$ 18.000,00', lifespan: '5' },
      { name: 'Adega Climatizada',             value: 'R$ 12.500,00', lifespan: '5' },
      { name: 'Coifa Industrial',              value: 'R$ 6.800,00',  lifespan: '5' },
    ],
    admin_systems: {
      systems_count: '3 Sistemas',
      software_pdv: 'R$ 480,00',
      accountant: 'R$ 1.800,00',
      card_machine_rent: 'R$ 140,00',
    },
    vehicles: [
      { name: 'Furgão Iveco (Delivery / Eventos)', installment: 'R$ 1.200,00', insurance_annual: 'R$ 4.200,00', ipva_annual: 'R$ 980,00', maintenance_monthly: 'R$ 480,00' },
    ],
    marketing_structure: {
      agency: 'R$ 1.800,00',
      ads_budget: 'R$ 3.500,00',
      ads_platform: 'Instagram / Meta Ads + Google',
      gifts_cost: 'R$ 4,50',
      gifts_qty: '160',
    },
    fees_marketplaces: [
      { provider: 'iFood',  monthly_fee: 'R$ 0,00', commission: '23%', sales_percentage: '24%' },
      { provider: 'Rappi',  monthly_fee: 'R$ 0,00', commission: '20%', sales_percentage: '8%' },
    ],
    fees_cards: [
      { provider: 'Stone', debit_rate: '1,75%', credit_rate: '2,90%' },
    ],
    other_fixed_costs: [
      { name: 'Importação Direta de Insumos (DI)', value: 'R$ 1.200,00' },
      { name: 'Uniformes (chef whites + salão)',   value: 'R$ 380,00' },
    ],
    revenue_history: monthLabels.map((m, i) => ({ month: m, amount: brl(revenues[i]) })),
    daily_revenue: dailyRevenueCurrentMonth(168000),
  };
}

// ── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  log('=========================================================');
  log(`Criando "${NAME}"`);
  log(`Hash: ${HASH}`);
  log('=========================================================');

  await cleanup();

  // Cria o Client com data completo
  const insumos = buildInsumos();
  const fichas = buildFichas(insumos);
  const formData = buildFormData();

  const clientData = {
    restaurant: { name: NAME, logo: null, category: CATEGORY },
    user: { name: 'Giuseppe Ferraro', photo: null, role: 'Proprietário da Conta', initials: 'GF', isOwner: true },
    profile: { name: 'Giuseppe Ferraro', email: 'giuseppe@italico.com.br', phone: '(11) 99988-7766' },
    period: { date: new Date().toLocaleDateString('pt-BR'), status: 'Lucrativo', statusColor: '#E2FD89' },
    overview: { title: NAME, subtitle: 'Cucina italiana autêntica — Demo FISPAL 2026', tags: ['Premium', 'Vinhos', 'Delivery', 'Salão'] },
    onboarding: { completed: true, step: 16 },
    formData,
    operational: {
      fichas,
      insumos: Object.values(insumos),
      categories: {
        insumos: ['Proteínas', 'Grãos', 'Vinhos', 'Molhos', 'Legumes', 'Temperos', 'Óleos', 'Laticínios', 'Insumo Pronto Preparado', 'Outros'],
        fichas: ['Prato Principal', 'Entrada', 'Sobremesa', 'Drinks, Coquetéis e Sucos', 'Acompanhamento'],
      },
    },
    menuEngineering: menuFromFichas(fichas),
  };

  const passwordHash = await bcrypt.hash(LOGIN_PASSWORD, 10);
  const client = await prisma.client.create({
    data: {
      name: NAME,
      hash: HASH,
      email: LOGIN_EMAIL,
      password: passwordHash,
      data: JSON.stringify(clientData),
      bpoEnabled: true,
      bpoActivatedAt: monthsFromNow(-8),
      active: true,
    },
  });
  ok('Client criado:', client.id);
  ok(`Login: ${LOGIN_EMAIL} / senha "${LOGIN_PASSWORD}"`);

  // ── Categorias financeiras ────────────────────────────────────────────
  const catData = [
    { name: 'CMV - Massas',          dreGroup: 'cmv',        color: '#DC2626', type: 'despesa' },
    { name: 'CMV - Carnes',          dreGroup: 'cmv',        color: '#F59E0B', type: 'despesa' },
    { name: 'CMV - Queijos',         dreGroup: 'cmv',        color: '#84CC16', type: 'despesa' },
    { name: 'CMV - Vinhos/Bebidas',  dreGroup: 'cmv',        color: '#7C3AED', type: 'despesa' },
    { name: 'CMV - Hortifruti',      dreGroup: 'cmv',        color: '#22C55E', type: 'despesa' },
    { name: 'Salários',              dreGroup: 'despesa_op', color: '#3B82F6', type: 'despesa' },
    { name: 'Aluguel',               dreGroup: 'despesa_op', color: '#6366F1', type: 'despesa' },
    { name: 'Energia/Água',          dreGroup: 'despesa_op', color: '#0EA5E9', type: 'despesa' },
    { name: 'Marketing',             dreGroup: 'despesa_op', color: '#EC4899', type: 'despesa' },
    { name: 'Manutenção',            dreGroup: 'despesa_op', color: '#8B5CF6', type: 'despesa' },
    { name: 'Impostos',              dreGroup: 'imposto',    color: '#A855F7', type: 'despesa' },
    { name: 'Vendas - Salão',        dreGroup: 'receita',    color: '#22C55E', type: 'receita' },
    { name: 'Vendas - iFood',        dreGroup: 'receita',    color: '#EF4444', type: 'receita' },
    { name: 'Vendas - Reservas',     dreGroup: 'receita',    color: '#F97316', type: 'receita' },
  ];
  const cats = [];
  for (const c of catData) cats.push(await prisma.financialCategory.create({ data: { ...c, clientId: client.id } }));
  ok(`${cats.length} categorias`);

  // ── Bancos (4) — campo CORRETO: type (não accountType), sem initialBalance ─
  const banks = await Promise.all([
    prisma.bankAccount.create({ data: { clientId: client.id, bankCode: '341', bankName: 'Itaú',           agency: '0457', account: '98765-4', type: 'corrente', currentBalance: 42180.00, isManual: true } }),
    prisma.bankAccount.create({ data: { clientId: client.id, bankCode: '001', bankName: 'Banco do Brasil', agency: '1234', account: '11122-3', type: 'corrente', currentBalance: 19450.00, isManual: true } }),
    prisma.bankAccount.create({ data: { clientId: client.id, bankCode: '237', bankName: 'Bradesco',       agency: '0892', account: '44455-6', type: 'corrente', currentBalance: 23890.00, isManual: true } }),
    prisma.bankAccount.create({ data: { clientId: client.id, bankCode: '260', bankName: 'Nubank PJ',      agency: '0001', account: '77788-9', type: 'corrente', currentBalance: 9120.00,  isManual: true } }),
  ]);
  ok(`${banks.length} contas bancárias — saldo total R$ ${(42180+19450+23890+9120).toLocaleString('pt-BR')}`);

  // ── Fornecedores (12 italianos) — campo CORRETO: cnpj (não document) ────
  const supData = [
    { name: 'Pasta La Buona Importadora',   cnpj: '12.345.678/0001-90', email: 'comercial@pastalabuona.com.br', phone: '(11) 3344-5566', defaultCat: 'CMV - Massas' },
    { name: 'La Latteria Italiana Ltda',    cnpj: '23.456.789/0001-01', defaultCat: 'CMV - Queijos' },
    { name: 'Olio Carli Brasil',            cnpj: '34.567.890/0001-12', defaultCat: 'CMV - Massas' },
    { name: 'Vinhos Toscana Imports',       cnpj: '45.678.901/0001-23', defaultCat: 'CMV - Vinhos/Bebidas' },
    { name: 'Frigorífico Bovino Premium',   cnpj: '56.789.012/0001-34', defaultCat: 'CMV - Carnes' },
    { name: 'Hortifruti San Marzano',       cnpj: '67.890.123/0001-45', defaultCat: 'CMV - Hortifruti' },
    { name: 'Embalagens Bella Casa',        cnpj: '78.901.234/0001-56' },
    { name: 'Enel Distribuição SP',         cnpj: '61.695.227/0001-93', defaultCat: 'Energia/Água' },
    { name: 'Sabesp',                       cnpj: '43.776.517/0001-80', defaultCat: 'Energia/Água' },
    { name: 'Vivo Empresas',                cnpj: '02.558.157/0001-62' },
    { name: 'Contabilidade Romano',         cnpj: '89.012.345/0001-67' },
    { name: 'Marketing Digital Forno',      cnpj: '90.123.456/0001-78', defaultCat: 'Marketing' },
  ];
  const sups = [];
  for (const s of supData) {
    const cat = s.defaultCat ? cats.find(c => c.name === s.defaultCat) : null;
    const { defaultCat, ...rest } = s;
    sups.push(await prisma.supplier.create({ data: { ...rest, clientId: client.id, defaultCategoryId: cat?.id || null } }));
  }
  ok(`${sups.length} fornecedores`);

  // ── Meios de pagamento — campo CORRETO: feePercent (não feeRate) ─────
  // Limpa antes — o onboardingSync pode ter rodado e criado duplicatas
  await prisma.paymentMethod.deleteMany({ where: { clientId: client.id } });
  const pms = await Promise.all([
    prisma.paymentMethod.create({ data: { clientId: client.id, name: 'Cartão Crédito', type: 'card_credit', feePercent: 2.90, settlementDays: 30 } }),
    prisma.paymentMethod.create({ data: { clientId: client.id, name: 'Cartão Débito',  type: 'card_debit',  feePercent: 1.75, settlementDays: 1  } }),
    prisma.paymentMethod.create({ data: { clientId: client.id, name: 'PIX',            type: 'pix',         feePercent: 0.00, settlementDays: 0  } }),
    prisma.paymentMethod.create({ data: { clientId: client.id, name: 'Dinheiro',       type: 'cash',        feePercent: 0.00, settlementDays: 0  } }),
    prisma.paymentMethod.create({ data: { clientId: client.id, name: 'iFood',          type: 'marketplace', feePercent: 23.00, settlementDays: 14 } }),
    prisma.paymentMethod.create({ data: { clientId: client.id, name: 'Rappi',          type: 'marketplace', feePercent: 20.00, settlementDays: 14 } }),
  ]);
  ok(`${pms.length} meios de pagamento`);

  // ── Funcionários BPO (espelham formData.employees) — onboardingSync
  //    pode ter criado a partir do formData; limpamos e recriamos.
  await prisma.bpoEmployee.deleteMany({ where: { clientId: client.id } });
  const empData = [
    { name: 'Marco Rossi',    role: 'Sous Chef',  baseSalary: 4200, cpf: '111.222.333-44' },
    { name: 'Luca Esposito',  role: 'Cozinheiro', baseSalary: 2800, cpf: '222.333.444-55' },
    { name: 'Anna Romano',    role: 'Maître',     baseSalary: 3500, cpf: '333.444.555-66' },
    { name: 'Paolo Conti',    role: 'Garçom',     baseSalary: 2200, cpf: '444.555.666-77' },
    { name: 'Carla Moretti',  role: 'Garçonete',  baseSalary: 2200, cpf: '555.666.777-88' },
    { name: 'Dario Lombardi', role: 'Sommelier',  baseSalary: 3800, cpf: '666.777.888-99' },
  ];
  for (const e of empData) await prisma.bpoEmployee.create({ data: { ...e, clientId: client.id } });
  ok(`${empData.length} funcionários`);

  // ── Sócios BPO — campo CORRETO: prolaboreAmount (sem equityPct) ──────
  await prisma.bpoPartner.deleteMany({ where: { clientId: client.id } });
  await prisma.bpoPartner.create({ data: { clientId: client.id, name: 'Giuseppe Ferraro', cpf: '777.888.999-00', prolaboreAmount: 12000 } });
  await prisma.bpoPartner.create({ data: { clientId: client.id, name: 'Sofia Bianchi',    cpf: '888.999.000-11', prolaboreAmount: 10000 } });
  ok('2 sócios');

  // ── Payables (30 — passado/presente/futuro) ──────────────────────────
  const findCat = (n) => cats.find(c => c.name === n);
  const findSup = (n) => sups.find(s => s.name === n);
  const samplePayables = [
    // Pagos (passado)
    { description: 'Pasta + Massas (semanal)',  amount: 4200, status: 'paid',      dueDays: -25, supplier: 'Pasta La Buona Importadora',  category: 'CMV - Massas' },
    { description: 'Queijos importados',        amount: 8800, status: 'paid',      dueDays: -22, supplier: 'La Latteria Italiana Ltda',   category: 'CMV - Queijos' },
    { description: 'Azeites e óleos',           amount: 3600, status: 'paid',      dueDays: -20, supplier: 'Olio Carli Brasil',           category: 'CMV - Massas' },
    { description: 'Vinhos Toscanos (caixa)',  amount: 12500, status: 'paid',      dueDays: -18, supplier: 'Vinhos Toscana Imports',      category: 'CMV - Vinhos/Bebidas' },
    { description: 'Carnes premium',           amount: 6200, status: 'paid',      dueDays: -15, supplier: 'Frigorífico Bovino Premium',  category: 'CMV - Carnes' },
    { description: 'Hortifruti semanal',       amount: 2800, status: 'paid',      dueDays: -12, supplier: 'Hortifruti San Marzano',      category: 'CMV - Hortifruti' },
    { description: 'Energia mensal',           amount: 4800, status: 'paid',      dueDays: -10, supplier: 'Enel Distribuição SP',         category: 'Energia/Água' },
    { description: 'Água/Esgoto',              amount: 920,  status: 'paid',      dueDays: -10, supplier: 'Sabesp',                       category: 'Energia/Água' },
    { description: 'Telefone/Internet',        amount: 500,  status: 'paid',      dueDays: -8,  supplier: 'Vivo Empresas',                category: 'Energia/Água' },
    { description: 'Honorários contábeis',     amount: 1800, status: 'paid',      dueDays: -5,  supplier: 'Contabilidade Romano',         category: 'Manutenção' },
    // Pendentes (futuro próximo)
    { description: 'Massas (nova entrega)',    amount: 4350, status: 'pending',   dueDays: 2,   supplier: 'Pasta La Buona Importadora',  category: 'CMV - Massas' },
    { description: 'Queijos (reposição)',      amount: 7900, status: 'pending',   dueDays: 4,   supplier: 'La Latteria Italiana Ltda',   category: 'CMV - Queijos' },
    { description: 'Hortifruti semanal',       amount: 2950, status: 'pending',   dueDays: 5,   supplier: 'Hortifruti San Marzano',      category: 'CMV - Hortifruti' },
    { description: 'Carnes (3 entregas)',     amount: 18800, status: 'pending',   dueDays: 7,   supplier: 'Frigorífico Bovino Premium',  category: 'CMV - Carnes' },
    { description: 'Vinhos (rev. da carta)',  amount: 15400, status: 'pending',   dueDays: 10,  supplier: 'Vinhos Toscana Imports',      category: 'CMV - Vinhos/Bebidas' },
    { description: 'Energia mensal',           amount: 5100, status: 'pending',   dueDays: 12,  supplier: 'Enel Distribuição SP',         category: 'Energia/Água' },
    { description: 'Marketing Instagram Ads', amount: 3500, status: 'pending',   dueDays: 15,  supplier: 'Marketing Digital Forno',      category: 'Marketing' },
    { description: 'Embalagens delivery',      amount: 1850, status: 'pending',   dueDays: 18,  supplier: 'Embalagens Bella Casa',        category: 'Manutenção' },
    // Agendados / aguardando aprovação
    { description: 'Vinhos exclusivos (alta)',amount: 28000, status: 'pending',   dueDays: 20,  supplier: 'Vinhos Toscana Imports',      category: 'CMV - Vinhos/Bebidas', scheduledStatus: 'pending_approval' },
    { description: 'Manutenção forno a lenha',amount: 1480, status: 'pending',   dueDays: 22,  supplier: 'Contabilidade Romano',         category: 'Manutenção',           scheduledStatus: 'pending_approval' },
    // Vencidos (past_due)
    { description: 'Honorários (fechamento)', amount: 950,  status: 'pending',   dueDays: -3,  supplier: 'Contabilidade Romano',         category: 'Manutenção' },
    { description: 'Marketing (campanha)',    amount: 1200, status: 'pending',   dueDays: -7,  supplier: 'Marketing Digital Forno',      category: 'Marketing' },
  ];

  let paidCount = 0;
  for (const p of samplePayables) {
    const sup = findSup(p.supplier);
    const cat = findCat(p.category);
    const dueDate = daysFromNow(p.dueDays);
    const payable = await prisma.payable.create({
      data: {
        clientId: client.id,
        supplierId: sup?.id || null,
        categoryId: cat?.id || null,
        description: p.description,
        amount: p.amount,
        remainingAmount: p.status === 'paid' ? 0 : p.amount,
        dueDate, paymentForecast: dueDate,
        status: p.status,
        scheduledStatus: p.scheduledStatus || null,
        scheduledAt: p.scheduledStatus ? new Date() : null,
      },
    });
    // Pra payables 'paid', cria PaymentTransaction ligando ao Itaú (banco 0)
    // — assim aparece histórico de movimentação no dashboard.
    if (p.status === 'paid') {
      await prisma.paymentTransaction.create({
        data: {
          payableId: payable.id,
          bankAccountId: banks[0].id,
          amount: p.amount,
          paidAt: dueDate,
          notes: `Pagamento de "${p.description}"`,
        },
      });
      paidCount++;
    }
  }
  ok(`${samplePayables.length} contas a pagar (${paidCount} com PaymentTransaction)`);

  // ── Receivables (20) ─────────────────────────────────────────────────
  const sampleReceivables = [
    { payer: 'iFood Repasses (semana)',  amount: 42000, status: 'received',  dueDays: -3,  category: 'Vendas - iFood' },
    { payer: 'iFood Repasses',           amount: 38500, status: 'received',  dueDays: -10, category: 'Vendas - iFood' },
    { payer: 'iFood Repasses',           amount: 41200, status: 'received',  dueDays: -17, category: 'Vendas - iFood' },
    { payer: 'Stone (D+30 cartão)',      amount: 32000, status: 'received',  dueDays: -8,  category: 'Vendas - Salão' },
    { payer: 'Stone (D+30 cartão)',      amount: 28500, status: 'received',  dueDays: -15, category: 'Vendas - Salão' },
    { payer: 'Eventos Privados (Boda)',  amount: 18500, status: 'received',  dueDays: -6,  category: 'Vendas - Reservas' },
    { payer: 'Reserva Confraternização', amount: 8200,  status: 'received',  dueDays: -12, category: 'Vendas - Reservas' },
    { payer: 'iFood (próximo repasse)',  amount: 39800, status: 'pending',   dueDays: 4,   category: 'Vendas - iFood' },
    { payer: 'Stone (cartão próx mês)',  amount: 35000, status: 'pending',   dueDays: 18,  category: 'Vendas - Salão' },
    { payer: 'Evento Empresarial XYZ',   amount: 24500, status: 'pending',   dueDays: 15,  category: 'Vendas - Reservas' },
    { payer: 'Reserva Aniversário',      amount: 6800,  status: 'pending',   dueDays: 20,  category: 'Vendas - Reservas' },
    { payer: 'iFood Repasses (futuro)',  amount: 40500, status: 'pending',   dueDays: 11,  category: 'Vendas - iFood' },
  ];

  let recvCount = 0;
  for (const r of sampleReceivables) {
    const cat = findCat(r.category);
    const dueDate = daysFromNow(r.dueDays);
    const receivable = await prisma.receivable.create({
      data: {
        clientId: client.id,
        categoryId: cat?.id || null,
        payerName: r.payer,
        description: `Recebível: ${r.payer}`,
        amount: r.amount,
        remainingAmount: r.status === 'received' ? 0 : r.amount,
        dueDate, receiptForecast: dueDate,
        status: r.status,
      },
    });
    if (r.status === 'received') {
      // Distribui recebidos entre os 4 bancos pra variar saldo
      const bankIdx = recvCount % banks.length;
      await prisma.paymentTransaction.create({
        data: {
          receivableId: receivable.id,
          bankAccountId: banks[bankIdx].id,
          amount: r.amount,
          paidAt: dueDate,
          notes: `Recebimento de "${r.payer}"`,
        },
      });
      recvCount++;
    }
  }
  ok(`${sampleReceivables.length} contas a receber (${recvCount} com PaymentTransaction)`);

  // ── BankTransactions (movimentações da semana) ───────────────────────
  // Distribui 12 transações nos últimos 7 dias para popular o widget
  // "Movimentações da semana" do dashboard.
  const bankTxs = [
    { bank: 0, type: 'debit',  amount: 4200,  desc: 'PASTA LA BUONA - Massas',         dayOff: -1 },
    { bank: 0, type: 'debit',  amount: 8800,  desc: 'LATTERIA ITALIANA - Queijos',     dayOff: -2 },
    { bank: 1, type: 'credit', amount: 42000, desc: 'IFOOD REPASSE SEMANAL',           dayOff: -3 },
    { bank: 2, type: 'debit',  amount: 1800,  desc: 'CONTABILIDADE ROMANO',            dayOff: -3 },
    { bank: 0, type: 'credit', amount: 32000, desc: 'STONE CARTAO - LIQUIDACAO',       dayOff: -4 },
    { bank: 3, type: 'debit',  amount: 320,   desc: 'VIVO EMPRESAS - INTERNET',        dayOff: -4 },
    { bank: 0, type: 'debit',  amount: 4800,  desc: 'ENEL ENERGIA - CONTA MENSAL',     dayOff: -5 },
    { bank: 1, type: 'credit', amount: 8200,  desc: 'PIX RESERVA CONFRATERNIZACAO',    dayOff: -5 },
    { bank: 0, type: 'debit',  amount: 2800,  desc: 'HORTIFRUTI SAN MARZANO',          dayOff: -6 },
    { bank: 2, type: 'credit', amount: 18500, desc: 'PIX EVENTOS BODA',                dayOff: -6 },
    { bank: 0, type: 'debit',  amount: 6200,  desc: 'FRIGORIFICO BOVINO PREMIUM',      dayOff: -6 },
    { bank: 3, type: 'debit',  amount: 920,   desc: 'SABESP - AGUA',                   dayOff: -7 },
  ];
  for (const t of bankTxs) {
    await prisma.bankTransaction.create({
      data: {
        bankAccountId: banks[t.bank].id,
        amount: t.amount,
        type: t.type,
        description: t.desc,
        date: daysFromNow(t.dayOff),
        source: 'manual',
      },
    });
  }
  ok(`${bankTxs.length} movimentações bancárias (últimos 7 dias)`);

  log('');
  log('=========================================================');
  log(`SEED ITÁLICO CONCLUÍDO`);
  log(`Acessar via hash: http://localhost:5173/?hash=${HASH}`);
  log(`Login email/senha: ${LOGIN_EMAIL} / ${LOGIN_PASSWORD}`);
  log('=========================================================');
}

main()
  .catch(e => { err('Erro fatal:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
