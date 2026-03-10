const TechnicalSheets = ({ data }) => {
  return (
    <div className="bg-[#1B1B1D] border border-[#2F2F31] rounded-[16px] p-3 h-full flex flex-col justify-between">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold text-[14px] text-[#E1E1E1]">Fichas Técnicas</h3>
          <p className="font-normal text-[11px] text-[#868686]">Onde o lucro se perde ou se protege no dia a dia</p>
        </div>
        <div className="w-[32px] h-[32px] bg-[#121212] border border-[#1F1F1F] rounded-[8px] flex items-center justify-center">
           <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M11.0833 1.75H2.91667C2.27233 1.75 1.75 2.27233 1.75 2.91667V11.0833C1.75 11.7277 2.27233 12.25 2.91667 12.25H11.0833C11.7277 12.25 12.25 11.7277 12.25 11.0833V2.91667C12.25 2.27233 11.7277 1.75 11.0833 1.75Z" stroke="#585858" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M1.75 6.41666H12.25" stroke="#585858" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5.25 1.75V12.25" stroke="#585858" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
           </svg>
        </div>
      </div>

      {/* Data Columns with Icons */}
      <div className="grid grid-cols-3 gap-2 md:gap-3 mb-6">
        {data.map((item, idx) => (
          <div key={idx} className="flex flex-col items-center gap-2">
            {/* Column Icon - Nota/Ficha */}
            <div className="w-[28px] h-[28px] bg-[#121212] border border-[#1F1F1F] rounded-[6px] flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M8.16667 1.75H3.5C3.19058 1.75 2.89383 1.87292 2.67504 2.09171C2.45625 2.3105 2.33333 2.60725 2.33333 2.91667V11.0833C2.33333 11.3928 2.45625 11.6895 2.67504 11.9083C2.89383 12.1271 3.19058 12.25 3.5 12.25H10.5C10.8094 12.25 11.1062 12.1271 11.325 11.9083C11.5437 11.6895 11.6667 11.3928 11.6667 11.0833V5.25L8.16667 1.75Z" stroke="#585858" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8.16667 1.75V5.25H11.6667" stroke="#585858" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9.33333 7.58334H4.66667" stroke="#585858" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9.33333 9.91666H4.66667" stroke="#585858" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5.83333 5.25H5.25H4.66667" stroke="#585858" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {/* Value */}
            <span className="font-semibold text-[14px] text-[#DDDDDD]">{item.value}</span>
            {/* Label */}
            <p className="font-normal text-[9px] text-[#7E7E7E] text-center leading-tight">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Insight Section */}
      <div className="mt-auto flex items-center gap-3">
         <div className="w-[28px] h-[28px] shrink-0 bg-[#1E1E1E] rounded-full flex items-center justify-center border border-[#333]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M8 21H16M12 17V21M6 4H18C19.1046 4 20 4.89543 20 6V9C20 9.88331 19.3877 10.6139 18.5284 10.8924C17.7533 13.9113 15.0217 16.0353 12 15.9994C8.97869 15.9635 6.25203 13.8404 5.47164 10.8236C4.61232 10.5451 4 9.81449 4 8.93103V6C4 4.89543 4.89543 4 6 4Z" stroke="#777" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 8L12 10L14 8" stroke="#777" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
         </div>
         <p className="text-[10px] text-[#A3A3A3] leading-normal flex-1">
           <span className="font-bold text-[#E1E1E1]">Lucro começa no estoque:</span> Ficha técnica atualizada e estoque contado reduzem desperdício, erro e margem perdida.
         </p>
      </div>
    </div>
  );
};

export default TechnicalSheets;
