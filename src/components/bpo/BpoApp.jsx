/**
 * BpoApp — orquestra navegação entre seções do módulo BPO.
 * Deve ser renderizado dentro de <BpoProvider>.
 */

import { useState } from 'react';
import { BpoProvider } from '../../context/BpoContext';
import BpoLayout from './BpoLayout';
import { EmptyState } from '../ui/primitives';
import SuppliersList from './cadastros/SuppliersList';

const ComingSoon = ({ section }) => (
  <EmptyState
    icon={
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    }
    title={`${section} — em desenvolvimento`}
    description="Esta seção será liberada conforme o roadmap das fases. Veja o doc de plano de ação no Obsidian."
  />
);

const BpoAppInner = () => {
  const [section, setSection] = useState('suppliers');

  const renderSection = () => {
    switch (section) {
      case 'suppliers': return <SuppliersList />;
      case 'overview': return <ComingSoon section="Visão Geral" />;
      case 'bank-accounts': return <ComingSoon section="Contas Bancárias" />;
      case 'categories': return <ComingSoon section="Categorias" />;
      case 'employees': return <ComingSoon section="Funcionários" />;
      case 'partners': return <ComingSoon section="Sócios" />;
      case 'payment-methods': return <ComingSoon section="Meios de Pagamento" />;
      case 'payables': return <ComingSoon section="Contas a Pagar" />;
      case 'receivables': return <ComingSoon section="Contas a Receber" />;
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
