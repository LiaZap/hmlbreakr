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
  sumComposite('operational_fixed', ['kitchen_gas', 'kitchen_oil']);

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

function calculateRevenue(formData) {
  if (!formData?.revenue_history?.months) return { latest: 0, avg: 0, months: 0 };
  const months = formData.revenue_history.months;
  const values = months.map(m => parseCurrency(m?.value)).filter(v => v > 0);
  if (values.length === 0) return { latest: 0, avg: 0, months: months.length };
  const latest = parseCurrency(months[months.length - 1]?.value);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return {
    latest: Math.round(latest * 100) / 100,
    avg: Math.round(avg * 100) / 100,
    months: months.length,
    withValues: values.length,
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
  };
}

module.exports = {
  parseCurrency,
  calculateFixedCosts,
  calculateRevenue,
  calculateClientFinancials,
};
