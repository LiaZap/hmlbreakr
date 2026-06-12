'use strict';
/**
 * coreSync — projeta o blob Client.data nas 19 tabelas Drizzle do núcleo.
 *
 * Fonte da verdade = o blob (Client.data). As tabelas Drizzle são uma PROJEÇÃO
 * reconstruída a cada save (rebuild: apaga as linhas do cliente e reinsere).
 * Idempotente por cliente. Enquanto o blob for a fonte (F2 dual-write), churnar
 * ids a cada save é aceitável — nada externo referencia esses ids ainda (F3+).
 *
 * Usado por:
 *  - scripts/backfill-core.js   (carga inicial / reprocesso em massa, modo --wipe)
 *  - src/routes.js (hook de save) (F2: a cada POST de Client.data, best-effort)
 *
 * Deps INJETADAS (sem conexões próprias): prisma, db (drizzle), s (schema).
 * No hook, o caller DEVE capturar erros (.catch) — uma falha aqui NUNCA pode
 * bloquear o save do blob, que é a fonte da verdade.
 *
 * Ver docs/plano-migracao-castelo-de-areia.md (F2).
 */
const crypto = require('crypto');
const { eq } = require('drizzle-orm');
const bpo = require('../db/schema-bpo');

const uuid = () => crypto.randomUUID();
const first = (...vals) => vals.find((v) => v !== undefined && v !== null);

// "R$ 1.234,56" / "1.234,56" / "1234.56" / 1234.56 → "1234.56" (string p/ numeric) | null
function money(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? String(v) : null;
  let str = String(v).replace(/R\$/g, '').trim();
  if (str.includes(',') && str.includes('.')) str = str.replace(/\./g, '').replace(',', '.');
  else if (str.includes(',')) str = str.replace(',', '.');
  str = str.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(str);
  return isFinite(n) ? String(n) : null;
}
const intOrNull = (v) => { const n = parseInt(v, 10); return isFinite(n) ? n : null; };
const boolish = (v) => v === true || v === 'true' || v === 'Sim' || v === 'sim';

// "1000kg" → {value:'1000', unit:'kg'} ; "0,5 L" → {'0.5','L'} ; "" → {null,null}
function parseYield(v) {
  if (v == null || v === '') return { value: null, unit: null };
  const str = String(v).trim();
  const m = str.match(/^\s*(-?[\d.,]+)\s*([^\d.,\s]*)/);
  if (m) return { value: money(m[1]), unit: (m[2] || '').trim() || null };
  // sem número: pode ser só unidade ("kg") — preserva a unidade p/ round-trip fiel
  return { value: null, unit: /^[^\d.,\s]+$/.test(str) ? str : null };
}
// epoch ms (number/string) → Date ; senão null
function epochToDate(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  if (!isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return isNaN(d.getTime()) ? null : d;
}
// normaliza nome p/ match cross-ORM (lower, sem acento, trim)
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// só guarda a string se for URL http(s); base64/data-uri fica no blob (não infla a tabela)
const urlOnly = (v) => (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) ? v.trim() : null;

// match cpf-first, senão nome normalizado SÓ se houver candidato ÚNICO
function makeMatcher(rows, nameKey) {
  const byCpf = new Map(rows.filter((r) => r.cpf).map((r) => [r.cpf, r.id]));
  const byName = new Map();
  for (const r of rows) { const k = norm(r[nameKey]); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(r.id); }
  return (cpf, name) => {
    if (cpf && byCpf.has(cpf)) return byCpf.get(cpf);
    const arr = byName.get(norm(name));
    return arr && arr.length === 1 ? arr[0] : null;
  };
}

// Caminha a árvore de subIngredients do insumo preparado → IngredientComponent.
// rootCol = 'ingredientId' (sub-receita de insumo) ou 'technicalSheetItemId' (sub-receita de item de ficha)
function emitComponents(list, rootCol, rootId, parentId, ingMap, out, modifiedBy) {
  let pos = 0;
  for (const c of (Array.isArray(list) ? list : [])) {
    const compId = uuid();
    const ry = parseYield(c.rendimento);
    out.push({
      id: compId, [rootCol]: rootId, parentComponentId: parentId,
      componentIngredientId: c.id != null ? (ingMap[String(c.id)] || null) : null,
      legacyId: c.id != null ? String(c.id) : null,
      name: first(c.name, c.nome) || 'Componente',
      category: first(c.category, c.categoria) || null,
      qty: money(first(c.qty, c.quantidade)), unit: c.unit || null,
      unitCost: money(c.price), lineCost: money(c.custo),
      // snapshot completo do sub (p/ reconstrução fiel na F3)
      packUnit: first(c.purchaseUnit, c.unidadeCompra) || null,
      packPrice: money(c.purchaseTotal), packQty: money(c.purchaseQty),
      defaultQty: money(c.defaultQty), grossQty: money(c.grossQty), netQty: money(c.netQty),
      correctionFactor: money(c.fc),
      usageUnit: c.usageUnit || null, originalUnit: c.originalUnit || null,
      yield: ry.value, yieldUnit: ry.unit,
      preparedYield: money(c.rendimentoPreparado), preparedYieldUnit: c.rendimentoUnit || null,
      preparedTotalCost: money(c.totalCost),
      sourceUpdatedAt: epochToDate(c.lastUpdated),
      isPrepared: boolish(c.isPrepared), position: ++pos,
      modifiedBy,
    });
    if (Array.isArray(c.subIngredients) && c.subIngredients.length) {
      emitComponents(c.subIngredients, rootCol, rootId, compId, ingMap, out, modifiedBy);
    }
  }
}

/**
 * Constrói TODAS as linhas das 19 tabelas a partir do blob (PURO, sem DB).
 * Retorna { rows, counts, blob, coverage, validation }.
 *  - rows: objeto keyed por nome da tabela (p/ insert)
 *  - counts/blob/coverage/validation: relatório de reconciliação
 */
function buildClientRows(clientId, data, opts = {}) {
  const { bpoEmployees = [], bpoPartners = [], modifiedBy = 'sync' } = opts;
  const cid = clientId;
  const MODIFIED_BY = modifiedBy;
  const op = data.operational || {};
  const fd = data.formData || {};

  // 0) Categorias → Category. operational.categories é OBJETO {insumos:[],fichas:[]}.
  const catByScope = { ingredient: new Set(), sheet: new Set(), menu: new Set() };
  const addCat = (scope, v) => { const x = (v == null ? '' : String(v)).trim(); if (x) catByScope[scope].add(x); };
  for (const c of (op.categories?.insumos || [])) addCat('ingredient', c);
  for (const c of (op.categories?.fichas || [])) addCat('sheet', c);
  for (const it of (op.insumos || [])) addCat('ingredient', first(it.categoria, it.category));
  for (const f of (op.fichas || [])) addCat('sheet', first(f.categoria, f.category, f.type));
  for (const m of (data.menuEngineering || [])) addCat('menu', first(m.categoria, m.category, m.type));
  const catMap = { ingredient: {}, sheet: {}, menu: {} };
  const catRows = [];
  for (const scope of ['ingredient', 'sheet', 'menu']) {
    for (const name of catByScope[scope]) {
      const id = uuid();
      catMap[scope][name] = id;
      catRows.push({ id, clientId: cid, name, scope, isSystem: false, modifiedBy: MODIFIED_BY });
    }
  }
  const catId = (scope, v) => { const x = (v == null ? '' : String(v)).trim(); return x ? (catMap[scope][x] || null) : null; };

  // 1) Insumos → Ingredient (mapa legacyId → id)
  const ingMap = {};
  const ingRows = (op.insumos || []).map((it) => {
    const id = uuid();
    if (it.id != null) ingMap[String(it.id)] = id;
    const cat = first(it.categoria, it.category);
    const ry = parseYield(it.rendimento);
    return {
      id, clientId: cid, legacyId: it.id != null ? String(it.id) : null,
      categoryId: catId('ingredient', cat),
      name: first(it.nome, it.name) || 'Insumo',
      category: cat || null,
      unit: first(it.unidade, it.unidadeMedida, it.unit) || null,
      packUnit: first(it.purchaseUnit, it.unidadeCompra) || null,
      packPrice: money(first(it.purchaseTotal, it.precoEmbalagem, it.packPrice)),
      packQty: money(first(it.purchaseQty, it.qtdEmbalagem, it.packQty)),
      unitCost: money(first(it.custo, it.custoUnitario, it.precoUnitario, it.unitCost)),
      price: money(it.price),
      refQty: money(it.qty),
      defaultQty: money(it.defaultQty),
      grossQty: money(it.grossQty),
      yield: ry.value,
      yieldUnit: ry.unit,
      isPrepared: boolish(it.isPrepared),
      preparedYield: money(it.rendimentoPreparado),
      preparedYieldUnit: it.rendimentoUnit || null,
      preparedTotalCost: money(it.totalCost),
      sourceUpdatedAt: epochToDate(it.lastUpdated),
      modifiedBy: MODIFIED_BY,
    };
  });

  // 1b) Sub-receita do insumo preparado → IngredientComponent (árvore recursiva)
  const compRows = [];
  for (const it of (op.insumos || [])) {
    if (Array.isArray(it.subIngredients) && it.subIngredients.length) {
      const rootId = it.id != null ? ingMap[String(it.id)] : null;
      if (rootId) emitComponents(it.subIngredients, 'ingredientId', rootId, null, ingMap, compRows, MODIFIED_BY);
    }
  }

  // 2) Fichas pass 1 → TechnicalSheet (mapa fichaLegacyId → sheetId)
  const sheetMap = {};
  const sheetRows = (op.fichas || []).map((f) => {
    const id = uuid();
    if (f.id != null) sheetMap[String(f.id)] = id;
    const fcat = first(f.categoria, f.category, f.type);
    const fy = parseYield(first(f.rendimento, f.yield));
    return {
      id, clientId: cid, legacyId: f.id != null ? String(f.id) : null,
      categoryId: catId('sheet', fcat),
      name: first(f.nome, f.name) || 'Ficha',
      category: fcat || null,
      isModular: !!f.isModular,
      yield: fy.value,
      yieldUnit: fy.unit,
      sellingPrice: money(first(f.precoVenda, f.sellingPrice)),
      totalCost: money(first(f.custoTotal, f.totalCost)),
      costIngredients: money(f.custoInsumos),
      costPackaging: money(f.custoEmbalagem),
      costMin: money(f.custoMin), costMax: money(f.custoMax),
      salesEstimateMonthly: money(f.vendasMes),
      prepTimeMinutes: intOrNull(f.tempoPreparo),
      prepTime: (f.tempoPreparo != null && String(f.tempoPreparo).trim() !== '') ? String(f.tempoPreparo) : null,
      utensils: (f.utensilios && String(f.utensilios).trim()) || null,
      finishing: (f.finalizacao && String(f.finalizacao).trim()) || null,
      dishPhoto: urlOnly(f.fotoPrato),
      isImported: boolish(f.isImported),
      progress: intOrNull(f.progress),
      sourceCreatedAt: epochToDate(f.createdAt),
      sourceUpdatedAt: epochToDate(f.lastUpdated),
      modifiedBy: MODIFIED_BY,
    };
  });

  // 3) Fichas pass 2 → itens (simples) ou módulos+opções (modular) + passos do preparo
  const itemRows = []; const moduleRows = []; const optionRows = []; const stepRows = [];
  for (const f of (op.fichas || [])) {
    const sheetId = sheetMap[String(f.id)];
    if (!sheetId) continue;
    let pos = 0;
    for (const step of (Array.isArray(f.modoPreparo) ? f.modoPreparo : [])) {
      const txt = typeof step === 'object' && step ? first(step.text, step.texto, step.descricao, step.passo) : step;
      const t = (txt == null ? '' : String(txt)).trim();
      if (!t) continue;
      stepRows.push({ id: uuid(), sheetId, position: ++pos, text: t, modifiedBy: MODIFIED_BY });
    }
    if (f.isModular) {
      for (const m of (f.modules || [])) {
        const moduleId = uuid();
        moduleRows.push({ id: moduleId, sheetId, legacyId: m.id != null ? String(m.id) : null, name: first(m.nome, m.name) || 'Módulo', required: m.required !== false, modifiedBy: MODIFIED_BY });
        for (const o of (m.options || [])) {
          optionRows.push({
            id: uuid(), moduleId, legacyId: o.id != null ? String(o.id) : null,
            name: first(o.nome, o.name) || 'Opção',
            cost: money(first(o.custo, o.cost)),
            isDefault: !!(o.default || o.isDefault),
            linkedSheetId: o.linkedFichaId != null ? (sheetMap[String(o.linkedFichaId)] || null) : null,
            modifiedBy: MODIFIED_BY,
          });
        }
      }
    } else {
      const items = [f.ingredients, f.insumos, f.itens, f.items].find(Array.isArray) || [];
      for (const it of items) {
        const qty = money(first(it.qty, it.qtd, it.quantidade, it.quantity)) || '0';
        const line = money(first(it.custo, it.custoTotal, it.lineCost)) || '0';
        const unitCost = money(first(it.price, it.custoUnitario, it.unitCost))
          || (parseFloat(qty) ? String(parseFloat(line) / parseFloat(qty)) : '0');
        const iy = parseYield(it.rendimento);
        const itemId = uuid();
        itemRows.push({
          id: itemId, sheetId,
          ingredientId: first(it.insumoId, it.id) != null ? (ingMap[String(first(it.insumoId, it.id))] || null) : null,
          legacyId: it.id != null ? String(it.id) : null,
          description: first(it.nome, it.descricao, it.name, it.description) || 'Item',
          category: first(it.categoria, it.category) || null,
          quantity: qty, unit: first(it.unit, it.unidade) || null,
          unitCost, lineCost: line,
          defaultQty: money(it.defaultQty), grossQty: money(it.grossQty), netQty: money(it.netQty),
          correctionFactor: money(it.fc),
          usageUnit: it.usageUnit || null, purchaseUnit: it.purchaseUnit || null, originalUnit: it.originalUnit || null,
          purchaseQty: money(it.purchaseQty), purchaseTotal: money(it.purchaseTotal),
          yield: iy.value, yieldUnit: iy.unit,
          isPrepared: boolish(it.isPrepared),
          preparedYield: money(it.rendimentoPreparado), preparedYieldUnit: it.rendimentoUnit || null,
          preparedTotalCost: money(it.totalCost),
          sourceUpdatedAt: epochToDate(it.lastUpdated),
          modifiedBy: MODIFIED_BY,
        });
        // item de ficha preparado tem sua PRÓPRIA sub-receita (snapshot pode divergir do insumo base)
        if (boolish(it.isPrepared) && Array.isArray(it.subIngredients) && it.subIngredients.length) {
          emitComponents(it.subIngredients, 'technicalSheetItemId', itemId, null, ingMap, compRows, MODIFIED_BY);
        }
      }
    }
  }

  // 4) Menu engineering → MenuItem
  const menuRows = (data.menuEngineering || []).map((m) => {
    const mcat = first(m.categoria, m.category, m.type);
    return {
      id: uuid(), clientId: cid, legacyId: m.id != null ? String(m.id) : null,
      sheetId: m.fichaId != null ? (sheetMap[String(m.fichaId)] || null) : null,
      categoryId: catId('menu', mcat),
      name: first(m.nome, m.name) || 'Item',
      category: mcat || null,
      salesEstimate: money(first(m.sales, m.vendas)),
      price: money(m.price ?? m.preco), cost: money(m.cost ?? m.custo),
      modifiedBy: MODIFIED_BY,
    };
  });

  // 5) Faturamento mensal (revenue_history "MM/AAAA")
  const revRows = [];
  for (const e of (fd.revenue_history || [])) {
    if (!e?.month) continue;
    const [mm, yyyy] = String(e.month).split('/');
    const month = intOrNull(mm); const year = intOrNull(yyyy);
    const amount = money(e.amount);
    if (month && year && amount !== null) revRows.push({ id: uuid(), clientId: cid, year, month, amount, source: 'onboarding', modifiedBy: MODIFIED_BY });
  }

  // 6) Faturamento diário (daily_revenue { "YYYY-MM-DD": valor })
  const dailyRows = Object.entries(fd.daily_revenue || {}).map(([date, v]) => ({
    id: uuid(), clientId: cid, date, amount: money(v), source: 'manual', modifiedBy: MODIFIED_BY,
  })).filter((r) => r.amount !== null);

  // 7) Company profile (1:1) — identidade do restaurante + perfil do dono.
  //    Imagens base64 NÃO migram (urlOnly) — ficam no blob até object storage.
  const prof = data.profile || {};
  const usr = data.user || {};
  const uinfo = fd.user_info || {};
  const profileRows = [{
    id: uuid(), clientId: cid,
    restaurantName: first(data.restaurant?.name, fd.identity?.restaurant_name, fd.identity?.company_name),
    restaurantCategory: first(data.restaurant?.category, fd.identity?.category),
    cuisineType: fd.identity?.cuisine_type || null,
    businessLogo: urlOnly(first(fd.identity?.business_logo, data.restaurant?.logo)),
    taxRegime: fd.identity?.tax_regime || null,
    isMei: boolish(fd.identity?.is_mei),
    simplesRate: money(fd.admin_systems?.simples_rate),
    rentMonthly: money(fd.location_costs?.rent),
    iptuAnnual: money(fd.location_costs?.iptu_annual),
    ownerName: first(usr.name, prof.name, uinfo.user_name) || null,
    ownerRole: first(usr.role, prof.role) || null,
    ownerIsOwner: typeof usr.isOwner === 'boolean' ? usr.isOwner : null,
    ownerEmail: first(prof.email, uinfo.user_email) || null,
    ownerPhone: first(prof.phone, uinfo.user_phone) || null,
    ownerCpf: prof.cpf || null,                 // PII
    ownerBirthday: prof.birthday || null,
    ownerPhoto: urlOnly(first(usr.photo, prof.photo, uinfo.user_photo)),
    modifiedBy: MODIFIED_BY,
  }];

  // 8) Custos fixos → FixedCostItem (ESPELHO FIEL do formData, não agregado):
  //    TODAS as chaves de cada objeto de custo (incl. zeros e config string),
  //    rawValue = valor ORIGINAL (string exata). Arrays com position. costGroup =
  //    o nome da chave do formData (p/ reconstruir o objeto 1-a-1). amount = parse
  //    (p/ a DRE/F4 somar). location_costs/admin_systems também alimentam o
  //    CompanyProfile (rent/iptu/simples) — aqui é o espelho do objeto.
  const costRows = [];
  const OBJ_GROUPS = ['location_costs', 'utilities', 'recurring_services', 'operational_fixed', 'admin_systems', 'marketing_structure'];
  for (const g of OBJ_GROUPS) {
    const obj = fd[g];
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj)) {
        costRows.push({ id: uuid(), clientId: cid, costGroup: g, costKey: k, label: null, rawValue: v == null ? null : String(v), amount: money(v), modifiedBy: MODIFIED_BY });
      }
    }
  }
  for (const g of ['monthly_services', 'other_fixed_costs']) {
    (fd[g] || []).forEach((it, idx) => {
      costRows.push({ id: uuid(), clientId: cid, costGroup: g, costKey: null, label: first(it.name, it.label) || null, rawValue: it.value == null ? null : String(it.value), amount: money(it.value), position: idx, modifiedBy: MODIFIED_BY });
    });
  }

  // 9) Employees / Partners (vínculo best-effort) / Equipment / Vehicles / Cards / Marketplaces / Snapshots
  const matchEmp = makeMatcher(bpoEmployees, 'name');
  const matchPartner = makeMatcher(bpoPartners, 'name');
  const empRows = (fd.employees || []).map((e) => ({
    id: uuid(), clientId: cid, legacyId: e.id != null ? String(e.id) : null,
    bpoEmployeeId: matchEmp(e.cpf || null, e.name),
    name: e.name || null, cpf: e.cpf || null, role: e.role || null, regime: e.regime || null,
    baseSalary: money(e.base_salary), bonus: money(e.premio),
    transportValue: money(e.transport_value), transportQty: intOrNull(e.transport_qty),
    workDays: intOrNull(e.work_days), foodCost: money(e.food_cost),
    modifiedBy: MODIFIED_BY,
  }));
  const partnerRows = (fd.partners || []).map((p) => ({
    id: uuid(), clientId: cid, legacyId: p.id != null ? String(p.id) : null,
    bpoPartnerId: matchPartner(p.cpf || null, p.name),
    name: p.name || null, cpf: p.cpf || null, role: p.role || null, proLabore: money(p.pro_labore),
    personalAccountBank: p.personal_bank || null, personalAccountAgency: p.personal_agency || null, personalAccountNumber: p.personal_account || null,
    modifiedBy: MODIFIED_BY,
  }));
  const equipmentRows = (fd.equipment || []).map((e) => ({
    id: uuid(), clientId: cid, legacyId: e.id != null ? String(e.id) : null,
    name: first(e.name, e.description) || null, value: money(e.value), lifespanYears: money(e.lifespan) || '5',
    modifiedBy: MODIFIED_BY,
  }));
  const vehicleRows = (fd.vehicles || []).map((v) => ({
    id: uuid(), clientId: cid, legacyId: v.id != null ? String(v.id) : null,
    description: first(v.name, v.description) || null,
    installment: money(v.installment), maintenanceMonthly: money(v.maintenance_monthly),
    insuranceAnnual: money(v.insurance_annual), ipvaAnnual: money(v.ipva_annual),
    modifiedBy: MODIFIED_BY,
  }));
  const cardRows = (fd.fees_cards || []).map((c) => ({
    id: uuid(), clientId: cid, legacyId: c.id != null ? String(c.id) : null,
    provider: first(c.provider, c.name) || null,
    customProvider: c.custom_provider || null,
    debitRate: money(String(c.debit_rate || '').replace('%', '')), creditRate: money(String(c.credit_rate || '').replace('%', '')),
    modifiedBy: MODIFIED_BY,
  }));
  const marketplaceRows = (fd.fees_marketplaces || []).map((m) => ({
    id: uuid(), clientId: cid, legacyId: m.id != null ? String(m.id) : null,
    provider: m.provider || null, customProvider: m.custom_provider || null,
    commission: money(String(m.commission || '').replace('%', '')), salesPercentage: money(String(m.sales_percentage || '').replace('%', '')),
    monthlyFee: money(m.monthly_fee),
    modifiedBy: MODIFIED_BY,
  }));
  const snapshotRows = Object.entries(fd.metric_snapshots || {}).map(([periodKey, d]) => ({
    id: uuid(), clientId: cid, periodKey,
    cmv: money(d?.cmv), marketplaceFee: money(d?.marketplace), fixedCosts: money(d?.fixedCosts),
    cardFee: money(d?.cardFee), advances: money(d?.advances), loans: money(d?.loans),
    drivers: d, modifiedBy: MODIFIED_BY,
  }));

  const rows = {
    category: catRows,
    ingredient: ingRows,
    ingredientComponent: compRows,
    technicalSheet: sheetRows,
    technicalSheetItem: itemRows,
    sheetModule: moduleRows,
    sheetModuleOption: optionRows,
    technicalSheetStep: stepRows,
    menuItem: menuRows,
    revenueEntry: revRows,
    dailyRevenue: dailyRows,
    companyProfile: profileRows,
    fixedCostItem: costRows,
    employee: empRows,
    partner: partnerRows,
    equipment: equipmentRows,
    vehicle: vehicleRows,
    cardMachine: cardRows,
    marketplace: marketplaceRows,
    metricSnapshot: snapshotRows,
  };

  const counts = {
    category: catRows.length, ingredient: ingRows.length, ingredientComponent: compRows.length,
    technicalSheet: sheetRows.length, sheetItem: itemRows.length, sheetModule: moduleRows.length,
    sheetOption: optionRows.length, sheetStep: stepRows.length, menuItem: menuRows.length,
    revenue: revRows.length, daily: dailyRows.length, profile: profileRows.length,
    fixedCost: costRows.length, employee: empRows.length, partner: partnerRows.length,
    equipment: equipmentRows.length, vehicle: vehicleRows.length, cardMachine: cardRows.length,
    marketplace: marketplaceRows.length, metricSnapshot: snapshotRows.length,
  };

  // ── Reconciliação (blob × linhas) ──
  const blobRevTotal = (fd.revenue_history || []).reduce((a, e) => a + (parseFloat(money(e.amount)) || 0), 0)
    + Object.values(fd.daily_revenue || {}).reduce((a, v) => a + (parseFloat(money(v)) || 0), 0);
  const tabRevTotal = revRows.reduce((a, r) => a + parseFloat(r.amount), 0) + dailyRows.reduce((a, r) => a + parseFloat(r.amount), 0);
  const revOk = Math.abs(blobRevTotal - tabRevTotal) < 0.01;

  const blob = {
    ingredient: (op.insumos || []).length,
    technicalSheet: (op.fichas || []).length,
    sheetItem: (op.fichas || []).reduce((a, f) => a + (f.isModular ? 0 : ([f.ingredients, f.insumos, f.itens, f.items].find(Array.isArray) || []).length), 0),
    sheetModule: (op.fichas || []).reduce((a, f) => a + (f.isModular ? (f.modules || []).length : 0), 0),
    sheetOption: (op.fichas || []).reduce((a, f) => a + (f.isModular ? (f.modules || []).reduce((b, m) => b + (m.options || []).length, 0) : 0), 0),
    menuItem: (data.menuEngineering || []).length,
    employee: (fd.employees || []).length,
    partner: (fd.partners || []).length,
    equipment: (fd.equipment || []).length,
    vehicle: (fd.vehicles || []).length,
    cardMachine: (fd.fees_cards || []).length,
    marketplace: (fd.fees_marketplaces || []).length,
  };

  const coverage = {
    categories: catRows.length,
    ingWithCat: ingRows.filter((r) => r.categoryId).length,
    sheetWithCat: sheetRows.filter((r) => r.categoryId).length,
    menuWithCat: menuRows.filter((r) => r.categoryId).length,
    ingPackUnit: ingRows.filter((r) => r.packUnit).length,
    ingPrepared: ingRows.filter((r) => r.isPrepared).length,
    ingComponents: compRows.length,
    sheetSrcUpdated: sheetRows.filter((r) => r.sourceUpdatedAt).length,
    sheetFinishing: sheetRows.filter((r) => r.finishing).length,
    steps: stepRows.length,
    ownerName: profileRows.filter((r) => r.ownerName).length,
    empBpoLinked: empRows.filter((r) => r.bpoEmployeeId).length,
    partnerBpoLinked: partnerRows.filter((r) => r.bpoPartnerId).length,
  };

  const validation = {
    insumos: { blob: blob.ingredient, tab: counts.ingredient, ok: blob.ingredient === counts.ingredient },
    fichas: { blob: blob.technicalSheet, tab: counts.technicalSheet, ok: blob.technicalSheet === counts.technicalSheet },
    menu: { blob: blob.menuItem, tab: counts.menuItem, ok: blob.menuItem === counts.menuItem },
    revenueTotal: { blob: blobRevTotal.toFixed(2), tab: tabRevTotal.toFixed(2), ok: revOk },
  };

  return { rows, counts, blob, coverage, validation };
}

// ordem FK-safe de insert (category antes dos que a referenciam; ingredient antes
// de component/item; sheet antes de item/module/step/menu; module antes de option).
const INSERT_ORDER = [
  // ingredientComponent DEPOIS de technicalSheetItem (FK polimórfica technicalSheetItemId)
  'category', 'ingredient', 'technicalSheet', 'technicalSheetItem', 'ingredientComponent',
  'sheetModule', 'sheetModuleOption', 'technicalSheetStep', 'menuItem', 'revenueEntry',
  'dailyRevenue', 'companyProfile', 'fixedCostItem', 'employee', 'partner', 'equipment',
  'vehicle', 'cardMachine', 'marketplace', 'metricSnapshot',
];

// FK-safe wipe das linhas do cliente (sheets cascateiam item/module/option/step;
// ingredient cascateia ingredientComponent; category POR ÚLTIMO p/ não churnar set null).
async function wipeClient(db, s, clientId) {
  await db.delete(s.technicalSheet).where(eq(s.technicalSheet.clientId, clientId));
  for (const t of [s.ingredient, s.menuItem, s.revenueEntry, s.dailyRevenue, s.companyProfile,
    s.fixedCostItem, s.employee, s.partner, s.equipment, s.vehicle, s.cardMachine, s.marketplace,
    s.metricSnapshot, s.category]) {
    await db.delete(t).where(eq(t.clientId, clientId));
  }
}

async function insertRows(db, table, rows) {
  if (!rows || !rows.length) return;
  for (let i = 0; i < rows.length; i += 500) await db.insert(table).values(rows.slice(i, i + 500));
}

/**
 * Reprojeta as tabelas Drizzle do cliente a partir do blob (rebuild: wipe+insert).
 * @param {object} db      drizzle db
 * @param {object} s       schema (require('../db/schema'))
 * @param {string} clientId
 * @param {object} data    blob Client.data já parseado
 * @param {object} opts    { wipe=true, dry=false, modifiedBy='sync:F2' }
 * @returns {Promise<{counts,blob,coverage,validation}>}
 */
async function syncCoreTables(db, s, clientId, data, opts = {}) {
  const { wipe = true, dry = false, modifiedBy = 'sync:F2' } = opts;
  const [bpoEmployees, bpoPartners] = await Promise.all([
    db.select({ id: bpo.bpoEmployee.id, cpf: bpo.bpoEmployee.cpf, name: bpo.bpoEmployee.name })
      .from(bpo.bpoEmployee).where(eq(bpo.bpoEmployee.clientId, clientId)),
    db.select({ id: bpo.bpoPartner.id, cpf: bpo.bpoPartner.cpf, name: bpo.bpoPartner.name })
      .from(bpo.bpoPartner).where(eq(bpo.bpoPartner.clientId, clientId)),
  ]);
  const built = buildClientRows(clientId, data, { bpoEmployees, bpoPartners, modifiedBy });
  if (!dry) {
    // Rebuild ATÔMICO: wipe + insert numa transação. Se dois saves do mesmo
    // cliente correrem, serializam — sem projeção em estado parcial.
    await db.transaction(async (tx) => {
      if (wipe) await wipeClient(tx, s, clientId);
      for (const key of INSERT_ORDER) await insertRows(tx, s[key], built.rows[key]);
    });
  }
  return { counts: built.counts, blob: built.blob, coverage: built.coverage, validation: built.validation };
}

module.exports = { syncCoreTables, buildClientRows, wipeClient, INSERT_ORDER };
