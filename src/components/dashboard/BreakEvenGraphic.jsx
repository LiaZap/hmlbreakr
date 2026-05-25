import React from 'react';

const BreakEvenGraphic = ({
  percentage = 0,
  value = "R$ 0,00",
  revenueAccumulated = null,
  minLabel = "0k",
  maxLabel = "100%"
}) => {
  const safePercentage = Math.min(Math.max(percentage, 0), 100);

  // From Figma: outer arc stroke-width 5.86, inner ring stroke-width 1.17
  const outerR = 92;
  const innerR = 78;
  const cx = 100;
  const cy = 98;

  const getCoords = (r, degree) => {
    const rad = (degree * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const describeArc = (r, start, end) => {
    const s = getCoords(r, start);
    const e = getCoords(r, end);
    const largeArc = end - start <= 180 ? 0 : 1;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  };

  const progressAngle = -180 + (safePercentage / 100) * 180;

  return (
    <div className="w-full flex flex-col items-center">
      <svg width="100%" viewBox="0 0 200 120" className="max-w-[260px]">
        {/* Inner decorative ring (Ellipse 47) */}
        <path
          d={describeArc(innerR, -180, 0)}
          fill="none"
          stroke="#373737"
          strokeWidth="1.17"
        />

        {/* Track — background arc (rgba white 0.1) */}
        <path
          d={describeArc(outerR, -180, 0)}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="5.86"
          strokeLinecap="round"
        />

        {/* Progress arc (Ellipse 46) */}
        {safePercentage > 0 && (
          <path
            d={describeArc(outerR, -180, progressAngle)}
            fill="none"
            stroke="#FF9406"
            strokeWidth="5.86"
            strokeLinecap="round"
          />
        )}

        {/* 0k / max labels */}
        <text x="8" y="112" textAnchor="middle" fill="#646464" fontSize="10" fontWeight="500" fontFamily="Plus Jakarta Sans, sans-serif">{minLabel}</text>
        <text x="192" y="112" textAnchor="middle" fill="#646464" fontSize="10" fontWeight="500" fontFamily="Plus Jakarta Sans, sans-serif">{maxLabel}</text>

        {/* Percentage — 14px weight 500 #ABABAB */}
        <text x="100" y="70" textAnchor="middle" fill="#ABABAB" fontSize="14" fontWeight="500" fontFamily="Plus Jakarta Sans, sans-serif">
          {percentage}%
        </text>

        {/* Revenue accumulated — main value */}
        {revenueAccumulated && (
          <text x="100" y="85" textAnchor="middle" fill="#FF9406" fontSize="11" fontWeight="600" fontFamily="Plus Jakarta Sans, sans-serif">
            R$ {revenueAccumulated}
          </text>
        )}

        {/* Break-even target — secondary */}
        <text x="100" y={revenueAccumulated ? "99" : "92"} textAnchor="middle" fill="#7A7A7A" fontSize="10" fontWeight="500" fontFamily="Plus Jakarta Sans, sans-serif">
          Meta: {value}
        </text>
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-[-6px]">
        {/* Faturado: Rectangle 91 = 12x3 #FF9406 */}
        <div className="flex items-center gap-1.5">
          <div style={{ width: 12, height: 3 }} className="bg-[#FF9406]" />
          <span className="text-[10px] font-normal text-[#595959]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Faturado</span>
        </div>
        {/* Meta: Ellipse 51 (5.5px dot) + Rectangle 92 (12x1) #373737 */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-[3px]">
            <div style={{ width: 5.5, height: 5.5 }} className="rounded-full bg-[#373737]" />
            <div style={{ width: 12, height: 1 }} className="bg-[#373737]" />
          </div>
          <span className="text-[10px] font-normal text-[#595959]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Meta</span>
        </div>
      </div>
    </div>
  );
};

export default BreakEvenGraphic;
