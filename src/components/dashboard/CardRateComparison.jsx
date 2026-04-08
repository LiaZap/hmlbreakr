const CardRateComparison = ({ data }) => {
  if (!data?.hasData) return null;

  return (
    <div className="bg-[#1B1B1D] border border-[#2F2F31] rounded-[16px] p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold text-[14px] text-[#E1E1E1]">Taxas de Cartão</h3>
          <p className="font-normal text-[11px] text-[#868686]">Comparativo com referência de mercado</p>
        </div>
        <div className="w-[32px] h-[32px] bg-[#121212] border border-[#1F1F1F] rounded-[8px] flex items-center justify-center shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <rect x="1" y="4" width="22" height="16" rx="2" stroke="#585858" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M1 10h22" stroke="#585858" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>
      </div>

      {/* Reference bar */}
      <div className="flex items-center gap-3 mb-4 px-3 py-2.5 bg-[#1F1F1F] rounded-[10px] border border-[#2A2A2C]">
        <div className="w-2 h-2 rounded-full bg-[#00B37E] shrink-0" />
        <div className="flex-1">
          <span className="text-[10px] text-[#868686]">Referência ideal de mercado</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-semibold text-[#00B37E]">
          <span>Débito ≤ {data.idealDebit}%</span>
          <span className="text-[#2A2A2C]">|</span>
          <span>Crédito ≤ {data.idealCredit}%</span>
        </div>
      </div>

      {/* Per-machine comparison */}
      <div className="flex flex-col gap-3 mb-4">
        {data.items.map((item, idx) => {
          const debitAbove = item.debit > item.debitIdeal;
          const creditAbove = item.credit > item.creditIdeal;
          const anyAbove = debitAbove || creditAbove;
          return (
            <div key={idx} className={`rounded-[12px] border p-3 ${anyAbove ? 'border-[#A78BFA]/30 bg-[#A78BFA]/5' : 'border-[#2A2A2C] bg-[#1F1F1F]'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-white">{item.name}</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${
                  anyAbove ? 'bg-[#A78BFA]/15 text-[#A78BFA]' : 'bg-[#00B37E]/15 text-[#00B37E]'
                }`}>
                  {anyAbove ? 'Acima do ideal' : 'OK'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Débito */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-[#555]">Débito</span>
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] font-bold ${debitAbove ? 'text-[#A78BFA]' : 'text-[#00B37E]'}`}>{item.debit}%</span>
                      {debitAbove && <span className="text-[9px] text-[#555]">↑ {(item.debit - item.debitIdeal).toFixed(1)}%</span>}
                    </div>
                  </div>
                  <div className="w-full h-[4px] bg-[#2A2A2C] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min((item.debit / (item.debitIdeal * 2)) * 100, 100)}%`,
                        backgroundColor: debitAbove ? '#A78BFA' : '#00B37E'
                      }}
                    />
                  </div>
                  <div className="text-[8px] text-[#555] mt-0.5">ideal: {item.debitIdeal}%</div>
                </div>
                {/* Crédito */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-[#555]">Crédito</span>
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] font-bold ${creditAbove ? 'text-[#A78BFA]' : 'text-[#00B37E]'}`}>{item.credit}%</span>
                      {creditAbove && <span className="text-[9px] text-[#555]">↑ {(item.credit - item.creditIdeal).toFixed(1)}%</span>}
                    </div>
                  </div>
                  <div className="w-full h-[4px] bg-[#2A2A2C] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min((item.credit / (item.creditIdeal * 2)) * 100, 100)}%`,
                        backgroundColor: creditAbove ? '#A78BFA' : '#00B37E'
                      }}
                    />
                  </div>
                  <div className="text-[8px] text-[#555] mt-0.5">ideal: {item.creditIdeal}%</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Excess cost insight */}
      {data.hasExcess ? (
        <div className="flex items-center gap-3 p-3 bg-[#A78BFA]/10 border border-[#A78BFA]/25 rounded-[10px]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p className="text-[10px] text-[#C4B5FD] flex-1 leading-relaxed">
            Você está perdendo aproximadamente <span className="font-bold text-white">R$ {data.excessCost}/mês</span> por pagar taxas acima da referência de mercado. Negocie com sua operadora.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 bg-[#00B37E]/10 border border-[#00B37E]/25 rounded-[10px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#00B37E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p className="text-[10px] text-[#00B37E] flex-1">Suas taxas de cartão estão dentro da referência de mercado.</p>
        </div>
      )}
    </div>
  );
};

export default CardRateComparison;
