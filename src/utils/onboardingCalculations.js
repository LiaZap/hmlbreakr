// Shared calculation and formatting utilities for onboarding (desktop + mobile)

export const formatCurrency = (raw) => {
  if (!raw && raw !== 0) return '';
  const digits = raw.toString().replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  return (num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const parseCurrencyToNumber = (value) => {
  if (!value) return 0;
  return parseFloat(value.toString().replace(/\D/g, '')) / 100 || 0;
};

export const calculateProLabore = (value) => {
  if (!value) return 0;
  const num = parseCurrencyToNumber(value);
  return num + (num * 0.11);
};

export const calculateCLT = (baseSalary) => {
  if (!baseSalary) return { total: 0, totalEfetivo: 0, totalProvisionamento: 0, breakdown: [] };
  const salary = parseCurrencyToNumber(baseSalary);

  // Custos efetivos (saem do caixa todo mês)
  const fgts = salary * 0.08;
  const totalEfetivo = salary + fgts;

  // Provisionamento (reservas que viram caixa em datas específicas: 13º, férias, rescisão)
  const prov13 = salary / 12;
  const provFerias = (salary * 1.3333) / 12;
  const fgtsProv = (prov13 + provFerias) * 0.08;
  const multa = (fgts + fgtsProv) * 0.50;
  const aviso = salary / 12;
  const totalProvisionamento = prov13 + provFerias + fgtsProv + multa + aviso;

  // Total completo (caixa mensal + provisionamento)
  const total = totalEfetivo + totalProvisionamento;

  return {
    total,                  // legado: mantém compatibilidade — soma de tudo
    totalEfetivo,           // novo: salário + FGTS (caixa mensal)
    totalProvisionamento,   // novo: reservas (13º, férias, FGTS sobre provisão, multa, aviso)
    breakdown: [
      { item: '01', comp: 'Salário Base', formula: 'Valor Nominal', val: salary, desc: 'Valor bruto em contrato.', type: 'efetivo' },
      { item: '02', comp: 'FGTS Mensal', formula: 'Salário * 0.08', val: fgts, desc: 'Depósito mensal obrigatório.', type: 'efetivo' },
      { item: '03', comp: 'Provisão 13º', formula: 'Salário / 12', val: prov13, desc: 'Reserva para 13º salário.', type: 'provisao' },
      { item: '04', comp: 'Provisão Férias', formula: '(Salário * 1.3333)/12', val: provFerias, desc: 'Férias + 1/3 constitucional.', type: 'provisao' },
      { item: '05', comp: 'FGTS s/ Prov.', formula: '(13º + Férias) * 0.08', val: fgtsProv, desc: 'FGTS sobre provisões.', type: 'provisao' },
      { item: '06', comp: 'Reserva Multa', formula: '(FGTS Total) * 0.50', val: multa, desc: 'Multa rescisória (40% + 10%).', type: 'provisao' },
      { item: '07', comp: 'Aviso Prévio', formula: 'Salário / 12', val: aviso, desc: 'Provisão para indenização.', type: 'provisao' },
    ]
  };
};

// Calcula custo de funcionário PJ (Pessoa Jurídica)
// Sem encargos trabalhistas, mas com risco fiscal/legal se mascarar vínculo
export const calculatePJ = (baseValue) => {
  if (!baseValue) return { total: 0, totalEfetivo: 0, totalProvisionamento: 0, breakdown: [] };
  const value = parseCurrencyToNumber(baseValue);
  return {
    total: value,
    totalEfetivo: value,
    totalProvisionamento: 0,
    breakdown: [
      { item: '01', comp: 'Valor Contratado PJ', formula: 'Valor Nominal', val: value, desc: 'Sem encargos trabalhistas. Atenção a vínculo disfarçado.', type: 'efetivo' },
    ]
  };
};

// Calcula custo de Freelancer
// Pagamento direto, sem nenhum vínculo — risco alto se relação for contínua
export const calculateFreela = (baseValue) => {
  if (!baseValue) return { total: 0, totalEfetivo: 0, totalProvisionamento: 0, breakdown: [] };
  const value = parseCurrencyToNumber(baseValue);
  return {
    total: value,
    totalEfetivo: value,
    totalProvisionamento: 0,
    breakdown: [
      { item: '01', comp: 'Valor Freelancer', formula: 'Valor Nominal', val: value, desc: 'Pagamento eventual. ⚠️ Relação contínua pode gerar passivo trabalhista.', type: 'efetivo' },
    ]
  };
};

export const calculateDepreciation = (value, lifespan) => {
  if (!value || !lifespan) return 0;
  const val = parseCurrencyToNumber(value);
  const years = parseFloat(lifespan);
  if (years <= 0) return 0;
  return val / (years * 12);
};

export const getMonthLabel = (monthStr) => {
  if (!monthStr) return '';
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const parts = monthStr.split('/');
  if (parts.length !== 2) return monthStr;
  const idx = parseInt(parts[0], 10) - 1;
  return months[idx] ? `${months[idx]}/${parts[1]}` : monthStr;
};

export const formatMonthInput = (value) => {
  let clean = value.replace(/[^0-9/]/g, '');
  if (clean.length === 2 && !clean.includes('/')) {
    clean += '/';
  }
  if (clean.length > 7) clean = clean.slice(0, 7);
  return clean;
};
