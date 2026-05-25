import { useState, useRef, useEffect } from 'react';

/**
 * InfoTooltip — tooltip global do app.
 *
 * Em mobile (<640px) usa auto-position: detecta a posição do trigger
 * via getBoundingClientRect e ancora o tooltip pra dentro da viewport.
 * Largura limitada a min(220px, viewport-24px) pra nunca cortar.
 *
 * Em desktop respeita o prop `position` original (bottom-left, etc).
 */
const InfoTooltip = ({ content, position = 'bottom', children }) => {
  const [visible, setVisible] = useState(false);
  const [mobileStyle, setMobileStyle] = useState(null);
  const ref = useRef(null);
  const triggerRef = useRef(null);

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

  // Auto-position pra viewport mobile (<640px) — calcula offset relativo
  // ao trigger pra o tooltip nunca passar das bordas.
  useEffect(() => {
    if (!visible) { setMobileStyle(null); return; }
    if (window.innerWidth >= 640) { setMobileStyle(null); return; }
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const PAD = 12;
    const tipW = Math.min(220, vw - PAD * 2);
    // Centraliza no trigger; clampa nas bordas
    let left = rect.left + rect.width / 2 - tipW / 2;
    if (left < PAD) left = PAD;
    if (left + tipW > vw - PAD) left = vw - PAD - tipW;
    setMobileStyle({
      position: 'fixed',
      top: `${rect.bottom + 8}px`,
      left: `${left}px`,
      width: `${tipW}px`,
      transform: 'none',
      right: 'auto',
    });
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
      <span ref={triggerRef} className="inline-flex items-center">
        {children || (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="cursor-pointer shrink-0">
            <circle cx="12" cy="12" r="10" stroke="#555" strokeWidth="1.5"/>
            <path d="M12 16v-4M12 8h.01" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        )}
      </span>
      {visible && (
        <div
          className={`z-50 bg-[#252527] border border-[#333] rounded-[12px] px-3 py-2.5 shadow-xl pointer-events-none ${
            mobileStyle ? '' : `absolute w-[220px] max-w-[calc(100vw-24px)] ${posClasses[position] || posClasses.bottom}`
          }`}
          style={mobileStyle || undefined}
        >
          <p className="text-[11px] sm:text-[10px] text-[#C8C8C8] leading-[1.5]">{content}</p>
        </div>
      )}
    </div>
  );
};

export default InfoTooltip;
