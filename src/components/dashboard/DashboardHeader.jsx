import React, { useState } from 'react';
import { useClerk } from '@clerk/clerk-react';
import ProfileModal from './ProfileModal';
import { useDashboard } from '../../context/DashboardContext';

const DashboardHeader = ({ data }) => {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isEditingRestaurant, setIsEditingRestaurant] = useState(false);
  const [editName, setEditName] = useState('');
  const { updateDashboardData } = useDashboard();

  const hash = new URLSearchParams(window.location.search).get('hash');

  const adminSession = sessionStorage.getItem('breaker-admin');
  const adminRole = sessionStorage.getItem('breaker-admin-role') || 'admin';
  const adminName = adminRole === 'super_admin' ? 'Gustavo Costa' : (sessionStorage.getItem('breaker-admin-name') || 'Admin');
  const isAdminViewing = !!adminSession;

  const { signOut } = useClerk();

  const handleLogout = async () => {
    try { await signOut(); } catch {}
    window.location.href = window.location.pathname;
  };

  const handleNameUpdated = (newName) => {
    updateDashboardData({
      user: {
        ...data.user,
        name: newName,
        initials: newName.substring(0, 2).toUpperCase()
      },
      _profile: { ...(data._profile || {}), name: newName }
    });
  };

  const handlePhotoUpdated = (newPhoto) => {
    updateDashboardData({
      user: { ...data.user, photo: newPhoto },
      profile: { ...(data.profile || {}), photo: newPhoto },
      _profile: { ...(data._profile || {}), photo: newPhoto }
    });
  };

  const handleEditRestaurantName = () => {
    setEditName(data.restaurant.name || '');
    setIsEditingRestaurant(true);
  };

  const handleSaveRestaurantName = () => {
    if (editName.trim() && editName.trim() !== data.restaurant.name) {
      updateDashboardData({
        restaurant: { ...data.restaurant, name: editName.trim() }
      });
    }
    setIsEditingRestaurant(false);
  };

  return (
    <div className="flex flex-wrap justify-between items-center mb-4 md:mb-8 py-2 md:py-[14px] gap-y-3">
      {/* Left - Restaurant Info */}
      <div className="flex items-center gap-4 md:gap-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-[6px]">
            <div className="w-[36px] h-[36px] md:w-[40px] md:h-[40px] rounded-full bg-[#344036] flex items-center justify-center overflow-hidden">
               {data.restaurant.logo ? (
                 <img src={data.restaurant.logo} alt={data.restaurant.name} className="w-full h-full object-cover" />
               ) : (
                 <div className="w-[18px] h-[18px] md:w-[20px] md:h-[20px] rounded-full border border-white/20" />
               )}
            </div>
            <div>
              {isEditingRestaurant ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRestaurantName(); if (e.key === 'Escape') setIsEditingRestaurant(false); }}
                    autoFocus
                    className="bg-[#1A1A1A] border border-[#F5A623] rounded-[6px] px-2 py-0.5 text-[13px] text-white outline-none w-[160px]"
                  />
                  <button onClick={handleSaveRestaurantName} className="text-[#00B37E] hover:text-[#00D48F] text-[11px] font-medium px-1">✓</button>
                  <button onClick={() => setIsEditingRestaurant(false)} className="text-[#666] hover:text-white text-[11px] px-1">✕</button>
                </div>
              ) : isAdminViewing ? (
                <span className="font-semibold text-[13px] md:text-[14px] text-[#959387]">{data.restaurant.name}</span>
              ) : (
                <button onClick={handleEditRestaurantName} className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer focus:outline-none">
                   <span className="font-semibold text-[13px] md:text-[14px] text-[#959387]">{data.restaurant.name}</span>
                   <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                      <path d="M1 1L5 5L9 1" stroke="#595959" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                   </svg>
                </button>
              )}
              <div className="font-medium text-[10px] text-white/35">{data.restaurant.category}</div>
            </div>
          </div>
        </div>

      </div>

      {/* Right - User Profile */}
      <div className="flex items-center gap-4 md:gap-8">

        <button
          onClick={() => setIsProfileModalOpen(true)}
          className="flex items-center gap-3 md:gap-4 md:border-l md:border-[#333] md:pl-6 hover:opacity-80 transition-opacity cursor-pointer focus:outline-none"
        >
          <div className="flex items-center gap-[8px]">
            {isAdminViewing ? (
              <>
                <div className="w-[36px] h-[36px] md:w-[40px] md:h-[40px] rounded-full bg-[#FF9406]/20 border border-[#FF9406]/40 flex items-center justify-center">
                  <span className="text-[#FF9406] font-bold text-[13px]">{adminName.substring(0, 2).toUpperCase()}</span>
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="font-medium text-[12px] text-[#CACACA]">{adminName}</span>
                  <span className="font-medium text-[9px] text-[#FF9406]">{adminRole === 'super_admin' ? 'Super Admin' : 'Admin'} · Visualizando</span>
                </div>
              </>
            ) : (
              <>
                <div className="w-[36px] h-[36px] md:w-[40px] md:h-[40px] rounded-full bg-[#FDD688] flex items-center justify-center overflow-hidden">
                   {data.user?.photo ? (
                     <img src={data.user.photo} alt={data.user.name} className="w-full h-full object-cover" />
                   ) : data.user?.name && data.user.name !== "Usuário" ? (
                     <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(data.user.name)}&background=FDD688&color=000&size=100`} alt={data.user.initials} className="w-full h-full object-cover" />
                   ) : (
                     <span className="text-black font-bold text-[14px]">{data.user?.initials || 'U'}</span>
                   )}
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="font-medium text-[12px] text-[#CACACA]">{data.user?.name || 'Usuário'}</span>
                  <span className="font-medium text-[9px] text-[#A0A0A0]">{data.user?.role || 'Acesso Cliente'}</span>
                </div>
              </>
            )}
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
              <path d="M4.5 6.75L9 11.25L13.5 6.75" stroke="#959387" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        </button>

      </div>

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentName={data.user?.name}
        hash={hash}
        onLogout={handleLogout}
        onNameUpdated={handleNameUpdated}
        clientEmail={data._clientEmail}
        clientPhone={data._profile?.phone}
        clientCpf={data._profile?.cpf}
        clientBirthday={data._profile?.birthday}
        clientPhoto={data._profile?.photo || data.user?.photo}
        onPhotoUpdated={handlePhotoUpdated}
        isAdminViewing={isAdminViewing}
        adminName={adminName}
        adminRole={adminRole}
      />
    </div>
  );
};

export default DashboardHeader;
