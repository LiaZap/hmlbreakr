/**
 * BpoLayout — shell do módulo BPO (sidebar + topbar com seletor de cliente)
 * Renderiza children dentro da área principal.
 */

import { useEffect, useState } from 'react';
import { useBpo } from '../../context/BpoContext';
import { Button, EmptyState } from '../ui/primitives';
import BpoClientSelector from './BpoClientSelector';

// Seções comuns (cliente + operador)
const NAV_COMMON = [
  { id: 'overview', label: 'Visão Geral', icon: 'home' },
  { id: 'cadastros', label: 'Cadastros', icon: 'users', children: [
    { id: 'suppliers', label: 'Fornecedores' },
    { id: 'bank-accounts', label: 'Contas Bancárias' },
    { id: 'categories', label: 'Categorias' },
    { id: 'employees', label: 'Funcionários' },
    { id: 'partners', label: 'Sócios' },
    { id: 'payment-methods', label: 'Meios Pagamento' },
  ]},
  { id: 'lancamentos', label: 'Lançamentos', icon: 'list', children: [
    { id: 'payables', label: 'Contas a Pagar' },
    { id: 'receivables', label: 'Contas a Receber' },
    { id: 'imports', label: 'Importar (NF-e/Boleto/Excel)' },
    { id: 'approvals', label: 'Aguardando Aprovação' },
  ]},
  { id: 'relatorios', label: 'Relatórios', icon: 'chart' },
  { id: 'bancario', label: 'Gestão Bancária', icon: 'bank', children: [
    { id: 'bancario', label: 'Saldos / Conciliação / Transferências' },
    { id: 'reconciliation-rules', label: 'Regras de Conciliação' },
  ]},
];

// Seções só do operador BPO (multi-cliente)
const NAV_OPERATOR_ONLY = [
  { id: 'whatsapp', label: 'WhatsApp Inbox', icon: 'list' },
  { id: 'painel', label: 'Painel BPO (multi-cliente)', icon: 'dashboard', children: [
    { id: 'painel', label: 'Visão Multi-cliente' },
    { id: 'tasks', label: 'Tarefas' },
  ]},
];

const Icon = ({ name }) => {
  const paths = {
    home: <path d="M3 12L12 3l9 9M5 10v10h14V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
    users: <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
    chart: <path d="M21 21H3M21 21V11M3 21V3l18 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
    bank: <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
    dashboard: <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  };
  return <svg width="16" height="16" viewBox="0 0 24 24">{paths[name]}</svg>;
};

const BpoLayout = ({ activeSection, onNavigate, children, clientMode = false }) => {
  const { selectedClient, fetchBpoClients, bpoClients } = useBpo();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (!clientMode) fetchBpoClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientMode]);

  // Em client mode, esconde sidebar de seções multi-cliente
  const NAV = clientMode ? NAV_COMMON : [...NAV_COMMON, ...NAV_OPERATOR_ONLY];

  // Fecha drawer ao trocar de seção em mobile
  const handleNavigate = (id) => {
    onNavigate(id);
    setMobileSidebarOpen(false);
  };

  return (
    <div className="flex flex-col w-full h-screen bg-background text-text font-jakarta overflow-hidden">
      {/* Topbar — em clientMode, sem seletor de cliente (e título diferente) */}
      <header className="h-14 border-b border-border bg-bg-card flex items-center justify-between px-3 md:px-4 shrink-0">
        <div className="flex items-center gap-3">
          {/* Hamburger só no mobile */}
          <button
            onClick={() => setMobileSidebarOpen((v) => !v)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-md hover:bg-bg-input"
            aria-label="Menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <span className="text-sm font-bold text-text-strong">{clientMode ? 'Financeiro' : 'Breakr BPO'}</span>
          <span className="text-xs text-text-subtle hidden sm:inline truncate max-w-[200px]">{clientMode ? selectedClient?.name : 'BPO'}</span>
        </div>
        {!clientMode && <BpoClientSelector />}
      </header>

      <div className="flex flex-1 min-h-0 relative">
        {/* Backdrop mobile */}
        {mobileSidebarOpen && (
          <div className="md:hidden fixed inset-0 top-14 bg-black/60 z-40" onClick={() => setMobileSidebarOpen(false)} />
        )}

        {/* Sidebar — drawer no mobile, fixa no desktop */}
        <aside className={`
          ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          fixed md:static top-14 md:top-auto bottom-0 left-0 z-50
          w-64 md:w-56 border-r border-border bg-bg-card overflow-y-auto py-3
          transition-transform duration-200 ease-out shrink-0
        `}>
          <nav className="flex flex-col gap-0.5 px-2">
            {NAV.map((item) => {
              const hasChildren = Array.isArray(item.children) && item.children.length > 0;
              const childActive = hasChildren && item.children.some((c) => c.id === activeSection);
              const isActive = activeSection === item.id || childActive;

              const handleParentClick = () => {
                if (item.disabled) return;
                if (hasChildren) {
                  // Clica no título → vai pro primeiro filho não-disabled (UX consistente)
                  const firstChild = item.children.find((c) => !c.disabled);
                  if (firstChild) handleNavigate(firstChild.id);
                } else {
                  handleNavigate(item.id);
                }
              };

              return (
                <div key={item.id}>
                  <button
                    onClick={handleParentClick}
                    disabled={item.disabled}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                      isActive ? 'bg-bg-input text-text-strong' : 'text-text-muted hover:bg-bg-input/50 hover:text-text-strong'
                    } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Icon name={item.icon} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.soon && (
                      <span className="text-[8px] uppercase font-bold bg-bg-input text-text-subtle px-1 py-0.5 rounded">em breve</span>
                    )}
                  </button>
                  {hasChildren && (
                    <div className="ml-7 flex flex-col gap-0.5 mt-0.5">
                      {item.children.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => !sub.disabled && handleNavigate(sub.id)}
                          disabled={sub.disabled}
                          className={`text-left px-3 py-1.5 rounded text-[11px] transition-colors ${
                            activeSection === sub.id ? 'text-brand font-semibold' : 'text-text-muted hover:text-text-strong'
                          } ${sub.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-3 md:p-6 w-full md:w-auto">
          {!selectedClient && !clientMode && !['painel', 'tasks', 'whatsapp'].includes(activeSection) ? (
            <EmptyState
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M21 13.5V20a2 2 0 01-2 2H5a2 2 0 01-2-2V4a2 2 0 012-2h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M14 2v6h6M3.5 12h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
              title={bpoClients.length === 0 ? 'Nenhum cliente com BPO ativado' : 'Selecione um cliente'}
              description={
                bpoClients.length === 0
                  ? 'Ative BPO em algum cliente no Painel Admin (toggle por cliente).'
                  : 'Use o seletor no topo pra escolher qual cliente trabalhar — ou clique em "Painel BPO" pra ver visão multi-cliente.'
              }
            />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
};

export default BpoLayout;
