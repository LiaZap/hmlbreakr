import React, { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const BroadcastPopup = ({ restaurantCategory }) => {
  const [broadcasts, setBroadcasts] = useState([]);

  useEffect(() => {
    fetch(`${API}/api/broadcasts/active`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const dismissed = JSON.parse(localStorage.getItem('breakr-dismissed-broadcasts') || '[]');
        // Filter: not dismissed, and matching category (or no target)
        const filtered = data.filter(b => {
          if (dismissed.includes(b.id)) return false;
          if (b.targetCategory && restaurantCategory &&
              !b.targetCategory.toLowerCase().includes(restaurantCategory.toLowerCase())) return false;
          return true;
        });
        setBroadcasts(filtered);
      })
      .catch(() => {});
  }, [restaurantCategory]);

  const dismiss = (id) => {
    const dismissed = JSON.parse(localStorage.getItem('breakr-dismissed-broadcasts') || '[]');
    dismissed.push(id);
    localStorage.setItem('breakr-dismissed-broadcasts', JSON.stringify(dismissed));
    setBroadcasts(prev => prev.filter(b => b.id !== id));
  };

  if (broadcasts.length === 0) return null;

  const current = broadcasts[0];

  // BANNER type
  if (current.type === 'banner') {
    return (
      <div className="w-full bg-[#F5A623] px-4 py-2.5 flex items-center justify-center gap-3 relative z-40">
        <div className="flex items-center gap-2 flex-1 justify-center min-w-0 pr-8">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-[12px] font-bold text-black truncate">{current.title}</span>
          <span className="text-[12px] text-black/70 truncate hidden sm:inline">{current.message}</span>
        </div>
        <button
          onClick={() => dismiss(current.id)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-black/60 hover:text-black transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    );
  }

  // POPUP type (default)
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-[90vw] max-w-[420px] bg-[#1B1B1D] rounded-[20px] border border-[#2A2A2C] shadow-2xl overflow-hidden">
        {/* Close button */}
        <button
          onClick={() => dismiss(current.id)}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/60 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Image */}
        {current.imageUrl && (
          <div className="w-full aspect-[16/9] bg-[#252527] overflow-hidden">
            <img src={current.imageUrl} alt={current.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {/* Icon + Title */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-[#F5A623]/15 flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="text-[18px] font-bold text-white">{current.title}</h3>
          </div>

          {/* Message */}
          <p className="text-[13px] text-[#999] leading-relaxed mb-5 whitespace-pre-line">
            {current.message}
          </p>

          {/* Footer */}
          <button
            onClick={() => dismiss(current.id)}
            className="w-full bg-[#F5A623] text-black font-semibold text-[14px] py-3 rounded-[12px] hover:bg-[#E5961E] transition-colors"
          >
            Entendi
          </button>
        </div>

        {/* Counter if multiple */}
        {broadcasts.length > 1 && (
          <div className="absolute top-4 left-4 bg-black/40 text-white/70 text-[10px] font-medium px-2 py-1 rounded-full">
            1 de {broadcasts.length}
          </div>
        )}
      </div>
    </div>
  );
};

export default BroadcastPopup;
