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
  if (!baseSalary) return { total: 0, breakdown: [] };
  const salary = parseCurrencyToNumber(baseSalary);

  const fgts = salary * 0.08;
  const prov13 = salary / 12;
  const provFerias = (salary * 1.3333) / 12;
  const fgtsProv = (prov13 + provFerias) * 0.08;
  const multa = (fgts + fgtsProv) * 0.50;
  const aviso = salary / 12;

  const total = salary + fgts + prov13 + provFerias + fgtsProv + multa + aviso;

  return {
    total,
    breakdown: [
      { item: '01', comp: 'Salário Base', formula: 'Valor Nominal', val: salary, desc: 'Valor bruto em contrato.' },
      { item: '02', comp: 'FGTS Mensal', formula: 'Salário * 0.08', val: fgts, desc: 'Depósito mensal obrigatório.' },
      { item: '03', comp: 'Provisão 13º', formula: 'Salário / 12', val: prov13, desc: 'Reserva para 13º salário.' },
      { item: '04', comp: 'Provisão Férias', formula: '(Salário * 1.3333)/12', val: provFerias, desc: 'Férias + 1/3 constitucional.' },
      { item: '05', comp: 'FGTS s/ Prov.', formula: '(13º + Férias) * 0.08', val: fgtsProv, desc: 'FGTS sobre provisões.' },
      { item: '06', comp: 'Reserva Multa', formula: '(FGTS Total) * 0.50', val: multa, desc: 'Multa rescisória (40% + 10%).' },
      { item: '07', comp: 'Aviso Prévio', formula: 'Salário / 12', val: aviso, desc: 'Provisão para indenização.' },
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
