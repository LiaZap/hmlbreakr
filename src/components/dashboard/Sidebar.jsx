import React, { useState } from 'react';
import boltIcon from '../../assets/bolt.svg';

const Sidebar = ({ activePage = 'home', onNavigate, isOwner = true, bpoEnabled = false }) => {
  const [expanded, setExpanded] = useState(false);

  const navItems = [
    { id: 'home', label: 'Página Inicial', icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M3 9.5L12 3L21 9.5V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9.5Z" stroke={active ? '#F5A623' : '#959387'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 22V14" stroke={active ? '#F5A623' : '#959387'} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )},
    { id: 'fichaTecnica', label: 'Ficha Técnica', icon: (active) => (
      <svg width="38" height="38" viewBox="0 0 44 44" fill="none">
        <path d="M18.8517 27.1792L17.2158 29.4692C17.1745 29.5298 17.1311 29.589 17.0858 29.6467C16.9314 29.8412 16.7388 30.0019 16.5198 30.1191C16.3008 30.2362 16.0602 30.3072 15.8127 30.3276C15.5652 30.3481 15.3162 30.3176 15.0809 30.238C14.8457 30.1585 14.6292 30.0315 14.445 29.865C14.3917 29.8151 14.3394 29.7639 14.2883 29.7117C14.2067 29.63 14.1658 29.5892 14.135 29.555C13.9684 29.3707 13.8413 29.1543 13.7617 28.9189C13.682 28.6836 13.6515 28.4345 13.6719 28.1869C13.6924 27.9393 13.7634 27.6985 13.8806 27.4795C13.9978 27.2604 14.1587 27.0678 14.3533 26.9133C14.39 26.885 14.4367 26.8508 14.5308 26.7842L16.8208 25.1483M18.8517 27.1792C18.5014 26.8528 18.1585 26.5186 17.8233 26.1767C17.4233 25.7767 17.0892 25.4433 16.8208 25.1483M18.8517 27.1792C19.4508 27.7225 19.8892 27.995 20.3933 27.995C21.1467 27.995 21.7517 27.3892 22.9642 26.1775L26.1767 22.9642C27.3892 21.7525 27.995 21.1467 27.995 20.3933C27.995 19.8892 27.7225 19.4508 27.1783 18.8517M16.8208 25.1483C16.2775 24.5492 16.0058 24.1108 16.0058 23.6067C16.0058 22.8533 16.6117 22.2483 17.8242 21.0358L21.0367 17.8233C22.2483 16.6108 22.8542 16.005 23.6075 16.005C24.1117 16.005 24.55 16.2775 25.1492 16.8217M25.1492 16.8217L26.785 14.5308C26.8268 14.4707 26.8698 14.4116 26.9142 14.3533C27.0686 14.1587 27.2613 13.9978 27.4803 13.8806C27.6994 13.7634 27.9401 13.6924 28.1877 13.6719C28.4353 13.6515 28.6845 13.682 28.9198 13.7617C29.1551 13.8413 29.3716 13.9684 29.5558 14.135C29.59 14.1658 29.6308 14.2067 29.7125 14.2883C29.7648 14.3394 29.8159 14.3917 29.8658 14.445C30.0323 14.6293 30.1593 14.8457 30.2389 15.0809C30.3184 15.3162 30.3489 15.5652 30.3285 15.8127C30.308 16.0602 30.237 16.3009 30.1199 16.5198C30.0028 16.7388 29.842 16.9314 29.6475 17.0858C29.6108 17.1158 29.5642 17.1492 29.47 17.2158L27.18 18.8517C26.8537 18.5014 26.5194 18.1585 26.1775 17.8233C25.7775 17.4233 25.4442 17.09 25.1492 16.8217Z" stroke={active ? '#F5A623' : '#959387'}/>
      </svg>
    )},
    { id: 'matrizPreco', label: 'Precificação', icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="6" stroke={active ? '#F5A623' : '#959387'} strokeWidth="1.5"/>
        <path d="M8 14L6 22L12 19L18 22L16 14" stroke={active ? '#F5A623' : '#959387'} strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    )},
    { id: '_sep1', separator: true },
    { id: 'engenhariaMenu', label: 'Eng. de Menu', icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M4 6H20M4 12H20M4 18H20" stroke={active ? '#F5A623' : '#959387'} strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="15" cy="6" r="2" fill={active ? '#F5A623' : '#959387'} fillOpacity="0.5"/>
        <circle cx="9" cy="12" r="2" fill={active ? '#F5A623' : '#959387'} fillOpacity="0.5"/>
        <circle cx="17" cy="18" r="2" fill={active ? '#F5A623' : '#959387'} fillOpacity="0.5"/>
      </svg>
    )},
  ];

  // BPO Financeiro V2.0 — só aparece se admin ativou pra esse cliente
  if (bpoEnabled) {
    navItems.push({
      id: 'financeiro', label: 'Financeiro', icon: (active) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" stroke={active ? '#F5A623' : '#959387'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    });
  }

  // Add Equipe if owner
  if (isOwner) {
    navItems.push(
      { id: '_sep2', separator: true },
      { id: 'equipe', label: 'Equipe', icon: (active) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke={active ? '#F5A623' : '#959387'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M6 21V19C6 17.8954 6.89543 17 8 17H16C17.1046 17 18 17.8954 18 19V21" stroke={active ? '#F5A623' : '#959387'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    );
  }

  const w = expanded ? 200 : 65;

  return (
    <div
      className="fixed left-[10px] top-[14px] hidden md:flex flex-col items-start py-5 z-50 transition-all duration-200 ease-out"
      style={{ width: `${w}px`, height: 'calc(100vh - 28px)' }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Top Logo */}
      <div
        className="h-[64px] bg-[#1E1E1E] rounded-[20px] flex items-center gap-3 overflow-hidden transition-all duration-200"
        style={{ width: `${w}px` }}
      >
        <div className="w-[65px] shrink-0 flex items-center justify-center">
          <div className="w-[44.72px] h-[44.72px] bg-black rounded-[10px] flex items-center justify-center">
            <img src={boltIcon} alt="Breakr" className="w-[20.72px] h-[20.72px]" />
          </div>
        </div>
        {expanded && (
          <span className="text-[14px] font-bold text-white whitespace-nowrap pr-4 animate-fadeIn">Breakr</span>
        )}
      </div>

      {/* Navigation Menu */}
      <div className="flex-1 flex items-center w-full">
        <div
          className="bg-[#151515] rounded-[20px] flex flex-col items-start py-[10px] gap-[6px] overflow-hidden transition-all duration-200"
          style={{ width: `${w}px` }}
        >
          {navItems.map((item) => {
            if (item.separator) {
              return <div key={item.id} className="w-[34.61px] h-0 border-b border-white/10 mx-auto" />;
            }
            const isActive = activePage === item.id;
            return (
              <div
                key={item.id}
                className={`h-[44px] rounded-[10px] flex items-center cursor-pointer transition-all duration-150 mx-[10px] ${
                  isActive ? 'bg-[#252527]' : 'hover:bg-[#1E1E1E]'
                }`}
                style={{ width: expanded ? `${w - 20}px` : '44px' }}
                onClick={() => onNavigate && onNavigate(item.id)}
              >
                <div className="w-[44px] h-[44px] shrink-0 flex items-center justify-center">
                  {item.icon(isActive)}
                </div>
                {expanded && (
                  <span className={`text-[12px] font-medium whitespace-nowrap pr-3 transition-opacity ${
                    isActive ? 'text-[#F5A623]' : 'text-[#959387]'
                  }`}>
                    {item.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom - Edit Onboarding */}
      <div
        className="bg-[#151515] rounded-[20px] flex flex-col items-start py-[10px] mt-auto overflow-hidden transition-all duration-200"
        style={{ width: `${w}px` }}
      >
        <div
          className="h-[44px] rounded-[10px] flex items-center cursor-pointer transition-all duration-150 hover:bg-[#252527] mx-[10px]"
          style={{ width: expanded ? `${w - 20}px` : '44px' }}
          onClick={() => onNavigate && onNavigate('editOnboarding')}
        >
          <div className="w-[44px] h-[44px] shrink-0 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="#959387" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18.5 2.50001C18.8978 2.10219 19.4374 1.87869 20 1.87869C20.5626 1.87869 21.1022 2.10219 21.5 2.50001C21.8978 2.89784 22.1213 3.4374 22.1213 4.00001C22.1213 4.56262 21.8978 5.10219 21.5 5.50001L12 15L8 16L9 12L18.5 2.50001Z" stroke="#959387" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          {expanded && (
            <span className="text-[12px] font-medium text-[#959387] whitespace-nowrap pr-3">
              Editar Dados
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
