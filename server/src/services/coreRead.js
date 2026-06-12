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

module.exports = { reconstructInsumos };
