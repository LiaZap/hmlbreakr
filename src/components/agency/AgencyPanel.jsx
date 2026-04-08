import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import boltIcon from '../../assets/bolt.svg';

const API_URL = import.meta.env.VITE_API_URL || '';

// ── Helpers ────────────────────────────────────────────────────────
const parseClientData = (raw) => {
  try { return typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); }
  catch { return {}; }
};

const getOnboardingProgress = (clientData) => {
  const d = parseClientData(clientData);
  if (d.onboarding_completed) return 100;
  if (d.revenue_history && d.revenue_history.length > 0) return 100;
  // count filled step keys
  const stepKeys = ['user_info','identity','partners','employees','benefits',
    'location_costs','utilities','recurring_services','operational_fixed',
    'monthly_services','equipment','admin_systems','vehicles',
    'marketing_structure','fees_marketplaces','fees_cards',
    'other_fixed_costs','revenue_history'];
  const filled = stepKeys.filter(k => {
    const v = d[k];
    if (!v) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return !!v;
  }).length;
  return Math.round((filled / stepKeys.length) * 100);
};

const planLabel = { basic: 'Básico', unlimited: 'Ilimitado' };
const planColor = { basic: '#F5A623', unlimited: '#A78BFA' };

// ── Sub-components ─────────────────────────────────────────────────
const Badge = ({ active }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${active ? 'bg-[#00B37E]/15 text-[#00B37E]' : 'bg-[#EF4444]/15 text-[#EF4444]'}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[#00B37E]' : 'bg-[#EF4444]'}`} />
    {active ? 'Ativo' : 'Inativo'}
  </span>
);

const ProgressBar = ({ pct }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 h-1.5 bg-[#2A2A2C] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: pct === 100 ? '#00B37E' : '#F5A623' }}
      />
    </div>
    <span className="text-[11px] text-[#666] w-8 text-right">{pct}%</span>
  </div>
);

// ── Add Client Modal ───────────────────────────────────────────────
const AddClientModal = ({ agencyHash, plan, currentCount, onClose, onAdded }) => {
  const [step, setStep] = useState('form'); // 'form' | 'success'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [newClient, setNewClient] = useState(null);

  const limit = plan === 'unlimited' ? Infinity : 10;
  const atLimit = currentCount >= limit;

  const inputClass = (err) =>
    `w-full bg-[#161616] border ${err ? 'border-red-500/50' : 'border-[#2A2A2C]'} rounded-[12px] px-4 py-3 text-[14px] text-white outline-none focus:border-[#F5A623] transition-all placeholder-[#444]`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email) { setError('Nome e email são obrigatórios.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/agency/${agencyHash}/clients`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password: password || undefined })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao adicionar cliente'); return; }
      setNewClient(data.client);
      setStep('success');
      onAdded();
    } catch { setError('Erro de conexão. Tente novamente.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-0">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="relative z-10 w-full max-w-[440px] bg-[#111111] border border-[#2A2A2C] rounded-[20px] p-6 sm:p-8"
      >
        {step === 'success' ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="w-14 h-14 rounded-full bg-[#00B37E]/15 border border-[#00B37E]/30 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#00B37E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <p className="font-bold text-white text-[17px] mb-1">Cliente adicionado!</p>
              <p className="text-[#868686] text-[13px]">
                <span className="text-white font-medium">{newClient?.name}</span> foi criado com sucesso.
              </p>
              {newClient?.hash && (
                <div className="mt-3 bg-[#161616] border border-[#2A2A2C] rounded-[10px] px-4 py-3 text-left">
                  <p className="text-[11px] text-[#666] mb-1 uppercase tracking-wide">Link do painel</p>
                  <a
                    href={`${window.location.origin}?hash=${newClient.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#F5A623] text-[13px] break-all hover:underline"
                  >
                    {window.location.origin}?hash={newClient.hash}
                  </a>
                </div>
              )}
            </div>
            <button onClick={onClose} className="w-full bg-[#F5A623] text-black font-bold rounded-[12px] py-3 mt-2 transition-all active:scale-[0.98]">
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[17px] font-bold text-white">Adicionar Cliente</h2>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2A2A2C] hover:bg-[#333] transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#868686" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>

            {atLimit && (
              <div className="mb-4 bg-[#F5A623]/10 border border-[#F5A623]/20 rounded-[10px] px-4 py-3">
                <p className="text-[#F5A623] text-[13px] font-medium">Limite de 10 clientes atingido no plano Básico.</p>
                <p className="text-[#F5A623]/70 text-[12px] mt-1">Faça upgrade para o plano Ilimitado para adicionar mais.</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#666] mb-1.5 uppercase tracking-wider pl-1">Nome do Restaurante</label>
                <input type="text" value={name} onChange={e => { setName(e.target.value); setError(''); }}
                  className={inputClass(!!error)} placeholder="Ex: Pizzaria do João" disabled={atLimit} autoFocus />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#666] mb-1.5 uppercase tracking-wider pl-1">Email</label>
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
                  className={inputClass(!!error)} placeholder="email@restaurante.com" disabled={atLimit} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#666] mb-1.5 uppercase tracking-wider pl-1">Senha (opcional)</label>
                <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                  className={inputClass(false)} placeholder="Deixe em branco para gerar automaticamente" disabled={atLimit} />
              </div>
              {error && (
                <p className="text-red-500 text-[12px] pl-1">{error}</p>
              )}
              <button type="submit" disabled={loading || atLimit}
                className="w-full bg-[#F5A623] hover:bg-[#E5961E] disabled:opacity-40 text-black font-bold rounded-[12px] py-3 mt-1 transition-all active:scale-[0.98]">
                {loading ? <div className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /><span>Criando...</span></div> : 'Adicionar Cliente'}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
};

// ── Confirm Remove Modal ───────────────────────────────────────────
const ConfirmRemoveModal = ({ client, agencyHash, onClose, onRemoved }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRemove = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/agency/${agencyHash}/clients/${client.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'Erro ao remover cliente'); return;
      }
      onRemoved(client.id);
      onClose();
    } catch { setError('Erro de conexão. Tente novamente.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative z-10 w-full max-w-[360px] bg-[#111111] border border-[#2A2A2C] rounded-[20px] p-6"
      >
        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-full bg-[#EF4444]/15 border border-[#EF4444]/30 flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <p className="font-bold text-white text-[16px] mb-1">Remover cliente?</p>
          <p className="text-[#868686] text-[13px]">
            <span className="text-white">{client.name}</span> será desvinculado da agência. O acesso ao painel continua ativo.
          </p>
        </div>
        {error && <p className="text-red-500 text-[12px] text-center mb-3">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-[#2A2A2C] hover:bg-[#333] text-white font-semibold rounded-[12px] py-3 transition-colors">
            Cancelar
          </button>
          <button onClick={handleRemove} disabled={loading}
            className="flex-1 bg-[#EF4444]/20 hover:bg-[#EF4444]/30 disabled:opacity-50 text-[#EF4444] font-bold rounded-[12px] py-3 border border-[#EF4444]/30 transition-colors">
            {loading ? 'Removendo...' : 'Remover'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────
const AgencyPanel = ({ agencyHash, onLogout }) => {
  const [agency, setAgency] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [clientToRemove, setClientToRemove] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/agency/${agencyHash}`);
      if (!res.ok) { setError('Agência não encontrada.'); return; }
      const data = await res.json();
      setAgency(data.agency);
      setClients(data.clients || []);
    } catch { setError('Erro ao carregar dados. Tente novamente.'); }
    finally { setLoading(false); }
  }, [agencyHash]);

  useEffect(() => { load(); }, [load]);

  const handlePortal = async () => {
    if (!agency?.stripeCustomerId) return;
    setPortalLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/asaas/portal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stripeCustomerId: agency.stripeCustomerId,
          returnUrl: `${window.location.origin}?agency=${agencyHash}`
        })
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { /* silent */ }
    finally { setPortalLoading(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#F5A623]/30 border-t-[#F5A623] rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <div className="text-center">
        <p className="text-[#EF4444] mb-4">{error}</p>
        <button onClick={load} className="px-5 py-2.5 bg-[#2A2A2C] rounded-[10px] text-white text-sm hover:bg-[#333] transition-colors">
          Tentar novamente
        </button>
      </div>
    </div>
  );

  const activeCount = clients.filter(c => c.active).length;
  const limit = agency?.plan === 'unlimited' ? '∞' : 10;
  const color = planColor[agency?.plan] || '#F5A623';
  const hasStripe = !!agency?.stripeCustomerId;

  return (
    <div className="min-h-screen bg-[#0A0A0A] font-jakarta text-white">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#0A0A0A]/95 backdrop-blur-sm border-b border-[#1A1A1A]">
        <div className="max-w-[900px] mx-auto px-4 sm:px-6 h-[60px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#1A1A1A] border border-[#2A2A2C] rounded-[10px] flex items-center justify-center">
              <img src={boltIcon} alt="Breakr" className="w-4" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-white leading-none">{agency?.name || 'Agência'}</p>
              <p className="text-[10px] text-[#555] mt-0.5 leading-none">Painel da Agência</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="hidden sm:inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide"
              style={{ background: `${color}18`, color }}
            >
              {planLabel[agency?.plan] || agency?.plan}
            </span>
            <button onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] text-[#666] hover:text-white hover:bg-[#1A1A1A] transition-all">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Clientes', value: clients.length },
            { label: 'Ativos', value: activeCount },
            { label: 'Limite', value: limit },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[#111111] border border-[#1A1A1A] rounded-[14px] px-4 py-3">
              <p className="text-[11px] text-[#555] uppercase tracking-wide mb-1">{label}</p>
              <p className="text-[22px] font-bold text-white leading-none">{value}</p>
            </div>
          ))}
        </div>

        {/* Subscription card */}
        {(hasStripe || true) && (
          <div className="bg-[#111111] border border-[#1A1A1A] rounded-[16px] px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-[12px] text-[#555] uppercase tracking-wide mb-1">Assinatura</p>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold" style={{ color }}>
                  Plano {planLabel[agency?.plan] || agency?.plan}
                </span>
                <Badge active={agency?.active} />
              </div>
              {!agency?.active && (
                <p className="text-[12px] text-[#EF4444]/80 mt-1">Assine para ativar o painel para seus clientes.</p>
              )}
            </div>
            {hasStripe ? (
              <button onClick={handlePortal} disabled={portalLoading}
                className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-[#1A1A1A] hover:bg-[#222] border border-[#2A2A2C] rounded-[10px] text-[13px] font-medium transition-colors disabled:opacity-50">
                {portalLoading
                  ? <div className="w-4 h-4 border-2 border-[#F5A623]/30 border-t-[#F5A623] rounded-full animate-spin" />
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2" stroke="#868686" strokeWidth="1.5"/><path d="M2 10h20" stroke="#868686" strokeWidth="1.5"/></svg>
                }
                Gerenciar
              </button>
            ) : (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${API_URL}/api/asaas/agency-checkout`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ agencyHash: agency.hash, email: agency.email, plan: agency.plan })
                    });
                    const d = await res.json();
                    if (d.url) window.location.href = d.url;
                  } catch { /* silent */ }
                }}
                className="shrink-0 px-4 py-2.5 bg-[#F5A623] hover:bg-[#E5961E] text-black font-bold rounded-[10px] text-[13px] transition-all active:scale-[0.98]">
                Assinar
              </button>
            )}
          </div>
        )}

        {/* Clients list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-bold">Clientes</h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#F5A623] hover:bg-[#E5961E] text-black font-bold rounded-[10px] text-[12px] transition-all active:scale-[0.98]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
              Adicionar
            </button>
          </div>

          {clients.length === 0 ? (
            <div className="bg-[#111111] border border-dashed border-[#2A2A2C] rounded-[16px] py-12 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-[#1A1A1A] border border-[#2A2A2C] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="#444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div>
                <p className="text-[14px] font-semibold text-[#555]">Nenhum cliente ainda</p>
                <p className="text-[12px] text-[#3A3A3A] mt-1">Adicione seu primeiro cliente para começar.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {clients.map(client => {
                const pct = getOnboardingProgress(client.data);
                return (
                  <motion.div
                    key={client.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#111111] border border-[#1A1A1A] hover:border-[#2A2A2C] rounded-[14px] px-4 py-4 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="shrink-0 w-9 h-9 rounded-full bg-[#1A1A1A] border border-[#2A2A2C] flex items-center justify-center text-[13px] font-bold text-[#555]">
                        {client.name?.[0]?.toUpperCase() || '?'}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-semibold text-[14px] text-white truncate">{client.name}</span>
                          <Badge active={client.active} />
                        </div>
                        {client.email && (
                          <p className="text-[12px] text-[#555] truncate mb-2">{client.email}</p>
                        )}
                        <ProgressBar pct={pct} />
                        <p className="text-[10px] text-[#444] mt-1">
                          {pct === 100 ? 'Onboarding concluído' : `Onboarding ${pct}% completo`}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="shrink-0 flex items-center gap-2 mt-0.5">
                        <a
                          href={`${window.location.origin}?hash=${client.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir painel"
                          className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#1A1A1A] hover:bg-[#222] border border-[#2A2A2C] transition-colors"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </a>
                        <button
                          onClick={() => setClientToRemove(client)}
                          title="Remover cliente"
                          className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#1A1A1A] hover:bg-[#EF4444]/10 hover:border-[#EF4444]/30 border border-[#2A2A2C] transition-colors"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAddModal && (
          <AddClientModal
            agencyHash={agencyHash}
            plan={agency?.plan}
            currentCount={clients.length}
            onClose={() => setShowAddModal(false)}
            onAdded={load}
          />
        )}
        {clientToRemove && (
          <ConfirmRemoveModal
            client={clientToRemove}
            agencyHash={agencyHash}
            onClose={() => setClientToRemove(null)}
            onRemoved={(id) => setClients(prev => prev.filter(c => c.id !== id))}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default AgencyPanel;
