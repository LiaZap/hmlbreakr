/**
 * seed-dashboard.js — Popula o Client.data (JSON) dos 3 clientes seed
 *
 * O seed-bpo.js cria os clientes mas deixa o Client.data praticamente vazio
 * (formData {}), então os dashboards (CMV, BASE, Ponto de Equilíbrio,
 * Dinheiro na Mesa, Engenharia de Menu, Simulador de Precificação) aparecem
 * zerados. Este script monta um dataset COMPLETO e COERENTE por restaurante.
 *
 * A estrutura segue exatamente o que o DashboardContext.jsx consome:
 *   - formData.<step>           — field IDs de src/data/onboardingQuestions.js
 *   - formData.revenue_history  — Array de { month: "MM/AAAA", amount }
 *   - formData.daily_revenue    — { "YYYY-MM-DD": valor } (mês corrente)
 *   - operational.fichas        — fichas técnicas { custoTotal, precoVenda, vendasMes, ... }
 *   - operational.insumos       — insumos { name, category, unit, price, ... }
 *   - operational.categories    — { insumos: [...], fichas: [...] }
 *   - menuEngineering           — itens vendáveis { name, category, sales, price, cost }
 *
 * Uso:
 *   node scripts/seed-dashboard.js                    # popula os 3
 *   node scripts/seed-dashboard.js --only=burger      # só 1
 *
 * Idempotente: sobrescreve o Client.data dos clientes seed a cada execução.
 */

const { db, pool } = require('../src/db/client');
const t = require('../src/db/schema-bpo');
const { eq, sql } = require('drizzle-orm');

// ============================================================================
// Hashes FIXOS (mesmos do seed-bpo.js)
// ============================================================================
const SEED_HASHES = {
  burger: 'seedburgerbros000000000',
  pizzaria: 'seedpizzariaesq00000000',
  sushi: 'seedsushiprem0000000000',
};

// ============================================================================
// Helpers
// ============================================================================
function log(...args) { console.log('[seed-dash]', ...args); }
function ok(...args) { console.log('[seed-dash] OK', ...args); }
function err(...args) { console.error('[seed-dash] ERRO', ...args); }

// "R$ 1.234,56" no padrão pt-BR usado em todo o dashboard
function brl(value) {
  return `R$ ${Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Gera os últimos N meses no formato "MM/AAAA" terminando no mês PASSADO
function lastMonths(n) {
  const out = [];
  const now = new Date();
  // começa no mês passado
  let d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  for (let i = 0; i < n; i++) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    out.unshift(`${mm}/${d.getFullYear()}`);
    d = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  }
  return out; // cronológico (mais antigo -> mais recente)
}

// Lançamentos diários do mês corrente: distribui `total` entre os dias 1..hoje-1
function dailyRevenueCurrentMonth(totalSoFar) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = now.getDate();
  const days = Math.max(1, today - 1); // não lança o dia de hoje (mês em curso)
  const out = {};
  const perDay = totalSoFar / days;
  for (let day = 1; day <= days; day++) {
    // pequena variação por dia (fim de semana rende mais)
    const dow = new Date(year, month - 1, day).getDay();
    const weight = dow === 5 || dow === 6 ? 1.35 : dow === 0 ? 1.15 : 0.88;
    const dd = String(day).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    out[`${year}-${mm}-${dd}`] = Math.round(perDay * weight * 100) / 100;
  }
  return out;
}

// Constrói uma ficha técnica no formato exato consumido pelo dashboard.
// custoInsumos + custoEmbalagem = custoTotal. CMV% = custoTotal / precoVenda.
function ficha(id, name, type, custoInsumos, custoEmbalagem, precoVenda, vendasMes, ingredients) {
  const custoTotal = custoInsumos + custoEmbalagem;
  return {
    id: String(id),
    name,
    type,
    progress: 100,
    insumos: ingredients.length,
    ingredients,
    custoInsumos: brl(custoInsumos),
    custoEmbalagem: brl(custoEmbalagem),
    rendimento: '1 porção',
    custoTotal: brl(custoTotal),
    precoVenda: brl(precoVenda),
    vendasMes: String(vendasMes),
    isImported: false,
    tempoPreparo: '10 min',
    utensilios: '',
    fotoPrato: null,
    modoPreparo: [],
    finalizacao: '',
    lastUpdated: Date.now(),
  };
}

// Insumo no formato consumido por operational.insumos
function insumo(id, name, category, unit, price, defaultQty) {
  return {
    id: String(id),
    name,
    category,
    defaultQty: String(defaultQty),
    qty: String(defaultQty),
    netQty: String(defaultQty),
    grossQty: String(defaultQty),
    fc: '1.00',
    unit,
    price: Number(price).toFixed(2).replace('.', ','),
    rendimento: `${defaultQty}${unit}`,
    custo: brl(price),
    lastUpdated: Date.now(),
  };
}

// ingrediente embutido numa ficha (subset de insumo + uso)
function ing(insObj, usageQty, usageUnit) {
  return {
    ...insObj,
    purchaseUnit: insObj.unit,
    originalUnit: insObj.unit,
    usageUnit,
    qty: String(usageQty),
    netQty: String(usageQty),
    grossQty: String(usageQty),
    fc: '1.00',
  };
}

// menuEngineering: espelha as fichas vendáveis. price/cost numéricos.
function menuFromFichas(fichas) {
  return fichas.map((f) => ({
    name: f.name,
    category: f.type,
    sales: parseInt(f.vendasMes, 10) || 0,
    price: parseFloat(f.precoVenda.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.')) || 0,
    cost: parseFloat(f.custoTotal.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.')) || 0,
  }));
}

// Categorias padrão (espelham initialData do DashboardContext)
const DEFAULT_CATEGORIES = {
  insumos: ['Proteínas', 'Grãos', 'Vinhos', 'Molhos', 'Legumes', 'Temperos', 'Óleos', 'Laticínios', 'Insumo Pronto Preparado', 'Outros'],
  fichas: ['Prato Principal', 'Entrada', 'Sobremesa', 'Drinks, Coquetéis e Sucos', 'Acompanhamento'],
};

// ============================================================================
// DATASET 1 — Burger Brothers (Hamburgueria, operação madura)
// ============================================================================
function buildBurger() {
  const name = 'Burger Brothers';

  // ---- Insumos ----
  const ins = {
    blend: insumo('b-ins-1', 'Blend Bovino 180g', 'Proteínas', 'kg', 38.0, 1000),
    pao: insumo('b-ins-2', 'Pão Brioche', 'Grãos', 'un', 1.8, 1),
    queijo: insumo('b-ins-3', 'Queijo Cheddar Fatiado', 'Laticínios', 'kg', 42.0, 1000),
    bacon: insumo('b-ins-4', 'Bacon Defumado', 'Proteínas', 'kg', 34.0, 1000),
    alface: insumo('b-ins-5', 'Alface Americana', 'Legumes', 'kg', 9.0, 1000),
    tomate: insumo('b-ins-6', 'Tomate', 'Legumes', 'kg', 7.5, 1000),
    cebola: insumo('b-ins-7', 'Cebola Roxa', 'Legumes', 'kg', 6.0, 1000),
    molhoEsp: insumo('b-ins-8', 'Molho Especial da Casa', 'Molhos', 'lt', 28.0, 1000),
    batata: insumo('b-ins-9', 'Batata Pré-Frita', 'Legumes', 'kg', 14.0, 1000),
    frango: insumo('b-ins-10', 'Filé de Frango Empanado', 'Proteínas', 'kg', 26.0, 1000),
    pernil: insumo('b-ins-11', 'Pernil Desfiado', 'Proteínas', 'kg', 29.0, 1000),
    refri: insumo('b-ins-12', 'Refrigerante Lata', 'Outros', 'un', 2.5, 1),
    cerveja: insumo('b-ins-13', 'Cerveja Long Neck', 'Outros', 'un', 4.5, 1),
    sucoNat: insumo('b-ins-14', 'Polpa de Fruta', 'Outros', 'kg', 18.0, 1000),
    oleo: insumo('b-ins-15', 'Óleo de Soja', 'Óleos', 'lt', 8.5, 1000),
    chocolate: insumo('b-ins-16', 'Calda de Chocolate', 'Outros', 'lt', 22.0, 1000),
    sorvete: insumo('b-ins-17', 'Sorvete de Creme', 'Laticínios', 'lt', 19.0, 1000),
    onion: insumo('b-ins-18', 'Cebola Empanada (Onion Rings)', 'Legumes', 'kg', 21.0, 1000),
    cheddarMolho: insumo('b-ins-19', 'Cheddar Cremoso', 'Laticínios', 'lt', 32.0, 1000),
    picles: insumo('b-ins-20', 'Picles', 'Legumes', 'kg', 16.0, 1000),
    embCombo: insumo('b-ins-21', 'Embalagem Combo', 'Outros', 'un', 0.9, 1),
    embCopo: insumo('b-ins-22', 'Copo + Tampa', 'Outros', 'un', 0.5, 1),
  };

  // ---- Fichas (cardápio hamburgueria) ----
  const fichas = [
    ficha('b-f-1', 'Classic Cheeseburger', 'Prato Principal', 6.8, 1.1, 24.9, 420, [
      ing(ins.blend, 180, 'gr'), ing(ins.pao, 1, 'un'), ing(ins.queijo, 40, 'gr'),
      ing(ins.alface, 20, 'gr'), ing(ins.tomate, 30, 'gr'), ing(ins.molhoEsp, 25, 'ml'),
    ]),
    ficha('b-f-2', 'Bacon Brothers Burger', 'Prato Principal', 9.2, 1.1, 32.9, 510, [
      ing(ins.blend, 180, 'gr'), ing(ins.pao, 1, 'un'), ing(ins.queijo, 40, 'gr'),
      ing(ins.bacon, 50, 'gr'), ing(ins.cebola, 25, 'gr'), ing(ins.molhoEsp, 25, 'ml'),
    ]),
    ficha('b-f-3', 'Double Smash', 'Prato Principal', 12.4, 1.1, 38.9, 360, [
      ing(ins.blend, 360, 'gr'), ing(ins.pao, 1, 'un'), ing(ins.queijo, 80, 'gr'),
      ing(ins.cheddarMolho, 30, 'ml'), ing(ins.molhoEsp, 25, 'ml'),
    ]),
    ficha('b-f-4', 'Chicken Crispy Burger', 'Prato Principal', 7.6, 1.1, 27.9, 290, [
      ing(ins.frango, 150, 'gr'), ing(ins.pao, 1, 'un'), ing(ins.alface, 25, 'gr'),
      ing(ins.tomate, 30, 'gr'), ing(ins.molhoEsp, 25, 'ml'),
    ]),
    ficha('b-f-5', 'Pulled Pork Burger', 'Prato Principal', 8.4, 1.1, 29.9, 210, [
      ing(ins.pernil, 140, 'gr'), ing(ins.pao, 1, 'un'), ing(ins.cebola, 25, 'gr'),
      ing(ins.picles, 20, 'gr'),
    ]),
    ficha('b-f-6', 'Veggie Burger', 'Prato Principal', 6.2, 1.1, 25.9, 95, [
      ing(ins.pao, 1, 'un'), ing(ins.alface, 25, 'gr'), ing(ins.tomate, 35, 'gr'),
      ing(ins.cebola, 25, 'gr'), ing(ins.cheddarMolho, 30, 'ml'),
    ]),
    ficha('b-f-7', 'Combo Classic + Fritas + Refri', 'Prato Principal', 10.6, 1.7, 36.9, 380, [
      ing(ins.blend, 180, 'gr'), ing(ins.pao, 1, 'un'), ing(ins.queijo, 40, 'gr'),
      ing(ins.batata, 150, 'gr'), ing(ins.refri, 1, 'un'),
    ]),
    ficha('b-f-8', 'Batata Frita Tradicional', 'Acompanhamento', 2.6, 0.6, 14.9, 640, [
      ing(ins.batata, 200, 'gr'), ing(ins.oleo, 30, 'ml'),
    ]),
    ficha('b-f-9', 'Batata Cheddar Bacon', 'Acompanhamento', 6.4, 0.6, 22.9, 410, [
      ing(ins.batata, 200, 'gr'), ing(ins.cheddarMolho, 60, 'ml'), ing(ins.bacon, 40, 'gr'),
    ]),
    ficha('b-f-10', 'Onion Rings', 'Acompanhamento', 3.8, 0.6, 16.9, 230, [
      ing(ins.onion, 150, 'gr'), ing(ins.oleo, 25, 'ml'),
    ]),
    ficha('b-f-11', 'Nuggets de Frango (8un)', 'Entrada', 4.2, 0.6, 18.9, 180, [
      ing(ins.frango, 160, 'gr'), ing(ins.oleo, 25, 'ml'),
    ]),
    ficha('b-f-12', 'Refrigerante Lata', 'Drinks, Coquetéis e Sucos', 2.5, 0.0, 7.0, 720, [
      ing(ins.refri, 1, 'un'),
    ]),
    ficha('b-f-13', 'Cerveja Long Neck', 'Drinks, Coquetéis e Sucos', 4.5, 0.0, 12.0, 380, [
      ing(ins.cerveja, 1, 'un'),
    ]),
    ficha('b-f-14', 'Suco Natural', 'Drinks, Coquetéis e Sucos', 2.7, 0.5, 11.9, 260, [
      ing(ins.sucoNat, 120, 'gr'),
    ]),
    ficha('b-f-15', 'Milkshake Chocolate', 'Drinks, Coquetéis e Sucos', 4.6, 0.5, 16.9, 310, [
      ing(ins.sorvete, 200, 'ml'), ing(ins.chocolate, 40, 'ml'),
    ]),
    ficha('b-f-16', 'Brownie com Sorvete', 'Sobremesa', 5.1, 0.6, 18.9, 175, [
      ing(ins.sorvete, 100, 'ml'), ing(ins.chocolate, 30, 'ml'),
    ]),
    ficha('b-f-17', 'Combo Bacon + Fritas + Cerveja', 'Prato Principal', 14.8, 1.7, 47.9, 220, [
      ing(ins.blend, 180, 'gr'), ing(ins.bacon, 50, 'gr'), ing(ins.batata, 150, 'gr'),
      ing(ins.cerveja, 1, 'un'),
    ]),
    ficha('b-f-18', 'Hambúrguer Kids', 'Prato Principal', 5.0, 1.0, 17.9, 140, [
      ing(ins.blend, 90, 'gr'), ing(ins.pao, 1, 'un'), ing(ins.queijo, 30, 'gr'),
    ]),
  ];

  const revenues = [98000, 105000, 112000, 118000, 121000, 134000];
  const monthLabels = lastMonths(6);

  return {
    hash: SEED_HASHES.burger,
    name,
    category: 'Hamburgueria',
    data: {
      restaurant: { name, logo: null, category: 'Hamburgueria' },
      user: { name: 'Bruno Burger', photo: null, role: 'Proprietário da Conta', initials: 'BB', isOwner: true },
      profile: { name: 'Bruno Burger', email: 'bruno@burgerbros.com.br', phone: '(11) 99999-1111' },
      period: { date: new Date().toLocaleDateString('pt-BR'), status: 'Lucrativo', statusColor: '#E2FD89' },
      overview: { title: name, subtitle: 'Hamburgueria artesanal — operação madura', tags: ['Delivery', 'Salão'] },
      onboarding: { completed: true, step: 16 },
      formData: {
        onboarding_completed: true,
        user_info: { user_name: 'Bruno Burger', user_phone: '(11) 99999-1111' },
        identity: {
          restaurant_name: name,
          cuisine_type: 'Hamburgueria',
          tax_regime: 'Simples Nacional',
          is_mei: 'Não',
        },
        partners: [
          { name: 'Bruno Burger', role: 'Diretor', pro_labore: 'R$ 8.000,00' },
          { name: 'Beatriz Brothers', role: 'Sócia-Gerente', pro_labore: 'R$ 7.000,00' },
        ],
        employees: [
          { name: 'Carlos Souza', role: 'Cozinha', base_salary: 'R$ 2.400,00', premio: 'R$ 200,00', regime: 'CLT', transport_value: 'R$ 9,20', transport_qty: '2', work_days: '24', food_cost: 'R$ 12,00' },
          { name: 'Marina Lima', role: 'Chapeira', base_salary: 'R$ 2.800,00', premio: 'R$ 300,00', regime: 'CLT', transport_value: 'R$ 9,20', transport_qty: '2', work_days: '24', food_cost: 'R$ 12,00' },
          { name: 'Pedro Almeida', role: 'Atendente', base_salary: 'R$ 1.900,00', premio: 'R$ 0,00', regime: 'CLT', transport_value: 'R$ 9,20', transport_qty: '2', work_days: '24', food_cost: 'R$ 12,00' },
          { name: 'Ana Beatriz Silva', role: 'Atendente', base_salary: 'R$ 1.900,00', premio: 'R$ 0,00', regime: 'CLT', transport_value: 'R$ 9,20', transport_qty: '2', work_days: '24', food_cost: 'R$ 12,00' },
          { name: 'Roberto Mota', role: 'Entregador', base_salary: 'R$ 1.600,00', premio: 'R$ 0,00', regime: 'CLT', transport_value: 'R$ 0,00', transport_qty: '0', work_days: '24', food_cost: 'R$ 12,00' },
        ],
        location_costs: { rent: 'R$ 9.500,00', iptu_annual: 'R$ 4.800,00' },
        utilities: {
          energy: 'R$ 3.200,00', water: 'R$ 680,00', internet: 'R$ 250,00',
          telefone: 'R$ 120,00', security: 'R$ 180,00', security_guard: 'R$ 0,00',
        },
        recurring_services: { pest_control: 'R$ 90,00', waste_removal: 'R$ 60,00', cleaning_supplies: 'R$ 420,00' },
        operational_fixed: { kitchen_gas: 'R$ 880,00', kitchen_oil: 'R$ 540,00', disposables: 'R$ 1.350,00' },
        monthly_services: [
          { name: 'Manutenção de equipamentos', value: 'R$ 350,00' },
          { name: 'Música ambiente (licença)', value: 'R$ 90,00' },
        ],
        equipment: [
          { name: 'Chapa Industrial', value: 'R$ 7.500,00', lifespan: '5' },
          { name: 'Fritadeira Elétrica Dupla', value: 'R$ 4.200,00', lifespan: '5' },
          { name: 'Câmara Fria', value: 'R$ 12.000,00', lifespan: '5' },
          { name: 'Coifa Industrial', value: 'R$ 5.500,00', lifespan: '5' },
        ],
        admin_systems: {
          systems_count: '2 Sistemas',
          software_pdv: 'R$ 320,00',
          accountant: 'R$ 1.100,00',
          card_machine_rent: 'R$ 90,00',
        },
        vehicles: [
          { name: 'Moto Honda CG (Delivery)', installment: 'R$ 480,00', insurance_annual: 'R$ 1.800,00', ipva_annual: 'R$ 380,00', maintenance_monthly: 'R$ 320,00' },
        ],
        marketing_structure: {
          agency: 'R$ 1.200,00',
          ads_budget: 'R$ 2.500,00',
          ads_platform: 'Instagram / Meta Ads',
          gifts_cost: 'R$ 1,50',
          gifts_qty: '120',
        },
        fees_marketplaces: [
          { provider: 'iFood', monthly_fee: 'R$ 0,00', commission: '23%', sales_percentage: '38%' },
          { provider: 'Rappi', monthly_fee: 'R$ 0,00', commission: '20%', sales_percentage: '12%' },
        ],
        fees_cards: [
          { provider: 'Stone', debit_rate: '1,80%', credit_rate: '3,20%' },
        ],
        other_fixed_costs: [
          { name: 'Contabilidade extra (fechamento)', value: 'R$ 250,00' },
          { name: 'Uniformes', value: 'R$ 180,00' },
        ],
        revenue_history: monthLabels.map((m, i) => ({ month: m, amount: brl(revenues[i]) })),
        daily_revenue: dailyRevenueCurrentMonth(72000),
      },
      operational: {
        fichas,
        insumos: Object.values(ins),
        categories: DEFAULT_CATEGORIES,
      },
      menuEngineering: menuFromFichas(fichas),
    },
  };
}

// ============================================================================
// DATASET 2 — Pizzaria da Esquina (Pizzaria)
// ============================================================================
function buildPizzaria() {
  const name = 'Pizzaria da Esquina';

  const ins = {
    massa: insumo('p-ins-1', 'Massa de Pizza (disco)', 'Grãos', 'un', 2.4, 1),
    molhoTom: insumo('p-ins-2', 'Molho de Tomate', 'Molhos', 'lt', 12.0, 1000),
    mussarela: insumo('p-ins-3', 'Mussarela', 'Laticínios', 'kg', 38.0, 1000),
    catupiry: insumo('p-ins-4', 'Catupiry', 'Laticínios', 'kg', 34.0, 1000),
    calabresa: insumo('p-ins-5', 'Calabresa', 'Proteínas', 'kg', 24.0, 1000),
    presunto: insumo('p-ins-6', 'Presunto', 'Proteínas', 'kg', 22.0, 1000),
    frango: insumo('p-ins-7', 'Frango Desfiado', 'Proteínas', 'kg', 21.0, 1000),
    bacon: insumo('p-ins-8', 'Bacon', 'Proteínas', 'kg', 33.0, 1000),
    cebola: insumo('p-ins-9', 'Cebola', 'Legumes', 'kg', 5.5, 1000),
    tomate: insumo('p-ins-10', 'Tomate', 'Legumes', 'kg', 7.5, 1000),
    azeitona: insumo('p-ins-11', 'Azeitona', 'Legumes', 'kg', 16.0, 1000),
    manjericao: insumo('p-ins-12', 'Manjericão', 'Temperos', 'kg', 28.0, 1000),
    oregano: insumo('p-ins-13', 'Orégano', 'Temperos', 'kg', 32.0, 1000),
    chocolate: insumo('p-ins-14', 'Chocolate ao Leite', 'Outros', 'kg', 29.0, 1000),
    morango: insumo('p-ins-15', 'Morango', 'Legumes', 'kg', 18.0, 1000),
    refri2l: insumo('p-ins-16', 'Refrigerante 2L', 'Outros', 'un', 7.5, 1),
    refriLata: insumo('p-ins-17', 'Refrigerante Lata', 'Outros', 'un', 2.5, 1),
    cerveja: insumo('p-ins-18', 'Cerveja Long Neck', 'Outros', 'un', 4.5, 1),
    azeite: insumo('p-ins-19', 'Azeite de Oliva', 'Óleos', 'lt', 36.0, 1000),
    palmito: insumo('p-ins-20', 'Palmito', 'Legumes', 'kg', 26.0, 1000),
    parmesao: insumo('p-ins-21', 'Parmesão Ralado', 'Laticínios', 'kg', 44.0, 1000),
    embPizza: insumo('p-ins-22', 'Caixa de Pizza', 'Outros', 'un', 1.6, 1),
    farinhaTrigo: insumo('p-ins-23', 'Farinha de Trigo', 'Grãos', 'kg', 4.8, 1000),
  };

  const fichas = [
    ficha('p-f-1', 'Pizza Mussarela (Grande)', 'Prato Principal', 13.2, 1.6, 44.9, 480, [
      ing(ins.massa, 1, 'un'), ing(ins.molhoTom, 120, 'ml'), ing(ins.mussarela, 250, 'gr'),
      ing(ins.oregano, 5, 'gr'),
    ]),
    ficha('p-f-2', 'Pizza Calabresa (Grande)', 'Prato Principal', 15.8, 1.6, 49.9, 540, [
      ing(ins.massa, 1, 'un'), ing(ins.molhoTom, 120, 'ml'), ing(ins.mussarela, 200, 'gr'),
      ing(ins.calabresa, 150, 'gr'), ing(ins.cebola, 40, 'gr'),
    ]),
    ficha('p-f-3', 'Pizza Frango com Catupiry (Grande)', 'Prato Principal', 17.4, 1.6, 52.9, 510, [
      ing(ins.massa, 1, 'un'), ing(ins.molhoTom, 120, 'ml'), ing(ins.mussarela, 180, 'gr'),
      ing(ins.frango, 150, 'gr'), ing(ins.catupiry, 120, 'gr'),
    ]),
    ficha('p-f-4', 'Pizza Portuguesa (Grande)', 'Prato Principal', 18.2, 1.6, 54.9, 360, [
      ing(ins.massa, 1, 'un'), ing(ins.molhoTom, 120, 'ml'), ing(ins.mussarela, 200, 'gr'),
      ing(ins.presunto, 120, 'gr'), ing(ins.cebola, 40, 'gr'), ing(ins.azeitona, 30, 'gr'),
    ]),
    ficha('p-f-5', 'Pizza Margherita (Grande)', 'Prato Principal', 14.6, 1.6, 48.9, 290, [
      ing(ins.massa, 1, 'un'), ing(ins.molhoTom, 130, 'ml'), ing(ins.mussarela, 220, 'gr'),
      ing(ins.tomate, 80, 'gr'), ing(ins.manjericao, 10, 'gr'),
    ]),
    ficha('p-f-6', 'Pizza Bacon (Grande)', 'Prato Principal', 19.1, 1.6, 56.9, 270, [
      ing(ins.massa, 1, 'un'), ing(ins.molhoTom, 120, 'ml'), ing(ins.mussarela, 200, 'gr'),
      ing(ins.bacon, 150, 'gr'),
    ]),
    ficha('p-f-7', 'Pizza Quatro Queijos (Grande)', 'Prato Principal', 21.3, 1.6, 59.9, 230, [
      ing(ins.massa, 1, 'un'), ing(ins.molhoTom, 110, 'ml'), ing(ins.mussarela, 150, 'gr'),
      ing(ins.catupiry, 100, 'gr'), ing(ins.parmesao, 80, 'gr'),
    ]),
    ficha('p-f-8', 'Pizza Palmito (Grande)', 'Prato Principal', 17.9, 1.6, 53.9, 160, [
      ing(ins.massa, 1, 'un'), ing(ins.molhoTom, 120, 'ml'), ing(ins.mussarela, 200, 'gr'),
      ing(ins.palmito, 150, 'gr'),
    ]),
    ficha('p-f-9', 'Pizza Mussarela (Broto)', 'Prato Principal', 7.8, 1.0, 27.9, 220, [
      ing(ins.massa, 1, 'un'), ing(ins.molhoTom, 70, 'ml'), ing(ins.mussarela, 130, 'gr'),
    ]),
    ficha('p-f-10', 'Pizza Doce Chocolate (Grande)', 'Sobremesa', 12.4, 1.6, 42.9, 190, [
      ing(ins.massa, 1, 'un'), ing(ins.chocolate, 200, 'gr'),
    ]),
    ficha('p-f-11', 'Pizza Doce Morango (Grande)', 'Sobremesa', 13.8, 1.6, 44.9, 150, [
      ing(ins.massa, 1, 'un'), ing(ins.chocolate, 150, 'gr'), ing(ins.morango, 100, 'gr'),
    ]),
    ficha('p-f-12', 'Calzone de Calabresa', 'Prato Principal', 12.6, 1.6, 39.9, 140, [
      ing(ins.massa, 1, 'un'), ing(ins.mussarela, 150, 'gr'), ing(ins.calabresa, 120, 'gr'),
    ]),
    ficha('p-f-13', 'Pão de Alho', 'Entrada', 3.4, 0.5, 14.9, 380, [
      ing(ins.farinhaTrigo, 80, 'gr'), ing(ins.azeite, 15, 'ml'),
    ]),
    ficha('p-f-14', 'Bruschetta (4un)', 'Entrada', 5.2, 0.5, 18.9, 210, [
      ing(ins.farinhaTrigo, 90, 'gr'), ing(ins.tomate, 100, 'gr'), ing(ins.manjericao, 8, 'gr'),
    ]),
    ficha('p-f-15', 'Refrigerante 2L', 'Drinks, Coquetéis e Sucos', 7.5, 0.0, 14.0, 460, [
      ing(ins.refri2l, 1, 'un'),
    ]),
    ficha('p-f-16', 'Refrigerante Lata', 'Drinks, Coquetéis e Sucos', 2.5, 0.0, 6.5, 340, [
      ing(ins.refriLata, 1, 'un'),
    ]),
    ficha('p-f-17', 'Cerveja Long Neck', 'Drinks, Coquetéis e Sucos', 4.5, 0.0, 11.0, 290, [
      ing(ins.cerveja, 1, 'un'),
    ]),
    ficha('p-f-18', 'Pizza Vegetariana (Grande)', 'Prato Principal', 16.2, 1.6, 51.9, 130, [
      ing(ins.massa, 1, 'un'), ing(ins.molhoTom, 120, 'ml'), ing(ins.mussarela, 180, 'gr'),
      ing(ins.tomate, 70, 'gr'), ing(ins.cebola, 40, 'gr'), ing(ins.palmito, 80, 'gr'),
    ]),
  ];

  const revenues = [62000, 68000, 71000, 74000, 79000, 84000];
  const monthLabels = lastMonths(6);

  return {
    hash: SEED_HASHES.pizzaria,
    name,
    category: 'Pizzaria',
    data: {
      restaurant: { name, logo: null, category: 'Pizzaria' },
      user: { name: 'Antonio Esquina', photo: null, role: 'Proprietário da Conta', initials: 'AE', isOwner: true },
      profile: { name: 'Antonio Esquina', email: 'antonio@pizzariaesquina.com.br', phone: '(11) 98888-2222' },
      period: { date: new Date().toLocaleDateString('pt-BR'), status: 'Lucrativo', statusColor: '#E2FD89' },
      overview: { title: name, subtitle: 'Pizzaria de bairro — forte no delivery', tags: ['Delivery', 'Retirada'] },
      onboarding: { completed: true, step: 16 },
      formData: {
        onboarding_completed: true,
        user_info: { user_name: 'Antonio Esquina', user_phone: '(11) 98888-2222' },
        identity: {
          restaurant_name: name,
          cuisine_type: 'Pizzaria',
          tax_regime: 'Simples Nacional',
          is_mei: 'Não',
        },
        partners: [
          { name: 'Antonio Esquina', role: 'Proprietário', pro_labore: 'R$ 6.000,00' },
          { name: 'Marcia Esquina', role: 'Gestora', pro_labore: 'R$ 4.500,00' },
        ],
        employees: [
          { name: 'José Pizzaiolo', role: 'Pizzaiolo', base_salary: 'R$ 2.700,00', premio: 'R$ 250,00', regime: 'CLT', transport_value: 'R$ 8,80', transport_qty: '2', work_days: '24', food_cost: 'R$ 10,00' },
          { name: 'Sandra Forno', role: 'Forneira', base_salary: 'R$ 2.200,00', premio: 'R$ 0,00', regime: 'CLT', transport_value: 'R$ 8,80', transport_qty: '2', work_days: '24', food_cost: 'R$ 10,00' },
          { name: 'Lucas Telles', role: 'Atendente', base_salary: 'R$ 1.700,00', premio: 'R$ 0,00', regime: 'CLT', transport_value: 'R$ 8,80', transport_qty: '2', work_days: '24', food_cost: 'R$ 10,00' },
          { name: 'Diego Moto', role: 'Entregador', base_salary: 'R$ 1.550,00', premio: 'R$ 0,00', regime: 'CLT', transport_value: 'R$ 0,00', transport_qty: '0', work_days: '24', food_cost: 'R$ 10,00' },
        ],
        location_costs: { rent: 'R$ 5.800,00', iptu_annual: 'R$ 2.600,00' },
        utilities: {
          energy: 'R$ 1.900,00', water: 'R$ 420,00', internet: 'R$ 180,00',
          telefone: 'R$ 90,00', security: 'R$ 130,00', security_guard: 'R$ 0,00',
        },
        recurring_services: { pest_control: 'R$ 70,00', waste_removal: 'R$ 0,00', cleaning_supplies: 'R$ 280,00' },
        operational_fixed: { kitchen_gas: 'R$ 1.100,00', kitchen_oil: 'R$ 180,00', disposables: 'R$ 980,00' },
        monthly_services: [
          { name: 'Manutenção do forno', value: 'R$ 220,00' },
        ],
        equipment: [
          { name: 'Forno a Lenha', value: 'R$ 9.000,00', lifespan: '5' },
          { name: 'Masseira Industrial', value: 'R$ 5.200,00', lifespan: '5' },
          { name: 'Geladeira Comercial 4 Portas', value: 'R$ 6.800,00', lifespan: '5' },
        ],
        admin_systems: {
          systems_count: '1 Sistema',
          software_pdv: 'R$ 230,00',
          accountant: 'R$ 850,00',
          card_machine_rent: 'R$ 60,00',
        },
        vehicles: [
          { name: 'Moto Delivery 1', installment: 'R$ 0,00', insurance_annual: 'R$ 1.400,00', ipva_annual: 'R$ 320,00', maintenance_monthly: 'R$ 280,00' },
          { name: 'Moto Delivery 2', installment: 'R$ 420,00', insurance_annual: 'R$ 1.400,00', ipva_annual: 'R$ 320,00', maintenance_monthly: 'R$ 260,00' },
        ],
        marketing_structure: {
          agency: 'R$ 0,00',
          ads_budget: 'R$ 1.400,00',
          ads_platform: 'Instagram',
          gifts_cost: 'R$ 0,00',
          gifts_qty: '0',
        },
        fees_marketplaces: [
          { provider: 'iFood', monthly_fee: 'R$ 0,00', commission: '23%', sales_percentage: '45%' },
        ],
        fees_cards: [
          { provider: 'PagSeguro', debit_rate: '1,99%', credit_rate: '3,49%' },
        ],
        other_fixed_costs: [
          { name: 'Manutenção predial', value: 'R$ 200,00' },
        ],
        revenue_history: monthLabels.map((m, i) => ({ month: m, amount: brl(revenues[i]) })),
        daily_revenue: dailyRevenueCurrentMonth(44000),
      },
      operational: {
        fichas,
        insumos: Object.values(ins),
        categories: DEFAULT_CATEGORIES,
      },
      menuEngineering: menuFromFichas(fichas),
    },
  };
}

// ============================================================================
// DATASET 3 — Sushi Premium (Japonês, alto volume)
// ============================================================================
function buildSushi() {
  const name = 'Sushi Premium';

  const ins = {
    salmao: insumo('s-ins-1', 'Salmão Fresco', 'Proteínas', 'kg', 89.0, 1000),
    atum: insumo('s-ins-2', 'Atum', 'Proteínas', 'kg', 95.0, 1000),
    kani: insumo('s-ins-3', 'Kani Kama', 'Proteínas', 'kg', 32.0, 1000),
    camarao: insumo('s-ins-4', 'Camarão', 'Proteínas', 'kg', 78.0, 1000),
    polvo: insumo('s-ins-5', 'Polvo', 'Proteínas', 'kg', 92.0, 1000),
    arroz: insumo('s-ins-6', 'Arroz Japonês', 'Grãos', 'kg', 9.5, 1000),
    nori: insumo('s-ins-7', 'Alga Nori', 'Outros', 'un', 0.9, 1),
    creamCheese: insumo('s-ins-8', 'Cream Cheese', 'Laticínios', 'kg', 36.0, 1000),
    pepino: insumo('s-ins-9', 'Pepino Japonês', 'Legumes', 'kg', 8.0, 1000),
    cebolinha: insumo('s-ins-10', 'Cebolinha', 'Temperos', 'kg', 14.0, 1000),
    gergelim: insumo('s-ins-11', 'Gergelim', 'Temperos', 'kg', 26.0, 1000),
    shoyu: insumo('s-ins-12', 'Shoyu', 'Molhos', 'lt', 18.0, 1000),
    wasabi: insumo('s-ins-13', 'Wasabi', 'Molhos', 'kg', 64.0, 1000),
    gengibre: insumo('s-ins-14', 'Gengibre em Conserva', 'Legumes', 'kg', 22.0, 1000),
    cremeAvocado: insumo('s-ins-15', 'Avocado', 'Legumes', 'kg', 19.0, 1000),
    manga: insumo('s-ins-16', 'Manga', 'Legumes', 'kg', 11.0, 1000),
    tempura: insumo('s-ins-17', 'Farinha de Tempurá', 'Grãos', 'kg', 13.0, 1000),
    oleoSoja: insumo('s-ins-18', 'Óleo de Soja', 'Óleos', 'lt', 8.5, 1000),
    saque: insumo('s-ins-19', 'Saquê', 'Vinhos', 'lt', 48.0, 1000),
    refri: insumo('s-ins-20', 'Refrigerante Lata', 'Outros', 'un', 2.5, 1),
    chaVerde: insumo('s-ins-21', 'Chá Verde', 'Outros', 'kg', 38.0, 1000),
    massaTempura: insumo('s-ins-22', 'Tofu', 'Proteínas', 'kg', 24.0, 1000),
    sorvete: insumo('s-ins-23', 'Sorvete de Gergelim', 'Laticínios', 'lt', 28.0, 1000),
    embDelivery: insumo('s-ins-24', 'Embalagem Sushi Delivery', 'Outros', 'un', 2.2, 1),
    cervejaJp: insumo('s-ins-25', 'Cerveja Japonesa', 'Outros', 'un', 8.0, 1),
  };

  const fichas = [
    ficha('s-f-1', 'Combinado Premium 20 peças', 'Prato Principal', 28.6, 2.4, 89.9, 620, [
      ing(ins.salmao, 120, 'gr'), ing(ins.atum, 60, 'gr'), ing(ins.arroz, 220, 'gr'),
      ing(ins.nori, 4, 'un'), ing(ins.creamCheese, 50, 'gr'),
    ]),
    ficha('s-f-2', 'Combinado Salmão 15 peças', 'Prato Principal', 22.4, 2.4, 72.9, 540, [
      ing(ins.salmao, 180, 'gr'), ing(ins.arroz, 200, 'gr'), ing(ins.nori, 3, 'un'),
      ing(ins.creamCheese, 40, 'gr'),
    ]),
    ficha('s-f-3', 'Sashimi de Salmão (10 fatias)', 'Prato Principal', 17.8, 1.8, 56.9, 480, [
      ing(ins.salmao, 200, 'gr'),
    ]),
    ficha('s-f-4', 'Sashimi de Atum (10 fatias)', 'Prato Principal', 19.0, 1.8, 62.9, 290, [
      ing(ins.atum, 200, 'gr'),
    ]),
    ficha('s-f-5', 'Hot Roll Filadélfia (8un)', 'Prato Principal', 11.6, 1.6, 38.9, 710, [
      ing(ins.salmao, 60, 'gr'), ing(ins.arroz, 120, 'gr'), ing(ins.nori, 1, 'un'),
      ing(ins.creamCheese, 40, 'gr'), ing(ins.tempura, 40, 'gr'),
    ]),
    ficha('s-f-6', 'Uramaki Califórnia (8un)', 'Prato Principal', 9.4, 1.6, 34.9, 560, [
      ing(ins.kani, 60, 'gr'), ing(ins.arroz, 120, 'gr'), ing(ins.nori, 1, 'un'),
      ing(ins.cremeAvocado, 40, 'gr'), ing(ins.pepino, 30, 'gr'),
    ]),
    ficha('s-f-7', 'Niguiri de Salmão (par)', 'Entrada', 4.2, 0.4, 14.9, 820, [
      ing(ins.salmao, 30, 'gr'), ing(ins.arroz, 30, 'gr'),
    ]),
    ficha('s-f-8', 'Temaki de Salmão', 'Prato Principal', 8.6, 1.2, 28.9, 690, [
      ing(ins.salmao, 70, 'gr'), ing(ins.arroz, 90, 'gr'), ing(ins.nori, 1, 'un'),
      ing(ins.creamCheese, 30, 'gr'),
    ]),
    ficha('s-f-9', 'Temaki de Camarão', 'Prato Principal', 10.2, 1.2, 32.9, 410, [
      ing(ins.camarao, 70, 'gr'), ing(ins.arroz, 90, 'gr'), ing(ins.nori, 1, 'un'),
      ing(ins.cremeAvocado, 30, 'gr'),
    ]),
    ficha('s-f-10', 'Combinado Vegetariano 12 peças', 'Prato Principal', 9.8, 2.4, 42.9, 180, [
      ing(ins.pepino, 80, 'gr'), ing(ins.cremeAvocado, 60, 'gr'), ing(ins.manga, 60, 'gr'),
      ing(ins.arroz, 180, 'gr'), ing(ins.nori, 3, 'un'),
    ]),
    ficha('s-f-11', 'Joe de Salmão', 'Entrada', 6.4, 0.6, 22.9, 350, [
      ing(ins.salmao, 60, 'gr'), ing(ins.creamCheese, 30, 'gr'), ing(ins.cebolinha, 10, 'gr'),
    ]),
    ficha('s-f-12', 'Guioza (6un)', 'Entrada', 5.8, 0.8, 21.9, 470, [
      ing(ins.massaTempura, 80, 'gr'), ing(ins.cebolinha, 15, 'gr'),
    ]),
    ficha('s-f-13', 'Tempurá de Camarão (6un)', 'Entrada', 12.4, 0.8, 39.9, 320, [
      ing(ins.camarao, 120, 'gr'), ing(ins.tempura, 60, 'gr'), ing(ins.oleoSoja, 30, 'ml'),
    ]),
    ficha('s-f-14', 'Yakisoba de Frango', 'Prato Principal', 11.2, 1.6, 36.9, 380, [
      ing(ins.massaTempura, 100, 'gr'), ing(ins.pepino, 60, 'gr'), ing(ins.shoyu, 40, 'ml'),
    ]),
    ficha('s-f-15', 'Polvo Grelhado', 'Prato Principal', 21.6, 1.8, 64.9, 140, [
      ing(ins.polvo, 200, 'gr'), ing(ins.shoyu, 30, 'ml'),
    ]),
    ficha('s-f-16', 'Niguiri de Atum (par)', 'Entrada', 5.0, 0.4, 16.9, 410, [
      ing(ins.atum, 32, 'gr'), ing(ins.arroz, 30, 'gr'),
    ]),
    ficha('s-f-17', 'Hot Roll Camarão (8un)', 'Prato Principal', 13.8, 1.6, 42.9, 360, [
      ing(ins.camarao, 70, 'gr'), ing(ins.arroz, 120, 'gr'), ing(ins.nori, 1, 'un'),
      ing(ins.tempura, 40, 'gr'), ing(ins.creamCheese, 35, 'gr'),
    ]),
    ficha('s-f-18', 'Saquê Dose', 'Drinks, Coquetéis e Sucos', 4.8, 0.0, 16.0, 290, [
      ing(ins.saque, 100, 'ml'),
    ]),
    ficha('s-f-19', 'Cerveja Japonesa', 'Drinks, Coquetéis e Sucos', 8.0, 0.0, 18.0, 340, [
      ing(ins.cervejaJp, 1, 'un'),
    ]),
    ficha('s-f-20', 'Refrigerante Lata', 'Drinks, Coquetéis e Sucos', 2.5, 0.0, 7.0, 520, [
      ing(ins.refri, 1, 'un'),
    ]),
    ficha('s-f-21', 'Chá Verde Quente', 'Drinks, Coquetéis e Sucos', 1.4, 0.3, 8.9, 230, [
      ing(ins.chaVerde, 8, 'gr'),
    ]),
    ficha('s-f-22', 'Sorvete de Gergelim', 'Sobremesa', 4.6, 0.5, 17.9, 260, [
      ing(ins.sorvete, 120, 'ml'), ing(ins.gergelim, 8, 'gr'),
    ]),
    ficha('s-f-23', 'Combinado Sushi & Sashimi 24 peças', 'Prato Principal', 34.2, 2.6, 104.9, 230, [
      ing(ins.salmao, 160, 'gr'), ing(ins.atum, 90, 'gr'), ing(ins.camarao, 50, 'gr'),
      ing(ins.arroz, 260, 'gr'), ing(ins.nori, 5, 'un'),
    ]),
  ];

  const revenues = [128000, 136000, 142000, 151000, 149000, 163000];
  const monthLabels = lastMonths(6);

  return {
    hash: SEED_HASHES.sushi,
    name,
    category: 'Japonês',
    data: {
      restaurant: { name, logo: null, category: 'Japonês' },
      user: { name: 'Hiroshi Tanaka', photo: null, role: 'Proprietário da Conta', initials: 'HT', isOwner: true },
      profile: { name: 'Hiroshi Tanaka', email: 'hiroshi@sushipremium.com.br', phone: '(11) 97777-3333' },
      period: { date: new Date().toLocaleDateString('pt-BR'), status: 'Lucrativo', statusColor: '#E2FD89' },
      overview: { title: name, subtitle: 'Restaurante japonês premium — alto volume', tags: ['Salão', 'Delivery'] },
      onboarding: { completed: true, step: 16 },
      formData: {
        onboarding_completed: true,
        user_info: { user_name: 'Hiroshi Tanaka', user_phone: '(11) 97777-3333' },
        identity: {
          restaurant_name: name,
          cuisine_type: 'Japonesa',
          tax_regime: 'Simples Nacional',
          is_mei: 'Não',
        },
        partners: [
          { name: 'Hiroshi Tanaka', role: 'Chef-Sócio', pro_labore: 'R$ 12.000,00' },
          { name: 'Yuki Tanaka', role: 'Sócia-Administradora', pro_labore: 'R$ 10.000,00' },
        ],
        employees: [
          { name: 'Kenji Sato', role: 'Sushiman', base_salary: 'R$ 4.200,00', premio: 'R$ 500,00', regime: 'CLT', transport_value: 'R$ 9,60', transport_qty: '2', work_days: '24', food_cost: 'R$ 15,00' },
          { name: 'Marcos Endo', role: 'Sushiman', base_salary: 'R$ 3.800,00', premio: 'R$ 400,00', regime: 'CLT', transport_value: 'R$ 9,60', transport_qty: '2', work_days: '24', food_cost: 'R$ 15,00' },
          { name: 'Paula Maeda', role: 'Cozinha Quente', base_salary: 'R$ 2.900,00', premio: 'R$ 0,00', regime: 'CLT', transport_value: 'R$ 9,60', transport_qty: '2', work_days: '24', food_cost: 'R$ 15,00' },
          { name: 'Carla Inoue', role: 'Atendente', base_salary: 'R$ 2.100,00', premio: 'R$ 0,00', regime: 'CLT', transport_value: 'R$ 9,60', transport_qty: '2', work_days: '24', food_cost: 'R$ 15,00' },
          { name: 'Bruno Reis', role: 'Atendente', base_salary: 'R$ 2.100,00', premio: 'R$ 0,00', regime: 'CLT', transport_value: 'R$ 9,60', transport_qty: '2', work_days: '24', food_cost: 'R$ 15,00' },
          { name: 'Felipe Costa', role: 'Entregador', base_salary: 'R$ 1.700,00', premio: 'R$ 0,00', regime: 'CLT', transport_value: 'R$ 0,00', transport_qty: '0', work_days: '24', food_cost: 'R$ 15,00' },
        ],
        location_costs: { rent: 'R$ 16.000,00', iptu_annual: 'R$ 9.600,00' },
        utilities: {
          energy: 'R$ 5.400,00', water: 'R$ 1.100,00', internet: 'R$ 320,00',
          telefone: 'R$ 160,00', security: 'R$ 280,00', security_guard: 'R$ 1.800,00',
        },
        recurring_services: { pest_control: 'R$ 140,00', waste_removal: 'R$ 220,00', cleaning_supplies: 'R$ 720,00' },
        operational_fixed: { kitchen_gas: 'R$ 980,00', kitchen_oil: 'R$ 420,00', disposables: 'R$ 2.400,00' },
        monthly_services: [
          { name: 'Manutenção de câmaras frias', value: 'R$ 480,00' },
          { name: 'Sommelier consultor', value: 'R$ 600,00' },
          { name: 'Música ambiente (licença)', value: 'R$ 120,00' },
        ],
        equipment: [
          { name: 'Câmara Fria Dupla', value: 'R$ 22.000,00', lifespan: '5' },
          { name: 'Balcão Refrigerado Sushi', value: 'R$ 14.000,00', lifespan: '5' },
          { name: 'Fogão Industrial 6 Bocas', value: 'R$ 6.500,00', lifespan: '5' },
          { name: 'Máquina de Arroz Industrial', value: 'R$ 4.800,00', lifespan: '5' },
          { name: 'Freezer Horizontal', value: 'R$ 5.200,00', lifespan: '5' },
        ],
        admin_systems: {
          systems_count: '3+ Sistemas',
          software_pdv: 'R$ 540,00',
          accountant: 'R$ 1.800,00',
          card_machine_rent: 'R$ 150,00',
        },
        vehicles: [
          { name: 'Fiorino Delivery', installment: 'R$ 920,00', insurance_annual: 'R$ 3.200,00', ipva_annual: 'R$ 1.100,00', maintenance_monthly: 'R$ 560,00' },
          { name: 'Moto Delivery', installment: 'R$ 480,00', insurance_annual: 'R$ 1.600,00', ipva_annual: 'R$ 340,00', maintenance_monthly: 'R$ 300,00' },
        ],
        marketing_structure: {
          agency: 'R$ 2.800,00',
          ads_budget: 'R$ 4.200,00',
          ads_platform: 'Instagram / Google Ads',
          gifts_cost: 'R$ 2,00',
          gifts_qty: '200',
        },
        fees_marketplaces: [
          { provider: 'iFood', monthly_fee: 'R$ 0,00', commission: '27%', sales_percentage: '30%' },
          { provider: 'Rappi', monthly_fee: 'R$ 0,00', commission: '23%', sales_percentage: '10%' },
        ],
        fees_cards: [
          { provider: 'Cielo', debit_rate: '1,60%', credit_rate: '2,90%' },
          { provider: 'Stone', debit_rate: '1,80%', credit_rate: '3,10%' },
        ],
        other_fixed_costs: [
          { name: 'Seguro empresarial', value: 'R$ 480,00' },
          { name: 'Uniformes e EPIs', value: 'R$ 320,00' },
          { name: 'Treinamento de equipe', value: 'R$ 300,00' },
        ],
        revenue_history: monthLabels.map((m, i) => ({ month: m, amount: brl(revenues[i]) })),
        daily_revenue: dailyRevenueCurrentMonth(88000),
      },
      operational: {
        fichas,
        insumos: Object.values(ins),
        categories: DEFAULT_CATEGORIES,
      },
      menuEngineering: menuFromFichas(fichas),
    },
  };
}

// ============================================================================
// Diagnóstico — calcula o CMV ponderado resultante (pra log de validação)
// ============================================================================
function cmvSummary(dataObj) {
  const fichas = dataObj.operational.fichas;
  let totalRev = 0;
  let totalCost = 0;
  fichas.forEach((f) => {
    const sales = parseInt(f.vendasMes, 10) || 0;
    const price = parseFloat(f.precoVenda.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.')) || 0;
    const cost = parseFloat(f.custoTotal.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.')) || 0;
    totalRev += sales * price;
    totalCost += sales * cost;
  });
  const cmvPct = totalRev > 0 ? (totalCost / totalRev) * 100 : 0;
  const revHist = dataObj.formData.revenue_history;
  const avgRev = revHist.reduce((s, e) => {
    return s + (parseFloat(e.amount.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.')) || 0);
  }, 0) / revHist.length;
  return { cmvPct, avgRev, fichaCount: fichas.length, insumoCount: dataObj.operational.insumos.length };
}

// ============================================================================
// Persistência
// ============================================================================
async function applySeed(built) {
  const [existing] = await db.select().from(t.client).where(eq(t.client.hash, built.hash)).limit(1);
  if (!existing) {
    err(`Cliente nao encontrado (hash=${built.hash}). Rode 'npm run seed:bpo' antes.`);
    return false;
  }

  await db.update(t.client)
    .set({ data: JSON.stringify(built.data), updatedAt: new Date() })
    .where(eq(t.client.hash, built.hash));

  const s = cmvSummary(built.data);
  ok(`${built.name} atualizado`);
  log(`   faturamento medio: ${brl(s.avgRev)} | CMV ponderado: ${s.cmvPct.toFixed(1)}% | fichas: ${s.fichaCount} | insumos: ${s.insumoCount}`);
  return true;
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  const args = process.argv.slice(2);
  const onlyArg = args.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.split('=')[1] : null;

  log('====================================================');
  log('Seed Dashboard — Breaker (popula Client.data)');
  log('====================================================');
  log(`DATABASE_URL: ${process.env.DATABASE_URL ? '***configurado***' : 'NAO ENCONTRADO'}`);

  try {
    await db.execute(sql`SELECT 1`);
  } catch (e) {
    err('Falha ao conectar no Postgres:', e.message);
    process.exit(1);
  }

  const builders = {
    burger: buildBurger,
    pizzaria: buildPizzaria,
    sushi: buildSushi,
  };

  let count = 0;
  for (const [key, build] of Object.entries(builders)) {
    if (only && only !== key) continue;
    const okres = await applySeed(build());
    if (okres) count++;
  }

  log('');
  log('====================================================');
  log(`SEED DASHBOARD CONCLUIDO — ${count} cliente(s) atualizado(s)`);
  log('====================================================');
  Object.values(SEED_HASHES).forEach((h) => {
    log(`   http://localhost:5173/?hash=${h}`);
  });
}

main()
  .catch((e) => {
    err('Erro fatal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
