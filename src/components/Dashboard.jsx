import React, { useState, lazy, Suspense } from 'react';
import { useDashboard } from '../context/DashboardContext';
import Sidebar from './dashboard/Sidebar';
import DashboardHeader from './dashboard/DashboardHeader';
import FinanceOverview from './dashboard/FinanceOverview';
import JourneyMap from './dashboard/JourneyMap';
import MoneyOnTable from './dashboard/MoneyOnTable';
import TechnicalSheets from './dashboard/TechnicalSheets';
import CostStructure from './dashboard/CostStructure';
import DashboardTips from './dashboard/DashboardTips';
import BreakEvenGraphic from './dashboard/BreakEvenGraphic';
import DailyRevenueModal from './dashboard/DailyRevenueModal';
import FichaTecnica from './dashboard/FichaTecnica';
import FaturamentoAnualIcon from './dashboard/FaturamentoAnualIcon';
import RankingCategoriaIcon from './dashboard/RankingCategoriaIcon';
import ProximoNivelIcon from './dashboard/ProximoNivelIcon';
import RankingGeralIcon from './dashboard/RankingGeralIcon';
import MatrizPreco from './dashboard/MatrizPreco';
import EngenhariaMenu from './dashboard/EngenhariaMenu';
import Equipe from './dashboard/Equipe';
import BpoClientAlerts from './dashboard/BpoClientAlerts';
// Code-splitting: BPO carrega só quando usuário entra na seção
const BpoClientApp = lazy(() => import('./bpo/BpoClientApp'));
import DRE from './dashboard/DRE';
import CardRateComparison from './dashboard/CardRateComparison';
import InfoTooltip from './dashboard/InfoTooltip';
import MobileNav from './dashboard/MobileNav';
import OnboardingForm from './OnboardingForm';
import MobileOnboarding from './mobile/MobileOnboarding';
import BroadcastPopup from './dashboard/BroadcastPopup';
import { useSubscriptionGuard } from '../hooks/useSubscriptionGuard';
import {
  PaymentFailedBanner,
  TrialEndingModal,
  CanceledWarningModal,
  SubscriptionBlockedScreen,
} from './dashboard/SubscriptionModals';

const Dashboard = () => {
  /* MOVED TO CONTEXT */
  const { dashboardData, updateDashboardData, setSelectedMonthIndex } = useDashboard();
  const [activePage, setActivePage] = useState(() => {
    // BAH-003: respeita ?section=financeiro vindo do AdminPanel ClientQuickSwitcher
    try {
      const sec = new URLSearchParams(window.location.search).get('section');
      const valid = ['home', 'fichaTecnica', 'matrizPreco', 'engenhariaMenu', 'equipe', 'financeiro'];
      return sec && valid.includes(sec) ? sec : 'home';
    } catch { return 'home'; }
  });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showDailyRevenue, setShowDailyRevenue] = useState(false);
  // BAH-036: BaseModal removido. Indicadores agora ficam inline no CostStructure / SimuladorPrecificacao

  // Admin-viewing mode detection
  const hash = new URLSearchParams(window.location.search).get('hash');
  const adminSession = sessionStorage.getItem('breaker-admin');
  const adminRole = sessionStorage.getItem('breaker-admin-role') || 'admin';
  const adminName = sessionStorage.getItem('breaker-admin-name') || (adminRole === 'super_admin' ? 'Gustavo Costa' : 'Admin');
  const isAdminViewing = !!adminSession && !!hash;
  const roleLabel = { super_admin: 'Super Admin', admin: 'Admin', commercial: 'Comercial', financial: 'Financeiro' }[adminRole] || 'Admin';

  // Stripe F3 — banner / modais / bloqueio por assinatura. Admin viewing
  // nunca é bloqueado (admin precisa ver dados mesmo de cliente bloqueado).
  const sub = useSubscriptionGuard({ isAdminViewing });

  const handleBackToAdmin = () => {
    if (window.opener) window.close();
    else window.location.href = window.location.pathname;
  };

  const handleNavigate = (page) => {
    if (page === 'editOnboarding') {
      setShowOnboarding(true);
    } else {
      setActivePage(page);
    }
  };

  // Bloqueio total (unpaid / expirado / admin_blocked) — short-circuit
  // ANTES do dashboard renderizar. Admin viewing está isento (hook trata).
  if (sub.ready && sub.shouldBlock) {
    return <SubscriptionBlockedScreen subscription={sub.raw} />;
  }

  return (
    <div className="relative w-full h-screen bg-[#1B1B1D] font-jakarta text-white select-none overflow-y-auto lg:overflow-hidden">
      {/* Avisos de assinatura — banner sticky e modais flutuantes */}
      {sub.ready && sub.showPaymentFailedBanner && <PaymentFailedBanner />}
      {sub.ready && sub.showTrialEndingModal && <TrialEndingModal daysLeft={sub.daysToTrialEnd} />}
      {sub.ready && sub.showCanceledWarningModal && <CanceledWarningModal daysLeft={sub.daysToCharge} />}
      {/* Banner de modo admin-viewing */}
      {isAdminViewing && (
        <div className="sticky top-0 z-[60] bg-gradient-to-r from-[#F5A623] to-[#E5961E] text-black shadow-lg">
          <div className="px-3 md:px-6 py-2 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span className="text-[12px] font-bold">
                Modo {roleLabel} — Visualizando como <span className="underline">{dashboardData.user?.name || dashboardData.restaurant?.name || 'Cliente'}</span>
              </span>
            </div>
            <span className="text-[11px] opacity-70 hidden sm:inline">· Logado como {adminName}</span>
            <button
              onClick={handleBackToAdmin}
              className="ml-auto bg-black/20 hover:bg-black/30 text-black text-[11px] font-bold px-3 py-1.5 rounded-[8px] transition-colors flex items-center gap-1.5 shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Voltar ao Admin
            </button>
          </div>
        </div>
      )}

      <BroadcastPopup restaurantCategory={dashboardData.restaurant?.category} />
      <Sidebar activePage={activePage} onNavigate={handleNavigate} isOwner={dashboardData.user?.isOwner !== false} lockCollapsed={activePage === 'financeiro'} />

      {activePage === 'fichaTecnica' ? (
        <div className="ml-0 md:ml-[85px] flex-1 min-h-0 pb-[70px] md:pb-0">
          <FichaTecnica />
        </div>
      ) : activePage === 'matrizPreco' ? (
        <div className="ml-0 md:ml-[85px] flex-1 min-h-0 pb-[70px] md:pb-0">
          <MatrizPreco />
        </div>
      ) : activePage === 'engenhariaMenu' ? (
        <div className="ml-0 md:ml-[85px] flex-1 min-h-0 pb-[70px] md:pb-0">
          <EngenhariaMenu />
        </div>
      ) : activePage === 'equipe' ? (
        <div className="ml-0 md:ml-[85px] flex-1 min-h-0 pb-[70px] md:pb-0">
          <Equipe />
        </div>
      ) : activePage === 'financeiro' ? (
        <div className="ml-0 md:ml-[85px] flex-1 min-h-0 pb-[70px] md:pb-0">
          <Suspense fallback={<div className="flex items-center justify-center h-full text-xs text-[#868686]">Carregando Financeiro...</div>}>
            <BpoClientApp />
          </Suspense>
        </div>
      ) : (
      <>
      {/* MAIN CONTENT - Full-width black background */}
      <div className="w-full bg-[#101010]">
      <div className="ml-0 md:ml-[85px] py-1 md:py-2 pb-2 md:pb-6">
        <div className="w-full px-3 md:px-6 2xl:px-10 flex flex-col min-h-0">
        
        <DashboardHeader data={dashboardData} />

        {/* BPO Alerts — só aparece se cliente tem BPO ativado */}
        <BpoClientAlerts bpoInfo={dashboardData._bpo} onNavigateToFinance={() => setActivePage('financeiro')} />

        {/* BAH-097: Mapa do Caminho é um SUPORTE só pra fase de onboarding/setup.
            Renderiza enquanto o cliente ainda não concluiu as etapas core
            (onboarding, insumos, fichas, engenharia, equipe). Quando tudo está
            'done', some do dashboard — não pode ficar empurrando o conteúdo
            financeiro. O critério de "concluído" vem de JourneyMap.isComplete(),
            que reusa a mesma lógica de progresso do próprio JourneyMap. */}
        {!JourneyMap.isComplete(dashboardData) && (
          <JourneyMap dashboardData={dashboardData} onNavigate={(page) => setActivePage(page)} />
        )}

        {/* MAIN GRID - 4 columns layout (responsive fluid) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4 xl:gap-6 mb-0 min-h-0">

          {/* COL 1 - Left Panel */}
          <div className="flex flex-col h-full py-0 md:py-2">
            
            {/* 1. Header Small */}
            <div className="hidden md:block mb-8">
              <span className="block font-bold text-[14px] text-white leading-tight">Dashboard</span>
              <span className="block font-normal text-[11px] text-[#595959] leading-tight">Painel de Controle</span>
            </div>

            {/* 2. Date & Status Row */}
            <div className="hidden md:flex items-center gap-5 mb-8">
               <div className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#595959" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span className="text-[#595959] font-medium text-[11px]">{dashboardData.period.date}</span>
               </div>
               <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-[#FDD789]/10 flex items-center justify-center">
                     <div className="w-2 h-2 rounded-full bg-[#FDD789]" />
                  </div>
                  <span className="text-[#595959] font-medium text-[11px]">{dashboardData.period.status}</span>
               </div>
            </div>

            {/* 3. Main Title */}
            <div className="mb-2 md:mb-4 pr-4">
              <h1 className="text-[18px] md:text-[28px] leading-[1.15] tracking-tight mb-1 md:mb-3">
                <span className="font-bold text-[#FF9406]">{dashboardData.restaurant.name}</span>
                <span className="font-medium text-[#E1E1E1]">, como <br className="hidden md:inline"/>você nunca viu antes</span>
              </h1>
              <p className="hidden md:block font-normal text-[12px] text-[#888] leading-snug w-full max-w-[280px]">
                {dashboardData.overview.subtitle}
              </p>
            </div>

            {/* 4. Pills Grid (Responsive) */}
            <div className="flex flex-nowrap md:flex-wrap overflow-x-auto gap-1.5 md:gap-2 mb-auto mt-2 md:mt-4 pb-1 md:pb-0 scrollbar-hide">
               {dashboardData.overview.tags.map((tag, idx) => (
                 <div key={idx} className="bg-[#151515] border border-[#222] rounded-full px-3 py-1.5 flex items-center gap-2">
                    <span className="text-[10px] text-[#999] whitespace-nowrap">{tag.label}</span>
                    <div className="w-2.5 h-1 rounded-full" style={{ backgroundColor: tag.color || '#FDD789' }} />
                 </div>
               ))}
            </div>

            {/* Bottom Link Removed */}
          </div>

          {/* COL 2 - Faturamento */}
          <div className="bg-[#141414] md:bg-transparent rounded-2xl md:rounded-none p-3 md:p-0 border border-[#1E1E1E] md:border-0">
            <FinanceOverview data={dashboardData.revenue} onSelectMonth={(idx) => setSelectedMonthIndex(idx)} onUpdateRevenue={(monthIdx, value) => {
              const formData = dashboardData.formData || {};
              const revenueHistory = [...(formData.revenue_history || [])];
              const mm = String(monthIdx + 1).padStart(2, '0');
              const yyyy = new Date().getFullYear();
              const monthStr = `${mm}/${yyyy}`;
              const existingIdx = revenueHistory.findIndex(r => r.month === monthStr);
              if (existingIdx >= 0) {
                revenueHistory[existingIdx] = { month: monthStr, amount: `R$ ${value}` };
              } else {
                revenueHistory.push({ month: monthStr, amount: `R$ ${value}` });
              }
              updateDashboardData({ ...formData, revenue_history: revenueHistory });
            }} />
          </div>

          {/* COL 3 - Ponto de Equilíbrio */}
          <div className="bg-[#141414] md:bg-transparent rounded-2xl md:rounded-none p-3 md:p-0 border border-[#1E1E1E] md:border-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex flex-col gap-[2px]">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-[11px] text-[#CACACA]">Ponto de Equilíbrio</span>
                  <InfoTooltip
                    position="bottom-right"
                    content="Faturamento mínimo mensal para cobrir todos os custos fixos e variáveis. Abaixo desse valor = prejuízo. Acima = lucro real."
                  />
                </div>
                <span className="font-normal text-[10px] text-[#595959]">Quando o lucro aparece</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Quick-add daily revenue */}
                <button
                  onClick={() => setShowDailyRevenue(true)}
                  className="w-6 h-6 rounded-full bg-[#FF9406]/15 border border-[#FF9406]/30 flex items-center justify-center hover:bg-[#FF9406]/25 transition-colors"
                  title="Adicionar faturamento diário"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF9406" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                </button>
                <InfoTooltip
                  position="bottom-left"
                  content={`Previsão de quando você atinge o ponto de equilíbrio neste mês. ${dashboardData.breakEven.reachedBreakEven ? 'Você já atingiu ou deve atingir a meta este mês!' : 'Ainda não atingiu a meta — acompanhe o faturamento diário.'}`}
                >
                  <div className="flex items-center gap-1 cursor-pointer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4C4C4" strokeWidth="1.5">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                    <span className="text-[11px] text-[#999] font-medium">{dashboardData.breakEven.estimatedDate}</span>
                    <span className={`w-2 h-2 rounded-full ${dashboardData.breakEven.reachedBreakEven ? 'bg-[#E2FD89]' : 'bg-[#FD8989]'}`} />
                  </div>
                </InfoTooltip>
              </div>
            </div>

            {/* Gauge Chart */}
            <div className="w-full mb-1 md:mb-2 relative max-w-[280px] md:max-w-none mx-auto md:mx-0">
              {dashboardData.breakEven.hasCmvData && (
                <div className="absolute top-0 right-0 z-10">
                  <InfoTooltip
                    position="bottom-left"
                    content={`${dashboardData.breakEven.percentage}% da meta atingida. Você faturou R$ ${dashboardData.breakEven.revenueAccumulated} de R$ ${dashboardData.breakEven.current} necessários. A fórmula é: Custos Fixos ÷ Margem de Contribuição.`}
                  />
                </div>
              )}
              {dashboardData.breakEven.hasCmvData ? (
                <BreakEvenGraphic
                  percentage={dashboardData.breakEven.percentage}
                  value={`R$ ${dashboardData.breakEven.current}`}
                  revenueAccumulated={dashboardData.breakEven.revenueAccumulated}
                  minLabel={dashboardData.breakEven.minLabel || "0k"}
                  maxLabel={dashboardData.breakEven.maxLabel || "100%"}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-8 px-4">
                  <div className="w-12 h-12 rounded-full bg-[#1F1F1F] flex items-center justify-center border border-[#2F2F2F] mb-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5">
                      <path d="M12 2v20M2 12h20" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <p className="text-[10px] text-[#7E7E7E] text-center leading-relaxed">
                    Preencha suas <span className="text-[#FF9406] font-semibold">Fichas Técnicas</span> para calcular o Ponto de Equilíbrio.
                  </p>
                </div>
              )}
            </div>

            {/* Daily revenue compact summary */}
            {(() => {
              const dailyRevenue = dashboardData.formData?.daily_revenue || {};
              const now = new Date();
              const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
              const entries = Object.entries(dailyRevenue).filter(([d]) => d.startsWith(prefix));
              const accumulated = entries.reduce((s, [, v]) => s + (typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g,'').replace(',','.')) || 0), 0);
              const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
              const fmtMoney = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

              return (
                <button
                  onClick={() => setShowDailyRevenue(true)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-[#1B1B1D] border border-[#2A2A2C] rounded-[10px] mb-3 hover:border-[#FF9406]/40 transition-colors"
                >
                  {entries.length === 0 ? (
                    <span className="text-[9px] text-[#555]">Nenhum lançamento diário</span>
                  ) : (
                    <>
                      <span className="text-[9px] text-[#777]">{entries.length}/{daysInMonth} dias</span>
                      <span className="text-[9px] font-semibold text-[#FF9406]">R$ {fmtMoney(accumulated)}</span>
                    </>
                  )}
                  <span className="text-[9px] text-[#FF9406] font-semibold ml-2">+ Lançar</span>
                </button>
              );
            })()}

            {/* Dynamic day prediction message */}
            <div className="flex items-start gap-[7px] mb-2 md:mb-3">
              <div className="w-10 h-10 rounded-[16px] bg-[#1B1B1D] flex items-center justify-center flex-shrink-0">
                {/* solar:cup-first-outline from Figma */}
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10.6556 4.83914C10.7699 4.88645 10.8675 4.96656 10.9362 5.06936C11.0048 5.17216 11.0415 5.29301 11.0415 5.41664V8.74997C11.0415 8.91573 10.9756 9.0747 10.8584 9.19191C10.7412 9.30912 10.5822 9.37497 10.4165 9.37497C10.2507 9.37497 10.0917 9.30912 9.97453 9.19191C9.85732 9.0747 9.79147 8.91573 9.79147 8.74997V6.92497L9.60814 7.1083C9.55092 7.16971 9.48192 7.21896 9.40525 7.25312C9.32859 7.28728 9.24582 7.30565 9.1619 7.30713C9.07799 7.30861 8.99463 7.29317 8.9168 7.26174C8.83898 7.23031 8.76829 7.18352 8.70894 7.12417C8.64959 7.06482 8.6028 6.99413 8.57137 6.9163C8.53993 6.83848 8.5245 6.75512 8.52598 6.6712C8.52746 6.58728 8.54583 6.50452 8.57999 6.42786C8.61415 6.35119 8.6634 6.28219 8.7248 6.22497L9.9748 4.97497C10.0621 4.88756 10.1734 4.828 10.2946 4.80383C10.4158 4.77965 10.5414 4.79194 10.6556 4.83914Z" fill="#525253"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M6.24817 1.33924C7.48822 1.13548 8.74317 1.03596 9.99984 1.04174C11.5232 1.04174 12.7823 1.17591 13.7515 1.33924L13.864 1.35841C14.7057 1.49924 15.4057 1.61674 15.9523 2.29007C16.3032 2.72257 16.4165 3.19008 16.4423 3.71091L16.8523 3.84758C17.2382 3.97591 17.5773 4.08924 17.8448 4.21424C18.1348 4.34924 18.4007 4.52257 18.604 4.80507C18.8073 5.08757 18.8882 5.39424 18.9248 5.71174C18.9582 6.00591 18.9582 6.36174 18.9582 6.77007V6.89007C18.9582 7.22507 18.9582 7.52091 18.9332 7.76841C18.9065 8.03591 18.8473 8.29674 18.6998 8.54841C18.5507 8.80091 18.3515 8.97924 18.1307 9.13257C17.9265 9.27424 17.6682 9.41841 17.3748 9.58091L15.1748 10.8034C14.7248 11.6876 14.1082 12.4759 13.2582 13.0451C12.529 13.5342 11.6565 13.8442 10.6248 13.9326V15.6251H11.8165C12.1537 15.6251 12.4804 15.7419 12.7411 15.9557C13.0018 16.1695 13.1804 16.467 13.2465 16.7976L13.429 17.7084H14.9998C15.1656 17.7084 15.3246 17.7743 15.4418 17.8915C15.559 18.0087 15.6248 18.1676 15.6248 18.3334C15.6248 18.4992 15.559 18.6581 15.4418 18.7754C15.3246 18.8926 15.1656 18.9584 14.9998 18.9584H4.99984C4.83408 18.9584 4.67511 18.8926 4.5579 18.7754C4.44069 18.6581 4.37484 18.4992 4.37484 18.3334C4.37484 18.1676 4.44069 18.0087 4.5579 17.8915C4.67511 17.7743 4.83408 17.7084 4.99984 17.7084H6.57067L6.75317 16.7976C6.81925 16.467 6.99785 16.1695 7.25857 15.9557C7.51928 15.7419 7.84602 15.6251 8.18317 15.6251H9.37484V13.9326C8.34317 13.8442 7.47067 13.5342 6.7415 13.0459C5.89234 12.4759 5.27484 11.6876 4.82484 10.8034L2.62484 9.58091C2.36587 9.44363 2.11364 9.29402 1.869 9.13257C1.63822 8.9832 1.44398 8.78384 1.30067 8.54924C1.165 8.30984 1.08497 8.04296 1.0665 7.76841C1.0415 7.52091 1.0415 7.22507 1.0415 6.89007V6.76924C1.0415 6.36258 1.0415 6.00591 1.07484 5.71174C1.1115 5.39424 1.1915 5.08674 1.39567 4.80507C1.599 4.52257 1.86484 4.34924 2.154 4.21341C2.42317 4.08841 2.7615 3.97591 3.14734 3.84758L3.55734 3.71091C3.58317 3.18924 3.6965 2.72257 4.04734 2.29007C4.59484 1.61591 5.294 1.49841 6.1365 1.35841L6.24817 1.33924ZM7.84567 17.7084H12.154L12.0207 17.0426C12.0112 16.9954 11.9857 16.9529 11.9485 16.9223C11.9113 16.8918 11.8646 16.8751 11.8165 16.8751H8.18317C8.13503 16.8751 8.08838 16.8918 8.05116 16.9223C8.01394 16.9529 7.98844 16.9954 7.979 17.0426L7.84567 17.7084ZM3.58484 5.01924C3.64484 6.28591 3.78734 7.68591 4.144 8.99424L3.25567 8.50174C2.9315 8.32091 2.72817 8.20757 2.5815 8.10591C2.4465 8.01174 2.40234 7.95591 2.37817 7.91424C2.35317 7.87257 2.3265 7.80757 2.30984 7.64424C2.29261 7.38407 2.28649 7.12327 2.2915 6.86257V6.80174C2.2915 6.35257 2.29234 6.06841 2.3165 5.85341C2.33984 5.65508 2.3765 5.58091 2.40984 5.53591C2.44234 5.49007 2.50067 5.43174 2.6815 5.34757C2.87817 5.25591 3.14817 5.16507 3.57317 5.02257L3.58484 5.01924ZM15.8557 8.99424L16.744 8.50174C17.0682 8.32091 17.2715 8.20757 17.4182 8.10591C17.5532 8.01174 17.5973 7.95591 17.6215 7.91424C17.6465 7.87257 17.6732 7.80757 17.6898 7.64424C17.7073 7.46591 17.7082 7.23341 17.7082 6.86257V6.80174C17.7082 6.35257 17.7073 6.06841 17.6832 5.85341C17.6598 5.65508 17.6232 5.58091 17.5898 5.53591C17.5573 5.49007 17.499 5.43174 17.3182 5.34757C17.1215 5.25591 16.8515 5.16507 16.4265 5.02257L16.4148 5.01924C16.3557 6.28591 16.2115 7.68591 15.8557 8.99424ZM9.99984 2.29174C8.54984 2.29174 7.36067 2.41924 6.4565 2.57174C5.45067 2.74174 5.23984 2.80508 5.01817 3.07841C4.79984 3.34674 4.779 3.60174 4.82317 4.73091C4.89817 6.61257 5.1465 8.64424 5.91484 10.1892C6.29484 10.9509 6.7915 11.5742 7.43817 12.0076C8.07984 12.4384 8.909 12.7084 9.99984 12.7084C11.0915 12.7084 11.9198 12.4384 12.5623 12.0076C13.209 11.5742 13.7048 10.9509 14.084 10.1884C14.8532 8.64424 15.1015 6.61341 15.1757 4.73007C15.2215 3.60174 15.2007 3.34674 14.9823 3.07841C14.7607 2.80508 14.549 2.74174 13.5432 2.57174C12.3719 2.38001 11.1867 2.28635 9.99984 2.29174Z" fill="#525253"/>
                </svg>
              </div>
              <p className="font-semibold text-[10px] leading-[13px] text-[#CBCBCB] pt-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {dashboardData.breakEven.estimatedDay > 0 ? (
                  dashboardData.breakEven.exceedsMonth ? (
                    <>
                      Com a média atual, o equilíbrio <span className="text-[#FD8989] font-bold">não será atingido</span> neste mês. Aumente o faturamento diário para alcançar a meta.
                    </>
                  ) : (
                    <>
                      A partir do dia <span className="text-white font-bold">{dashboardData.breakEven.estimatedDay}</span>, cada venda tende a virar sobra real. Seu objetivo é baixar esse dia sem comprometer qualidade.
                    </>
                  )
                ) : (
                  'Preencha seus dados para calcular a previsão do ponto de equilíbrio.'
                )}
              </p>
            </div>

            {/* Base Info Box — display inline (BAH-036: modal removido; BAH-086: fórmula removida da UI) */}
            <div className="p-3 md:p-4 bg-[#FF9406] rounded-[12px] md:rounded-[14px] flex flex-col items-center justify-center text-center">
              <div className="flex items-center gap-2 mb-1 md:mb-2">
                <span className="font-bold text-[11px] text-black">Base</span>
                <span className="px-2.5 py-0.5 bg-black/15 rounded-full text-[9px] font-medium text-black flex items-center gap-1">
                  {dashboardData.breakEven.base.status}
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.5 5.5H19l-4.5 3.5L16 17.5 12 14l-4 3.5L9.5 12 5 8.5h5.5z"/>
                  </svg>
                </span>
                <InfoTooltip
                  position="bottom-left"
                  content="Indicador de custos fundamentais que precisam ser incluídos em todas suas vendas"
                >
                  <span
                    className="w-[16px] h-[16px] rounded-full bg-black text-white text-[11px] font-extrabold flex items-center justify-center cursor-pointer shrink-0 leading-none"
                    aria-label="Ajuda"
                  >
                    ?
                  </span>
                </InfoTooltip>
              </div>
              <span className="font-bold text-[24px] md:text-[28px] text-black leading-none">{dashboardData.breakEven.base.value}</span>
            </div>
          </div>

          {/* COL 4 - Comparativo de mercado (REMOVED) */}
        </div>
        </div>
      </div>
      </div>

      {/* BOTTOM ROW - Cards (full-width bg) */}
      <div className="pl-3 md:pl-[85px] pr-3 md:pr-6 py-2 md:py-4 pb-[80px] md:pb-4 w-full">
        <div className="w-full px-0 md:px-0 2xl:px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
            <MoneyOnTable data={dashboardData.cards.moneyOnTable} />
            <TechnicalSheets data={dashboardData.cards.technicalSheets} />
            <CostStructure data={dashboardData.cards.costStructure} />
          </div>
          {/* DRE e Taxa Cartão removidos do dashboard para evitar rolagem */}
        </div>
      </div>
      </>
      )}

      {/* Mobile Bottom Navigation */}
      <MobileNav activePage={activePage} onNavigate={handleNavigate} isOwner={dashboardData.user?.isOwner !== false} />

      {/* Bottom spacing handled by pb-[80px] on bottom row */}

      {/* Daily Revenue Modal */}
      <DailyRevenueModal
        isOpen={showDailyRevenue}
        onClose={() => setShowDailyRevenue(false)}
        existingEntries={dashboardData.formData?.daily_revenue || {}}
        onSave={(dateStr, amount) => {
          const formData = dashboardData.formData || {};
          const dailyRevenue = { ...(formData.daily_revenue || {}), [dateStr]: amount };
          updateDashboardData({ ...formData, daily_revenue: dailyRevenue });
          setShowDailyRevenue(false);
        }}
      />

      {/* Onboarding Edit Modal */}
      {showOnboarding && (
        <div className="fixed inset-0 z-100 bg-black/60 backdrop-blur-sm">
          {window.matchMedia('(max-width: 767px)').matches ? (
            <MobileOnboarding
              onClose={() => setShowOnboarding(false)}
              onComplete={() => setShowOnboarding(false)}
              isEditing
            />
          ) : (
            <OnboardingForm
              onClose={() => setShowOnboarding(false)}
              onComplete={() => setShowOnboarding(false)}
              isEditing
            />
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
