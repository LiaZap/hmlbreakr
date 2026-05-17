/**
 * AdminDREModal — DRE Aberto pra visualizacao no Painel ADM
 * BAH-026: mostra Receita Operacional Bruta -> Lucro Liquido com pro-labore separado
 */

const fmtBRL = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (n) => `${(n || 0).toFixed(1)}%`;

const AdminDREModal = ({ client, dre, onClose }) => {
  if (!client) return null;

  // Empty state quando nao ha receita cadastrada
  if (!dre || dre.receitaBruta === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="w-full max-w-md bg-[#1B1B1D] border border-[#2F2F31] rounded-[20px] p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-[16px] font-bold text-white">DRE Aberto</h2>
              <p className="text-[11px] text-[#868686] mt-0.5">{client.name}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2A2A2C] hover:bg-[#333]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="#868686" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <div className="text-center py-8">
            <div className="text-[12px] text-[#868686] mb-2">⚠️ Sem dados de faturamento</div>
            <div className="text-[11px] text-[#555]">Cliente ainda não cadastrou receita no histórico.</div>
          </div>
        </div>
      </div>
    );
  }

  const rows = [
    { label: 'Receita Operacional Bruta', value: dre.receitaBruta, pct: 100, bold: true, color: '#00B37E', sign: '+', type: 'header' },

    { label: 'Deduções', value: -dre.deducoes, pct: -dre.deducoesPct, type: 'group' },
    { label: 'Impostos', value: -dre.impostos, pct: -dre.impostosPct, sublabel: 'Simples Nacional / outros', type: 'sub' },
    { label: 'Taxas de Venda', value: -dre.taxasVenda, pct: -dre.taxasVendaPct, sublabel: 'Cartão + Marketplace', type: 'sub' },

    { label: 'Receita Líquida', value: dre.receitaLiquida, pct: dre.receitaLiquidaPct, bold: true, color: '#E1E1E1', sign: '=', type: 'subtotal' },

    { label: 'CMV (Custo da Mercadoria)', value: -dre.cmv, pct: -dre.cmvPct, sublabel: `CMV Teórico das fichas (${fmtPct(dre.cmvRate)})`, type: 'deduction' },

    { label: 'Margem de Contribuição', value: dre.margemContribuicao, pct: dre.margemContribuicaoPct, bold: true, color: '#F5A623', sign: '=', type: 'subtotal' },

    { label: 'Despesas Operacionais', value: -dre.despesasFixas, pct: -dre.despesasFixasPct, sublabel: 'Aluguel, salários, infra, marketing, admin (sem pró-labore)', type: 'deduction' },

    { label: 'Resultado Operacional', value: dre.resultadoOperacional, pct: dre.resultadoOperacionalPct, bold: true, color: dre.resultadoOperacional >= 0 ? '#E1E1E1' : '#FF8A9C', sign: '=', type: 'subtotal' },

    { label: 'Pró-Labore', value: -dre.proLabore, pct: -dre.proLaborePct, sublabel: 'Retirada dos sócios (separado por análise)', type: 'deduction' },

    { label: 'Lucro Líquido', value: dre.lucroLiquido, pct: dre.lucroLiquidoPct, bold: true, color: dre.isProfit ? '#00B37E' : '#FF4560', sign: '=', type: 'result' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-[#1B1B1D] border border-[#2F2F31] rounded-t-[24px] md:rounded-[24px] flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3 border-b border-[#2A2A2C] shrink-0">
          <div>
            <h2 className="text-[16px] font-bold text-white">DRE Aberto</h2>
            <p className="text-[11px] text-[#868686] mt-0.5">{client.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2A2A2C] hover:bg-[#333] transition-colors shrink-0" aria-label="Fechar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#868686" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* DRE Body */}
        <div className="flex-1 overflow-y-auto p-3 md:p-5">
          <div className="flex flex-col gap-0.5">
            {rows.map((row, idx) => {
              const isResult = row.type === 'result';
              const isSubtotal = row.type === 'subtotal';
              const isHeader = row.type === 'header';
              const isGroup = row.type === 'group';
              const isSub = row.type === 'sub';
              const needsDivider = isSubtotal || isResult || isHeader;

              return (
                <div key={idx}>
                  {needsDivider && idx > 0 && <div className="w-full h-px bg-[#2A2A2C] my-2" />}
                  <div className={`flex items-center gap-1.5 md:gap-2 py-1.5 px-1.5 md:px-2 rounded-[8px] ${isResult ? 'bg-[#1F1F1F]' : ''} ${isSub ? 'pl-3 md:pl-6' : ''}`}>
                    {/* Sign */}
                    {row.sign && (
                      <div className={`w-[16px] h-[16px] md:w-[18px] md:h-[18px] rounded-[4px] flex items-center justify-center shrink-0 text-[10px] font-bold
                        ${isResult
                          ? (dre.isProfit ? 'bg-[#00B37E]/20 text-[#00B37E]' : 'bg-[#FF4560]/20 text-[#FF4560]')
                          : isSubtotal
                            ? 'bg-[#F5A623]/15 text-[#F5A623]'
                            : 'bg-[#00B37E]/15 text-[#00B37E]'
                        }`}
                      >
                        {row.sign}
                      </div>
                    )}
                    {!row.sign && <div className="w-[16px] md:w-[18px] shrink-0" />}

                    {/* Label */}
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-[11px] md:text-[12px] leading-tight ${row.bold || isGroup ? 'font-semibold' : 'font-normal'}`}
                        style={{ color: row.color || (isSub ? '#7E7E7E' : isGroup ? '#A0A0A0' : '#C8C8C8') }}
                      >
                        {row.label}
                      </div>
                      {row.sublabel && <div className="text-[9px] text-[#555] leading-tight mt-0.5">{row.sublabel}</div>}
                    </div>

                    {/* Pct */}
                    <div
                      className={`text-[9px] md:text-[10px] w-[40px] md:w-[48px] text-right shrink-0 tabular-nums ${row.bold ? 'font-semibold' : 'font-normal'}`}
                      style={{ color: row.color || (isSub ? '#555' : '#7E7E7E') }}
                    >
                      {row.pct >= 0 ? '+' : ''}{row.pct.toFixed(1)}%
                    </div>

                    {/* Value */}
                    <div
                      className={`text-[11px] md:text-[12px] w-[88px] md:w-[110px] text-right shrink-0 tabular-nums ${row.bold ? 'font-semibold' : 'font-normal'}`}
                      style={{ color: row.color || (isSub ? '#7E7E7E' : isGroup ? '#A0A0A0' : '#C8C8C8') }}
                    >
                      {fmtBRL(row.value)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer com nota explicativa */}
          <div className="mt-5 p-3 bg-[#161616] border border-[#2A2A2C] rounded-[10px]">
            <div className="text-[10px] text-[#868686] leading-relaxed">
              <strong className="text-[#F5A623]">Nota:</strong> Este DRE é uma <strong>estimativa</strong> baseada
              no faturamento mais recente e nos custos cadastrados. CMV teórico vem das fichas técnicas. Pró-labore
              é separado das despesas operacionais para análise de resultado da operação vs retirada dos sócios.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDREModal;
