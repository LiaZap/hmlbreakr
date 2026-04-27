/**
 * BpoApp — orquestra navegação entre seções do módulo BPO.
 */

import { useState } from 'react';
import { BpoProvider } from '../../context/BpoContext';
import BpoLayout from './BpoLayout';
import { EmptyState } from '../ui/primitives';
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

const ComingSoon = ({ section }) => (
  <EmptyState
    icon={
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    }
    title={`${section} — em desenvolvimento`}
    description="Esta seção será liberada nas próximas fases. Veja [[Breakr V2.0 - Plano de Acao BPO Financeiro]]."
  />
);

const BpoAppInner = () => {
  const [section, setSection] = useState('overview');

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
      default: return <ComingSoon section={section} />;
    }
  };

  return (
    <BpoLayout activeSection={section} onNavigate={setSection}>
      {renderSection()}
    </BpoLayout>
  );
};

const BpoApp = () => (
  <BpoProvider>
    <BpoAppInner />
  </BpoProvider>
);

export default BpoApp;
