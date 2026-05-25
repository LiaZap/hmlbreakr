import React, { useState } from 'react';
import InfoTooltip from './InfoTooltip';

const MoneyOnTable = ({ data }) => {
  const [activeIdx, setActiveIdx] = useState(null);

  const items = data.items || [];
  const totalPct = items.reduce((sum, item) => sum + (item.pctOfRevenue || 0), 0);
  // Scale proportionally if total exceeds 100%
  const scale = totalPct > 100 ? 100 / totalPct : 1;
  const scaledTotal = totalPct * scale;
  const remainingPct = Math.max(0, 100 - scaledTotal);

  // Active item for tooltip
  const active = activeIdx !== null ? items[activeIdx] : null;

  return (
    <div className="bg-[#1B1B1D] rounded-[16px] p-3 h-full flex flex-col relative overflow-hidden min-h-0">

      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-[14px] text-[#E1E1E1] mb-1">Dinheiro na mesa</h3>
          <p className="font-normal text-[11px] text-[#868686]">O quanto está escapando hoje por decisões operacionais</p>
        </div>
        <div className="w-[32px] h-[32px] bg-white/5 rounded-[8px] flex items-center justify-center border border-white/5 shrink-0">
           <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11.0833 1.75H2.91667C2.27233 1.75 1.75 2.27233 1.75 2.91667V11.0833C1.75 11.7277 2.27233 12.25 2.91667 12.25H11.0833C11.7277 12.25 12.25 11.7277 12.25 11.0833V2.91667C12.25 2.27233 11.7277 1.75 11.0833 1.75Z" stroke="#868686" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M1.75 6.41666H12.25" stroke="#868686" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M5.83333 12.25V1.75" stroke="#868686" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
      </div>

      {/* Main Value */}
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="font-semibold text-[14px] md:text-[16px] text-[#FF9406]">R$</span>
        <span className="font-semibold text-[20px] md:text-[24px] text-white tracking-tight">{data.total}</span>
        {data.percentage && data.percentage !== "0%" && (
          <div className="ml-auto shrink-0">
            <InfoTooltip
              position="bottom-left"
              content={`Você está deixando ${data.percentage} do seu faturamento na mesa por decisões operacionais (taxas de marketplace, custos fixos elevados e perdas que podem ser recuperadas).`}
            >
              <div className="flex items-center justify-center bg-[#FD8989]/15 rounded-md px-2.5 h-[24px] cursor-help hover:bg-[#FD8989]/25 transition-colors">
                <span className="text-[#FD8989] text-[10px] font-bold">{data.percentage}</span>
              </div>
            </InfoTooltip>
          </div>
        )}
      </div>

      {/* Valor Recuperado badge */}
      {data.hasRecovered && (
        <div className="flex items-center gap-1.5 mb-3">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M12 19V5M5 12l7-7 7 7" stroke="#00B37E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-[10px] font-semibold text-[#00B37E]">R$ {data.recoveredTotal} recuperado este mês</span>
        </div>
      )}
      {!data.hasRecovered && <div className="mb-3" />}

      {items.length > 0 ? (
        <>
          {/* Stacked Progress Bar */}
          <div className="w-full h-[10px] rounded-full overflow-hidden flex mb-3">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="h-full cursor-pointer transition-opacity duration-150"
                style={{
                  width: `${(item.pctOfRevenue || 0) * scale}%`,
                  backgroundColor: item.color || '#FF9406',
                  opacity: activeIdx !== null && activeIdx !== idx ? 0.35 : 1,
                }}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseLeave={() => setActiveIdx(null)}
                onClick={() => setActiveIdx(activeIdx === idx ? null : idx)}
              />
            ))}
            <div className="h-full" style={{ width: `${remainingPct}%`, backgroundColor: '#3A3A3C', opacity: activeIdx !== null ? 0.2 : 0.4 }} />
          </div>

          {/* Tooltip — fixed height, always occupies space */}
          <div className="h-[36px] mb-2">
            {active ? (
              <div className="flex items-center justify-between px-2.5 py-2 bg-[#252527] rounded-[10px] border border-[#333] h-full">
                <div className="flex items-center gap-2">
                  <div className="w-[8px] h-[8px] rounded-full shrink-0" style={{ backgroundColor: active.color }} />
                  <span className="font-medium text-[11px] text-[#E1E1E1]">{active.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-semibold" style={{ color: active.color }}>{active.pct}</span>
                  <span className="font-semibold text-[12px] text-white">R$ {active.value}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center px-2.5 h-full">
                <span className="text-[10px] text-[#555]">Passe o mouse na barra para ver detalhes</span>
              </div>
            )}
          </div>

          {/* Legend dots + actions */}
          <div className="flex flex-col gap-1.5">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 cursor-pointer"
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseLeave={() => setActiveIdx(null)}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-[6px] h-[6px] rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-[9px] text-[#999] truncate">{item.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.recovered > 0 && (
                    <span className="text-[8px] font-semibold text-[#00B37E]">↓ R$ {item.recovered.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex items-start flex-1 opacity-50">
          <p className="text-[10px] text-[#7E7E7E] leading-relaxed">
            {!data.hasData
              ? "Preencha o % de vendas nos marketplaces e fichas técnicas para ver valores."
              : "Nenhum indicador acima do limite. Operação saudável!"
            }
          </p>
        </div>
      )}

      {/* Insight Section */}
      <div className="flex items-center gap-3 mt-auto pt-3 border-t border-[#2A2A2C]">
        <div className="w-[24px] h-[24px] shrink-0 bg-[#1E1E1E] rounded-full flex items-center justify-center border border-[#333]">
           <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M8 21H16M12 17V21M6 4H18C19.1046 4 20 4.89543 20 6V9C20 9.88331 19.3877 10.6139 18.5284 10.8924C17.7533 13.9113 15.0217 16.0353 12 15.9994C8.97869 15.9635 6.25203 13.8404 5.47164 10.8236C4.61232 10.5451 4 9.81449 4 8.93103V6C4 4.89543 4.89543 4 6 4Z" stroke="#777" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 8L12 10L14 8" stroke="#777" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <p className="text-[10px] text-[#A3A3A3] leading-normal flex-1">
          <span className="font-bold text-[#E1E1E1]">Limites saudáveis: </span>
          Marketplace até 23%, Custo Fixo até 33% e CMV até 30% do faturamento.
        </p>
      </div>

    </div>
  );
};

export default MoneyOnTable;
