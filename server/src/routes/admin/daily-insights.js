/**
 * Daily Briefing IA — endpoint de insights gerados (mock por enquanto)
 *
 * Item 4.1 do plano admin. Retorna:
 *   - actions: top 3-5 ações urgentes (ligar pra cliente em risco, etc)
 *   - insight: insight do dia gerado por IA (~2 frases)
 *   - yesterday: resumo agregado de ontem (cadastros, churn, vendas, BPO)
 *
 * v1: dados mockados estáticos com pequena variação por dia. Estrutura
 * compatível com integração futura via OpenAI sem mudar o contrato.
 *
 * TODO: integrar OpenAI quando OPENAI_API_KEY estiver configurada.
 * Prompt sugerido (system + user):
 *   System: "Você é um analista de SaaS de restaurantes da Breakr.
 *            Analise o portfólio agregado e produza UM insight em
 *            português brasileiro, com no máximo 2 frases, destacando
 *            o ponto mais acionável do dia. Tom direto, executivo,
 *            sem jargão. Inclua números concretos quando possível."
 *   User:   "Dados do portfólio hoje: {clients_count} restaurantes,
 *            CMV médio {avg_cmv}%, lucro médio {avg_profit}%, ...
 *            Movimentações de ontem: {yesterday}.
 *            Riscos detectados: {risks}.
 *            Gere o insight do dia."
 */

const express = require('express');
const { db } = require('../../db/client');
const { client: clientTable } = require('../../db/schema-bpo');

const router = express.Router();

// Pool de insights mockados — variação determinística por dia
const MOCK_INSIGHTS = [
  {
    title: 'Insight do Dia',
    text: 'O preço do queijo subiu 18% nos últimos 30 dias. 14 restaurantes da sua base usam queijo intensamente — estimativa de R$ 18k de margem perdida/mês se não reajustarem cardápio.',
    actions: [
      { label: 'Enviar broadcast', action: 'broadcast' },
      { label: 'Adiar pra amanhã', action: 'snooze' },
    ],
  },
  {
    title: 'Insight do Dia',
    text: 'Restaurantes com CMV acima de 35% representam 62% da sua base hoje. A maioria não atualiza fichas técnicas há mais de 30 dias — oportunidade clara de ativação consultiva.',
    actions: [
      { label: 'Criar campanha de revisão', action: 'campaign' },
      { label: 'Adiar pra amanhã', action: 'snooze' },
    ],
  },
  {
    title: 'Insight do Dia',
    text: 'Clientes ativados via marketplace dependem em média 38% das vendas do iFood. Risco alto de margem comprimida — vale uma campanha educativa sobre canais próprios.',
    actions: [
      { label: 'Enviar broadcast', action: 'broadcast' },
      { label: 'Adiar pra amanhã', action: 'snooze' },
    ],
  },
  {
    title: 'Insight do Dia',
    text: '7 restaurantes terminaram a configuração de fichas técnicas esta semana — momento ideal pra oferecer o módulo de Matriz de Preço. Conversão histórica desse perfil: 41%.',
    actions: [
      { label: 'Listar prontos pro upgrade', action: 'list_upgrade' },
      { label: 'Adiar pra amanhã', action: 'snooze' },
    ],
  },
];

const pickInsight = (date) => {
  // Determinismo por dia: insight rotaciona conforme dia do mês
  const day = new Date(date).getDate();
  return MOCK_INSIGHTS[day % MOCK_INSIGHTS.length];
};

const buildMockActions = (clients) => {
  // Tenta gerar ações com base em clientes reais quando há dados;
  // senão cai pra mock genérico.
  const real = (clients || []).slice(0, 3);
  if (real.length >= 3) {
    return [
      {
        id: 'act_1',
        type: 'phone',
        client: real[0]?.name || 'Cliente',
        reason: 'faturamento -38%, risco churn',
        icon: '📞',
        title: `Ligar pra ${real[0]?.name || 'cliente'} (faturamento -38%, risco churn)`,
      },
      {
        id: 'act_2',
        type: 'upsell',
        client: real[1]?.name || 'Cliente',
        reason: 'pronto p/ upgrade',
        icon: '💼',
        title: `Oferecer plano premium pra ${real[1]?.name || 'cliente'} (pronto p/ upgrade)`,
      },
      {
        id: 'act_3',
        type: 'email',
        client: 'Múltiplos',
        reason: 'parados em "Custos Fixos"',
        icon: '📧',
        title: 'Email pra 5 clientes parados em "Custos Fixos"',
      },
    ];
  }
  return [
    {
      id: 'act_1',
      type: 'phone',
      client: 'Cantina',
      reason: 'faturamento -38%, risco churn',
      icon: '📞',
      title: 'Ligar pra Cantina (faturamento -38%, risco churn)',
    },
    {
      id: 'act_2',
      type: 'upsell',
      client: 'Aero',
      reason: 'pronto p/ upgrade',
      icon: '💼',
      title: 'Oferecer plano premium pra Aero (pronto p/ upgrade)',
    },
    {
      id: 'act_3',
      type: 'email',
      client: 'Múltiplos',
      reason: 'parados em "Custos Fixos"',
      icon: '📧',
      title: 'Email pra 5 clientes parados em "Custos Fixos"',
    },
  ];
};

// Fix: server pode rodar em UTC. "Ontem" precisa ser ontem em horário Brasil
// pra alinhar com a percepção do admin/cliente (que estão em -03:00).
const nowInBrazil = () => {
  const parts = new Date().toLocaleString('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).match(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/);
  if (!parts) return new Date();
  return new Date(+parts[3], +parts[1] - 1, +parts[2], +parts[4], +parts[5], +parts[6]);
};

const computeYesterday = (clients) => {
  const now = nowInBrazil();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayStart = yesterday.getTime();
  const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  let newClients = 0;
  let totalRevenue = 0;
  let bpoActivations = 0;

  (clients || []).forEach((c) => {
    try {
      const created = c.createdAt ? new Date(c.createdAt).getTime() : null;
      if (created && created >= yesterdayStart && created < yesterdayEnd) {
        newClients += 1;
      }
      if (c.bpoActivatedAt) {
        const t = new Date(c.bpoActivatedAt).getTime();
        if (t >= yesterdayStart && t < yesterdayEnd) bpoActivations += 1;
      }
      const data = typeof c.data === 'string' ? JSON.parse(c.data || '{}') : c.data || {};
      const daily = data?.formData?.daily_revenue || {};
      Object.entries(daily).forEach(([dateStr, val]) => {
        const d = new Date(dateStr).getTime();
        if (!isNaN(d) && d >= yesterdayStart && d < yesterdayEnd) {
          const num = typeof val === 'number'
            ? val
            : parseFloat(String(val).replace(/[R$ .]/g, '').replace(',', '.')) || 0;
          totalRevenue += num;
        }
      });
    } catch {
      // cliente sem JSON parseável — ignora
    }
  });

  return {
    newClients,
    churns: 0, // não trackeamos churn ainda
    totalRevenue,
    bpoActivations,
  };
};

router.get('/daily-insights', async (req, res) => {
  try {
    // Fix: data em horário Brasil (não UTC) pra alinhar com percepção do admin
    const today = nowInBrazil();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const isoDate = `${yyyy}-${mm}-${dd}`;

    // Carrega clientes pra computar resumo de ontem (best-effort)
    let clients = [];
    try {
      clients = await db
        .select({
          id: clientTable.id,
          name: clientTable.name,
          createdAt: clientTable.createdAt,
          bpoActivatedAt: clientTable.bpoActivatedAt,
          data: clientTable.data,
        })
        .from(clientTable);
    } catch (err) {
      console.warn('[daily-insights] erro ao buscar clientes:', err.message);
    }

    const insight = pickInsight(today);
    const actions = buildMockActions(clients);
    const yesterday = computeYesterday(clients);

    return res.json({
      date: isoDate,
      insight,
      actions,
      yesterday,
    });
  } catch (err) {
    console.error('[daily-insights]', err);
    return res.status(500).json({ error: 'Erro ao gerar daily insights' });
  }
});

module.exports = router;
