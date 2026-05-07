/**
 * Client Health & Operational Diagnostics — utility compartilhado pelo Painel ADM
 *
 * Calcula métricas operacionais REAIS de restaurante a partir do client.data:
 *  - CMV % (Custo de Matéria-prima)
 *  - BASE % (Custos fixos + impostos + cartão)
 *  - Lucro líquido %
 *  - Faturamento mensal + tendência
 *  - Maturidade de cardápio (% fichas com custo, com preço)
 *  - % marketplace das vendas (dependência)
 *
 * E gera alertas acionáveis pra cada cliente.
 *
 * Limites usados (benchmarks gastronomia):
 *  - CMV saudável: 28-32% | risco >35% | crítico >40%
 *  - BASE saudável: <55% | apertado 55-65% | crítico >65%
 *  - Lucro líq saudável: >8% | apertado 3-8% | risco <3% | prejuízo <0%
 *  - Marketplace saudável: <20% | atenção 20-30% | dependência >30%
 *  - Ficha técnica completa: >80% pratos com custo
 *  - Engagement: atualização nos últimos 14 dias
 */

/**
 * Helper compartilhado pra extrair logo do cliente, tentando vários campos
 * possíveis em ordem de preferência. Padroniza o lookup pra todos componentes.
 */
export function getClientLogo(client) {
  if (!client) return null;
  try {
    const data = typeof client.data === 'string' ? JSON.parse(client.data || '{}') : (client.data || {});
    return data?.restaurant?.logo
      || data?.user?.photo
      || data?.profile?.photo
      || data?.formData?.identity?.business_logo
      || null;
  } catch { return null; }
}

/**
 * Helper compartilhado pra extrair tipo de cozinha do cliente. Default consistente.
 */
export function getClientCuisine(client) {
  if (!client) return 'Não informado';
  try {
    const data = typeof client.data === 'string' ? JSON.parse(client.data || '{}') : (client.data || {});
    return data?.formData?.identity?.cuisine_type
      || data?.formData?.cuisine_type
      || 'Não informado';
  } catch { return 'Não informado'; }
}

const parseValue = (val) => {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  let s = String(val).replace(/R\$/g, '').trim();
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  return parseFloat(s) || 0;
};

const parsePct = (val) => {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(',', '.').replace('%', '').trim()) || 0;
};

/**
 * Extrai métricas operacionais de um client.data (parsed)
 * Retorna null se cliente sem dados (não onboarded).
 */
export function computeClientHealth(data) {
  if (!data || typeof data !== 'object') return null;

  const fd = data.formData || {};
  const op = data.operational || {};
  const fichas = op.fichas || [];
  const insumos = op.insumos || [];
  const breakEven = data.breakEven || {};

  // Faturamento atual (mês mais recente com dados)
  const revenueHistory = Array.isArray(fd.revenue_history) ? fd.revenue_history : [];
  const validRevenues = revenueHistory
    .filter(r => r?.month && r?.amount)
    .map(r => ({ month: r.month, value: parseValue(r.amount) }))
    .sort((a, b) => {
      const [ma, ya] = a.month.split('/').map(Number);
      const [mb, yb] = b.month.split('/').map(Number);
      return (yb - ya) || (mb - ma);
    });

  const currentRevenue = validRevenues[0]?.value || 0;
  const prevRevenue = validRevenues[1]?.value || 0;
  const revenueChange = prevRevenue > 0
    ? ((currentRevenue - prevRevenue) / prevRevenue) * 100
    : 0;

  // BASE (custos fixos + impostos + cartão) — vem pré-calculado
  // Fix: tolera dados legados onde breakEven.base é número/string direto sem .value
  const baseRaw = breakEven?.base?.value ?? breakEven?.base ?? 0;
  const basePct = parsePct(baseRaw);
  const taxPct = parsePct(breakEven?.taxPercent || 0);
  const marketplaceFeePct = parsePct(breakEven?.marketplaceFeePct || 0);

  // CMV — calcula dos fichas com custo + venda + média ponderada por vendas
  const fichasComCusto = fichas.filter(f => parseValue(f.custoTotal) > 0);
  const fichasComPreco = fichas.filter(f => parseValue(f.precoVenda) > 0);
  const fichasComCustoEPreco = fichas.filter(f =>
    parseValue(f.custoTotal) > 0 && parseValue(f.precoVenda) > 0
  );

  let cmvPct = 0;
  if (fichasComCustoEPreco.length > 0) {
    let totalCusto = 0, totalReceita = 0;
    fichasComCustoEPreco.forEach(f => {
      const vendas = parseInt(f.vendasMes, 10) || 0;
      const custo = parseValue(f.custoTotal);
      const preco = parseValue(f.precoVenda);
      // Se tem vendas, pondera. Senão, média simples.
      const weight = vendas > 0 ? vendas : 1;
      totalCusto += custo * weight;
      totalReceita += preco * weight;
    });
    cmvPct = totalReceita > 0 ? (totalCusto / totalReceita) * 100 : 0;
  }

  // Lucro líquido = 100 - BASE - CMV (com impostos já em BASE)
  // Fix: se nao temos dados de CMV (cliente sem fichas com custo+preço+vendas),
  // lucroLiqPct fica indefinido — não dá pra avaliar saúde financeira ainda.
  // hasFinancialData controla se usamos lucro nas decisões.
  const hasFinancialData = fichasComCustoEPreco.length > 0;
  const lucroLiqPct = hasFinancialData ? (100 - basePct - cmvPct) : null;

  // Marketplace share (% das vendas vindo de marketplace)
  // Fix: clampa a 100% pra evitar valores absurdos quando user erra na soma
  const marketplaces = Array.isArray(fd.fees_marketplaces) ? fd.fees_marketplaces : [];
  const marketplaceSalesPctRaw = marketplaces.reduce((acc, m) => {
    return acc + parsePct(m.sales_percentage);
  }, 0);
  const marketplaceSalesPct = Math.min(100, marketplaceSalesPctRaw);

  // Maturidade do cardápio
  const fichasTotal = fichas.length;
  const insumosTotal = insumos.length;
  const fichasComCustoCount = fichasComCusto.length;
  const fichasComPrecoCount = fichasComPreco.length;
  const cardapioMaturidadePct = fichasTotal > 0
    ? Math.round((fichasComCustoCount / fichasTotal) * 100)
    : 0;

  // Engagement — última atualização (lastUpdated do dashboardData)
  const lastActivity = computeLastActivity(data);
  const daysSinceActivity = lastActivity
    ? Math.floor((Date.now() - lastActivity) / (1000 * 60 * 60 * 24))
    : Infinity;

  // BPO ativa
  const bpoActive = !!(data._bpo && data._bpo.enabled);

  // Cuisine type (pra benchmarks) — default consistente com getClientCuisine helper
  const cuisineType = fd.identity?.cuisine_type || fd.cuisine_type || 'Não informado';

  return {
    // Identificação
    cuisineType,

    // Métricas operacionais
    hasFinancialData,
    cmvPct: +cmvPct.toFixed(1),
    basePct: +basePct.toFixed(1),
    lucroLiqPct: lucroLiqPct !== null ? +lucroLiqPct.toFixed(1) : null,
    taxPct: +taxPct.toFixed(1),
    marketplaceFeePct: +marketplaceFeePct.toFixed(1),
    marketplaceSalesPct: +marketplaceSalesPct.toFixed(1),

    // Faturamento
    currentRevenue,
    prevRevenue,
    revenueChange: +revenueChange.toFixed(1),

    // Cardápio
    fichasTotal,
    fichasComCustoCount,
    fichasComPrecoCount,
    cardapioMaturidadePct,
    insumosTotal,

    // Engagement
    lastActivity,
    daysSinceActivity,
    bpoActive,

    // Onboarding
    onboardingCompleted: !!fd.onboarding_completed,

    // Status agregado
    health: classifyHealth({ cmvPct, basePct, lucroLiqPct, revenueChange, hasFinancialData }),
  };
}

/**
 * Classifica saúde geral em healthy / tight / risk / critical / unknown
 * Fix: 'unknown' pra clientes sem dados financeiros suficientes
 * (sem fichas com custo+preço). Não classifica como saudável quem nem tem
 * dados pra avaliar.
 */
function classifyHealth({ cmvPct, basePct, lucroLiqPct, revenueChange, hasFinancialData }) {
  // Sem dados suficientes pra avaliar saúde financeira
  if (!hasFinancialData || lucroLiqPct == null) {
    // Se BASE >65 sem fichas, ainda é crítico (custos fixos altos sem receita compensando)
    if (basePct > 65) return 'risk';
    return 'unknown';
  }
  // Critical: prejuízo OU CMV crítico OU queda forte de receita
  if (lucroLiqPct < 0 || cmvPct > 40 || revenueChange < -25) return 'critical';
  // Risk: lucro <3% OU CMV >35% OU BASE >65% OU queda 15-25%
  if (lucroLiqPct < 3 || cmvPct > 35 || basePct > 65 || revenueChange < -15) return 'risk';
  // Tight: lucro 3-8% OU CMV 32-35 OU BASE 55-65
  if (lucroLiqPct < 8 || cmvPct > 32 || basePct > 55) return 'tight';
  // Healthy
  return 'healthy';
}

/**
 * Computa última atividade do cliente (heurística pelos dados)
 * Fix: filtra timestamps futuros (cliente cadastrando "11/2026" enquanto
 * estamos em maio de 2026 não conta como "atividade hoje").
 */
function computeLastActivity(data) {
  const now = Date.now();
  const ts = [];
  // lastUpdated em fichas — só timestamps PASSADOS (anti-futuro)
  (data.operational?.fichas || []).forEach(f => {
    if (f.lastUpdated && f.lastUpdated <= now) ts.push(f.lastUpdated);
  });
  // daily revenue entries — datas reais de lançamento
  const daily = data.formData?.daily_revenue || {};
  Object.keys(daily).forEach(dateStr => {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime()) && d.getTime() <= now) ts.push(d.getTime());
  });
  // Não usamos revenue_history.month pra atividade — pode ter mês futuro/passado
  // arbitrário (cliente cadastra "Janeiro 2026" hoje). Esse não é sinal de atividade.
  return ts.length > 0 ? Math.max(...ts) : null;
}

/**
 * Gera lista de alertas acionáveis pra um cliente.
 * Cada alerta tem severidade, descrição, sugestão de ação.
 */
export function generateClientAlerts(health) {
  if (!health) return [];
  const alerts = [];

  // CMV crítico
  if (health.cmvPct > 40) {
    alerts.push({
      severity: 'critical',
      type: 'cmv_critical',
      title: `CMV ${health.cmvPct}% (saudável <32%)`,
      description: `Insumos consumindo ${health.cmvPct}% da receita. Margem está apertadíssima.`,
      action: 'Revisar fichas técnicas e/ou ajustar preços de venda',
      page: 'fichaTecnica',
    });
  } else if (health.cmvPct > 35) {
    alerts.push({
      severity: 'high',
      type: 'cmv_high',
      title: `CMV ${health.cmvPct}% (limite saudável 32%)`,
      description: 'Custo de matéria-prima acima do recomendado.',
      action: 'Atualizar custos dos insumos + revisar pratos com margem baixa',
      page: 'fichaTecnica',
    });
  }

  // Lucro líquido negativo (prejuízo) — só avalia se temos dados financeiros
  if (health.hasFinancialData && health.lucroLiqPct !== null) {
    if (health.lucroLiqPct < 0) {
      alerts.push({
        severity: 'critical',
        type: 'profit_negative',
        title: `Operando em prejuízo (${health.lucroLiqPct}%)`,
        description: 'Custos totais superam o faturamento. Ação imediata necessária.',
        action: 'Análise completa: cortar despesas + revisar mix de cardápio',
        page: 'home',
      });
    } else if (health.lucroLiqPct < 3) {
      alerts.push({
        severity: 'high',
        type: 'profit_thin',
        title: `Lucro líquido ${health.lucroLiqPct}% (saudável >8%)`,
        description: 'Margem muito apertada. Qualquer choque vira prejuízo.',
        action: 'Revisar BASE e/ou CMV com cliente',
        page: 'home',
      });
    }
  }

  // BASE alto (custos fixos consumindo lucro)
  if (health.basePct > 65) {
    alerts.push({
      severity: 'high',
      type: 'base_critical',
      title: `BASE ${health.basePct}% (saudável <55%)`,
      description: 'Custos fixos + impostos comendo o lucro inteiro.',
      action: 'Revisar folha, aluguel, contratos recorrentes',
      page: 'home',
    });
  }

  // Faturamento despencando
  if (health.revenueChange < -25 && health.prevRevenue > 0) {
    alerts.push({
      severity: 'critical',
      type: 'revenue_crash',
      title: `Faturamento ${health.revenueChange}% vs mês anterior`,
      description: `Caiu de R$ ${(health.prevRevenue / 1000).toFixed(1)}k → R$ ${(health.currentRevenue / 1000).toFixed(1)}k`,
      action: 'Ligar HOJE e entender o que aconteceu — risco de churn',
      page: null,
    });
  } else if (health.revenueChange < -15 && health.prevRevenue > 0) {
    alerts.push({
      severity: 'high',
      type: 'revenue_drop',
      title: `Faturamento ${health.revenueChange}% (queda significativa)`,
      description: `R$ ${(health.prevRevenue / 1000).toFixed(1)}k → R$ ${(health.currentRevenue / 1000).toFixed(1)}k`,
      action: 'Investigar causa: sazonalidade ou problema operacional?',
      page: null,
    });
  }

  // Maturidade de cardápio baixa
  if (health.fichasTotal > 5 && health.cardapioMaturidadePct < 50) {
    alerts.push({
      severity: 'medium',
      type: 'menu_immature',
      title: `${health.fichasTotal - health.fichasComCustoCount} fichas sem custo (${100 - health.cardapioMaturidadePct}%)`,
      description: 'Sem custo = não sabemos lucro real desses pratos.',
      action: 'Cadastrar custos das fichas faltantes ou importar matriz',
      page: 'fichaTecnica',
    });
  }

  // Marketplace dependência
  if (health.marketplaceSalesPct > 30) {
    alerts.push({
      severity: 'medium',
      type: 'marketplace_dependency',
      title: `${health.marketplaceSalesPct}% das vendas via marketplace`,
      description: 'Dependência forte de plataformas — comissão alta + risco de mudança de regra.',
      action: 'Estimular venda direta (app próprio, balcão) com promoções diferenciadas',
      page: 'engenhariaMenu',
    });
  }

  // Inativo (sem atualização)
  if (health.daysSinceActivity > 30 && health.daysSinceActivity !== Infinity) {
    alerts.push({
      severity: 'medium',
      type: 'inactive',
      title: `Sem atividade há ${health.daysSinceActivity} dias`,
      description: 'Cliente parou de usar o sistema — risco de churn silencioso.',
      action: 'Mensagem de reengajamento + entender bloqueador',
      page: null,
    });
  }

  // Onboarding parado
  if (!health.onboardingCompleted && health.fichasTotal === 0 && health.daysSinceActivity > 7) {
    const daysText = isFinite(health.daysSinceActivity)
      ? `nos últimos ${health.daysSinceActivity} dias`
      : 'desde o cadastro';
    alerts.push({
      severity: 'medium',
      type: 'onboarding_stuck',
      title: 'Onboarding parado',
      description: `Cadastrou-se mas não preencheu nada ${daysText}.`,
      action: 'Email/WhatsApp guiado pelo próximo passo',
      page: null,
    });
  }

  return alerts;
}

/**
 * Severity ranking pra ordenação
 */
export const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Agrega health de múltiplos clientes em métricas de portfólio
 */
export function aggregatePortfolio(healthList) {
  const valid = healthList.filter(h => h !== null);
  if (valid.length === 0) {
    return {
      total: 0,
      cmvAvg: 0, baseAvg: 0, profitAvg: 0,
      revenueTotal: 0, revenueChangeAvg: 0,
      healthy: 0, tight: 0, risk: 0, critical: 0,
      withMature: 0, withBpo: 0, withRevenue: 0,
    };
  }
  const sum = (arr, fn) => arr.reduce((a, b) => a + fn(b), 0);
  const avg = (arr, fn) => arr.length > 0 ? sum(arr, fn) / arr.length : 0;
  // Fix: profit só média entre quem TEM dados financeiros (lucroLiqPct nao-null)
  const withProfit = valid.filter(h => h.lucroLiqPct !== null && isFinite(h.lucroLiqPct));
  const withCmv = valid.filter(h => h.cmvPct > 0); // CMV 0 = sem dados
  return {
    total: valid.length,
    cmvAvg: withCmv.length > 0 ? +avg(withCmv, h => h.cmvPct).toFixed(1) : 0,
    baseAvg: +avg(valid, h => h.basePct).toFixed(1),
    profitAvg: withProfit.length > 0 ? +avg(withProfit, h => h.lucroLiqPct).toFixed(1) : null,
    profitClientCount: withProfit.length,
    cmvClientCount: withCmv.length,
    revenueTotal: sum(valid, h => h.currentRevenue),
    revenueChangeAvg: +avg(valid, h => h.revenueChange).toFixed(1),
    healthy: valid.filter(h => h.health === 'healthy').length,
    tight: valid.filter(h => h.health === 'tight').length,
    risk: valid.filter(h => h.health === 'risk').length,
    critical: valid.filter(h => h.health === 'critical').length,
    withMature: valid.filter(h => h.cardapioMaturidadePct >= 80).length,
    withBpo: valid.filter(h => h.bpoActive).length,
    withRevenue: valid.filter(h => h.currentRevenue > 0).length,
  };
}
