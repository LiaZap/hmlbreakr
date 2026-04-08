import { useState, useRef, useEffect } from 'react';

const InfoTooltip = ({ content, position = 'bottom', children }) => {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  // Close on outside tap (mobile)
  useEffect(() => {
    if (!visible) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setVisible(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [visible]);

  const posClasses = {
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
    'bottom-right': 'top-full mt-2 left-0',
    'bottom-left': 'top-full mt-2 right-0',
  };

  return (
    <div
      ref={ref}
      className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={() => setVisible(v => !v)}
    >
      {children || (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="cursor-pointer shrink-0">
          <circle cx="12" cy="12" r="10" stroke="#555" strokeWidth="1.5"/>
          <path d="M12 16v-4M12 8h.01" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )}
      {visible && (
        <div className={`absolute z-50 w-[220px] bg-[#252527] border border-[#333] rounded-[12px] px-3 py-2.5 shadow-xl pointer-events-none ${posClasses[position] || posClasses.bottom}`}>
          <p className="text-[10px] text-[#C8C8C8] leading-[1.5]">{content}</p>
        </div>
      )}
    </div>
  );
};

export default InfoTooltip;
