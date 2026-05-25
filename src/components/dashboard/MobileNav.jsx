import React, { useState, useEffect, useRef } from 'react';

/**
 * MobileNav — bottom navigation pra mobile.
 *
 * Estrategia: SEMPRE 5 botões fixos na barra (atende touch targets >=60px
 * em 375px). Itens secundários ficam num bottom-sheet aberto por "Mais".
 *
 * Visíveis sempre: Início, Fichas, Preços, Menu, Mais
 * No "Mais": Equipe, Plano (Assinatura), Editar dados, BPO (Financeiro)
 */
const MobileNav = ({ activePage = 'home', onNavigate, isOwner = true }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef(null);

  // Fecha o bottom sheet ao clicar fora
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [moreOpen]);

  const handleNav = (id) => {
    setMoreOpen(false);
    if (onNavigate) onNavigate(id);
  };

  // Ícone SVG factory
  const Icon = ({ d, fill, active, size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {d.map((path, i) => (
        <path
          key={i}
          d={path}
          stroke={active ? '#F5A623' : '#666'}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...(fill?.[i] ? { fill: active ? '#F5A623' : '#666', fillOpacity: 0.5 } : {})}
        />
      ))}
    </svg>
  );

  // 4 principais sempre visíveis + "Mais"
  const primary = [
    { id: 'home',           label: 'Início',  d: ['M3 9.5L12 3L21 9.5V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9.5Z','M12 22V14'] },
    { id: 'fichaTecnica',   label: 'Fichas',  d: ['M9 2H15M12 10V14M12 14L14 12M12 14L10 12','M19.071 19.071C21.293 16.849 22 14.076 22 12C22 6.477 17.523 2 12 2C6.477 2 2 6.477 2 12C2 14.076 2.707 16.849 4.929 19.071M7.757 16.243C9.101 14.899 10.514 14 12 14C13.486 14 14.899 14.899 16.243 16.243'] },
    { id: 'matrizPreco',    label: 'Preços',  d: ['M12 8m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0','M8 14L6 22L12 19L18 22L16 14'] },
    { id: 'engenhariaMenu', label: 'Menu',    d: ['M4 6H20M4 12H20M4 18H20','M15 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0','M9 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0','M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0'], fill: [false, true, true, true] },
  ];

  // Itens secundários (no bottom sheet do "Mais")
  const secondary = [
    { id: 'financeiro',      label: 'Financeiro',  desc: 'BPO — contas a pagar/receber',  d: ['M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3'] },
    ...(isOwner ? [
      { id: 'equipe',        label: 'Equipe',      desc: 'Sócios e funcionários',         d: ['M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z','M6 21V19C6 17.8954 6.89543 17 8 17H16C17.1046 17 18 17.8954 18 19V21'] },
      { id: 'assinatura',    label: 'Plano',       desc: 'Assinatura e cobrança',         d: ['M3 6h18v13H3z','M3 10h18','M7 15h4'] },
      { id: 'configuracoes', label: 'Configurações', desc: 'Conta, segurança, privacidade', d: ['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z','M12 9m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0'] },
    ] : []),
    { id: 'editOnboarding', label: 'Editar dados', desc: 'Reabrir onboarding',           d: ['M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13','M18.5 2.50001C18.8978 2.10219 19.4374 1.87869 20 1.87869C20.5626 1.87869 21.1022 2.10219 21.5 2.50001C21.8978 2.89784 22.1213 3.4374 22.1213 4.00001C22.1213 4.56262 21.8978 5.10219 21.5 5.50001L12 15L8 16L9 12L18.5 2.50001Z'] },
  ];

  const moreIsActive = secondary.some(s => s.id === activePage);

  return (
    <>
      {/* Backdrop do bottom sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-[60] md:hidden bg-black/60 backdrop-blur-sm" />
      )}

      {/* Bottom sheet "Mais" */}
      {moreOpen && (
        <div
          ref={sheetRef}
          className="fixed bottom-0 left-0 right-0 z-[70] md:hidden bg-[#161616] border-t border-[#2A2A2C] rounded-t-[20px] shadow-2xl safe-area-bottom animate-slideUp"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center justify-center pt-2.5 pb-2">
            <div className="w-10 h-1 rounded-full bg-[#444]" />
          </div>
          <div className="px-2 pb-3">
            <div className="flex items-center justify-between px-3 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#666]">Mais opções</span>
              <button onClick={() => setMoreOpen(false)} className="text-[#666] hover:text-white p-1" aria-label="Fechar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
            {secondary.map(item => {
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-[12px] transition-colors ${isActive ? 'bg-[#F5A623]/10' : 'hover:bg-white/[0.03]'}`}
                >
                  <div className="w-9 h-9 rounded-[10px] bg-[#1E1E1E] flex items-center justify-center shrink-0">
                    <Icon d={item.d} active={isActive} />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className={`text-[13px] font-semibold ${isActive ? 'text-[#F5A623]' : 'text-white'}`}>{item.label}</div>
                    <div className="text-[11px] text-[#666] truncate">{item.desc}</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#444] shrink-0">
                    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Barra inferior fixa (5 botões) */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#111111] border-t border-[#2A2A2C]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-stretch justify-around px-1 py-1.5">
          {primary.map(item => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg flex-1 min-h-[52px] transition-colors ${isActive ? 'bg-[#1E1E1E]' : 'active:bg-white/[0.03]'}`}
              >
                <Icon d={item.d} fill={item.fill} active={isActive} />
                <span className={`text-[10px] font-medium truncate max-w-full ${isActive ? 'text-[#F5A623]' : 'text-[#666]'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
          {/* Botão "Mais" — abre bottom sheet */}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg flex-1 min-h-[52px] transition-colors ${moreIsActive || moreOpen ? 'bg-[#1E1E1E]' : 'active:bg-white/[0.03]'}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="5" cy="12" r="1.5" fill={moreIsActive || moreOpen ? '#F5A623' : '#666'} />
              <circle cx="12" cy="12" r="1.5" fill={moreIsActive || moreOpen ? '#F5A623' : '#666'} />
              <circle cx="19" cy="12" r="1.5" fill={moreIsActive || moreOpen ? '#F5A623' : '#666'} />
            </svg>
            <span className={`text-[10px] font-medium ${moreIsActive || moreOpen ? 'text-[#F5A623]' : 'text-[#666]'}`}>Mais</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default MobileNav;
