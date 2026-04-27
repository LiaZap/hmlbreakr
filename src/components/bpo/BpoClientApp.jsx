/**
 * BpoClientApp — versão do BPO pra DONO DO RESTAURANTE (não operador BPO)
 *
 * Diferenças vs BpoApp:
 * - Auto-seleciona o cliente atual (baseado no hash da URL)
 * - Esconde seções multi-cliente (Painel BPO, Tarefas, WhatsApp Inbox)
 * - Esconde seletor de cliente na topbar
 * - Mostra só o que faz sentido pro dono do negócio gerenciar
 */

import { useState, useEffect } from 'react';
import { BpoProvider, useBpo } from '../../context/BpoContext';
import { useDashboard } from '../../context/DashboardContext';
import BpoLayout from './BpoLayout';
import { EmptyState, Card } from '../ui/primitives';
import SuppliersList from './cadastros/SuppliersList';
import BankAccountsList from './cadastros/BankAccountsList';
import CategoriesList from './cadastros/CategoriesList';
import EmployeesList from './cadastros/EmployeesList';
import PartnersList from './cadastros/PartnersList';
import PaymentMethodsList from './cadastros/PaymentMethodsList';
import PayablesList from './lancamentos/PayablesList';
import ReceivablesList from './lancamentos/ReceivablesList';
import ImportsHub from './imports/ImportsHub';
import ReportsHub from './relatorios/ReportsHub';
import BpoDashboard from './dashboard/BpoDashboard';
import BankManagement from './bancario/BankManagement';
import ReconciliationRulesList from './bancario/ReconciliationRulesList';

const ComingSoon = ({ section }) => (
  <EmptyState
    icon={
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    }
    title={`${section} — em desenvolvimento`}
    description="Esta seção será liberada nas próximas fases."
  />
);

const BpoClientAppInner = () => {
  const [section, setSection] = useState('overview');
  const { setSelectedClient, selectedClient } = useBpo();
  const { dashboardData } = useDashboard();

  // Auto-seleciona o cliente atual baseado no hash da URL + dashboardData
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = params.get('hash');
    if (hash && (!selectedClient || selectedClient.hash !== hash)) {
      setSelectedClient({
        id: dashboardData.clientId || hash, // fallback
        hash,
        name: dashboardData.restaurant?.name || dashboardData.user?.name || 'Meu Restaurante',
        bpoActivatedAt: null,
      });
    }
  }, [dashboardData, selectedClient, setSelectedClient]);

  // Empty state se não houver hash (dono não logou via /client/:hash)
  if (!selectedClient) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <Card>
          <EmptyState
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M21 13.5V20a2 2 0 01-2 2H5a2 2 0 01-2-2V4a2 2 0 012-2h7" stroke="currentColor" strokeWidth="1.5"/></svg>}
            title="BPO Financeiro não disponível"
            description="O acesso ao BPO requer que você esteja logado como cliente do Breakr. Recarregue a página com seu link."
          />
        </Card>
      </div>
    );
  }

  const renderSection = () => {
    switch (section) {
      case 'overview': return <BpoDashboard />;
      case 'suppliers': return <SuppliersList />;
      case 'bank-accounts': return <BankAccountsList />;
      case 'categories': return <CategoriesList />;
      case 'employees': return <EmployeesList />;
      case 'partners': return <PartnersList />;
      case 'payment-methods': return <PaymentMethodsList />;
      case 'payables': return <PayablesList />;
      case 'receivables': return <ReceivablesList />;
      case 'imports': return <ImportsHub />;
      case 'relatorios': return <ReportsHub />;
      case 'bancario': return <BankManagement />;
      case 'reconciliation-rules': return <ReconciliationRulesList />;
      default: return <ComingSoon section={section} />;
    }
  };

  return (
    <BpoLayout activeSection={section} onNavigate={setSection} clientMode>
      {renderSection()}
    </BpoLayout>
  );
};

const BpoClientApp = () => (
  <BpoProvider>
    <BpoClientAppInner />
  </BpoProvider>
);

export default BpoClientApp;
