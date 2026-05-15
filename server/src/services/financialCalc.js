/**
 * Cálculo de indicadores financeiros — espelha exatamente a lógica do DashboardContext.jsx
 * IMPORTANTE: qualquer mudança aqui precisa ser replicada no DashboardContext.jsx
 *
 * @param {object} formData — dados preenchidos pelo cliente no onboarding
 * @returns {object} { revenue, totalFixed, cfPct, ... }
 */

// Parse "R$ 1.234,56" ou "1234,56" ou 1234.56 → 1234.56
const parseCurrency = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  let str = String(val).replace(/R\$/g, '').trim();
  if (str.includes(',') && str.includes('.')) str = str.replace(/\./g, '').replace(',', '.');
  else if (str.includes(',')) str = str.replace(',', '.');
  return parseFloat(str) || 0;
};

function calculateFixedCosts(formData) {
  if (!formData) return { fixedCosts: 0, personnelCosts: 0, totalFixedCosts: 0 };

  let fixedCosts = 0;
  const addCost = (val) => fixedCosts += parseCurrency(val);
  const sumComposite = (parentId, fields) => {
    if (!formData[parentId]) return;
    fields.forEach(f => addCost(formData[parentId][f]));
  };

  // === Location ===
  if (formData.location_costs) {
    addCost(formData.location_costs.rent);
    addCost(parseCurrency(formData.location_costs.iptu_annual) / 12);
  }

  // === Utilities, Recurring, Operational ===
  sumComposite('utilities', ['energy', 'water', 'internet', 'telefone', 'security', 'security_guard']);
  sumComposite('recurring_services', ['pest_control', 'waste_removal', 'cleaning_supplies']);
  sumComposite('operational_fixed', ['kitchen_gas', 'kitchen_oil', 'disposables']);

  // === Monthly Services (lista dinâmica) ===
  if (Array.isArray(formData.monthly_services)) {
    formData.monthly_services.forEach(item => addCost(item?.value));
  }

  // === Admin Systems ===
  sumComposite('admin_systems', ['software_pdv', 'accountant', 'card_machine_rent']);
  if (formData.identity?.is_mei === 'Sim') {
    sumComposite('admin_systems', ['taxes_das']);
  }

  // === Marketing ===
  sumComposite('marketing_structure', ['agency', 'ads_budget']);
  if (formData.marketing_structure?.gifts_cost && formData.marketing_structure?.gifts_qty) {
    const giftCost = parseCurrency(formData.marketing_structure.gifts_cost);
    const giftQty = parseFloat(formData.marketing_structure.gifts_qty) || 0;
    fixedCosts += giftCost * giftQty;
  }

  // === Marketplaces (fixed monthly fee) ===
  if (Array.isArray(formData.fees_marketplaces)) {
    formData.fees_marketplaces.forEach(item => addCost(item?.monthly_fee));
  }

  // === Vehicles ===
  if (Array.isArray(formData.vehicles)) {
    formData.vehicles.forEach(v => {
      addCost(v.installment);
      addCost(v.maintenance_monthly);
      addCost(parseCurrency(v.insurance_annual) / 12);
      addCost(parseCurrency(v.ipva_annual) / 12);
    });
  }

  // === Equipment (Depreciação fixa 5 anos = 60 meses) ===
  if (Array.isArray(formData.equipment)) {
    formData.equipment.forEach(eq => {
      const val = parseCurrency(eq.value);
      const years = parseFloat(eq.lifespan) || 5;
      if (years > 0) {
        fixedCosts += val / (years * 12);
      }
    });
  }

  // === Other Fixed Costs (lista dinâmica) ===
  if (Array.isArray(formData.other_fixed_costs)) {
    formData.other_fixed_costs.forEach(item => addCost(item?.value));
  }

  // === Personnel (partners + employees + benefícios) ===
  let personnelCosts = 0;

  if (Array.isArray(formData.partners)) {
    formData.partners.forEach(p => {
      const pl = parseCurrency(p.pro_labore);
      personnelCosts += pl + (pl * 0.11); // INSS 11%
    });
  }

  if (Array.isArray(formData.employees)) {
    formData.employees.forEach(e => {
      const base = parseCurrency(e.base_salary);
      const premio = parseCurrency(e.premio);
      if (e.regime === 'CLT') {
        const fgts = base * 0.08;
        const prov13 = base / 12;
        const provFerias = (base * 1.3333) / 12;
        const fgtsProv = (prov13 + provFerias) * 0.08;
        const multa = (fgts + fgtsProv) * 0.50;
        const aviso = base / 12;
        const aviso13 = aviso / 12;
        const avisoFerias = (aviso + aviso / 3) / 12;
        const avisoFgts = (aviso13 + avisoFerias) * 0.08;
        const reserves = fgts + prov13 + provFerias + fgtsProv + multa + aviso + aviso13 + avisoFerias + avisoFgts;
        personnelCosts += base + reserves + premio;
      } else {
        personnelCosts += base + premio;
      }
    });

    // Benefícios por funcionário
    formData.employees.forEach(emp => {
      const transValue = parseCurrency(emp.transport_value);
      const transQty = parseFloat(emp.transport_qty) || 0;
      const workDays = parseFloat(emp.work_days) || 0;
      const foodCost = parseCurrency(emp.food_cost);
      personnelCosts += (transValue * transQty * workDays);
      personnelCosts += (foodCost * workDays);
    });
  }

  // Legacy: benefícios agregados (formato antigo)
  if (formData.benefits && !formData.employees?.[0]?.transport_value) {
    const transValue = parseCurrency(formData.benefits.transport_value);
    const transQty = parseFloat(formData.benefits.transport_qty) || 0;
    const workDays = parseFloat(formData.benefits.work_days) || 0;
    const foodCost = parseCurrency(formData.benefits.food_cost);
    const empCount = formData.employees ? formData.employees.length : 1;
    personnelCosts += (transValue * transQty * workDays * empCount);
    personnelCosts += (foodCost * workDays * empCount);
  }

  return {
    fixedCosts: Math.round(fixedCosts * 100) / 100,
    personnelCosts: Math.round(personnelCosts * 100) / 100,
    totalFixedCosts: Math.round((fixedCosts + personnelCosts) * 100) / 100,
  };
}

// Parse "MM/AAAA" -> número comparável (AAAA*12 + MM). Inválido -> -Infinity.
function monthKey(m) {
  const parts = String(m?.month || '').split('/');
  if (parts.length !== 2) return -Infinity;
  const mm = parseInt(parts[0], 10);
  const yyyy = parseInt(parts[1], 10);
  if (!mm || !yyyy) return -Infinity;
  return yyyy * 12 + mm;
}

function calculateRevenue(formData) {
  // Shape canônico (onboarding): revenue_history = Array de { month, amount }.
  // Shape legado tolerado: { months: [{ month, value }] }.
  const rh = formData?.revenue_history;
  const months = Array.isArray(rh)
    ? rh
    : (Array.isArray(rh?.months) ? rh.months : null);
  if (!months || months.length === 0) return { latest: 0, avg: 0, months: 0 };

  // amount é o campo canônico; value é fallback do shape legado.
  const valOf = (m) => parseCurrency(m?.amount != null ? m.amount : m?.value);
  const values = months.map(valOf).filter(v => v > 0);
  if (values.length === 0) return { latest: 0, avg: 0, months: months.length };

  // "latest" = mês cronologicamente mais recente (o array do onboarding é
  // gerado em ordem retroativa, então não dá pra confiar na posição).
  const latestMonth = months.reduce((best, m) =>
    monthKey(m) > monthKey(best) ? m : best
  );
  const latest = valOf(latestMonth);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return {
    latest: Math.round(latest * 100) / 100,
    avg: Math.round(avg * 100) / 100,
    months: months.length,
    withValues: values.length,
  };
}

// Pró-labore total (soma dos sócios com +11% INSS) — separado para o DRE
function calculateProLabore(formData) {
  if (!Array.isArray(formData?.partners)) return 0;
  return formData.partners.reduce((acc, p) => {
    const pl = parseCurrency(p.pro_labore);
    return acc + pl + (pl * 0.11);
  }, 0);
}

// Estimativa de impostos sobre faturamento (Simples Nacional Anexo I) ou MEI fixo
function estimateTaxRate(formData, revenue) {
  if (formData.identity?.is_mei === 'Sim') return 0; // MEI: imposto fixo já entra em DAS (custo fixo), não percentual aqui
  if (formData.identity?.tax_regime !== 'Simples Nacional') return 0;
  const userRate = formData.admin_systems?.simples_rate;
  const cleanRate = userRate ? parseFloat(String(userRate).replace(',', '.')) : 0;
  if (cleanRate > 0) return cleanRate / 100;
  // Fallback: tabela Anexo I (Comércio) com RBT12 anualizado
  const rbt12 = revenue * 12;
  if (rbt12 <= 180000) return 0.04;
  if (rbt12 <= 360000) return ((rbt12 * 0.073) - 5940) / rbt12;
  if (rbt12 <= 720000) return ((rbt12 * 0.095) - 13860) / rbt12;
  if (rbt12 <= 1800000) return ((rbt12 * 0.107) - 22500) / rbt12;
  if (rbt12 <= 3600000) return ((rbt12 * 0.143) - 87300) / rbt12;
  return ((rbt12 * 0.19) - 378000) / rbt12;
}

// Taxa média ponderada de cartão (débito + crédito)
function estimateCardFeeRate(formData) {
  if (!Array.isArray(formData?.fees_cards)) return 0;
  const valid = formData.fees_cards.filter(c => c?.rate);
  if (valid.length === 0) return 0;
  const total = valid.reduce((s, c) => s + (parseFloat(String(c.rate).replace(',', '.')) || 0), 0);
  return total / valid.length / 100;
}

// Comissão média ponderada de marketplace (commission * sales_pct)
function estimateMarketplaceFeeRate(formData) {
  if (!Array.isArray(formData?.fees_marketplaces)) return 0;
  let weighted = 0;
  formData.fees_marketplaces.forEach(m => {
    const comm = parseFloat(String(m.commission || '0').replace(',', '.').replace('%', '')) || 0;
    const sales = parseFloat(String(m.sales_percentage || '0').replace(',', '.').replace('%', '')) || 0;
    weighted += (comm * sales) / 100;
  });
  return weighted / 100;
}

// CMV teórico (% sobre receita) calculado a partir das fichas técnicas
function estimateCMVRate(data) {
  const fichas = data?.operational?.fichas || [];
  const withPrice = fichas.filter(f => parseCurrency(f.precoVenda) > 0 && parseCurrency(f.custoTotal) > 0);
  if (withPrice.length === 0) return 0;
  const avg = withPrice.reduce((s, f) => s + (parseCurrency(f.custoTotal) / parseCurrency(f.precoVenda)), 0) / withPrice.length;
  return avg;
}

// Calcula DRE aberto pra exibição no Painel ADM (BAH-026)
function calculateDRE(clientData) {
  const data = typeof clientData === 'string' ? JSON.parse(clientData) : clientData;
  if (!data?.formData) return null;
  const fd = data.formData;
  const rev = calculateRevenue(fd);
  const receitaBruta = rev.latest;
  if (receitaBruta === 0) return null;

  const costs = calculateFixedCosts(fd);
  const proLabore = calculateProLabore(fd);
  const despesasFixas = costs.totalFixedCosts - proLabore; // separa pró-labore das despesas

  const taxRate = estimateTaxRate(fd, receitaBruta);
  const cardRate = estimateCardFeeRate(fd);
  const mpRate = estimateMarketplaceFeeRate(fd);
  const cmvRate = estimateCMVRate(data);

  const impostos = receitaBruta * taxRate;
  const taxasCartao = receitaBruta * cardRate;
  const taxasMarketplace = receitaBruta * mpRate;
  const taxasVenda = taxasCartao + taxasMarketplace;
  const deducoes = impostos + taxasVenda;
  const receitaLiquida = receitaBruta - deducoes;

  const cmv = receitaBruta * cmvRate;
  const margemContribuicao = receitaLiquida - cmv;

  const resultadoOperacional = margemContribuicao - despesasFixas;
  const lucroLiquido = resultadoOperacional - proLabore;

  const pct = (v) => receitaBruta > 0 ? (v / receitaBruta) * 100 : 0;

  return {
    receitaBruta,
    deducoes,
    impostos,
    taxasVenda,
    taxasCartao,
    taxasMarketplace,
    receitaLiquida,
    cmv,
    cmvRate: cmvRate * 100,
    margemContribuicao,
    despesasFixas,
    proLabore,
    resultadoOperacional,
    lucroLiquido,
    isProfit: lucroLiquido >= 0,
    // Percentuais
    deducoesPct: pct(deducoes),
    impostosPct: pct(impostos),
    taxasVendaPct: pct(taxasVenda),
    receitaLiquidaPct: pct(receitaLiquida),
    cmvPct: pct(cmv),
    margemContribuicaoPct: pct(margemContribuicao),
    despesasFixasPct: pct(despesasFixas),
    proLaborePct: pct(proLabore),
    resultadoOperacionalPct: pct(resultadoOperacional),
    lucroLiquidoPct: pct(lucroLiquido),
  };
}

function calculateClientFinancials(clientData) {
  const data = typeof clientData === 'string' ? JSON.parse(clientData) : clientData;
  if (!data || !data.formData) return null;

  const formData = data.formData;
  const rev = calculateRevenue(formData);
  const costs = calculateFixedCosts(formData);
  const cfPct = rev.latest > 0 ? (costs.totalFixedCosts / rev.latest) * 100 : 0;

  return {
    revenue: rev.latest,
    avgRevenue: rev.avg,
    revenueMonths: rev.months,
    totalFixed: costs.totalFixedCosts,
    fixedCosts: costs.fixedCosts,
    personnelCosts: costs.personnelCosts,
    cfPct: Math.round(cfPct * 10) / 10,
    fichas: (data.operational?.fichas || []).length,
    insumos: (data.operational?.insumos || []).length,
    // DRE Aberto (BAH-026)
    dre: calculateDRE(data),
  };
}

module.exports = {
  parseCurrency,
  calculateFixedCosts,
  calculateRevenue,
  calculateClientFinancials,
  calculateDRE,
};
