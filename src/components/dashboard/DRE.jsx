const DRE = ({ data }) => {
  if (!data) return null;

  const rows = [
    {
      type: 'revenue',
      sign: '+',
      label: 'Receita Bruta',
      value: `R$ ${data.receitaBruta}`,
      pct: '100,0%',
      bold: false,
    },
    {
      type: 'deduction',
      sign: '-',
      label: 'Impostos',
      sublabel: 'Simples / MEI / outros',
      value: `R$ ${data.impostos}`,
      pct: `${data.impostoPct}%`,
      bold: false,
    },
    {
      type: 'deduction',
      sign: '-',
      label: 'Taxas de Venda',
      sublabel: 'Cartão + Marketplace',
      value: `R$ ${data.taxasVenda}`,
      pct: `${data.taxasVendaPct}%`,
      bold: false,
    },
    {
      type: 'subtotal',
      sign: '=',
      label: 'Receita Líquida',
      value: `R$ ${data.receitaLiquida}`,
      pct: `${data.receitaLiquidaPct}%`,
      bold: true,
      color: '#E1E1E1',
    },
    {
      type: 'deduction',
      sign: '-',
      label: 'CMV Teórico',
      sublabel: 'Custo da Mercadoria Vendida (estimado das fichas técnicas)',
      value: `R$ ${data.cmv}`,
      pct: `${data.cmvPct}%`,
      bold: false,
    },
    {
      type: 'subtotal',
      sign: '=',
      label: 'Margem de Contribuição',
      value: `R$ ${data.margemContribuicao}`,
      pct: `${data.margemContribuicaoPct}%`,
      bold: true,
      color: '#F5A623',
    },
    {
      type: 'deduction',
      sign: '-',
      label: 'Custos Fixos',
      sublabel: 'Aluguel, salários, serviços...',
      value: `R$ ${data.custosFixos}`,
      pct: `${data.custosFixosPct}%`,
      bold: false,
    },
    {
      type: 'result',
      sign: '=',
      label: 'Lucro Líquido',
      value: `R$ ${data.lucroLiquido}`,
      pct: `${data.lucroLiquidoPct}%`,
      bold: true,
      color: data.isProfit ? '#00B37E' : '#FF4560',
    },
  ];

  return (
    <div className="bg-[#1B1B1D] border border-[#2F2F31] rounded-[16px] p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold text-[14px] text-[#E1E1E1]">DRE</h3>
          <p className="font-normal text-[11px] text-[#868686]">Demonstração do Resultado do Exercício</p>
        </div>
        <div className="w-[32px] h-[32px] bg-[#121212] border border-[#1F1F1F] rounded-[8px] flex items-center justify-center shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#585858" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="#585858" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {!data.hasData ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="w-10 h-10 rounded-full bg-[#1F1F1F] flex items-center justify-center border border-[#2F2F2F]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5">
              <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-[10px] text-[#7E7E7E] text-center leading-relaxed">
            Preencha seu faturamento e custos para <span className="text-[#F5A623] font-semibold">gerar o DRE</span>.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          {rows.map((row, idx) => {
            const isSubtotal = row.type === 'subtotal';
            const isResult = row.type === 'result';
            const isDeduction = row.type === 'deduction';
            const needsDividerBefore = isSubtotal || isResult;

            return (
              <div key={idx}>
                {needsDividerBefore && (
                  <div className="w-full h-px bg-[#2A2A2C] my-2" />
                )}
                <div className={`flex items-center gap-2 py-[5px] px-2 rounded-[8px] ${isResult ? 'bg-[#1F1F1F]' : ''}`}>
                  {/* Sign badge */}
                  <div className={`w-[18px] h-[18px] rounded-[4px] flex items-center justify-center shrink-0 text-[10px] font-bold
                    ${isResult
                      ? (data.isProfit ? 'bg-[#00B37E]/20 text-[#00B37E]' : 'bg-[#FF4560]/20 text-[#FF4560]')
                      : isSubtotal
                        ? 'bg-[#F5A623]/15 text-[#F5A623]'
                        : isDeduction
                          ? 'bg-[#2A2A2C] text-[#868686]'
                          : 'bg-[#2A2A2C] text-[#868686]'
                    }`}
                  >
                    {row.sign}
                  </div>

                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-[11px] leading-tight ${row.bold ? 'font-semibold' : 'font-normal'}`}
                      style={{ color: row.color || (isDeduction ? '#868686' : '#C8C8C8') }}
                    >
                      {row.label}
                    </div>
                    {row.sublabel && (
                      <div className="text-[9px] text-[#555] leading-tight">{row.sublabel}</div>
                    )}
                  </div>

                  {/* Pct */}
                  <div className={`text-[10px] w-[38px] text-right shrink-0 ${row.bold ? 'font-semibold' : 'font-normal'}`}
                    style={{ color: row.color || (isDeduction ? '#555' : '#7E7E7E') }}
                  >
                    {row.pct}
                  </div>

                  {/* Value */}
                  <div className={`text-[11px] w-[90px] text-right shrink-0 ${row.bold ? 'font-semibold' : 'font-normal'}`}
                    style={{ color: row.color || (isDeduction ? '#868686' : '#C8C8C8') }}
                  >
                    {row.value}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DRE;
