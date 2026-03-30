import React, { useState, useEffect } from 'react';
import boltIcon from '../../assets/bolt.svg';

const AdminPanel = () => {
  const adminRole = sessionStorage.getItem('breaker-admin-role') || 'admin';
  const isSuperAdmin = adminRole === 'super_admin';
  const adminName = isSuperAdmin ? 'Gustavo Costa' : (sessionStorage.getItem('breaker-admin-name') || 'Admin');
  const roleLabel = isSuperAdmin ? 'Super Admin' : 'Admin';
  const [clients, setClients] = useState([]);
  const [newClientName, setNewClientName] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [resetModal, setResetModal] = useState(null); // { clientId, clientName, hash, currentEmail }
  const [resetEmail, setResetEmail] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [newClientEmail, setNewClientEmail] = useState('');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [resentId, setResentId] = useState(null);

  useEffect(() => {
    fetch('/api/admin/clients')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setClients(data);
      })
      .catch(err => console.error("Failed to fetch clients", err));
  }, []);

  const handleCreateClient = () => {
    if (!newClientName.trim()) return;

    fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newClientName, email: newClientEmail.trim() || undefined })
    })
    .then(res => res.json())
    .then(newClient => {
      setClients(prev => [...prev, newClient]);
      setNewClientName('');
      setNewClientEmail('');
      setShowModal(false);
    })
    .catch(() => alert("Erro ao criar cliente"));
  };

  const handleResendWelcome = async (clientId, clientName) => {
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/resend-welcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: adminRole })
      });
      const data = await res.json();
      if (data.success) {
        setResentId(clientId);
        setTimeout(() => setResentId(null), 2500);
      } else {
        alert(data.error || 'Erro ao reenviar email.');
      }
    } catch {
      alert('Erro de conexão.');
    }
  };

  const copyLink = (hash, id) => {
    const url = `${window.location.origin}/?hash=${hash}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteClient = (id, name) => {
    if (!isSuperAdmin) {
      alert('Apenas o Super Admin pode excluir clientes.');
      return;
    }
    if (!window.confirm(`Excluir "${name}"? Todos os dados serão apagados.`)) return;

    fetch(`/api/admin/clients/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: adminRole })
    })
    .then(res => res.json())
    .then(data => {
       if (data.success) {
          setClients(prev => prev.filter(c => c.id !== id));
       } else {
          alert(data.error || "Erro ao excluir cliente");
       }
    })
    .catch(() => alert("Erro de conexão ao tentar excluir."));
  };

  const handleResetCredentials = async () => {
    if (!resetModal) return;
    if (!resetEmail && !resetPassword) { alert('Preencha ao menos um campo.'); return; }
    if (resetPassword && resetPassword.length < 6) { alert('A senha deve ter no mínimo 6 caracteres.'); return; }
    setResetLoading(true);
    try {
      const payload = { role: adminRole };
      if (resetPassword) payload.password = resetPassword;
      if (resetEmail && resetEmail !== resetModal.currentEmail) payload.email = resetEmail;
      const res = await fetch(`/api/admin/clients/${resetModal.clientId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert(`Credenciais de "${resetModal.clientName}" atualizadas!`);
        if (payload.email) {
          setClients(prev => prev.map(c => c.id === resetModal.clientId ? { ...c, email: payload.email } : c));
        }
        setResetModal(null);
        setResetEmail('');
        setResetPassword('');
      } else {
        alert(data.error || 'Erro ao redefinir.');
      }
    } catch {
      alert('Erro de conexão.');
    }
    setResetLoading(false);
  };

  const handleMarkComplete = async (clientId, currentlyComplete) => {
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/mark-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !currentlyComplete })
      });
      const data = await res.json();
      if (data.success) {
        setClients(prev => prev.map(c => {
          if (c.id !== clientId) return c;
          const raw = typeof c.data === 'string' ? JSON.parse(c.data) : c.data;
          if (!raw.formData) raw.formData = {};
          if (!currentlyComplete) raw.formData.onboarding_completed = true;
          else delete raw.formData.onboarding_completed;
          return { ...c, data: JSON.stringify(raw) };
        }));
      }
    } catch { alert('Erro de conexão.'); }
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const getInitials = (name) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const getColor = (name) => {
    const colors = ['#F5A623', '#00B37E', '#5B8DEF', '#FF6B6B', '#A78BFA', '#F472B6', '#34D399', '#FBBF24', '#60A5FA', '#F87171'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const getClientPhoto = (client) => {
    try {
      const raw = typeof client.data === 'string' ? JSON.parse(client.data) : client.data;
      if (!raw) return null;
      // Check restaurant logo first, then user photo, then formData paths
      return raw.restaurant?.logo || raw.user?.photo || raw.formData?.user_info?.photo || null;
    } catch { return null; }
  };

  const getOnboardingProgress = (client) => {
    try {
      const raw = typeof client.data === 'string' ? JSON.parse(client.data) : client.data;
      if (!raw) return 0;
      // formData is nested inside dashboardData
      const d = raw.formData || raw;
      if (d.onboarding_completed) return 100;
      const steps = [
        { check: () => d.user_info?.name },
        { check: () => d.identity?.tax_regime },
        { check: () => d.partners && (Array.isArray(d.partners) ? d.partners.length > 0 : d.partners.name) },
        { check: () => d.employees && (Array.isArray(d.employees) ? d.employees.length > 0 : true) },
        { check: () => d.location_costs?.rent || d.location_costs?.own },
        { check: () => d.utilities?.energy || d.utilities?.water },
        { check: () => d.recurring_services },
        { check: () => d.operational_fixed },
        { check: () => d.monthly_services },
        { check: () => d.equipment && (Array.isArray(d.equipment) ? d.equipment.length > 0 : true) },
        { check: () => d.admin_systems },
        { check: () => d.vehicles },
        { check: () => d.marketing_structure },
        { check: () => d.fees_marketplaces },
        { check: () => d.fees_cards && (Array.isArray(d.fees_cards) ? d.fees_cards.length > 0 : true) },
        { check: () => d.other_fixed_costs },
        { check: () => d.revenue_history?.months?.length >= 3 },
      ];
      const completed = steps.filter(s => { try { return s.check(); } catch { return false; } }).length;
      return Math.min(Math.round((completed / steps.length) * 100), 100);
    } catch { return 0; }
  };

  return (
    <div className="min-h-screen bg-[#101010] font-jakarta text-white">
      {/* Top Bar */}
      <div className="border-b border-[#2A2A2C] bg-[#141414]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-[36px] h-[36px] bg-black rounded-[10px] flex items-center justify-center">
              <img src={boltIcon} alt="Breakr" className="w-[16px]" />
            </div>
            <div>
              <h1 className="text-[16px] font-bold">Breakr Admin</h1>
              <p className="text-[11px] text-[#868686]">{clients.length} clientes</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Logged-in admin info */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-[#1E1E1E] rounded-[10px] border border-[#2A2A2C]">
              <div className="w-[28px] h-[28px] rounded-full bg-[#F5A623]/20 flex items-center justify-center shrink-0">
                <span className="text-[#F5A623] font-bold text-[11px]">{adminName.substring(0, 2).toUpperCase()}</span>
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[12px] font-semibold text-white">{adminName}</span>
                <span className="text-[10px] text-[#F5A623]">{roleLabel}</span>
              </div>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="bg-[#F5A623] text-black font-semibold text-[13px] px-5 py-2.5 rounded-[10px] hover:bg-[#E5961E] transition-colors flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 5V19M5 12H19" stroke="black" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              Novo Cliente
            </button>
            <button
              onClick={() => { sessionStorage.removeItem('breaker-admin'); window.location.href = '/'; }}
              className="text-[#868686] hover:text-white text-[12px] font-medium transition-colors px-3 py-2 rounded-[8px] hover:bg-[#1E1E1E]"
            >
              Sair
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Search & Filter Bar */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#555]" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 21L16.65 16.65M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full bg-[#1B1B1D] border border-[#2A2A2C] rounded-[12px] pl-10 pr-4 py-3 text-[13px] text-white outline-none focus:border-[#F5A623] transition-colors placeholder-[#555]"
            />
          </div>
          <div className="text-[12px] text-[#868686] shrink-0">
            {filteredClients.length} de {clients.length}
          </div>
        </div>

        {/* Cards Grid */}
        {filteredClients.length === 0 ? (
          <div className="text-center py-20 text-[#555]">
            {search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClients.map(client => {
              const color = getColor(client.name);
              const progress = getOnboardingProgress(client);
              const photo = getClientPhoto(client);
              const raw = typeof client.data === 'string' ? JSON.parse(client.data || '{}') : (client.data || {});
              const displayName = raw.restaurant?.name || raw.formData?.identity?.restaurant_name || client.name;
              return (
                <div key={client.id} className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[16px] p-5 hover:border-[#3A3A3C] transition-all group">
                  {/* Card Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {photo ? (
                        <img src={photo} alt={displayName} className="w-[44px] h-[44px] rounded-[12px] object-cover shrink-0" />
                      ) : (
                        <div
                          className="w-[44px] h-[44px] rounded-[12px] flex items-center justify-center text-[14px] font-bold shrink-0"
                          style={{ backgroundColor: color + '20', color: color }}
                        >
                          {getInitials(displayName)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-[14px] text-white truncate">{displayName}</div>
                        <div className="text-[11px] text-[#868686]">{client.name} · {new Date(client.createdAt).toLocaleDateString('pt-BR')}</div>
                      </div>
                    </div>
                    {isSuperAdmin && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteClient(client.id, client.name); }}
                        className="opacity-0 group-hover:opacity-100 text-[#555] hover:text-[#FF4560] transition-all p-1.5 rounded-[8px] hover:bg-[#FF4560]/10"
                        title="Excluir"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M19 7L18.1327 19.1425C18.0579 20.1891 17.187 21 16.1378 21H7.86224C6.81296 21 5.94208 20.1891 5.86732 19.1425L5 7M10 11V17M14 11V17M15 7V4C15 3.44772 14.5523 3 14 3H10C9.44772 3 9 3.44772 9 4V7M4 7H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-[#868686]">Onboarding</span>
                      <span className="text-[10px] font-medium" style={{ color: progress >= 100 ? '#00B37E' : '#F5A623' }}>{progress}%</span>
                    </div>
                    <div className="w-full h-[4px] bg-[#252527] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${progress}%`, backgroundColor: progress >= 100 ? '#00B37E' : '#F5A623' }}
                      />
                    </div>
                  </div>

                  {/* Status Badge */}
                  {(() => {
                    const raw = typeof client.data === 'string' ? JSON.parse(client.data) : (client.data || {});
                    const d = raw.formData || raw;
                    const isManuallyComplete = !!d.onboarding_completed;
                    return (
                      <div className="flex items-center gap-2 mb-4">
                        <div className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${
                          progress >= 100
                            ? 'bg-[#00B37E]/15 text-[#00B37E]'
                            : progress > 0
                            ? 'bg-[#F5A623]/15 text-[#F5A623]'
                            : 'bg-[#252527] text-[#868686] border border-[#333]'
                        }`}>
                          {progress >= 100 ? 'Completo' : progress > 0 ? 'Em andamento' : 'Pendente'}
                        </div>
                        <button
                          onClick={() => handleMarkComplete(client.id, isManuallyComplete)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${
                            isManuallyComplete
                              ? 'bg-[#00B37E]/10 text-[#00B37E] border-[#00B37E]/30 hover:bg-[#00B37E]/20'
                              : 'bg-transparent text-[#555] border-[#333] hover:border-[#555] hover:text-[#868686]'
                          }`}
                          title={isManuallyComplete ? 'Desmarcar como concluído' : 'Marcar como concluído'}
                        >
                          {isManuallyComplete ? '✓ Concluído' : 'Marcar concluído'}
                        </button>
                      </div>
                    );
                  })()}

                  {/* Actions */}
                  <div className="flex items-center gap-1 pt-3 border-t border-[#2A2A2C]">
                    <button
                      onClick={() => window.open(`${window.location.origin}/?hash=${client.hash}`, '_blank')}
                      className="flex-1 flex items-center justify-center gap-1 text-[11px] text-white font-medium py-2 rounded-[8px] bg-[#252527] hover:bg-[#333] transition-colors whitespace-nowrap"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M15 3H21V9M21 3L13 11M10 5H5C3.89543 5 3 5.89543 3 7V19C3 20.1046 3.89543 21 5 21H17C18.1046 21 19 20.1046 19 19V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Acessar
                    </button>
                    <button
                      onClick={() => copyLink(client.hash, client.id)}
                      className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-medium py-2 rounded-[8px] transition-colors whitespace-nowrap ${
                        copiedId === client.id
                          ? 'bg-[#00B37E]/15 text-[#00B37E]'
                          : 'bg-[#252527] text-[#F5A623] hover:bg-[#333]'
                      }`}
                    >
                      {copiedId === client.id ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Copiado!
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path d="M13.8284 10.1716L16.6569 7.34315C17.4379 6.5621 18.7042 6.5621 19.4853 7.34315C20.2663 8.1242 20.2663 9.39052 19.4853 10.1716L16.6569 13M10.1716 13.8284L7.34315 16.6569C6.5621 17.4379 5.29577 17.4379 4.51472 16.6569C3.73367 15.8758 3.73367 14.6095 4.51472 13.8284L7.34315 11M8.75736 15.2426L15.2426 8.75736" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Copiar Link
                        </>
                      )}
                    </button>
                    {/* Super Admin actions */}
                    {isSuperAdmin && client.email && (
                      <>
                        <button
                          onClick={() => { setResetModal({ clientId: client.id, clientName: client.name, hash: client.hash, currentEmail: client.email }); setResetEmail(client.email || ''); }}
                          className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium py-2 rounded-[8px] bg-[#252527] text-[#868686] hover:bg-[#333] hover:text-white transition-colors whitespace-nowrap"
                          title="Redefinir credenciais"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path d="M15 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H15M10 17L15 12M15 12L10 7M15 12H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Reset
                        </button>
                        <button
                          onClick={() => handleResendWelcome(client.id, client.name)}
                          className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-medium py-2 rounded-[8px] transition-colors whitespace-nowrap ${
                            resentId === client.id
                              ? 'bg-[#00B37E]/15 text-[#00B37E]'
                              : 'bg-[#252527] text-[#868686] hover:bg-[#333] hover:text-white'
                          }`}
                          title="Reenviar email de acesso"
                        >
                          {resentId === client.id ? (
                            <>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              Enviado!
                            </>
                          ) : (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              Email
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reset Credentials Modal */}
      {resetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => { setResetModal(null); setResetEmail(''); setResetPassword(''); }}>
          <div className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[16px] p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-white mb-1">Redefinir Credenciais</h3>
            <p className="text-[12px] text-[#868686] mb-4">Cliente: <span className="text-white">{resetModal.clientName}</span></p>
            <label className="block text-[11px] font-semibold text-[#666] mb-2 uppercase tracking-wider">E-mail</label>
            <input
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="email@cliente.com"
              className="w-full bg-[#161616] border border-[#2A2A2C] rounded-[10px] px-4 py-3 text-[14px] text-white outline-none focus:border-[#F5A623] transition-colors mb-3"
            />
            <label className="block text-[11px] font-semibold text-[#666] mb-2 uppercase tracking-wider">Nova Senha</label>
            <input
              type="text"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Deixe em branco para manter a atual"
              className="w-full bg-[#161616] border border-[#2A2A2C] rounded-[10px] px-4 py-3 text-[14px] text-white outline-none focus:border-[#F5A623] transition-colors mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setResetModal(null); setResetEmail(''); setResetPassword(''); }} className="flex-1 bg-[#252527] text-[#868686] font-medium text-[13px] rounded-[10px] py-2.5">Cancelar</button>
              <button onClick={handleResetCredentials} disabled={resetLoading} className="flex-1 bg-[#F5A623] text-black font-bold text-[13px] rounded-[10px] py-2.5 disabled:opacity-50">
                {resetLoading ? 'Salvando...' : 'Redefinir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Client Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-[420px] bg-[#1B1B1D] rounded-[20px] p-6 border border-[#2A2A2C] mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-[18px] font-bold mb-1">Novo Cliente</h3>
            <p className="text-[12px] text-[#868686] mb-6">Cadastre um novo restaurante no sistema</p>

            <div className="mb-4">
              <label className="block text-[12px] text-[#868686] mb-2">Nome do Restaurante</label>
              <input
                type="text"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateClient()}
                className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[12px] px-4 py-3.5 text-white outline-none focus:border-[#F5A623] transition-colors"
                placeholder="Ex: Meu Restaurante"
                autoFocus
              />
            </div>
            <div className="mb-6">
              <label className="block text-[12px] text-[#868686] mb-2">E-mail do Cliente <span className="text-[#555]">(opcional — envia boas-vindas)</span></label>
              <input
                type="email"
                value={newClientEmail}
                onChange={(e) => setNewClientEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateClient()}
                className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[12px] px-4 py-3.5 text-white outline-none focus:border-[#F5A623] transition-colors"
                placeholder="cliente@email.com"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 bg-[#252527] rounded-[12px] text-[#868686] text-[13px] font-semibold hover:bg-[#333] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateClient}
                className="flex-1 py-3 bg-[#F5A623] rounded-[12px] text-black text-[13px] font-semibold hover:bg-[#E5961E] transition-colors"
              >
                Criar Cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
