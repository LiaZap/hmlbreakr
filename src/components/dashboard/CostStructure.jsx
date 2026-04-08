import React from 'react';

const CostStructure = ({ data }) => {
  return (
    <div className="bg-[#1B1B1D] border border-[#2F2F31] rounded-[16px] p-3 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-[14px] text-[#E1E1E1] mb-1">
            Estrutura de custos
          </h3>
          <p className="font-normal text-[11px] text-[#868686]">
            Custos fixos e variáveis do período
          </p>
        </div>
        <div className="shrink-0">
          <svg width="53" height="24" viewBox="0 0 53 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="52.5094" height="24" rx="8" fill="#E2FD89" fillOpacity="0.15"/>
            <text x="8" y="16" fill="#E2FD89" fontSize="10" fontWeight="bold" fontFamily="sans-serif">{data.percentage}</text>
            <rect x="37" y="10.2968" width="7.50943" height="3.40634" rx="1.70317" fill="#E2FD89"/>
            <rect x="35.2968" y="8.59364" width="10.9158" height="6.81269" rx="3.40634" stroke="#E2FD89" strokeOpacity="0.19" strokeWidth="3.40634"/>
          </svg>
        </div>
      </div>

      {/* Value */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold text-[14px] md:text-[16px] text-[#FF9406]">R$</span>
          <span className="font-semibold text-[20px] md:text-[24px] text-white tracking-tight">{data.total}</span>
        </div>
        {data.fixedCostPercentage && (
          <div className="shrink-0 flex items-center justify-center bg-[#FFC100]/15 rounded-md px-2.5 h-[24px]">
            <span className="text-[#FFC100] text-[10px] font-bold">CF: {data.fixedCostPercentage}</span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
        <div className="w-full h-[6px] bg-[#2A2A2C] rounded-full mb-5 overflow-hidden">
        <div className="h-full bg-[#FD8989] rounded-full" style={{ width: data.percentage }} />
      </div>

      {/* Cost breakdown table */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[10px] mb-4">
        {data.breakdown.map((item, idx) => (
          <div key={idx} className="flex justify-between">
            <span className="text-[#7E7E7E]">{item.label}</span>
            <span className="text-[#CACACA] font-medium">{item.value}</span>
          </div>
        ))}
      </div>

      {/* Provisões */}
      {data.reserves?.hasData && (
        <div className="border border-[#2A2A2C] rounded-[10px] p-3 bg-[#161616]">
          <div className="flex items-center gap-1.5 mb-2">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-[10px] font-semibold text-[#F5A623]">Provisões a reservar / mês</span>
          </div>
          <div className="flex flex-col gap-1.5 text-[10px]">
            {parseFloat(data.reserves.employees.replace(/\./g,'').replace(',','.')) > 0 && (
              <div className="flex justify-between">
                <span className="text-[#7E7E7E]">Reserva trabalhista (CLT)</span>
                <span className="text-[#CACACA] font-medium">R$ {data.reserves.employees}</span>
              </div>
            )}
            {parseFloat(data.reserves.depreciation.replace(/\./g,'').replace(',','.')) > 0 && (
              <div className="flex justify-between">
                <span className="text-[#7E7E7E]">Depreciação equipamentos</span>
                <span className="text-[#CACACA] font-medium">R$ {data.reserves.depreciation}</span>
              </div>
            )}
            <div className="w-full h-px bg-[#2A2A2C] my-0.5" />
            <div className="flex justify-between">
              <span className="text-[#F5A623] font-semibold">Total provisões</span>
              <span className="text-[#F5A623] font-semibold">R$ {data.reserves.total}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CostStructure;
