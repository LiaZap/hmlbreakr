import React, { useState } from 'react';

const FinanceOverview = ({ data, onSelectMonth }) => {
  const [selectedKey, setSelectedKey] = useState(null); // MM/YYYY key or legacy monthIdx
  const [hoveredKey, setHoveredKey] = useState(null);

  const history = data.history || [];
  const timeline = data.timeline || [];
  const useTimeline = timeline.length > 0;

  const formatVal = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  let displayValue, displayMonth;
  if (useTimeline) {
    const entry = timeline.find(e => e.key === selectedKey);
    displayValue = entry ? formatVal(entry.value) : data.total;
    displayMonth = entry ? entry.label : data.month;
  } else {
    displayValue = selectedKey !== null ? formatVal(history[selectedKey]) : data.total;
    displayMonth = selectedKey !== null ? monthNames[selectedKey] : data.month;
  }

  return (
    <div className="flex flex-col w-full bg-[#101010] rounded-[16px]">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="font-semibold text-[14px] text-[#CACACA]">Faturamento</span>
          <p className="font-normal text-[10px] text-[#595959]">Visão Geral dos Índices Financeiros</p>
        </div>
        <div className="flex items-center gap-2">
           <div className="flex items-center gap-1.5 px-2 py-1 bg-[#1F1F1F] rounded-full border border-[#2F2F2F]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#FD8989]" />
              <span className="text-[10px] font-medium text-[#CACACA]">{data.risk.label}</span>
           </div>
           <span className="text-[10px] font-semibold text-white">{data.risk.count}</span>
           <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="-rotate-45 text-[#959387]">
              <path d="M1 9L9 1M9 1H3M9 1V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
           </svg>
        </div>
      </div>

      {/* Period Total */}
      {data.annualTotal && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <span className="text-[10px] text-[#595959]">Faturamento Total do Período:</span>
          <span className="text-[11px] font-bold text-[#E2FD89]">R$ {data.annualTotal}</span>
        </div>
      )}

      {/* Bar Chart */}
      <div className="h-[60px] flex items-end justify-between gap-[3px] w-full mb-4 px-1 relative">
        {useTimeline ? (() => {
            // Timeline mode: oldest → newest, left → right
            const maxVal = Math.max(...timeline.map(e => e.value), 1);
            const lastKey = timeline[timeline.length - 1]?.key;
            return timeline.map((entry) => {
              const isMostRecent = entry.key === lastKey;
              const isSelected = selectedKey === entry.key;
              const hasData = entry.value > 0;
              const hasSelection = selectedKey !== null;

              let bgColor = 'bg-[#333]';
              if (isSelected && hasData) bgColor = 'bg-[#FF9406]';
              else if (!hasSelection && isMostRecent && hasData) bgColor = 'bg-[#FF9406]';
              else if (hasData) bgColor = 'bg-[#E1E1E1]';

              let opacity = 0.2;
              if (isSelected) opacity = 1;
              else if (!hasSelection && isMostRecent) opacity = 1;
              else if (hoveredKey === entry.key) opacity = 1;
              else if (hasData) opacity = 0.4;

              return (
                <div
                  key={entry.key}
                  className="group relative flex flex-col items-center justify-end h-full flex-1"
                  onMouseEnter={() => setHoveredKey(entry.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => { setSelectedKey(entry.key); if (onSelectMonth) onSelectMonth(entry.monthIdx); }}
                >
                  <AnimateTooltip show={hoveredKey === entry.key} value={entry.value} label={entry.label} />
                  <div
                    className={`w-full max-w-[12px] md:max-w-[16px] rounded-[3px] transition-all duration-300 cursor-pointer ${bgColor} hover:bg-[#FF9406]`}
                    style={{ height: entry.value > 0 ? `${Math.max((entry.value / maxVal) * 100, 15)}%` : '4px', opacity }}
                  />
                  <span className="text-[7px] text-[#555] mt-1 leading-tight text-center">{entry.label}</span>
                </div>
              );
            });
        })() : (() => {
            // Legacy fallback: 12 months, oldest → newest
            const monthsShort = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            const currentMonthIdx = new Date().getMonth();
            const months12 = [];
            for (let m = 11; m >= 0; m--) {
              const idx = (currentMonthIdx - m + 12) % 12;
              months12.push({ val: history[idx] || 0, i: idx });
            }
            const maxVal = Math.max(...months12.map(m => m.val), 1);
            return months12.map(({ val, i }) => {
              const isCurrent = i === currentMonthIdx;
              const isSelected = selectedKey === i;
              const hasData = val > 0;
              const hasSelection = selectedKey !== null;
              let bgColor = 'bg-[#333]';
              if (isSelected && hasData) bgColor = 'bg-[#FF9406]';
              else if (!hasSelection && isCurrent && hasData) bgColor = 'bg-[#FF9406]';
              else if (hasData) bgColor = 'bg-[#E1E1E1]';
              let opacity = 0.2;
              if (!hasData) opacity = 0.2;
              else if (isSelected) opacity = 1;
              else if (!hasSelection && isCurrent) opacity = 1;
              else if (hoveredKey === i) opacity = 1;
              else opacity = 0.4;
              return (
                <div
                  key={i}
                  className="group relative flex flex-col items-center justify-end h-full flex-1"
                  onMouseEnter={() => setHoveredKey(i)}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => { setSelectedKey(i); if (onSelectMonth) onSelectMonth(i); }}
                >
                  <AnimateTooltip show={hoveredKey === i} value={val} label={monthsShort[i]} />
                  <div
                    className={`w-full max-w-[12px] md:max-w-[16px] rounded-[3px] transition-all duration-300 cursor-pointer ${bgColor} hover:bg-[#FF9406]`}
                    style={{ height: val > 0 ? `${Math.max((val / maxVal) * 100, 15)}%` : '4px', opacity }}
                  />
                  <span className="text-[7px] text-[#555] mt-1">{monthsShort[i]}</span>
                </div>
              );
            });
        })()}
      </div>

      {/* Value & Badge Row */}
      <div className="flex items-end justify-between mb-1">
         {/* Value */}
         <div className="flex items-baseline gap-1 min-w-0">
           <span className="text-[18px] md:text-[24px] font-bold text-[#FF9406]">R$</span>
           <span className="text-[18px] md:text-[24px] font-bold text-[#E1E1E1] truncate">{displayValue}</span>
         </div>

         {/* Badge & Status */}
         <div className="flex flex-col items-end">
            {(() => {
              const isNegative = data.change?.startsWith('-');
              const isZero = data.change === '0%' || data.change === '+0.0%';
              const color = isNegative ? '#FD8989' : '#E2FD89';
              const label = isZero ? 'Estável' : (isNegative ? 'Diminuiu' : 'Aumentou');
              return (
                <div className="px-2 py-0.5 rounded-[6px] mb-1" style={{ backgroundColor: `${color}15`, border: `1px solid ${color}33` }}>
                  <span className="text-[10px] font-semibold" style={{ color }}>{label} {data.change}</span>
                </div>
              );
            })()}
            <div className="flex items-center gap-1 opacity-60">
               <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#E1E1E1" strokeWidth="2"><path d="M7 17l9.2-9.2M17 17V7H7"/></svg>
               <span className="text-[9px] text-[#E1E1E1]">{data.status}</span>
            </div>
         </div>
      </div>

      {/* Date Label */}
      <div className="text-[10px] text-[#595959] mb-4">
         Faturado em <strong className="text-[#959387]">{displayMonth}</strong>
      </div>

      {/* Bottom Sub-Cards (Custos & Margem) */}
      <div className="grid grid-cols-2 gap-3">
        {data.cards && data.cards.map((card, index) => (
           <div key={index} className="bg-[#151515] border border-[#262626] rounded-[14px] p-3 flex flex-col gap-3 group hover:border-[#333] transition-colors">
              <div className="flex items-start justify-between">
                 <div className="w-8 h-8 rounded-full bg-[#1F1F1F] flex items-center justify-center border border-[#2F2F2F]">
                    {card.icon === 'wallet' ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#868686" strokeWidth="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#868686" strokeWidth="1.5"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                    )}
                 </div>
                 <div className={`px-2 py-0.5 rounded-full border ${card.status === 'neutral' ? 'bg-[#E2FD89]/5 border-[#E2FD89]/20 text-[#E2FD89]' : 'bg-[#FD8989]/5 border-[#FD8989]/20 text-[#FD8989]'}`}>
                    <span className="text-[10px] font-bold">{card.percentage}</span>
                 </div>
              </div>
              <div>
                 <div className="text-[14px] font-bold text-[#E1E1E1] mb-0.5">{card.value}</div>
                 <div className="flex items-center gap-1.5 relative">
                    <span className="text-[10px] text-[#595959] font-medium">{card.label}</span>
                    {(card.tooltip || card.breakdown) && (
                      <div className="relative inline-block">
                        <div className="w-3 h-3 rounded-full bg-[#262626] flex items-center justify-center text-[8px] text-[#595959] font-bold cursor-help peer">?</div>
                        {/* Tooltip on hover */}
                        <div className="absolute bottom-full left-0 mb-2 hidden peer-hover:block z-50 w-[220px] bg-[#1F1F1F] border border-[#2F2F2F] rounded-[8px] p-2.5 shadow-xl pointer-events-none">
                          {card.tooltip && (
                            <div className="text-[10px] text-[#B0B0B0] mb-1.5 leading-snug">{card.tooltip}</div>
                          )}
                          {card.breakdown && card.breakdown.length > 0 && (
                            <div className="flex flex-col gap-1 pt-1.5 border-t border-[#2F2F2F]">
                              {card.breakdown.map((b, i) => (
                                <div key={i} className="flex items-center justify-between text-[10px]">
                                  <span className="text-[#868686]">{b.label}</span>
                                  <span className="text-[#E1E1E1] font-semibold">{b.value}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                 </div>
              </div>
           </div>
        ))}
      </div>

    </div>
  );
};

export default FinanceOverview;

const AnimateTooltip = ({ show, value, label }) => {
  if (!show) return null;
  return (
    <div className="absolute bottom-full mb-2 bg-[#1F1F1F] border border-[#2F2F2F] px-2 py-1 rounded-[6px] flex flex-col items-center pointer-events-none z-10 whitespace-nowrap shadow-xl">
        <span className="text-[8px] text-[#888] mb-px">{label}</span>
        <span className="text-[10px] font-bold text-[#E1E1E1]">
            R$ {value ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'}
        </span>
        {/* Arrow */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1F1F1F] border-r border-b border-[#2F2F2F] rotate-45 transform -mt-1" />
    </div>
  );
};
