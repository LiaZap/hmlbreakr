/**
 * BpoLayout — shell do módulo BPO (sidebar + topbar com seletor de cliente)
 * Renderiza children dentro da área principal.
 */

import { useEffect } from 'react';
import { useBpo } from '../../context/BpoContext';
import { Button, EmptyState } from '../ui/primitives';
import BpoClientSelector from './BpoClientSelector';

const NAV = [
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
  ]},
  { id: 'relatorios', label: 'Relatórios', icon: 'chart', disabled: true, soon: true },
  { id: 'bancario', label: 'Gestão Bancária', icon: 'bank', disabled: true, soon: true },
  { id: 'painel', label: 'Painel BPO', icon: 'dashboard', disabled: true, soon: true },
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

const BpoLayout = ({ activeSection, onNavigate, children }) => {
  const { selectedClient, fetchBpoClients, bpoClients } = useBpo();

  useEffect(() => {
    fetchBpoClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col w-full h-screen bg-background text-text font-jakarta overflow-hidden">
      {/* Topbar */}
      <header className="h-14 border-b border-border bg-bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-text-strong">Breakr BPO</span>
          <span className="text-xs text-text-subtle">Financeiro</span>
        </div>
        <BpoClientSelector />
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-56 border-r border-border bg-bg-card shrink-0 overflow-y-auto py-3">
          <nav className="flex flex-col gap-0.5 px-2">
            {NAV.map((item) => (
              <div key={item.id}>
                <button
                  onClick={() => !item.disabled && !item.children && onNavigate(item.id)}
                  disabled={item.disabled}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                    activeSection === item.id ? 'bg-bg-input text-text-strong' : 'text-text-muted hover:bg-bg-input/50 hover:text-text-strong'
                  } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Icon name={item.icon} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.soon && (
                    <span className="text-[8px] uppercase font-bold bg-bg-input text-text-subtle px-1 py-0.5 rounded">em breve</span>
                  )}
                </button>
                {item.children && (
                  <div className="ml-7 flex flex-col gap-0.5 mt-0.5">
                    {item.children.map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => !sub.disabled && onNavigate(sub.id)}
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
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selectedClient ? (
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
                  : 'Use o seletor no topo pra escolher qual cliente trabalhar.'
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
