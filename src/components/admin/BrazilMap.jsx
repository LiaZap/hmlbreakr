/**
 * BrazilMap — Distribuição geográfica do portfólio de restaurantes (Item 3.2).
 *
 * Approach: Bubble map (Option C) agrupado por região do Brasil.
 *
 * Justificativa: o onboarding atual NÃO captura UF/estado dos clientes —
 * `location_costs` só tem rent/IPTU. Sem dado estruturado de localização,
 * um SVG geográfico real ficaria majoritariamente vazio/falso. O bubble
 * map cumpre a função (mostra distribuição + saúde média) com 0 dependências
 * extras, e quando o backend passar a coletar UF, este componente continua
 * funcionando sem mudança no contrato.
 *
 * Extração de UF (em ordem de tentativa):
 *   1. data.formData.location_costs.state (futuro)
 *   2. data.formData.identity.state (futuro)
 *   3. data.formData.address.state (futuro)
 *   4. parse final de qualquer string `address` (últimos 2 chars = UF)
 *   5. heurística: parse de `identity.restaurant_name` ("Restaurante X - SP")
 *   6. fallback: "Não informado"
 *
 * Bubble:
 *   - tamanho proporcional à quantidade (24px → 64px, escala em sqrt)
 *   - cor pela saúde média (>=70 verde, 40-70 amarelo, <40 vermelho)
 *   - badge com contagem
 *   - click chama onClientClick(clientsArray, uf)
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { computeClientHealth } from '../../utils/clientHealth';

// ---------------------------------------------------------------------------
// Tabelas estáticas
// ---------------------------------------------------------------------------

const REGIONS = [
  { id: 'norte',    label: 'Norte',        ufs: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'] },
  { id: 'nordeste', label: 'Nordeste',     ufs: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'] },
  { id: 'centro',   label: 'Centro-Oeste', ufs: ['DF', 'GO', 'MT', 'MS'] },
  { id: 'sudeste',  label: 'Sudeste',      ufs: ['ES', 'MG', 'RJ', 'SP'] },
  { id: 'sul',      label: 'Sul',          ufs: ['PR', 'RS', 'SC'] },
];

const ALL_UFS = new Set(REGIONS.flatMap(r => r.ufs));

const UF_TO_REGION = REGIONS.reduce((acc, r) => {
  r.ufs.forEach(uf => { acc[uf] = r.id; });
  return acc;
}, {});

// Mapeia 'health' string do clientHealth.js para score 0-100
const HEALTH_SCORE = {
  healthy: 90,
  tight: 60,
  risk: 35,
  critical: 15,
  unknown: 50,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parseClientData = (c) => {
  try {
    return typeof c?.data === 'string' ? JSON.parse(c.data || '{}') : (c?.data || {});
  } catch {
    return {};
  }
};

/**
 * Tenta extrair UF de um cliente. Retorna 'XX' (uppercase) ou null.
 */
const extractUF = (data) => {
  const fd = data?.formData || {};

  // 1-3: campos estruturados (futuro — ainda não existem mas a estrutura está preparada)
  const direct =
    fd?.location_costs?.state ||
    fd?.identity?.state ||
    fd?.address?.state ||
    fd?.identity?.uf ||
    fd?.location_costs?.uf;
  if (typeof direct === 'string' && direct.trim()) {
    const up = direct.trim().toUpperCase().slice(0, 2);
    if (ALL_UFS.has(up)) return up;
  }

  // 4: parse de string address — pega as duas últimas letras
  const addrStr =
    (typeof fd?.identity?.address === 'string' && fd.identity.address) ||
    (typeof fd?.location_costs?.address === 'string' && fd.location_costs.address) ||
    (typeof fd?.address === 'string' && fd.address) ||
    '';
  if (addrStr) {
    const m = addrStr.toUpperCase().match(/\b([A-Z]{2})\b\s*$/);
    if (m && ALL_UFS.has(m[1])) return m[1];
  }

  // 5: heurística — restaurant_name termina com " - SP" ou similar
  const name = typeof fd?.identity?.restaurant_name === 'string' ? fd.identity.restaurant_name : '';
  if (name) {
    const m = name.toUpperCase().match(/[\s\-/(]([A-Z]{2})\b\s*\)?\s*$/);
    if (m && ALL_UFS.has(m[1])) return m[1];
  }

  return null;
};

/**
 * Calcula tamanho da bolha em px com escala suave (sqrt) entre min/max.
 */
const bubbleSize = (count, maxCount) => {
  const MIN = 32;
  const MAX = 64;
  if (maxCount <= 1) return MIN;
  const t = Math.sqrt(count) / Math.sqrt(maxCount);
  return Math.round(MIN + (MAX - MIN) * t);
};

/**
 * Cor da bolha baseada na saúde média.
 */
const colorForHealth = (avg) => {
  if (avg >= 70) return { bg: 'rgba(34, 197, 94, 0.18)',  border: '#22c55e', text: '#22c55e' }; // verde
  if (avg >= 40) return { bg: 'rgba(245, 166, 35, 0.18)', border: '#F5A623', text: '#F5A623' }; // amarelo
  return                { bg: 'rgba(239, 68, 68, 0.18)',  border: '#ef4444', text: '#ef4444' }; // vermelho
};

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

const BrazilMap = ({ clients = [], onClientClick }) => {
  const [hoveredUF, setHoveredUF] = useState(null);

  // Agrupa clientes por UF + computa saúde média
  const { byRegion, totalLocated, totalUnknown, maxCount } = useMemo(() => {
    const buckets = {}; // uf -> { clients: [], scores: [] }
    let unknown = 0;

    clients.forEach(c => {
      const data = parseClientData(c);
      const uf = extractUF(data);
      const health = computeClientHealth(data);
      const score = health ? (HEALTH_SCORE[health.health] ?? 50) : 50;

      if (!uf) {
        unknown += 1;
        return;
      }
      if (!buckets[uf]) buckets[uf] = { clients: [], scores: [] };
      buckets[uf].clients.push(c);
      buckets[uf].scores.push(score);
    });

    const ufStats = Object.entries(buckets).map(([uf, b]) => ({
      uf,
      count: b.clients.length,
      clients: b.clients,
      avgHealth: b.scores.length > 0
        ? Math.round(b.scores.reduce((a, x) => a + x, 0) / b.scores.length)
        : 50,
    }));

    // Agrupa por região para layout
    const regionMap = {};
    REGIONS.forEach(r => { regionMap[r.id] = []; });
    ufStats.forEach(s => {
      const region = UF_TO_REGION[s.uf];
      if (region) regionMap[region].push(s);
    });
    // Ordena cada região por contagem desc
    Object.values(regionMap).forEach(arr => arr.sort((a, b) => b.count - a.count));

    const located = ufStats.reduce((a, s) => a + s.count, 0);
    const max = ufStats.reduce((a, s) => Math.max(a, s.count), 1);

    return {
      byRegion: regionMap,
      totalLocated: located,
      totalUnknown: unknown,
      maxCount: max,
    };
  }, [clients]);

  const handleBubbleClick = (stat) => {
    if (typeof onClientClick === 'function') {
      onClientClick(stat.clients, stat.uf);
    }
  };

  // Empty state
  if (!clients || clients.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#1a1a1a] p-6">
        <h3 className="text-base font-semibold text-white">Distribuição Geográfica</h3>
        <p className="mt-3 text-sm text-white/50">Sem clientes para mapear ainda.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1a1a1a] p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-white">Distribuição Geográfica</h3>
          <p className="mt-1 text-xs text-white/50">
            {totalLocated} restaurante{totalLocated === 1 ? '' : 's'} localizado{totalLocated === 1 ? '' : 's'}
            {totalUnknown > 0 && (
              <span className="text-white/40"> • {totalUnknown} sem UF</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-white/50">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500/70 border border-green-500"></span>
            saudável
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#F5A623]/70 border border-[#F5A623]"></span>
            misto
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500/70 border border-red-500"></span>
            crítico
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {REGIONS.map(region => {
          const stats = byRegion[region.id] || [];
          const regionTotal = stats.reduce((a, s) => a + s.count, 0);

          return (
            <div
              key={region.id}
              className="grid grid-cols-[88px_1fr] gap-3 items-center min-h-[56px]"
            >
              <div className="text-xs text-white/60 font-medium">
                {region.label}
                <div className="text-[10px] text-white/30 mt-0.5">
                  {regionTotal} {regionTotal === 1 ? 'rest.' : 'rest.'}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {stats.length === 0 ? (
                  <span className="text-[11px] text-white/25 italic">sem clientes</span>
                ) : (
                  stats.map(stat => {
                    const size = bubbleSize(stat.count, maxCount);
                    const color = colorForHealth(stat.avgHealth);
                    const isHovered = hoveredUF === stat.uf;
                    return (
                      <motion.button
                        key={stat.uf}
                        type="button"
                        whileHover={{ scale: 1.06 }}
                        whileTap={{ scale: 0.96 }}
                        onMouseEnter={() => setHoveredUF(stat.uf)}
                        onMouseLeave={() => setHoveredUF(null)}
                        onClick={() => handleBubbleClick(stat)}
                        title={`${stat.uf}: ${stat.count} restaurante${stat.count === 1 ? '' : 's'} • saúde média ${stat.avgHealth}`}
                        className="relative flex items-center justify-center rounded-full font-semibold transition-shadow focus:outline-none focus:ring-2 focus:ring-white/30"
                        style={{
                          width: size,
                          height: size,
                          backgroundColor: color.bg,
                          border: `1.5px solid ${color.border}`,
                          color: color.text,
                          fontSize: size >= 48 ? 13 : 11,
                          boxShadow: isHovered ? `0 0 0 3px ${color.border}33` : 'none',
                        }}
                      >
                        {stat.uf}
                        {stat.count > 1 && (
                          <span
                            className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#1a1a1a] text-white text-[10px] font-bold flex items-center justify-center border border-white/20"
                          >
                            {stat.count}
                          </span>
                        )}
                      </motion.button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}

        {totalUnknown > 0 && (
          <div className="grid grid-cols-[88px_1fr] gap-3 items-center pt-3 border-t border-white/5">
            <div className="text-xs text-white/40 font-medium">Não informado</div>
            <div className="text-[11px] text-white/40">
              {totalUnknown} restaurante{totalUnknown === 1 ? '' : 's'} sem UF identificada
            </div>
          </div>
        )}
      </div>

      <p className="mt-5 pt-3 border-t border-white/5 text-[10px] text-white/35">
        Tamanho da bolha = quantidade • Cor = saúde média do estado • Clique pra filtrar
      </p>
    </div>
  );
};

export default BrazilMap;
