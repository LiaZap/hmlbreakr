import React, { useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import Sidebar from './dashboard/Sidebar';
import DashboardHeader from './dashboard/DashboardHeader';
import FinanceOverview from './dashboard/FinanceOverview';
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
import MobileNav from './dashboard/MobileNav';
import OnboardingForm from './OnboardingForm';

const Dashboard = () => {
  /* MOVED TO CONTEXT */
  const { dashboardData, updateDashboardData } = useDashboard();
  const [activePage, setActivePage] = useState('home');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showDailyRevenue, setShowDailyRevenue] = useState(false);

  const handleNavigate = (page) => {
    if (page === 'editOnboarding') {
      setShowOnboarding(true);
    } else {
      setActivePage(page);
    }
  };

  return (
    <div className="relative w-full min-h-screen bg-[#1B1B1D] font-jakarta text-white select-none overflow-x-hidden overflow-y-auto">
      
      <Sidebar activePage={activePage} onNavigate={handleNavigate} isOwner={dashboardData.user?.isOwner !== false} />

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
      ) : (
      <>
      {/* MAIN CONTENT - Full-width black background */}
      <div className="w-full bg-[#101010]">
      <div className="ml-0 md:ml-[85px] py-2 pb-6">
        <div className="w-full px-3 md:px-6 2xl:px-10 flex flex-col min-h-0">
        
        <DashboardHeader data={dashboardData} />

        {/* MAIN GRID - 4 columns layout (responsive fluid) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 xl:gap-6 mb-0 min-h-0">
          
          {/* COL 1 - Left Panel */}
          <div className="flex flex-col h-full py-2">
            
            {/* 1. Header Small */}
            <div className="mb-8">
              <span className="block font-bold text-[14px] text-white leading-tight">Dashboard</span>
              <span className="block font-normal text-[11px] text-[#595959] leading-tight">Painel de Controle</span>
            </div>

            {/* 2. Date & Status Row */}
            <div className="flex items-center gap-5 mb-8">
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
            <div className="mb-4 pr-4">
              <h1 className="text-[22px] md:text-[28px] leading-[1.15] tracking-tight mb-3">
                <span className="font-bold text-[#FF9406]">{dashboardData.restaurant.name}</span>
                <span className="font-medium text-[#E1E1E1]">, como <br className="hidden md:inline"/>você nunca viu antes</span>
              </h1>
              <p className="font-normal text-[12px] text-[#888] leading-snug w-full max-w-[280px]">
                {dashboardData.overview.subtitle}
              </p>
            </div>

            {/* 4. Pills Grid (Responsive) */}
            <div className="flex flex-wrap gap-2 mb-auto mt-4">
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
          <div>
            <FinanceOverview data={dashboardData.revenue} onUpdateRevenue={(monthIdx, value) => {
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
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex flex-col gap-[2px]">
                <span className="font-semibold text-[11px] text-[#CACACA]">Ponto de Equilíbrio</span>
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4C4C4" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                <span className="text-[11px] text-[#999] font-medium">{dashboardData.breakEven.estimatedDate}</span>
                <span className={`w-2 h-2 rounded-full ${dashboardData.breakEven.reachedBreakEven ? 'bg-[#E2FD89]' : 'bg-[#FD8989]'}`} />
              </div>
            </div>

            {/* Gauge Chart */}
            <div className="w-full mb-2">
              {dashboardData.breakEven.hasCmvData ? (
                <BreakEvenGraphic
                  percentage={dashboardData.breakEven.percentage}
                  value={`R$ ${dashboardData.breakEven.current}`}
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

            {/* Dynamic day prediction message */}
            <div className="flex items-start gap-[7px] mb-3">
              <div className="w-10 h-10 rounded-[16px] bg-[#1B1B1D] flex items-center justify-center flex-shrink-0">
                {/* solar:cup-first-outline */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6.5 4h11v6a5.5 5.5 0 0 1-11 0V4z"/>
                  <path d="M17.5 7H19a2 2 0 0 1 0 4h-1.5"/>
                  <path d="M6.5 7H5a2 2 0 0 0 0 4h1.5"/>
                  <path d="M9 16h6"/>
                  <path d="M12 16v4"/>
                  <path d="M8 20h8"/>
                </svg>
              </div>
              <p className="font-semibold text-[10px] leading-[13px] text-[#CBCBCB] pt-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {dashboardData.breakEven.estimatedDay > 0 ? (
                  <>
                    A partir do dia <span className="text-white font-bold">{dashboardData.breakEven.estimatedDay}</span>, cada venda tende a virar sobra real. Seu objetivo é baixar esse dia sem comprometer qualidade.
                  </>
                ) : (
                  'Preencha seus dados para calcular a previsão do ponto de equilíbrio.'
                )}
              </p>
            </div>

            {/* Base Info Box */}
            <div className="p-4 bg-[#FF9406] rounded-[14px] flex flex-col items-center justify-center text-center">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-[11px] text-black">Base</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 16v-4M12 8h.01"/>
                  </svg>
                </div>
                <span className="px-2.5 py-0.5 bg-black/15 rounded-full text-[9px] font-medium text-black flex items-center gap-1">
                  {dashboardData.breakEven.base.status}
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.5 5.5H19l-4.5 3.5L16 17.5 12 14l-4 3.5L9.5 12 5 8.5h5.5z"/>
                  </svg>
                </span>
              </div>
              <span className="font-bold text-[28px] text-black leading-none mb-1">{dashboardData.breakEven.base.value}</span>
              <p className="font-medium text-[10px] text-black/60">Faixa saudável: 40 a 45</p>
            </div>
          </div>

          {/* COL 4 - Comparativo de mercado (REMOVED) */}
        </div>
        </div>
      </div>
      </div>

      {/* BOTTOM ROW - Cards (full-width bg) */}
      <div className="pl-3 md:pl-[85px] pr-3 md:pr-6 py-6 w-full">
        <div className="w-full px-3 md:px-0 2xl:px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <MoneyOnTable data={dashboardData.cards.moneyOnTable} />
            <TechnicalSheets data={dashboardData.cards.technicalSheets} />
            <CostStructure data={dashboardData.cards.costStructure} />
          </div>
        </div>
      </div>
      </>
      )}

      {/* Mobile Bottom Navigation */}
      <MobileNav activePage={activePage} onNavigate={handleNavigate} isOwner={dashboardData.user?.isOwner !== false} />

      {/* Bottom spacing for mobile nav */}
      <div className="h-[70px] md:hidden" />

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
          <OnboardingForm
            onClose={() => setShowOnboarding(false)}
            onComplete={() => setShowOnboarding(false)}
            isEditing
          />
        </div>
      )}
    </div>
  );
};

export default Dashboard;
