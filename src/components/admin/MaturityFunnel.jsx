/**
 * MaturityFunnel — Funil de Maturidade Operacional do portfólio.
 *
 * Item 3.1 do plano: visualização vertical em formato de funil mostrando
 * onde os restaurantes do portfólio estão na jornada operacional.
 *
 * 8 estágios (cada cliente avança ou trava em algum):
 *  1. Cadastrado (todo cliente = 100%)
 *  2. Onboarding completo (formData.onboarding_completed === true)
 *  3. Insumos cadastrados (operational.insumos.length >= 20)
 *  4. Fichas técnicas com >80% custo (cardapioMaturidadePct >= 80)
 *  5. Engenharia de Menu ativa (menuEngineering preenchido OU cardápio maduro com preços)
 *  6. BPO Financeira ativa (_bpo.enabled === true)
 *  7. Equipe cadastrada (partners + employees > 0)
 *  8. 3+ meses de receita lançada
 *
 * Identifica "gargalos" (queda > 30 pp do estágio anterior) e marca em vermelho.
 * Click em um estágio retorna lista de clientes "presos" naquele estágio
 * (passaram pelo anterior, mas falharam neste).
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { computeClientHealth } from '../../utils/clientHealth';

const STAGES = [
  { id: 'cadastrado',  num: 1, label: 'Cadastrado',                  hint: 'Conta criada no sistema' },
  { id: 'onboarding',  num: 2, label: 'Onboarding completo',         hint: 'Preencheu o questionário inicial' },
  { id: 'insumos',     num: 3, label: 'Insumos cadastrados (>20)',   hint: 'Base de matéria-prima estruturada' },
  { id: 'fichas',      num: 4, label: 'Fichas com custo >80%',       hint: 'Cardápio com custo conhecido' },
  { id: 'engenharia',  num: 5, label: 'Engenharia de Menu',          hint: 'Mix de cardápio analisado' },
  { id: 'bpo',         num: 6, label: 'BPO Financeira ativa',        hint: 'Conta a Pagar/Receber em uso' },
  { id: 'equipe',      num: 7, label: 'Equipe cadastrada',           hint: 'Sócios e/ou funcionários' },
  { id: 'receita',     num: 8, label: '3+ meses de receita',         hint: 'Histórico financeiro mínimo' },
];

const parseClientData = (c) => {
  try {
    return typeof c.data === 'string' ? JSON.parse(c.data || '{}') : (c.data || {});
  } catch {
    return {};
  }
};

/**
 * Para um cliente, retorna um objeto { stageId: boolean } dizendo se ele
 * passou em cada estágio.
 */
const evaluateStages = (data, health) => {
  const fd = data?.formData || {};
  const op = data?.operational || {};
  const insumos = Array.isArray(op.insumos) ? op.insumos : [];
  const menuEng = Array.isArray(data?.menuEngineering) ? data.menuEngineering : [];
  const partners = Array.isArray(fd.partners) ? fd.partners : [];
  const employees = Array.isArray(fd.employees) ? fd.employees : [];
  const revenueHistory = Array.isArray(fd.revenue_history) ? fd.revenue_history : [];

  const validRevenueCount = revenueHistory.filter(r => {
    if (!r?.month || !r?.amount) return false;
    const v = typeof r.amount === 'number'
      ? r.amount
      : parseFloat(String(r.amount).replace(/R\$/g, '').replace(/\./g, '').replace(',', '.')) || 0;
    return v > 0;
  }).length;

  const cardapioMaturidadePct = health?.cardapioMaturidadePct || 0;
  const fichasComPreco = health?.fichasComPrecoCount || 0;

  return {
    cadastrado: true,
    onboarding: !!fd.onboarding_completed,
    // Threshold reduzido pra 10 (lanchonetes pequenas comecam com poucos insumos)
    insumos: insumos.length >= 10,
    fichas: cardapioMaturidadePct >= 80,
    // Engenharia: requer matriz importada OU fichas com preço >= 5 (criterio mais rigoroso)
    engenharia: menuEng.length >= 5 || fichasComPreco >= 5,
    bpo: !!(data?._bpo && data._bpo.enabled),
    // Equipe vem antes da maioria das outras (geralmente cadastra logo no onboarding)
    equipe: (partners.length + employees.length) > 0,
    receita: validRevenueCount >= 3,
  };
};

const colorForPct = (pct) => {
  if (pct > 80) return '#00B37E';
  if (pct >= 50) return '#F5A623';
  return '#FF4560';
};

const MaturityFunnel = ({ clients = [], onStageClick }) => {
  const [selected, setSelected] = useState(null); // { stageId, stuckClients }

  const { total, stageCounts, stuckByStage } = useMemo(() => {
    const list = Array.isArray(clients) ? clients : [];
    const totalN = list.length;

    // Para cada cliente, avalia por estágio
    const evaluated = list.map(c => {
      const data = parseClientData(c);
      const health = computeClientHealth(data);
      return { client: c, stages: evaluateStages(data, health) };
    });

    const counts = {};
    const stuck = {};
    STAGES.forEach((stage, idx) => {
      counts[stage.id] = evaluated.filter(e => e.stages[stage.id]).length;
      // "Stuck" = falhou neste estágio mas passou no anterior (ou é o primeiro estágio)
      const prevStage = idx > 0 ? STAGES[idx - 1] : null;
      stuck[stage.id] = evaluated
        .filter(e => {
          const passedPrev = prevStage ? e.stages[prevStage.id] : true;
          return passedPrev && !e.stages[stage.id];
        })
        .map(e => e.client);
    });

    return { total: totalN, stageCounts: counts, stuckByStage: stuck };
  }, [clients]);

  const enriched = useMemo(() => {
    return STAGES.map((stage, idx) => {
      const count = stageCounts[stage.id] || 0;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      const prevPct = idx > 0
        ? (total > 0 ? Math.round((stageCounts[STAGES[idx - 1].id] / total) * 100) : 0)
        : pct;
      const drop = idx > 0 ? prevPct - pct : 0;
      const isBottleneck = idx > 0 && drop > 30;
      return { ...stage, count, pct, drop, isBottleneck };
    });
  }, [stageCounts, total]);

  const handleClick = (stage) => {
    const stuckClients = stuckByStage[stage.id] || [];
    setSelected({ stageId: stage.id, label: stage.label, stuckClients });
    if (typeof onStageClick === 'function') {
      onStageClick(stage.id, stuckClients);
    }
  };

  // Largura visual do funil: estreita do topo (100%) ao fundo conforme % cai
  // Mas garantimos um mínimo pra ainda ser clicável.
  const widthForPct = (pct) => Math.max(15, pct);

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-[16px] font-bold text-white">Funil de Maturidade Operacional</h2>
          <p className="text-[11px] text-[#868686]">Onde cada restaurante está na jornada</p>
        </div>
        <div className="text-[11px] text-[#666]">
          {total} {total === 1 ? 'restaurante' : 'restaurantes'} no portfólio
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] p-5"
      >
        {total === 0 ? (
          <div className="text-[12px] text-[#666] py-8 text-center">
            Sem clientes no portfólio para analisar.
          </div>
        ) : (
          <div className="space-y-2.5">
            {enriched.map((stage) => {
              const barColor = stage.isBottleneck ? '#FF4560' : colorForPct(stage.pct);
              const isActive = selected?.stageId === stage.id;
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => handleClick(stage)}
                  className={`w-full text-left rounded-[12px] p-3 transition-all border ${
                    isActive
                      ? 'border-white/[0.20] bg-white/[0.04]'
                      : 'border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.02]'
                  } ${stage.isBottleneck ? 'ring-1 ring-[#FF4560]/30' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    {/* Numero */}
                    <div
                      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ring-1"
                      style={{
                        backgroundColor: barColor + '20',
                        color: barColor,
                        boxShadow: `inset 0 0 0 1px ${barColor}40`,
                      }}
                    >
                      {stage.num}
                    </div>

                    {/* Label + barra */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-semibold text-white">
                            {stage.label}
                          </span>
                          {stage.isBottleneck && (
                            <span className="text-[10px] font-bold text-[#FF4560] bg-[#FF4560]/10 px-1.5 py-0.5 rounded">
                              gargalo! -{stage.drop}pp
                            </span>
                          )}
                        </div>
                        <div className="flex items-baseline gap-2 tabular-nums">
                          <span className="text-[11px] text-[#868686]">
                            {stage.count}/{total}
                          </span>
                          <span
                            className="text-[12px] font-bold"
                            style={{ color: barColor }}
                          >
                            {stage.pct}%
                          </span>
                        </div>
                      </div>

                      {/* Barra de progresso (com efeito de funil pelo container) */}
                      <div
                        className="h-2 rounded-full bg-white/[0.04] overflow-hidden"
                        style={{ width: `${widthForPct(stage.pct)}%`, minWidth: 60 }}
                      >
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: '100%' }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className="h-full rounded-full"
                          style={{
                            background: `linear-gradient(90deg, ${barColor}80, ${barColor})`,
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-[#666] mt-1">{stage.hint}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Painel de clientes presos */}
        {selected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 pt-4 border-t border-white/[0.06]"
          >
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h3 className="text-[13px] font-bold text-white">
                  Presos em: {selected.label}
                </h3>
                <p className="text-[10px] text-[#666] mt-0.5">
                  {selected.stuckClients.length === 0
                    ? 'Nenhum cliente preso aqui — todos passaram ou nem chegaram a este ponto.'
                    : `${selected.stuckClients.length} ${selected.stuckClients.length === 1 ? 'cliente passou' : 'clientes passaram'} no estágio anterior mas não avançou neste.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-[10px] text-[#868686] hover:text-white px-2 py-1 rounded transition-colors"
              >
                Fechar
              </button>
            </div>

            {selected.stuckClients.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[280px] overflow-y-auto pr-1">
                {selected.stuckClients.map((c, i) => {
                  const data = parseClientData(c);
                  const fd = data?.formData || {};
                  const name = c.name || fd.identity?.business_name || fd.business_name || c.email || `Cliente #${c.id || i + 1}`;
                  const sub = fd.identity?.cuisine_type || fd.cuisine_type || c.email || '';
                  return (
                    <div
                      key={c.id || c.email || i}
                      className="flex items-center gap-2 p-2 rounded-[10px] bg-white/[0.03] border border-white/[0.04]"
                    >
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#F5A623]/30 to-[#FF9406]/30 ring-1 ring-white/[0.08] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                        {String(name).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-white truncate">{name}</p>
                        {sub && <p className="text-[9px] text-[#666] truncate">{sub}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default MaturityFunnel;
