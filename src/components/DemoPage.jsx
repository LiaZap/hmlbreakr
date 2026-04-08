import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import OnboardingForm from './OnboardingForm';
import MobileOnboarding from './mobile/MobileOnboarding';
import { DashboardContext } from '../context/DashboardContext';

// Standalone demo page — no auth, no API, all local state
const DemoPage = () => {
  const [formData, setFormData] = useState({});
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [completed, setCompleted] = useState(false);
  const isMobile = window.matchMedia('(max-width: 767px)').matches;

  const handleUpdate = (data) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const handleComplete = (data) => {
    setFormData(prev => ({ ...prev, ...data }));
    setShowOnboarding(false);
    setCompleted(true);
  };

  // Inject demo context overrides into window so OnboardingForm/MobileOnboarding
  // can read formData without a real DashboardContext
  // We wrap with a local DashboardProvider override via prop drilling
  return (
    <div className="relative w-full min-h-screen bg-[#101010] font-jakarta text-white select-none overflow-hidden flex flex-col">

      {/* Demo Banner */}
      <div className="w-full bg-[#F5A623]/15 border-b border-[#F5A623]/30 px-4 py-2 flex items-center justify-center gap-2 shrink-0">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-[11px] font-semibold text-[#F5A623]">Modo Demo</span>
        <span className="text-[11px] text-[#F5A623]/70">— seus dados não são salvos</span>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        {!completed ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md text-center"
          >
            {/* Logo */}
            <div className="w-[56px] h-[56px] bg-[#1B1B1D] border border-[#2A2A2C] rounded-[16px] flex items-center justify-center mx-auto mb-6">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <h1 className="text-[26px] font-bold text-white mb-2 leading-tight">
              Veja o <span className="text-[#F5A623]">Breakr</span> em ação
            </h1>
            <p className="text-[13px] text-[#868686] mb-8 leading-relaxed">
              Preencha os dados do seu restaurante e veja seu painel financeiro completo. Nenhuma conta necessária.
            </p>

            <div className="flex flex-col gap-3 mb-8">
              {[
                'DRE automático com seus números reais',
                'Ponto de equilíbrio calculado em tempo real',
                'CMV, BASE e Margem de Contribuição',
                'Dinheiro na mesa identificado',
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 text-left px-4 py-3 bg-[#1B1B1D] border border-[#2A2A2C] rounded-[12px]">
                  <div className="w-5 h-5 rounded-full bg-[#00B37E]/15 flex items-center justify-center shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="#00B37E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="text-[12px] text-[#C8C8C8]">{item}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowOnboarding(true)}
              className="w-full min-h-[52px] bg-[#F5A623] rounded-full text-black font-bold text-[15px] flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all"
            >
              Começar agora — é grátis
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md text-center"
          >
            <div className="w-16 h-16 rounded-full bg-[#00B37E]/15 border border-[#00B37E]/30 flex items-center justify-center mx-auto mb-6">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" stroke="#00B37E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <h2 className="text-[24px] font-bold text-white mb-2">Seu painel está pronto!</h2>
            <p className="text-[13px] text-[#868686] mb-8 leading-relaxed">
              Crie sua conta para salvar seus dados, acessar o dashboard completo e acompanhar sua evolução mês a mês.
            </p>

            <a
              href="mailto:contato@breakr.com.br?subject=Quero criar minha conta&body=Olá! Fiz o demo e quero criar minha conta no Breakr."
              className="block w-full min-h-[52px] bg-[#F5A623] rounded-full text-black font-bold text-[15px] flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all mb-3"
            >
              Criar minha conta
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>

            <button
              onClick={() => { setCompleted(false); setShowOnboarding(true); }}
              className="w-full text-[12px] text-[#555] hover:text-[#868686] py-2"
            >
              Refazer o demo
            </button>
          </motion.div>
        )}
      </div>

      {/* Onboarding Modal */}
      <AnimatePresence>
        {showOnboarding && (
          <div className="fixed inset-0 z-50">
            <DemoOnboardingWrapper
              formData={formData}
              onUpdate={handleUpdate}
              onComplete={handleComplete}
              onClose={() => setShowOnboarding(false)}
              isMobile={isMobile}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Wraps the onboarding with a fake DashboardContext so it works standalone
const DemoOnboardingWrapper = ({ formData, onUpdate, onComplete, onClose, isMobile }) => {
  const [localData, setLocalData] = useState({ formData, _hasCredentials: true });

  const mockContext = {
    dashboardData: localData,
    updateDashboardData: async (data) => {
      const merged = { ...localData, formData: { ...localData.formData, ...data } };
      setLocalData(merged);
      onUpdate(data);
    },
    clientDataLoaded: true,
    clientDataError: null,
    setSelectedMonthIndex: () => {},
  };

  return (
    <DashboardContext.Provider value={mockContext}>
      {isMobile ? (
        <MobileOnboarding
          onClose={onClose}
          onComplete={(data) => onComplete(data)}
          isEditing={false}
        />
      ) : (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <OnboardingForm
            onClose={onClose}
            onComplete={(data) => onComplete(data)}
            isEditing={false}
          />
        </div>
      )}
    </DashboardContext.Provider>
  );
};

export default DemoPage;
