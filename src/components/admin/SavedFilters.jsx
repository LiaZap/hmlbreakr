/* eslint-disable react-refresh/only-export-components */
import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { computeClientHealth } from '../../utils/clientHealth';
import { computeHealthScore } from './HealthScoreBadge';

/**
 * SavedFilters — chips horizontais de visões salvas (predefinidas + custom)
 *
 * Ao clicar em uma visão, executa o filterDef contra a lista de clientes
 * e o consumidor recebe o resultado via onApplyFilter.
 *
 * Persistência:
 *  - Predefinidas: hardcoded aqui, sempre disponíveis (não podem ser apagadas).
 *  - Custom: salvas em localStorage["breakr.admin.savedViews"] como JSON array.
 *    Cada custom view: { id, name, icon, filterDef, createdAt }.
 *  - Se localStorage não estiver disponível (SSR / privacy mode), cai pra
 *    estado em memória — visões duram só a sessão.
 *
 * filterDef estrutura (usada por applyView):
 * {
 *   health?: ['critical','risk',...],   // array de classificações aceitas
 *   bpoActive?: true|false,
 *   onboardingCompleted?: true|false,
 *   minMonthsInUse?: number,
 *   minProfit?: number,                  // lucroLiqPct mínimo
 *   maxRevenue?: number,                 // <=
 *   minRevenue?: number,                 // >=
 *   hasRevenue?: true|false,
 *   minDaysInactive?: number,
 *   maxDaysInactive?: number,
 *   onboardingIncompleteDays?: number,   // dias desde criação sem onboarding
 *   cuisineTypes?: string[],
 *   search?: string,                     // substring no nome/email
 *   sortBy?: 'healthScoreDesc'|'healthScoreAsc'|'revenueDesc'|'recentActivity',
 *   limit?: number,
 * }
 */

const STORAGE_KEY = 'breakr.admin.savedViews';

// --------------------------------------------------------------------------
// Predefined views — sempre disponíveis
// --------------------------------------------------------------------------
export const PREDEFINED_VIEWS = [
  {
    id: 'preset:em-risco',
    name: 'Em risco',
    icon: '🔴',
    preset: true,
    filterDef: { health: ['critical', 'risk'] },
  },
  {
    id: 'preset:top-10',
    name: 'Top 10 mais saudáveis',
    icon: '💎',
    preset: true,
    filterDef: { sortBy: 'healthScoreDesc', limit: 10 },
  },
  {
    id: 'preset:trial-expirando',
    name: 'Trial expirando',
    icon: '⏰',
    preset: true,
    filterDef: {
      onboardingCompleted: false,
      onboardingIncompleteDays: 7,
      hasRevenue: false,
    },
  },
  {
    id: 'preset:inativos',
    name: 'Inativos',
    icon: '📭',
    preset: true,
    filterDef: { minDaysInactive: 30 },
  },
  {
    id: 'preset:casos-sucesso',
    name: 'Casos de sucesso',
    icon: '🏆',
    preset: true,
    filterDef: {
      health: ['healthy'],
      minProfit: 12,
      minMonthsInUse: 3,
    },
  },
  {
    id: 'preset:upgrade',
    name: 'Prontos pra upgrade',
    icon: '🎯',
    preset: true,
    filterDef: {
      health: ['healthy'],
      bpoActive: true,
      minMonthsInUse: 6,
    },
  },
];

const ICON_OPTIONS = ['🎯', '💎', '🏆', '⏰', '🚨', '🎨'];

// --------------------------------------------------------------------------
// localStorage helpers (com fallback in-memory)
// --------------------------------------------------------------------------
let memoryStore = [];

function safeLoad() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return memoryStore;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return memoryStore;
  }
}

function safeSave(views) {
  memoryStore = views;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // ignora — fallback de memória já foi atualizado acima
  }
}

function makeId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // fallback abaixo
  }
  return `view_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// --------------------------------------------------------------------------
// Parser de client.data — aceita objeto ou string JSON
// --------------------------------------------------------------------------
function parseClientData(client) {
  if (!client) return null;
  if (client.data && typeof client.data === 'object') return client.data;
  if (typeof client.data === 'string') {
    try {
      return JSON.parse(client.data);
    } catch {
      return null;
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// Quantos meses o cliente está usando o sistema (a partir do createdAt)
// --------------------------------------------------------------------------
function monthsInUse(client) {
  const createdAt = client?.createdAt || client?.created_at;
  if (!createdAt) return 0;
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return 0;
  const diffMs = Date.now() - d.getTime();
  return diffMs / (1000 * 60 * 60 * 24 * 30);
}

function daysSinceCreation(client) {
  const createdAt = client?.createdAt || client?.created_at;
  if (!createdAt) return 0;
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// --------------------------------------------------------------------------
// applyView — função pura: aplica filterDef na lista e retorna filtrada/ordenada
// --------------------------------------------------------------------------
export function applyView(view, allClients = []) {
  const def = view?.filterDef || {};
  if (!Array.isArray(allClients)) return [];

  // 1) Enriquecer cada cliente com health + score (cache local da chamada)
  const enriched = allClients.map((c) => {
    const data = parseClientData(c);
    const health = computeClientHealth(data);
    const score = health ? computeHealthScore(health).score : 0;
    return { client: c, data, health, score };
  });

  // 2) Filtros
  let filtered = enriched.filter(({ client, data, health }) => {
    // Saúde / classificação
    if (Array.isArray(def.health) && def.health.length > 0) {
      const cls = health?.health || 'unknown';
      if (!def.health.includes(cls)) return false;
    }

    // BPO ativa
    if (def.bpoActive === true && !health?.bpoActive) return false;
    if (def.bpoActive === false && health?.bpoActive) return false;

    // Onboarding completo
    if (def.onboardingCompleted === true && !health?.onboardingCompleted) return false;
    if (def.onboardingCompleted === false && health?.onboardingCompleted) return false;

    // Onboarding incompleto há X dias (desde criação)
    if (typeof def.onboardingIncompleteDays === 'number') {
      if (health?.onboardingCompleted) return false;
      if (daysSinceCreation(client) < def.onboardingIncompleteDays) return false;
    }

    // Receita mínima/máxima
    if (typeof def.minRevenue === 'number' && (health?.currentRevenue || 0) < def.minRevenue) return false;
    if (typeof def.maxRevenue === 'number' && (health?.currentRevenue || 0) > def.maxRevenue) return false;
    if (def.hasRevenue === true && !(health?.currentRevenue > 0)) return false;
    if (def.hasRevenue === false && health?.currentRevenue > 0) return false;

    // Lucro mínimo
    if (typeof def.minProfit === 'number') {
      if (!health?.hasFinancialData || health?.lucroLiqPct == null) return false;
      if (health.lucroLiqPct < def.minProfit) return false;
    }

    // Atividade
    if (typeof def.minDaysInactive === 'number') {
      const d = health?.daysSinceActivity;
      if (d == null) return false;
      if (d < def.minDaysInactive) return false;
    }
    if (typeof def.maxDaysInactive === 'number') {
      const d = health?.daysSinceActivity;
      if (d == null || d === Infinity) return false;
      if (d > def.maxDaysInactive) return false;
    }

    // Tempo de uso mínimo (em meses)
    if (typeof def.minMonthsInUse === 'number') {
      if (monthsInUse(client) < def.minMonthsInUse) return false;
    }

    // Cuisine — default consistente com clientHealth.getClientCuisine
    if (Array.isArray(def.cuisineTypes) && def.cuisineTypes.length > 0) {
      const cuisine = data?.formData?.identity?.cuisine_type
        || data?.formData?.cuisine_type
        || 'Não informado';
      if (!def.cuisineTypes.includes(cuisine)) return false;
    }

    // Busca textual
    if (def.search && typeof def.search === 'string' && def.search.trim()) {
      const q = def.search.trim().toLowerCase();
      const name = (client?.name || '').toLowerCase();
      const email = (client?.email || '').toLowerCase();
      if (!name.includes(q) && !email.includes(q)) return false;
    }

    return true;
  });

  // 3) Ordenação
  if (def.sortBy === 'healthScoreDesc') {
    filtered.sort((a, b) => b.score - a.score);
  } else if (def.sortBy === 'healthScoreAsc') {
    filtered.sort((a, b) => a.score - b.score);
  } else if (def.sortBy === 'revenueDesc') {
    filtered.sort((a, b) => (b.health?.currentRevenue || 0) - (a.health?.currentRevenue || 0));
  } else if (def.sortBy === 'recentActivity') {
    filtered.sort((a, b) => (b.health?.lastActivity || 0) - (a.health?.lastActivity || 0));
  }

  // 4) Limit
  if (typeof def.limit === 'number' && def.limit > 0) {
    filtered = filtered.slice(0, def.limit);
  }

  // 5) Devolve só o array de clientes
  return filtered.map((e) => e.client);
}

// --------------------------------------------------------------------------
// Hook simples pra ler/gravar custom views
// --------------------------------------------------------------------------
function useCustomViews() {
  const [views, setViews] = useState(() => safeLoad());

  const save = (next) => {
    setViews(next);
    safeSave(next);
  };

  return [views, save];
}

// --------------------------------------------------------------------------
// SavedFilters — componente principal
// --------------------------------------------------------------------------
const SavedFilters = ({
  filters = null,
  onApplyFilter = () => {},
  activeViewId = null,
  clients = [],
}) => {
  const [customViews, setCustomViews] = useCustomViews();
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  // Form state pra criar
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState(ICON_OPTIONS[0]);
  const [error, setError] = useState('');

  // Form state pra renomear
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const allViews = useMemo(() => {
    return [...PREDEFINED_VIEWS, ...customViews];
  }, [customViews]);

  // Conta clientes por view
  const counts = useMemo(() => {
    const map = {};
    if (!Array.isArray(clients) || clients.length === 0) return map;
    allViews.forEach((v) => {
      try {
        map[v.id] = applyView(v, clients).length;
      } catch {
        map[v.id] = 0;
      }
    });
    return map;
  }, [allViews, clients]);

  const handleSelect = (view) => {
    onApplyFilter({ view, filterDef: view.filterDef });
  };

  const handleClearAll = () => {
    onApplyFilter({ view: null, filterDef: null });
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) {
      setError('Dá um nome pra essa visão');
      return;
    }
    const lower = name.toLowerCase();
    const collide = PREDEFINED_VIEWS.some((p) => p.name.toLowerCase() === lower)
      || customViews.some((c) => c.name.toLowerCase() === lower);
    if (collide) {
      setError('Já existe uma visão com esse nome');
      return;
    }

    const view = {
      id: makeId(),
      name,
      icon: newIcon,
      filterDef: filters || {},
      createdAt: Date.now(),
    };
    setCustomViews([...customViews, view]);
    setNewName('');
    setNewIcon(ICON_OPTIONS[0]);
    setError('');
    setCreateOpen(false);
  };

  const handleDelete = (id) => {
    setCustomViews(customViews.filter((v) => v.id !== id));
    if (renamingId === id) {
      setRenamingId(null);
      setRenameValue('');
    }
  };

  const handleStartRename = (view) => {
    setRenamingId(view.id);
    setRenameValue(view.name);
  };

  const handleConfirmRename = () => {
    const trimmed = renameValue.trim();
    if (!trimmed || !renamingId) {
      setRenamingId(null);
      return;
    }
    const lower = trimmed.toLowerCase();
    const collide = PREDEFINED_VIEWS.some((p) => p.name.toLowerCase() === lower)
      || customViews.some((c) => c.id !== renamingId && c.name.toLowerCase() === lower);
    if (collide) return;
    setCustomViews(
      customViews.map((v) => (v.id === renamingId ? { ...v, name: trimmed } : v))
    );
    setRenamingId(null);
    setRenameValue('');
  };

  // Wrappers que limpam estado de erro/edição ao fechar os modais
  const closeCreate = () => {
    setCreateOpen(false);
    setError('');
  };
  const closeManage = () => {
    setManageOpen(false);
    setRenamingId(null);
    setRenameValue('');
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 flex-wrap">
        {/* "Todos" */}
        <button
          type="button"
          onClick={handleClearAll}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors border ${
            !activeViewId
              ? 'bg-[#F5A623] text-black border-[#F5A623] shadow-[0_4px_12px_-4px_rgba(245,166,35,0.5)]'
              : 'bg-[#1B1B1D] text-[#999] border-[#2A2A2C] hover:border-[#444] hover:text-white'
          }`}
        >
          Todos
          {Array.isArray(clients) && (
            <span className={`text-[10px] tabular-nums ${!activeViewId ? 'text-black/70' : 'text-[#666]'}`}>
              {clients.length}
            </span>
          )}
        </button>

        {/* Predefinidas + custom */}
        {allViews.map((v) => {
          const active = activeViewId === v.id;
          const count = counts[v.id];
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => handleSelect(v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors border ${
                active
                  ? 'bg-[#F5A623] text-black border-[#F5A623] shadow-[0_4px_12px_-4px_rgba(245,166,35,0.5)]'
                  : 'bg-[#1B1B1D] text-[#CCC] border-[#2A2A2C] hover:border-[#444] hover:text-white'
              }`}
              title={v.name}
            >
              <span aria-hidden="true">{v.icon}</span>
              <span>{v.name}</span>
              {typeof count === 'number' && (
                <span className={`text-[10px] tabular-nums ${active ? 'text-black/70' : 'text-[#666]'}`}>
                  ({count})
                </span>
              )}
            </button>
          );
        })}

        {/* Botão "+" criar visão */}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#1B1B1D] border border-[#2A2A2C] text-[#999] hover:border-[#F5A623]/40 hover:text-[#F5A623] transition-colors"
          aria-label="Criar nova visão"
          title="Criar visão a partir dos filtros atuais"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {/* Botão "Editar" gerenciar */}
        <button
          type="button"
          onClick={() => setManageOpen(true)}
          className="inline-flex items-center gap-1 px-2.5 h-8 rounded-full bg-[#1B1B1D] border border-[#2A2A2C] text-[#999] hover:border-[#444] hover:text-white transition-colors"
          aria-label="Gerenciar visões"
          title="Gerenciar visões salvas"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[11px] font-semibold">Editar</span>
        </button>
      </div>

      {/* Modal: Criar Visão */}
      <AnimatePresence>
        {createOpen && (
          <motion.div
            key="create-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={closeCreate}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[20px] p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-[18px] font-bold text-white mb-1">Criar Visão</h3>
              <p className="text-[12px] text-[#868686] mb-5">
                Salva os filtros atuais como uma visão reutilizável.
              </p>

              <label className="block text-[11px] font-semibold text-[#666] mb-1.5 uppercase tracking-wider">
                Nome
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setError('');
                }}
                placeholder="Ex: Italianos sem ficha"
                autoFocus
                className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-4 py-3 text-[14px] text-white outline-none focus:border-[#F5A623] transition-colors mb-4"
              />

              <label className="block text-[11px] font-semibold text-[#666] mb-1.5 uppercase tracking-wider">
                Ícone
              </label>
              <div className="flex gap-2 mb-4">
                {ICON_OPTIONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setNewIcon(ic)}
                    className={`w-10 h-10 rounded-[10px] text-[18px] flex items-center justify-center border transition-colors ${
                      newIcon === ic
                        ? 'bg-[#F5A623]/15 border-[#F5A623] text-[#F5A623]'
                        : 'bg-[#252527] border-[#2A2A2C] hover:border-[#444]'
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>

              {error && (
                <p className="text-[12px] text-[#FF4560] mb-3">{error}</p>
              )}

              {!filters && (
                <p className="text-[12px] text-[#666] mb-3">
                  Nenhum filtro ativo no momento — a visão salvará uma seleção vazia.
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeCreate}
                  className="flex-1 py-3 bg-[#252527] rounded-[12px] text-[#868686] text-[13px] font-semibold hover:bg-[#333] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  className="flex-1 py-3 bg-[#F5A623] rounded-[12px] text-black text-[13px] font-semibold hover:bg-[#E5961E] transition-colors"
                >
                  Salvar Visão
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Gerenciar Visões */}
      <AnimatePresence>
        {manageOpen && (
          <motion.div
            key="manage-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={closeManage}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[20px] p-6 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-[18px] font-bold text-white mb-1">Gerenciar Visões</h3>
              <p className="text-[12px] text-[#868686] mb-4">
                Renomeie ou exclua visões customizadas. Visões padrão não podem ser apagadas.
              </p>

              <div className="overflow-y-auto -mx-2 px-2 flex-1">
                {/* Predefinidas */}
                <div className="text-[10px] uppercase tracking-wider text-[#555] font-semibold mb-2 px-1">
                  Padrão
                </div>
                <div className="space-y-1.5 mb-4">
                  {PREDEFINED_VIEWS.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center gap-3 bg-[#0F0F11] border border-white/[0.04] rounded-[10px] px-3 py-2.5 opacity-70"
                    >
                      <span className="text-[16px]">{v.icon}</span>
                      <span className="flex-1 text-[13px] text-white truncate">{v.name}</span>
                      <span className="text-[9px] uppercase tracking-wider text-[#555] font-semibold bg-white/[0.04] px-2 py-0.5 rounded-full">
                        Padrão
                      </span>
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        className="text-[#444] cursor-not-allowed"
                        title="Visões padrão não podem ser apagadas"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Custom */}
                <div className="text-[10px] uppercase tracking-wider text-[#555] font-semibold mb-2 px-1">
                  Minhas Visões ({customViews.length})
                </div>
                {customViews.length === 0 ? (
                  <div className="text-center py-8 text-[12px] text-[#555]">
                    Nenhuma visão customizada ainda.
                    <br />
                    Use o botão <span className="text-[#999]">+</span> pra criar a partir dos filtros atuais.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {customViews.map((v) => {
                      const isRenaming = renamingId === v.id;
                      return (
                        <div
                          key={v.id}
                          className="flex items-center gap-3 bg-[#0F0F11] border border-white/[0.06] rounded-[10px] px-3 py-2.5 hover:border-[#F5A623]/30 transition-colors"
                        >
                          <span className="text-[16px]">{v.icon}</span>
                          {isRenaming ? (
                            <input
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleConfirmRename();
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                              autoFocus
                              className="flex-1 bg-[#252527] border border-[#F5A623]/40 rounded-[8px] px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-[#F5A623]"
                            />
                          ) : (
                            <span className="flex-1 text-[13px] text-white truncate">{v.name}</span>
                          )}

                          {isRenaming ? (
                            <>
                              <button
                                type="button"
                                onClick={handleConfirmRename}
                                className="text-[11px] font-semibold text-[#F5A623] hover:text-[#E5961E] px-2 py-1"
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                onClick={() => setRenamingId(null)}
                                className="text-[11px] font-semibold text-[#666] hover:text-white px-2 py-1"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartRename(v)}
                                className="p-1.5 rounded-md text-[#868686] hover:text-white hover:bg-white/[0.04] transition-colors"
                                title="Renomear"
                                aria-label="Renomear visão"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                  <path
                                    d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(v.id)}
                                className="p-1.5 rounded-md text-[#868686] hover:text-[#FF4560] hover:bg-[#FF4560]/10 transition-colors"
                                title="Excluir"
                                aria-label="Excluir visão"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                  <path
                                    d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={closeManage}
                  className="px-5 py-2.5 bg-[#252527] rounded-[12px] text-[#CCC] text-[13px] font-semibold hover:bg-[#333] transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SavedFilters;
