import React from 'react';

const BreakEvenGraphic = ({
  percentage = 0,
  value = "R$ 0,00",
  minLabel = "0k",
  maxLabel = "100%"
}) => {
  const safePercentage = Math.min(Math.max(percentage, 0), 100);

  const radius = 80;
  const cx = 100;
  const cy = 90;

  const getCoords = (degree) => {
    const rad = (degree * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad)
    };
  };

  const startAngle = -180;
  const progressAngle = startAngle + (safePercentage / 100) * 180;

  const describeArc = (start, end) => {
    const startPt = getCoords(start);
    const endPt = getCoords(end);
    const largeArc = end - start <= 180 ? 0 : 1;
    return [
      "M", startPt.x, startPt.y,
      "A", radius, radius, 0, largeArc, 1, endPt.x, endPt.y
    ].join(" ");
  };

  // Inner ring radius
  const innerRadius = 67;

  return (
    <div className="w-full flex flex-col items-center">
      <svg width="100%" viewBox="0 0 200 120" className="max-w-[240px]">
        {/* Inner decorative ring (semicircle) */}
        <path
          d={(() => {
            const getInnerCoords = (degree) => {
              const rad = (degree * Math.PI) / 180;
              return { x: cx + innerRadius * Math.cos(rad), y: cy + innerRadius * Math.sin(rad) };
            };
            const s = getInnerCoords(-180);
            const e = getInnerCoords(0);
            return `M ${s.x} ${s.y} A ${innerRadius} ${innerRadius} 0 0 1 ${e.x} ${e.y}`;
          })()}
          fill="none"
          stroke="#373737"
          strokeWidth="1"
        />

        {/* Track (background arc) */}
        <path
          d={describeArc(-180, 0)}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Progress arc */}
        <path
          d={describeArc(-180, progressAngle)}
          fill="none"
          stroke="#FF9406"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Labels 0k / max */}
        <text x="18" y="108" textAnchor="middle" fill="#646464" fontSize="10" fontWeight="500" fontFamily="Plus Jakarta Sans, sans-serif">{minLabel}</text>
        <text x="182" y="108" textAnchor="middle" fill="#646464" fontSize="10" fontWeight="500" fontFamily="Plus Jakarta Sans, sans-serif">{maxLabel}</text>

        {/* Percentage */}
        <text x="100" y="68" textAnchor="middle" fill="#ABABAB" fontSize="14" fontWeight="500" fontFamily="Plus Jakarta Sans, sans-serif">
          {percentage}%
        </text>

        {/* Value */}
        <text x="100" y="82" textAnchor="middle" fill="#595959" fontSize="9.5" fontWeight="400" fontFamily="Plus Jakarta Sans, sans-serif">
          {value}
        </text>
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-[-8px]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-[3px] rounded-[0.5px] bg-[#FF9406]" />
          <span className="text-[10px] font-normal text-[#595959]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Faturado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1">
            <div className="w-[5.5px] h-[5.5px] rounded-full bg-[#373737]" />
            <div className="w-3 h-[1px] bg-[#373737]" />
          </div>
          <span className="text-[10px] font-normal text-[#595959]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Meta</span>
        </div>
      </div>
    </div>
  );
};

export default BreakEvenGraphic;
