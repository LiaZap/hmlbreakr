'use strict';
/**
 * coreRead — reconstrói o shape do blob a partir das tabelas Drizzle (F3 leitura).
 *
 * INVERSO de coreSync.buildClientRows. Quando a flag por cliente
 * (Client.readInsumosFromTables) está ON, o GET /client/:hash serve
 * operational.insumos vindo de Ingredient(+IngredientComponent) em vez do blob.
 *
 * Blob continua a FONTE DA VERDADE do write (F2 dual-write intacto); isto é só
 * leitura. Usa legacyId como `id` (o uuid da tabela churna a cada save; legacyId
 * é estável e é a chave que o front usa pra casar insumo/subIngredient).
 *
 * Ver docs/plano-migracao-castelo-de-areia.md (F3).
 */
const { and, eq, inArray, asc } = require('drizzle-orm');

// numeric (string/num) → 'R$ 5,00' / 'R$ 0,675' (PT-BR; mín. 2 casas, preserva mais). vazio → ''
function brMoney(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!isFinite(n)) return '';
  let s = n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  if (!s.includes('.')) s += '.00';
  else { const d = s.split('.')[1].length; if (d < 2) s += '0'.repeat(2 - d); }
  return 'R$ ' + s.replace('.', ',');
}
// numeric → string PT com vírgula, sem zeros à direita ('1.357000'→'1,357'; '5'→'5')
function brNum(v, maxDec = 6) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!isFinite(n)) return '';
  let s = n.toFixed(maxDec);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}
// número "puro" (qtd) — front aceita ponto ou vírgula; mantém simples
function plainNum(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!isFinite(n)) return '';
  let s = n.toFixed(6);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
// rendimento: yield(num) + yieldUnit → "1000kg" / "0kg" / ""
function recomposeYield(yieldVal, unit) {
  const u = unit || '';
  if (yieldVal == null || yieldVal === '') return u;   // só unidade ("kg") ou vazio
  return plainNum(yieldVal) + u;
}
const epochOf = (d) => (d instanceof Date ? d.getTime() : (d ? new Date(d).getTime() : undefined));

// Reconstrói UM subIngredient (snapshot completo) a partir da linha IngredientComponent.
function subFromRow(c) {
  const sub = { id: c.legacyId || c.id, name: c.name, isPrepared: !!c.isPrepared };
  const put = (k, v) => { if (v !== undefined && v !== null && v !== '') sub[k] = v; };
  put('category', c.category);
  sub.qty = plainNum(c.qty);
  put('unit', c.unit);
  sub.price = brNum(c.unitCost);
  sub.custo = brMoney(c.lineCost);
  put('rendimento', recomposeYield(c.yield, c.yieldUnit));
  put('defaultQty', plainNum(c.defaultQty));
  put('grossQty', plainNum(c.grossQty));
  put('netQty', plainNum(c.netQty));
  put('fc', plainNum(c.correctionFactor));
  put('usageUnit', c.usageUnit);
  put('originalUnit', c.originalUnit);
  // emite cada campo pela própria presença (o blob não é estritamente prep XOR compra)
  put('purchaseUnit', c.packUnit);
  put('purchaseTotal', brNum(c.packPrice));
  put('purchaseQty', plainNum(c.packQty));
  put('rendimentoPreparado', plainNum(c.preparedYield));
  put('rendimentoUnit', c.preparedYieldUnit);
  if (c.preparedTotalCost != null) sub.totalCost = Number(c.preparedTotalCost);
  const lu = epochOf(c.sourceUpdatedAt);
  if (lu) sub.lastUpdated = lu;
  return sub;
}

// Monta a árvore de subIngredients (agrupadas por parentComponentId). rootId=null = 1º nível.
function buildSubTree(componentsByParent, parentId) {
  const children = componentsByParent.get(parentId) || [];
  return children
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((c) => {
      const sub = subFromRow(c);
      const nested = buildSubTree(componentsByParent, c.id);
      if (nested.length) sub.subIngredients = nested;
      return sub;
    });
}

/**
 * Reconstrói operational.insumos do cliente a partir das tabelas.
 * @returns {Promise<Array>} array de insumos no shape do blob.
 */
async function reconstructInsumos(db, s, clientId) {
  const ings = await db.select().from(s.ingredient)
    .where(and(eq(s.ingredient.clientId, clientId), eq(s.ingredient.isDeleted, false)));
  if (!ings.length) return [];

  // componentes de TODOS os insumos do cliente, agrupados por ingredientId raiz
  const ingIds = ings.map((i) => i.id);
  const comps = await db.select().from(s.ingredientComponent)
    .where(inArray(s.ingredientComponent.ingredientId, ingIds));
  const compsByIngredient = new Map();   // ingredientId → componentsByParent(Map)
  for (const c of comps) {
    if (!compsByIngredient.has(c.ingredientId)) compsByIngredient.set(c.ingredientId, new Map());
    const byParent = compsByIngredient.get(c.ingredientId);
    const pk = c.parentComponentId || null;
    if (!byParent.has(pk)) byParent.set(pk, []);
    byParent.get(pk).push(c);
  }

  return ings.map((it) => {
    const insumo = {
      id: it.legacyId || it.id,
      name: it.name,
      category: it.category || undefined,
      unit: it.unit || undefined,
      qty: plainNum(it.refQty),
      defaultQty: plainNum(it.defaultQty),
      grossQty: plainNum(it.grossQty),
      rendimento: recomposeYield(it.yield, it.yieldUnit),
      custo: brMoney(it.unitCost),
      price: brNum(it.price),
      isPrepared: !!it.isPrepared,
    };
    const lu = epochOf(it.sourceUpdatedAt);
    if (lu) insumo.lastUpdated = lu;

    if (it.isPrepared) {
      // sub-receita: campos de preparado + árvore de subIngredients
      insumo.rendimentoPreparado = plainNum(it.preparedYield);
      insumo.rendimentoUnit = it.preparedYieldUnit || undefined;
      insumo.totalCost = it.preparedTotalCost != null ? Number(it.preparedTotalCost) : undefined;
      const byParent = compsByIngredient.get(it.id);
      insumo.subIngredients = byParent ? buildSubTree(byParent, null) : [];
    } else {
      // insumo pronto: dados de compra
      insumo.purchaseUnit = it.packUnit || undefined;
      insumo.purchaseTotal = brNum(it.packPrice);
      insumo.purchaseQty = plainNum(it.packQty);
    }
    return insumo;
  });
}

const groupBy = (arr, key) => { const m = new Map(); for (const x of arr) { if (!m.has(x[key])) m.set(x[key], []); m.get(x[key]).push(x); } return m; };

// Reconstrói UM item de ficha (snapshot do insumo + uso). subIngredients vêm do
// insumo base (via ingredientId) — o item referencia o insumo top-level.
function itemToBlob(it, compsByItem) {
  const item = { id: it.legacyId || it.id, name: it.description, isPrepared: !!it.isPrepared };
  const put = (k, v) => { if (v !== undefined && v !== null && v !== '') item[k] = v; };
  put('category', it.category);
  item.qty = plainNum(it.quantity);
  put('unit', it.unit);
  item.price = brNum(it.unitCost);
  item.custo = brMoney(it.lineCost);
  put('defaultQty', plainNum(it.defaultQty));
  put('grossQty', plainNum(it.grossQty));
  put('netQty', plainNum(it.netQty));
  put('fc', plainNum(it.correctionFactor));
  put('usageUnit', it.usageUnit);
  put('purchaseUnit', it.purchaseUnit);
  put('originalUnit', it.originalUnit);
  put('purchaseQty', plainNum(it.purchaseQty));
  put('purchaseTotal', brNum(it.purchaseTotal));
  put('rendimento', recomposeYield(it.yield, it.yieldUnit));
  const lu = epochOf(it.sourceUpdatedAt); if (lu) item.lastUpdated = lu;
  if (it.isPrepared) {
    put('rendimentoPreparado', plainNum(it.preparedYield));
    put('rendimentoUnit', it.preparedYieldUnit);
    if (it.preparedTotalCost != null) item.totalCost = Number(it.preparedTotalCost);
    const byParent = it.id ? compsByItem.get(it.id) : null;
    item.subIngredients = byParent ? buildSubTree(byParent, null) : [];
  }
  return item;
}

/**
 * Reconstrói operational.fichas do cliente a partir das tabelas
 * (TechnicalSheet + items/modules/options/steps). fotoPrato base64 não migra →
 * fallback do blob (blobFichasById: { [legacyId]: fichaDoBlob }).
 */
async function reconstructFichas(db, s, clientId, blobFichasById = {}) {
  const sheets = await db.select().from(s.technicalSheet)
    .where(and(eq(s.technicalSheet.clientId, clientId), eq(s.technicalSheet.isDeleted, false)));
  if (!sheets.length) return [];
  const sheetIds = sheets.map((x) => x.id);
  const sheetLegacyById = new Map(sheets.map((x) => [x.id, x.legacyId || x.id]));

  const [items, modules, steps] = await Promise.all([
    db.select().from(s.technicalSheetItem).where(inArray(s.technicalSheetItem.sheetId, sheetIds)),
    db.select().from(s.sheetModule).where(inArray(s.sheetModule.sheetId, sheetIds)),
    db.select().from(s.technicalSheetStep).where(inArray(s.technicalSheetStep.sheetId, sheetIds)),
  ]);
  const moduleIds = modules.map((m) => m.id);
  const options = moduleIds.length
    ? await db.select().from(s.sheetModuleOption).where(inArray(s.sheetModuleOption.moduleId, moduleIds)) : [];

  // subIngredients dos itens preparados vêm do PRÓPRIO item (snapshot fiel, technicalSheetItemId)
  const itemIds = items.filter((it) => it.isPrepared).map((it) => it.id);
  const comps = itemIds.length
    ? await db.select().from(s.ingredientComponent).where(inArray(s.ingredientComponent.technicalSheetItemId, itemIds)) : [];
  const compsByItem = new Map();
  for (const c of comps) {
    if (!compsByItem.has(c.technicalSheetItemId)) compsByItem.set(c.technicalSheetItemId, new Map());
    const bp = compsByItem.get(c.technicalSheetItemId);
    const pk = c.parentComponentId || null;
    if (!bp.has(pk)) bp.set(pk, []);
    bp.get(pk).push(c);
  }

  const itemsBySheet = groupBy(items, 'sheetId');
  const modulesBySheet = groupBy(modules, 'sheetId');
  const optionsByModule = groupBy(options, 'moduleId');
  const stepsBySheet = groupBy(steps, 'sheetId');

  return sheets.map((sh) => {
    const legacyId = sh.legacyId || sh.id;
    const f = { id: legacyId, name: sh.name, isModular: !!sh.isModular };
    const put = (k, v) => { if (v !== undefined && v !== null && v !== '') f[k] = v; };
    // modular usa a chave `category`; simples usa `type` (mesmo dado denormalizado)
    if (sh.category) f[sh.isModular ? 'category' : 'type'] = sh.category;
    put('rendimento', recomposeYield(sh.yield, sh.yieldUnit));
    f.custoTotal = brMoney(sh.totalCost);
    f.precoVenda = brMoney(sh.sellingPrice);
    put('custoInsumos', brMoney(sh.costIngredients));
    put('custoEmbalagem', brMoney(sh.costPackaging));
    put('custoMin', brMoney(sh.costMin));
    put('custoMax', brMoney(sh.costMax));
    put('vendasMes', plainNum(sh.salesEstimateMonthly));
    if (sh.prepTime != null && sh.prepTime !== '') f.tempoPreparo = sh.prepTime;
    put('utensilios', sh.utensils);
    put('finalizacao', sh.finishing);
    f.isImported = !!sh.isImported;
    if (sh.progress != null) f.progress = sh.progress;
    const cAt = epochOf(sh.sourceCreatedAt); if (cAt) f.createdAt = cAt;
    const uAt = epochOf(sh.sourceUpdatedAt); if (uAt) f.lastUpdated = uAt;
    // fotoPrato base64 não migra → fallback do blob; senão null (chave preservada)
    f.fotoPrato = sh.dishPhoto || (blobFichasById[String(legacyId)] || {}).fotoPrato || null;
    f.modoPreparo = (stepsBySheet.get(sh.id) || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0)).map((x) => x.text);

    if (sh.isModular) {
      f.ingredients = [];
      f.modules = (modulesBySheet.get(sh.id) || []).map((m) => ({
        id: m.legacyId || m.id, name: m.name, required: !!m.required,
        options: (optionsByModule.get(m.id) || []).map((o) => {
          const opt = { id: o.legacyId || o.id, name: o.name, default: !!o.isDefault };
          if (o.cost != null) opt.custo = Number(o.cost);
          if (o.linkedSheetId) opt.linkedFichaId = sheetLegacyById.get(o.linkedSheetId) || null;
          return opt;
        }),
      }));
    } else {
      const ings = (itemsBySheet.get(sh.id) || []).map((it) => itemToBlob(it, compsByItem));
      f.ingredients = ings;
      f.insumos = ings.length;   // contador derivado (o blob guarda)
    }
    return f;
  });
}

/**
 * Reconstrói menuEngineering do cliente a partir de MenuItem. Shape simples:
 * { id(number), name, category, sales, price, cost, fichaId? }. Valores numéricos.
 */
async function reconstructMenu(db, s, clientId) {
  const rows = await db.select().from(s.menuItem)
    .where(and(eq(s.menuItem.clientId, clientId), eq(s.menuItem.isDeleted, false)));
  if (!rows.length) return [];
  const sheetIds = [...new Set(rows.map((r) => r.sheetId).filter(Boolean))];
  let sheetLegacy = new Map();
  if (sheetIds.length) {
    const sheets = await db.select({ id: s.technicalSheet.id, legacyId: s.technicalSheet.legacyId })
      .from(s.technicalSheet).where(inArray(s.technicalSheet.id, sheetIds));
    sheetLegacy = new Map(sheets.map((x) => [x.id, x.legacyId || x.id]));
  }
  const numOrZero = (v) => (v == null || v === '') ? 0 : Number(v);
  return rows.map((r) => {
    const leg = String(r.legacyId || r.id);
    const m = { id: /^\d+$/.test(leg) ? Number(leg) : leg, name: r.name };
    if (r.category) m.category = r.category;
    m.sales = numOrZero(r.salesEstimate);          // sales é número no blob
    m.price = brMoney(r.price);                    // price/cost são strings "R$ x,yz"
    m.cost = brMoney(r.cost);
    if (r.sheetId) m.fichaId = sheetLegacy.get(r.sheetId) || null;
    return m;
  });
}

module.exports = { reconstructInsumos, reconstructFichas, reconstructMenu };
