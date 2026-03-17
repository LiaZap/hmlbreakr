/* eslint-disable no-unused-vars */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import boltIcon from '../assets/bolt.svg';
import lockIcon from '../assets/lock.svg';
import OnboardingForm from './OnboardingForm';
import MobileOnboarding from './mobile/MobileOnboarding';
import { onboardingQuestions } from '../data/onboardingQuestions';

import { useDashboard } from '../context/DashboardContext';

const LandingPage = ({ onComplete }) => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { dashboardData } = useDashboard();
  const { restaurant, user } = dashboardData;

  return (
    <div className="relative w-full min-h-screen bg-background font-jakarta text-white select-none overflow-hidden">
      
      {/* Dark Overlay when form is open */}
      <AnimatePresence>
        {showOnboarding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-10"
          />
        )}
      </AnimatePresence>

      {/* HEADER */}
      <div className="absolute top-0 left-0 right-0 h-[64px] md:h-[113px] border-b border-white/10">
        {/* Left - Logo + Restaurant */}
        <div className="absolute left-4 md:left-10 top-[10px] md:top-[14px] flex items-center gap-2 md:gap-5">
          {/* Breakr Logo */}
          <div className="w-[40px] h-[40px] md:w-[47px] md:h-[47px] bg-black rounded-[12px] md:rounded-[15px] flex items-center justify-center">
            <img src={boltIcon} alt="Breakr" className="w-[18px] md:w-[21px]" />
          </div>

          {/* Restaurant Info */}
          <div className="flex items-center gap-[6px]">
            {restaurant.logo ? (
            <div className="w-[36px] h-[36px] md:w-[46px] md:h-[46px] rounded-full overflow-hidden border border-white/10 bg-[#344036]">
              <img src={restaurant.logo} alt={restaurant.name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-[36px] h-[36px] md:w-[46px] md:h-[46px] rounded-full bg-[#344036]" />
          )}
            <div>
              <div className="font-semibold text-[12px] md:text-[14px] text-[#514F43]">{restaurant.name}</div>
              <div className="font-medium text-[9px] md:text-[10px] text-[#A39888]">{restaurant.category}</div>
            </div>
          </div>
        </div>

        {/* Right - User Profile */}
        {(user.name && user.name !== "Usuário") && (
            <div className="absolute right-4 md:right-[55px] top-[12px] md:top-[28px] flex items-center gap-2 md:gap-[11px]">
            <div className="w-[36px] h-[36px] md:w-[46px] md:h-[46px] rounded-full bg-[#FDD688] flex items-center justify-center overflow-hidden">
                {user.photo ? (
                  <img src={user.photo} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-semibold text-[12px] md:text-[14px] text-black">{user.initials}</span>
                )}
            </div>
            <div className="hidden sm:block">
                <div className="font-medium text-[14px] text-white">{user.name}</div>
                <div className="font-medium text-[10px] text-[#A0A0A0]">{user.role}</div>
            </div>
            </div>
        )}
      </div>

      {/* MAIN CONTENT - Responsive Grid */}
      <div className="pt-[80px] md:pt-[140px] px-5 md:px-10 h-full flex flex-col md:block">
        <div className="flex flex-col md:flex-row items-start gap-6 md:gap-8 max-w-[1400px] mx-auto flex-1">

          {/* LEFT COLUMN */}
          <div className="shrink-0 w-full md:w-[320px] flex flex-col md:block">
            {/* Circles Row */}
            <div className="flex items-center gap-4 md:gap-[22px] mb-5 md:mb-[25px]">
              {/* Yellow Circle */}
              <div
                className="w-[44px] h-[44px] md:w-[50px] md:h-[50px] bg-[#FFC100] flex items-center justify-center"
                style={{ borderRadius: '60.99px 60.99px 60.99px 10px' }}
              >
                <img src={boltIcon} alt="Bolt" className="w-[18px] h-[18px] md:w-[21px] md:h-[21px]" />
              </div>

              {/* Locked Circle 1 */}
              <div className="w-[44px] h-[44px] md:w-[55px] md:h-[54px] rounded-full border border-white/15 flex items-center justify-center">
                <img src={lockIcon} alt="Lock" className="w-[16px] h-[16px] md:w-[20px] md:h-[20px] opacity-40" />
              </div>

              {/* Locked Circle 2 */}
              <div className="w-[44px] h-[44px] md:w-[55px] md:h-[54px] rounded-full border border-white/15 flex items-center justify-center">
                <img src={lockIcon} alt="Lock" className="w-[16px] h-[16px] md:w-[20px] md:h-[20px] opacity-40" />
              </div>

              {/* Step indicator - mobile only */}
              <div className="ml-auto flex items-center gap-1.5 md:hidden">
                <div className="w-2 h-2 rounded-full bg-[#FFC100]" />
                <div className="w-2 h-2 rounded-full bg-white/10" />
                <div className="w-2 h-2 rounded-full bg-white/10" />
              </div>
            </div>

            {/* Welcome Text */}
            <div className="mb-8 md:mb-[80px]">
              <p className="font-semibold text-[20px] md:text-[29px] leading-[28px] md:leading-[38px] text-white">
                Bem-vindo à Revolução Breakr. Em até 40 dias, seu restaurante <span className="font-bold text-[#FFC100]">lucrando mais</span>, usando melhor o faturamento que você já tem hoje.
              </p>
            </div>

            {/* Mobile Card Preview */}
            <div className="md:hidden mb-6">
              <button
                onClick={() => setShowOnboarding(true)}
                className="w-full bg-[#1D1D1D] border border-white/5 rounded-[16px] p-5 text-left active:bg-[#252525] transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
                      <path d="M10 8.5H14M10.3 12H13.7M12 15.5V16.5M12 7.5V8.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div>
                    <div className="text-[11px] text-white/50 font-medium">Finanças & Custos</div>
                    <div className="text-[9px] text-white/30">1/{onboardingQuestions.length} etapas</div>
                  </div>
                  <div className="ml-auto px-2 py-1 bg-white/5 rounded-md">
                    <span className="text-[9px] text-white/50 font-medium">10%</span>
                  </div>
                </div>
                <p className="text-[13px] text-white/40 leading-[18px] mb-4">
                  Hora de entendermos quanto você tem de custos visíveis e invisíveis.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#FFC100] font-semibold">Iniciar →</span>
                </div>
              </button>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-8">
              {!showOnboarding && (
                <motion.button
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0, x: 100 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => setShowOnboarding(true)}
                  className="flex items-center justify-center gap-[17px] w-full md:w-[192px] h-[52px] md:h-[57px] bg-[#FFC100] rounded-full hover:opacity-90 transition-opacity active:scale-[0.98]"
                  style={{ padding: '16px 16px 16px 23px' }}
                >
                <span className="font-semibold text-[14px] text-black whitespace-nowrap">Começar Desafio</span>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M6.75 3.75L12 9L6.75 14.25" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </motion.button>
              )}
            </div>
          </div>

          {/* CENTER - Video Card — temporarily hidden until client records new video */}
          {/*
          <div className="shrink-0 w-[346px] h-[529px] bg-black rounded-[14px] relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <button className="w-[60px] h-[60px] rounded-full border-2 border-white/30 flex items-center justify-center hover:border-white/50 transition-colors bg-transparent">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M8 5L19 12L8 19V5Z" fill="white"/>
                </svg>
              </button>
            </div>
            <div className="absolute top-8 right-6 font-semibold text-[12px] text-white">0:40</div>
            <div className="absolute bottom-8 left-8">
              <div className="font-semibold text-[12px] text-white mb-[3px]">Gustavo Aqui!</div>
              <div className="font-normal text-[12px] text-white">Antes de começar, um papinho</div>
            </div>
          </div>
          */}

          {/* RIGHT - Cards Container (hidden on mobile) */}
          <div className="relative shrink-0 hidden md:block">
            {/* Main Card */}
            <div 
              className="w-[349px] h-[506px] bg-[#1D1D1D] rounded-[10px] relative cursor-pointer hover:bg-[#252525] transition-colors"
              onClick={() => setShowOnboarding(true)}
            >
              {/* Badge */}
              <div className="absolute top-[50px] right-[29px] px-2 py-2 bg-white/5 rounded-[6px]">
                <span className="font-semibold text-[10px] text-white/75">10% Completo</span>
              </div>

              {/* Icon Circle */}
              <div className="absolute top-[38px] left-[39px] w-[53px] h-[53px] bg-white/5 rounded-full flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5"/>
                  <path d="M10 8.5H14M10.3 12H13.7M12 15.5V16.5M12 7.5V8.5" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>

              {/* Label */}
              <div className="absolute top-[110px] left-[39px] font-semibold text-[12px] text-white/50">
                Finanças & Custos
              </div>

              {/* Title */}
              <div className="absolute top-[132px] left-[39px] w-[191px] font-semibold text-[25px] leading-[107%] text-white/80">
                Vamos falar de custos, faturamento e despesas?
              </div>

              {/* Description */}
              <div className="absolute top-[270px] left-[39px] w-[181px] font-medium text-[13px] leading-[16px] text-white/55">
                Hora de entendermos quanto você tem de custos visíveis e invisíveis.
              </div>

              {/* Lock Icon */}
              <div className="absolute top-[270px] right-10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 14.5V16.5M7.5 10.5V7.5C7.5 5.01 9.51 3 12 3C14.49 3 16.5 5.01 16.5 7.5V10.5M7.875 21H16.125C17.16 21 18 20.16 18 19.125V12.375C18 11.34 17.16 10.5 16.125 10.5H7.875C6.84 10.5 6 11.34 6 12.375V19.125C6 20.16 6.84 21 7.875 21Z" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>

              {/* Footer */}
              <div className="absolute bottom-[62px] left-10 font-semibold text-[12px] text-[#F5F2ED] cursor-pointer hover:opacity-80">
                Iniciar
              </div>
              <div className="absolute bottom-[62px] right-10 font-semibold text-[12px] text-[#F5F2ED]">
                1/{onboardingQuestions.length}
              </div>
            </div>

            {/* Blurred Card (behind) */}
            <div 
              className="absolute top-[10px] left-[360px] w-[330px] h-[479px] bg-[#212121] rounded-[14px] opacity-25"
              style={{ filter: 'blur(2px)' }}
            >
              {/* Icon */}
              <div className="absolute top-[30px] right-[30px] w-[50px] h-[50px] bg-white/5 rounded-full flex items-center justify-center">
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5"/>
                </svg>
              </div>

              {/* Dia 01 Badge */}
              <div className="absolute top-[110px] left-10 px-4 py-2 bg-white rounded-full">
                <span className="font-semibold text-[11px] text-black">Dia 01</span>
              </div>

              {/* Title */}
              <div className="absolute top-[152px] left-11 w-[181px] font-semibold text-[24px] leading-[30px] text-white/80">
                Vamos falar de custos, faturamento e despesas?
              </div>

              {/* Description */}
              <div className="absolute top-[282px] left-11 w-[171px] font-medium text-[13px] leading-[17px] text-white/55">
                Hora de entendermos quanto você tem de custos visíveis e invisíveis.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Onboarding Form */}
      {showOnboarding && (
        <div className="fixed inset-0 z-20">
          {window.matchMedia('(max-width: 767px)').matches ? (
            <MobileOnboarding
              onClose={() => setShowOnboarding(false)}
              onComplete={() => {
                setShowOnboarding(false);
                if (onComplete) onComplete();
              }}
            />
          ) : (
            <OnboardingForm
              onClose={() => setShowOnboarding(false)}
              onComplete={() => {
                setShowOnboarding(false);
                if (onComplete) onComplete();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default LandingPage;
