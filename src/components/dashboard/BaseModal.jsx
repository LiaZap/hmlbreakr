const BaseModal = ({ base, onClose }) => {
  if (!base) return null;

  const baseValue = parseFloat(base.valueRaw || base.value) || 0;
  const bd = base.breakdown || {};

  const breakdownItems = [
    { label: 'Custos Fixos', value: bd.custosFixos, color: '#F5A623' },
    { label: 'Impostos', value: bd.impostos, color: '#868686' },
    { label: 'Taxas de Cartão', value: bd.taxasCartao, color: '#868686' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[#1B1B1D] border border-[#2F2F31] rounded-t-[24px] md:rounded-[24px] p-5 pb-8 md:pb-5"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        {/* Handle (mobile) */}
        <div className="w-10 h-1 bg-[#3A3A3C] rounded-full mx-auto mb-4 md:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-bold text-[16px] text-white">BASE</h2>
            <p className="text-[11px] text-[#868686] mt-0.5">Total de custos sobre o faturamento</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2A2A2C] hover:bg-[#333]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#868686" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Current BASE value */}
        <div className="flex items-center justify-between bg-[#FF9406]/10 border border-[#FF9406]/30 rounded-[14px] px-4 py-3 mb-5">
          <div>
            <div className="text-[10px] text-[#FF9406]/70 font-medium mb-0.5">Sua BASE atual</div>
            <div className="text-[28px] font-bold text-[#FF9406] leading-none">{parseFloat(base.value).toFixed(0)}%</div>
          </div>
          <span className={`px-3 py-1 rounded-full text-[11px] font-semibold border ${
            base.status === 'Crítico' ? 'bg-[#FF4560]/15 text-[#FF4560] border-[#FF4560]/30' :
            base.status === 'Alerta'  ? 'bg-[#F5A623]/15 text-[#F5A623] border-[#F5A623]/30' :
            base.status === 'Saudável' ? 'bg-[#00B37E]/15 text-[#00B37E] border-[#00B37E]/30' :
                                        'bg-[#555]/20 text-[#888] border-[#555]/30'
          }`}>{base.status}</span>
        </div>

        {/* Breakdown */}
        <div className="mb-5">
          <div className="text-[10px] text-[#555] font-semibold uppercase tracking-wider mb-2">Como é formada</div>
          <div className="text-[11px] text-[#868686] mb-3 leading-relaxed">
            <span className="text-white font-semibold">BASE = </span>
            Custos Fixos + Impostos + Taxas de Cartão
          </div>
          <div className="flex flex-col gap-2">
            {breakdownItems.map((item, idx) => {
              const val = parseFloat(item.value) || 0;
              const barWidth = baseValue > 0 ? Math.min((val / baseValue) * 100, 100) : 0;
              return (
                <div key={idx} className="flex items-center gap-3">
                  <div className="w-[110px] text-[10px] shrink-0" style={{ color: item.color }}>{item.label}</div>
                  <div className="flex-1 h-[4px] bg-[#2A2A2C] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${barWidth}%`, backgroundColor: item.color }} />
                  </div>
                  <div className="w-[36px] text-right text-[10px] font-semibold shrink-0" style={{ color: item.color }}>{val.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tabela de lucro/CMV removida — indicadores de precificação ficam no painel de fichas técnicas */}
      </div>
    </div>
  );
};

export default BaseModal;
