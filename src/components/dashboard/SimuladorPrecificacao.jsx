import { useState, useMemo } from 'react';
import { useDashboard } from '../../context/DashboardContext';

// Helper: parsing seguro de moeda (mesmo padrão dos outros componentes)
const parseCurrency = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let str = String(val).replace(/R\$/g, '').trim();
  if (str.includes(',') && str.includes('.')) str = str.replace(/\./g, '').replace(',', '.');
  else if (str.includes(',')) str = str.replace(',', '.');
  return parseFloat(str) || 0;
};

const fmtBRL = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * SimuladorPrecificacao
 * Tela interativa que ajuda o usuário a precificar produtos com base em:
 * - BASE atual (custos fixos + impostos + cartão)
 * - Lucro alvo escolhido pelo usuário (10-30%)
 * - Custo total da ficha técnica
 *
 * Fórmula:
 *   CMV alvo = 100% - BASE - LucroAlvo
 *   Preço cardápio próprio = custoTotal / (CMV / 100)
 *   Preço marketplace = preço próprio / (1 - comissão_marketplace)
 *
 * BAH-039
 */
const SimuladorPrecificacao = ({ onClose }) => {
  const { dashboardData } = useDashboard();
  const fichas = (dashboardData.operational?.fichas || []).filter(
    (f) => parseCurrency(f.custoTotal) > 0
  );

  const basePct = parseFloat(dashboardData.breakEven?.base?.value || '25') || 25;

  // Lê marketplaces individuais do onboarding pra calcular preço por canal.
  // Cada marketplace tem comissão própria — pra precificar nele o preço
  // tem que cobrir AQUELA comissão, não a média ponderada.
  const marketplaces = useMemo(() => {
    const list = dashboardData.formData?.fees_marketplaces || [];
    return list
      .map((m) => ({
        name: (m.provider === 'Outro' ? (m.custom_provider || 'Outro') : m.provider) || 'Marketplace',
        commission: parseFloat(String(m.commission ?? '0').replace(',', '.').replace('%', '')) || 0,
      }))
      .filter((m) => m.commission > 0); // canais sem comissão (ex: App Próprio) viram "Cardápio Próprio"
  }, [dashboardData.formData]);

  const [selectedFichaId, setSelectedFichaId] = useState(fichas[0]?.id || null);
  const [lucroAlvo, setLucroAlvo] = useState(20); // padrão 20%
  const [search, setSearch] = useState('');

  const filteredFichas = useMemo(
    () => fichas.filter((f) => (f.name || '').toLowerCase().includes(search.toLowerCase())),
    [fichas, search]
  );

  const selectedFicha = fichas.find((f) => String(f.id) === String(selectedFichaId)) || null;

  const cmvAlvo = Math.max(0, 100 - basePct - lucroAlvo);
  const cmvAlvoFraction = cmvAlvo / 100;

  const calc = useMemo(() => {
    if (!selectedFicha || cmvAlvoFraction <= 0) return null;
    const custoTotal = parseCurrency(selectedFicha.custoTotal);
    const precoAtual = parseCurrency(selectedFicha.precoVenda);

    const precoProprio = custoTotal / cmvAlvoFraction;

    // Preço por marketplace — cada um aplica SUA comissão sobre o preço próprio
    const precosMarketplaces = marketplaces.map((m) => {
      const c = m.commission;
      const preco = c > 0 && c < 100 ? precoProprio / (1 - c / 100) : precoProprio;
      return {
        name: m.name,
        commission: c,
        preco,
        delta: precoAtual > 0 ? preco - precoAtual : 0,
      };
    });

    const cmvAtualPct = precoAtual > 0 ? (custoTotal / precoAtual) * 100 : 0;
    const lucroAtualPct = precoAtual > 0 ? 100 - basePct - cmvAtualPct : 0;
    const deltaProprio = precoAtual > 0 ? precoProprio - precoAtual : 0;

    return {
      custoTotal,
      precoAtual,
      precoProprio,
      precosMarketplaces,
      cmvAtualPct,
      lucroAtualPct,
      deltaProprio,
    };
  }, [selectedFicha, basePct, cmvAlvoFraction, marketplaces]);

  // CMV negativo = combinação BASE+Lucro inviável
  const cmvInviavel = cmvAlvo <= 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-[#1B1B1D] border border-[#2F2F31] rounded-t-[24px] md:rounded-[24px] flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3 border-b border-[#2A2A2C] shrink-0">
          <div>
            <h2 className="text-[16px] font-bold text-white">Simulador de Precificação</h2>
            <p className="text-[11px] text-[#868686] mt-0.5">Defina o lucro alvo e veja preços recomendados</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2A2A2C] hover:bg-[#333] transition-colors shrink-0" aria-label="Fechar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#868686" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Empty state se sem fichas com custo */}
          {fichas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-[#252527] flex items-center justify-center mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 8v4M12 16h.01M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z" stroke="#868686" strokeWidth="1.5" /></svg>
              </div>
              <div className="text-[13px] font-medium text-white mb-1">Nenhuma ficha com custo cadastrado</div>
              <div className="text-[11px] text-[#868686]">Cadastre fichas técnicas com custo total &gt; 0 pra simular preços.</div>
            </div>
          ) : (
            <>
              {/* Seleção de ficha */}
              <div>
                <label className="text-[11px] text-[#868686] uppercase tracking-wider font-semibold mb-2 block">Produto (ficha técnica)</label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar ficha..."
                  className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-3 py-2 text-[13px] text-white placeholder:text-[#555] outline-none focus:border-[#F5A623] mb-2"
                />
                <select
                  value={selectedFichaId || ''}
                  onChange={(e) => setSelectedFichaId(e.target.value)}
                  className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-3 py-2 text-[13px] text-white outline-none focus:border-[#F5A623]"
                >
                  {filteredFichas.length === 0 && <option value="">Nenhum resultado</option>}
                  {filteredFichas.map((f) => (
                    <option key={f.id} value={f.id} className="bg-[#1B1B1D]">
                      {f.name} — Custo {fmtBRL(parseCurrency(f.custoTotal))}
                    </option>
                  ))}
                </select>
              </div>

              {/* Slider Lucro */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] text-[#868686] uppercase tracking-wider font-semibold">Lucro alvo</label>
                  <span className="text-[18px] font-bold text-[#F5A623]">{lucroAlvo}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={40}
                  step={1}
                  value={lucroAlvo}
                  onChange={(e) => setLucroAlvo(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-[#2A2A2C] rounded-lg appearance-none cursor-pointer accent-[#F5A623]"
                />
                <div className="flex justify-between text-[10px] text-[#555] mt-1">
                  <span>5%</span>
                  <span className="text-[#7E7E7E]">Sugerido: 10–30%</span>
                  <span>40%</span>
                </div>
              </div>

              {/* Fórmula visual */}
              <div className="bg-[#161616] border border-[#2A2A2C] rounded-[12px] p-3">
                <div className="text-[10px] text-[#7E7E7E] uppercase tracking-wider font-semibold mb-2">CMV máximo permitido</div>
                <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                  <span className="text-[24px] font-bold" style={{ color: cmvInviavel ? '#FF4560' : '#00B37E' }}>
                    {cmvAlvo.toFixed(0)}%
                  </span>
                  <span className="text-[11px] text-[#868686]">
                    = 100% − BASE ({basePct.toFixed(0)}%) − Lucro ({lucroAlvo}%)
                  </span>
                </div>
                {cmvInviavel && (
                  <div className="text-[11px] text-[#FF8A9C] bg-[#FF4560]/10 border border-[#FF4560]/30 rounded p-2 mt-2 leading-snug">
                    ⚠️ BASE + Lucro {'>'} 100%. Reduza o lucro alvo ou trabalhe pra baixar a BASE.
                  </div>
                )}
              </div>

              {/* Resultado: card de Cardápio Próprio + 1 card por marketplace */}
              {selectedFicha && calc && !cmvInviavel && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Cardápio Próprio (sem comissão) */}
                  <div className="bg-[#161616] border border-[#2A2A2C] rounded-[14px] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-[#868686] uppercase tracking-wider font-semibold">Cardápio próprio</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L4 6v6c0 5.5 3.5 10.7 8 12 4.5-1.3 8-6.5 8-12V6l-8-4z" stroke="#00B37E" strokeWidth="1.5"/>
                      </svg>
                    </div>
                    <div className="text-[26px] font-bold text-white mb-1">{fmtBRL(calc.precoProprio)}</div>
                    <div className="text-[11px] text-[#7E7E7E]">Sem comissão (App próprio, balcão)</div>
                    {calc.precoAtual > 0 && (
                      <div className="text-[11px] mt-1">
                        <span className="text-[#868686]">vs atual {fmtBRL(calc.precoAtual)}: </span>
                        <span className={`font-semibold ${calc.deltaProprio >= 0 ? 'text-[#00B37E]' : 'text-[#FF4560]'}`}>
                          {calc.deltaProprio >= 0 ? '+' : ''}{fmtBRL(calc.deltaProprio)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Um card por marketplace cadastrado (com comissão > 0) */}
                  {calc.precosMarketplaces.length === 0 ? (
                    <div className="bg-[#161616] border border-[#2A2A2C] border-dashed rounded-[14px] p-4 flex flex-col items-center justify-center text-center">
                      <div className="text-[11px] text-[#868686] uppercase tracking-wider font-semibold mb-1">Marketplaces</div>
                      <div className="text-[12px] text-[#7E7E7E]">Nenhum marketplace cadastrado no onboarding</div>
                    </div>
                  ) : (
                    calc.precosMarketplaces.map((mp, idx) => (
                      <div key={`${mp.name}-${idx}`} className="bg-[#161616] border border-[#2A2A2C] rounded-[14px] p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] text-[#868686] uppercase tracking-wider font-semibold truncate" title={mp.name}>{mp.name}</span>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" stroke="#F5A623" strokeWidth="1.5"/>
                          </svg>
                        </div>
                        <div className="text-[26px] font-bold text-white mb-1">{fmtBRL(mp.preco)}</div>
                        <div className="text-[11px] text-[#868686]">+{mp.commission.toFixed(1)}% de comissão</div>
                        {calc.precoAtual > 0 && (
                          <div className="text-[11px] mt-1">
                            <span className="text-[#868686]">vs atual: </span>
                            <span className={`font-semibold ${mp.delta >= 0 ? 'text-[#00B37E]' : 'text-[#FF4560]'}`}>
                              {mp.delta >= 0 ? '+' : ''}{fmtBRL(mp.delta)}
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Análise atual (se houver preço de venda na ficha) */}
              {selectedFicha && calc && calc.precoAtual > 0 && (
                <div className="bg-[#161616] border border-[#2A2A2C] rounded-[12px] p-3">
                  <div className="text-[10px] text-[#7E7E7E] uppercase tracking-wider font-semibold mb-2">Análise do preço atual</div>
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div>
                      <div className="text-[#868686] mb-0.5">CMV atual</div>
                      <div className={`text-[14px] font-bold ${calc.cmvAtualPct > cmvAlvo ? 'text-[#FF4560]' : 'text-[#00B37E]'}`}>
                        {calc.cmvAtualPct.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[#868686] mb-0.5">Lucro atual estimado</div>
                      <div className={`text-[14px] font-bold ${calc.lucroAtualPct < 5 ? 'text-[#FF4560]' : (calc.lucroAtualPct < 10 ? 'text-[#F5A623]' : 'text-[#00B37E]')}`}>
                        {calc.lucroAtualPct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimuladorPrecificacao;
