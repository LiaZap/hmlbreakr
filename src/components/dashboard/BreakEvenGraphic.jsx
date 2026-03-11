import React from 'react';

const BreakEvenGraphic = ({
  percentage = 0,
  value = "R$ 0,00",
  minLabel = "0k",
  maxLabel = "100%"
}) => {
  // Clamp percentage between 0 and 100 for the bar
  const safePercentage = Math.min(Math.max(percentage, 0), 100);
  
  // Calculate arc path
  // Radius 80, Center (100, 100)
  // Start Angle: -90 (Left) to +90 (Right) -> Total 180 degrees semicircle
  // We want a slightly smaller arc, maybe -100 to 80? Or standard gauge.
  // Let's do standard semicircle for simplicity: 180 degrees.
  // SVG ViewBox: 0 0 200 120 (Center X=100, Y=100)
  
  const radius = 80;
  const cx = 100;
  const cy = 85;
  
  // As cy is 85 and radius 80, top is 5, bottom centers are 85.
  // Viewbox height 110 leaves 25px at bottom for labels. Perfect.

  // Helper to get coordinates
  const getCoords = (degree) => {
    const rad = (degree * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad)
    };
  };

  // Background Arc (Full 180: -180 to 0)
  const startAngle = -180;
  // Foreground Arc equivalent to percentage
  const progressAngle = startAngle + (safePercentage / 100) * 180;

  // Describe Arc Path
  const describeArc = (start, end) => {
    const startPt = getCoords(start);
    const endPt = getCoords(end);
    const largeArc = end - start <= 180 ? 0 : 1;
    return [
      "M", startPt.x, startPt.y, 
      "A", radius, radius, 0, largeArc, 1, endPt.x, endPt.y
    ].join(" ");
  };

  return (
    <div className="w-full flex flex-col items-center">
      <svg width="100%" viewBox="0 0 200 110" className="max-w-[240px]">
        {/* Track */}
        <path
          d={describeArc(-180, 0)}
          fill="none"
          stroke="#333"
          strokeWidth="8"
          strokeLinecap="round"
        />

        {/* Progress */}
        <path
          d={describeArc(-180, progressAngle)}
          fill="none"
          stroke="#FF9406"
          strokeWidth="8"
          strokeLinecap="round"
        />

        {/* Labels on Ends */}
        <text x="20" y="105" textAnchor="middle" fill="#777" fontSize="10" fontFamily="sans-serif">{minLabel}</text>
        <text x="180" y="105" textAnchor="middle" fill="#777" fontSize="10" fontFamily="sans-serif">{maxLabel}</text>

        {/* Center Text */}
        <text x="100" y="65" textAnchor="middle" fill="#E1E1E1" fontSize="24" fontWeight="bold" fontFamily="Plus Jakarta Sans, sans-serif">
          {percentage}%
        </text>
        <text x="100" y="85" textAnchor="middle" fill="#888" fontSize="10" fontWeight="medium" fontFamily="Plus Jakarta Sans, sans-serif">
          {value}
        </text>
      </svg>
      
      {/* Legend below graph */}
      <div className="flex items-center gap-4 mt-[-10px]">
         <div className="flex items-center gap-1.5">
            <div className="w-3 h-[2px] bg-[#FF9406]" />
            <span className="text-[10px] text-[#888]">Faturado</span>
         </div>
         <div className="flex items-center gap-1.5">
            <div className="w-3 h-[2px] bg-[#555]" />
            <span className="text-[10px] text-[#888]">Meta</span>
         </div>
      </div>
    </div>
  );
};

export default BreakEvenGraphic;
