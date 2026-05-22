import React from 'react';

const MobileNav = ({ activePage = 'home', onNavigate, isOwner = true }) => {
  const navItems = [
    {
      id: 'home',
      label: 'Início',
      icon: (active) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M3 9.5L12 3L21 9.5V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9.5Z" stroke={active ? '#F5A623' : '#666'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 22V14" stroke={active ? '#F5A623' : '#666'} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      id: 'fichaTecnica',
      label: 'Fichas',
      icon: (active) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M9 2H15M12 10V14M12 14L14 12M12 14L10 12" stroke={active ? '#F5A623' : '#666'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M19.071 19.071C21.293 16.849 22 14.076 22 12C22 6.477 17.523 2 12 2C6.477 2 2 6.477 2 12C2 14.076 2.707 16.849 4.929 19.071M7.757 16.243C9.101 14.899 10.514 14 12 14C13.486 14 14.899 14.899 16.243 16.243" stroke={active ? '#F5A623' : '#666'} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      id: 'matrizPreco',
      label: 'Preços',
      icon: (active) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="6" stroke={active ? '#F5A623' : '#666'} strokeWidth="1.5"/>
          <path d="M8 14L6 22L12 19L18 22L16 14" stroke={active ? '#F5A623' : '#666'} strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      id: 'engenhariaMenu',
      label: 'Menu',
      icon: (active) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M4 6H20M4 12H20M4 18H20" stroke={active ? '#F5A623' : '#666'} strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="15" cy="6" r="2" fill={active ? '#F5A623' : '#666'} fillOpacity="0.5"/>
          <circle cx="9" cy="12" r="2" fill={active ? '#F5A623' : '#666'} fillOpacity="0.5"/>
          <circle cx="17" cy="18" r="2" fill={active ? '#F5A623' : '#666'} fillOpacity="0.5"/>
        </svg>
      ),
    },
    {
      id: 'editOnboarding',
      label: 'Editar',
      icon: (active) => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke={active ? '#F5A623' : '#666'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M18.5 2.50001C18.8978 2.10219 19.4374 1.87869 20 1.87869C20.5626 1.87869 21.1022 2.10219 21.5 2.50001C21.8978 2.89784 22.1213 3.4374 22.1213 4.00001C22.1213 4.56262 21.8978 5.10219 21.5 5.50001L12 15L8 16L9 12L18.5 2.50001Z" stroke={active ? '#F5A623' : '#666'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
  ];

  // Add Equipe + Assinatura if owner
  if (isOwner) {
    navItems.splice(4, 0,
      {
        id: 'equipe',
        label: 'Equipe',
        icon: (active) => (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke={active ? '#F5A623' : '#666'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6 21V19C6 17.8954 6.89543 17 8 17H16C17.1046 17 18 17.8954 18 19V21" stroke={active ? '#F5A623' : '#666'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        id: 'assinatura',
        label: 'Plano',
        icon: (active) => (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="6" width="18" height="13" rx="2" stroke={active ? '#F5A623' : '#666'} strokeWidth="1.5"/>
            <path d="M3 10h18" stroke={active ? '#F5A623' : '#666'} strokeWidth="1.5"/>
            <path d="M7 15h4" stroke={active ? '#F5A623' : '#666'} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        ),
      }
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#111111] border-t border-[#2A2A2C] safe-area-bottom">
      <div className="flex items-center justify-around px-1 py-1.5">
        {navItems.map((item) => {
          const isActive = activePage === item.id || (item.id === 'editOnboarding' && false);
          return (
            <button
              key={item.id}
              onClick={() => onNavigate && onNavigate(item.id)}
              className={`flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg min-w-0 flex-1 transition-colors ${
                isActive ? 'bg-[#1E1E1E]' : ''
              }`}
            >
              {item.icon(isActive)}
              <span className={`text-[9px] font-medium truncate ${isActive ? 'text-[#F5A623]' : 'text-[#666]'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MobileNav;
