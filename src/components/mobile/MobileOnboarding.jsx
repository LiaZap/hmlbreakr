import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onboardingQuestions } from '../../data/onboardingQuestions';
import { useDashboard } from '../../context/DashboardContext';
import { formatCurrency } from '../../utils/onboardingCalculations';
import MobileStepRenderer from './MobileStepRenderer';
import MobileRegistration from './MobileRegistration';

const MobileOnboarding = ({ onClose, onComplete, isEditing }) => {
  const { dashboardData, updateDashboardData } = useDashboard();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState({});
  const [direction, setDirection] = useState(1);
  const [showRegistration, setShowRegistration] = useState(false);
  const [registrationDone, setRegistrationDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalSteps = onboardingQuestions.length;
  const currentQuestion = onboardingQuestions[currentStepIndex];

  // Load formData only once on mount — never overwrite in-progress edits from context updates
  useEffect(() => {
    if (dashboardData?.formData && Object.keys(dashboardData.formData).length > 0) {
      setFormData(dashboardData.formData);
    }
    if (!isEditing && dashboardData && !dashboardData._hasCredentials && !registrationDone) {
      setShowRegistration(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On initial mount, resume from the last step that was filled
  useEffect(() => {
    if (!isEditing && dashboardData?.formData && Object.keys(dashboardData.formData).length > 0) {
      const fd = dashboardData.formData;
      const firstEmpty = onboardingQuestions.findIndex(q => {
        const val = fd[q.id];
        if (val === undefined || val === null) return true;
        if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) return true;
        return false;
      });
      if (firstEmpty > 0) setCurrentStepIndex(firstEmpty);
      else if (firstEmpty === -1) setCurrentStepIndex(onboardingQuestions.length - 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fill defaultValues for composite steps
  useEffect(() => {
    if (!currentQuestion || currentQuestion.type !== 'composite') return;
    const stepData = formData[currentQuestion.id] || {};
    let updated = false;
    const newStepData = { ...stepData };

    currentQuestion.fields.forEach(field => {
      if (field.defaultValue && !stepData[field.id]) {
        newStepData[field.id] = field.defaultValue;
        updated = true;
      }
    });

    if (updated) {
      setFormData(prev => ({ ...prev, [currentQuestion.id]: newStepData }));
    }
  }, [currentStepIndex]);

  // Composite field change
  const handleCompositeChange = useCallback((parentId, fieldId, value, type) => {
    setFormData(prev => {
      const step = { ...(prev[parentId] || {}) };
      step[fieldId] = type === 'currency' ? formatCurrency(value) : value;
      return { ...prev, [parentId]: step };
    });
  }, []);

  // Dynamic list item field change
  const handleGroupChange = useCallback((questionId, index, fieldId, value, type) => {
    setFormData(prev => {
      const items = [...(prev[questionId] || [])];
      items[index] = { ...items[index], [fieldId]: type === 'currency' ? formatCurrency(value) : value };
      return { ...prev, [questionId]: items };
    });
  }, []);

  // Add dynamic item
  const handleAddItem = useCallback((questionId) => {
    const question = onboardingQuestions.find(q => q.id === questionId);
    let newItem = {};

    if (question?.fields) {
      question.fields.forEach(f => { if (f.defaultValue) newItem[f.id] = f.defaultValue; });
    }

    // Auto-fill month for revenue_history
    if (questionId === 'revenue_history') {
      setFormData(prev => {
        const existing = prev[questionId] || [];
        const now = new Date();
        const d = new Date(now.getFullYear(), now.getMonth() - 1 - existing.length, 1);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return { ...prev, [questionId]: [...existing, { month: `${mm}/${yyyy}` }] };
      });
      return;
    }

    setFormData(prev => ({
      ...prev,
      [questionId]: [...(prev[questionId] || []), newItem]
    }));
  }, []);

  // Remove dynamic item
  const handleRemoveItem = useCallback((questionId, index) => {
    setFormData(prev => {
      const items = [...(prev[questionId] || [])];
      items.splice(index, 1);
      return { ...prev, [questionId]: items };
    });
  }, []);

  // Navigate forward
  const handleContinue = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await updateDashboardData(formData);
    } catch (e) {
      console.error('Auto-save error:', e);
    }

    if (currentStepIndex < totalSteps - 1) {
      setDirection(1);
      setCurrentStepIndex(prev => prev + 1);
    } else {
      // Last step — mark onboarding complete and close
      const completedFormData = { ...formData, onboarding_completed: true };
      await updateDashboardData(completedFormData);
      if (onComplete) onComplete(completedFormData);
    }
    setIsSubmitting(false);
  };

  // In edit mode, save current step's data before closing
  const handleClose = () => {
    if (isEditing && Object.keys(formData).length > 0) {
      updateDashboardData(formData);
    }
    onClose?.();
  };

  // Navigate back
  const handleBack = () => {
    if (showRegistration) {
      // Registration is mandatory — cannot go back to skip it
      return;
    }
    if (currentStepIndex > 0) {
      setDirection(-1);
      setCurrentStepIndex(prev => prev - 1);
    } else {
      handleClose();
    }
  };

  const progressPercent = ((currentStepIndex + 1) / totalSteps) * 100;

  const slideVariants = {
    enter: (dir) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
  };

  return (
    <div className="fixed inset-0 bg-[#1D1D1D] flex flex-col z-50" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* Top Bar */}
      <div className="shrink-0 px-4 pt-3 pb-2">
        {/* Progress Bar */}
        <div className="h-[3px] bg-[#2A2A2C] rounded-full mb-3 overflow-hidden">
          <motion.div
            className="h-full bg-[#F5A623] rounded-full"
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Step Info */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-[#868686]">
              Passo {currentStepIndex + 1} de {totalSteps}
            </div>
            {!showRegistration && (
              <div className="text-[10px] text-[#555]">{currentQuestion?.section}</div>
            )}
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2A2A2C] active:bg-[#333]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#868686" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <AnimatePresence mode="wait" custom={direction}>
          {showRegistration ? (
            <motion.div
              key="registration"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
              className="pt-4"
            >
              <MobileRegistration
                hash={dashboardData?.hash || new URLSearchParams(window.location.search).get('hash')}
                onComplete={() => {
                  setRegistrationDone(true);
                  setShowRegistration(false);
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key={currentQuestion?.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
              className="pt-2"
            >
              {/* Step Header */}
              <h2 className="text-[20px] font-bold text-white mb-1">{currentQuestion?.title}</h2>
              <p className="text-[13px] text-[#868686] mb-5">{currentQuestion?.description}</p>

              {/* Step Content */}
              <MobileStepRenderer
                question={currentQuestion}
                formData={formData}
                onCompositeChange={handleCompositeChange}
                onGroupChange={handleGroupChange}
                onAddItem={handleAddItem}
                onRemoveItem={handleRemoveItem}
                globalData={formData}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Navigation */}
      {!showRegistration && (
        <div className="shrink-0 px-4 py-3 bg-[#1D1D1D] border-t border-white/5">
          <div className="flex items-center gap-3">
            {isEditing ? (
              <button
                onClick={handleClose}
                className="min-h-[48px] px-5 rounded-full border border-[#F5A623]/40 text-[#F5A623] text-[14px] font-medium active:bg-[#F5A623]/10"
              >
                Salvar e Fechar
              </button>
            ) : (
              <button
                onClick={handleBack}
                className="min-h-[48px] px-5 rounded-full border border-white/10 text-white text-[14px] font-medium active:bg-white/5"
              >
                {currentStepIndex === 0 ? 'Cancelar' : 'Voltar'}
              </button>
            )}
            <button
              onClick={handleContinue}
              disabled={isSubmitting}
              className="flex-1 min-h-[48px] bg-[#F5A623] rounded-full text-black text-[15px] font-bold flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  {currentStepIndex === totalSteps - 1
                    ? (isEditing ? 'Salvar' : 'Finalizar')
                    : 'Continuar'}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileOnboarding;
