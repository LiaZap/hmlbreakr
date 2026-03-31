/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onboardingQuestions } from '../data/onboardingQuestions';
import { useDashboard } from '../context/DashboardContext';



const ImageCropModal = ({ src, onConfirm, onClose }) => {
    const canvasRef = useRef(null);
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const imageRef = useRef(null);

    const handleConfirm = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const size = 300; // Target size
        
        // Final export canvas
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = size;
        exportCanvas.height = size;
        const eCtx = exportCanvas.getContext('2d');
        
        // Draw the current state of the main canvas into the export canvas
        eCtx.drawImage(canvas, 0, 0, size, size);
        onConfirm(exportCanvas.toDataURL('image/png'));
    };

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imageRef.current) return;
        const ctx = canvas.getContext('2d');
        const size = 300;
        canvas.width = size;
        canvas.height = size;

        ctx.clearRect(0, 0, size, size);
        
        const img = imageRef.current;
        const scale = Math.max(size / img.width, size / img.height) * zoom;
        const w = img.width * scale;
        const h = img.height * scale;
        
        const x = (size - w) / 2 + offset.x;
        const y = (size - h) / 2 + offset.y;

        // Draw image
        ctx.save();
        // Circular clipping
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();
        
        ctx.drawImage(img, x, y, w, h);
        ctx.restore();

        // Overlay guide
        ctx.strokeStyle = '#FFC100';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
        ctx.stroke();
    }, [zoom, offset]);

    useEffect(() => {
        const img = new Image();
        img.src = src;
        img.onload = () => {
            imageRef.current = img;
            draw();
        };
    }, [src, draw]);

    const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };

    const handleMouseUp = () => setIsDragging(false);

    return (
        <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/80 backdrop-blur-md">
            <div className="bg-[#1A1A1A] p-8 rounded-3xl border border-[#333] flex flex-col items-center gap-6 max-w-[400px] w-full">
                <h3 className="text-white font-bold text-xl font-['Plus_Jakarta_Sans']">Ajustar Imagem</h3>
                <div 
                    className="relative cursor-move rounded-full overflow-hidden shadow-2xl border-4 border-[#333]"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <canvas ref={canvasRef} />
                </div>
                <div className="w-full flex flex-col gap-2">
                    <label className="text-white/50 text-xs font-medium">ZOOM</label>
                    <input 
                        type="range" min="1" max="3" step="0.1" 
                        value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))}
                        className="w-full accent-[#FFC100]"
                    />
                </div>
                <div className="flex gap-4 w-full mt-4">
                    <button onClick={onClose} className="flex-1 py-3 text-white/50 font-bold hover:text-white transition-colors">CANCELAR</button>
                    <button onClick={handleConfirm} className="flex-1 py-3 bg-[#FFC100] text-black font-bold rounded-xl hover:bg-[#FFD600] transition-colors">CONFIRMAR</button>
                </div>
            </div>
        </div>
    );
};

const AutocompleteField = ({ field, value, onChange }) => {
    const [searchTerm, setSearchTerm] = useState(value || '');
    const [isOpen, setIsOpen] = useState(false);
    
    useEffect(() => {
        setSearchTerm(value || '');
    }, [value]);

    // Helper to normalize strings (remove accents and make lowercase)
    const normalizeStr = (str) => 
        str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';

    const filteredOptions = field.options.filter(opt => 
        normalizeStr(opt).includes(normalizeStr(searchTerm))
    );

    return (
        <div className="relative">
            <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    onChange(e.target.value);
                    setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                placeholder={field.placeholder}
                className="font-['Plus_Jakarta_Sans'] font-medium bg-transparent border-b border-[#333333] focus:border-white outline-none pb-2 transition-colors w-full"
                style={{ fontSize: '18px', color: 'rgba(255, 255, 255, 0.9)' }}
            />
            <AnimatePresence>
                {isOpen && filteredOptions.length > 0 && (
                    <motion.div 
                        initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                        className="absolute z-10 w-full mt-2 bg-[#1A1A1A] border border-[#333] rounded-lg shadow-xl max-h-48 overflow-y-auto"
                    >
                        {filteredOptions.map(opt => (
                            <div
                                key={opt}
                                className="p-3 text-[14px] text-white/80 hover:bg-[#FFC100] hover:text-black cursor-pointer transition-colors"
                                onClick={() => {
                                    setSearchTerm(opt);
                                    onChange(opt);
                                    setIsOpen(false);
                                }}
                            >
                                {opt}
                            </div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const API_URL = import.meta.env.VITE_API_URL || '';

const OnboardingForm = ({ onClose = () => {}, onComplete = () => {}, isEditing = false }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState({});
  const [direction, setDirection] = useState(0);
  const [showRegistration, setShowRegistration] = useState(false);
  const [registrationDone, setRegistrationDone] = useState(false);
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [cropSource, setCropSource] = useState(null);
  const [cropTarget, setCropTarget] = useState(null);

  const currentQuestion = onboardingQuestions[currentStepIndex];
  const totalSteps = onboardingQuestions.length;
  const totalWithReg = isEditing ? totalSteps : totalSteps + 1;
  const progress = showRegistration
    ? (1 / totalWithReg) * 100
    : ((currentStepIndex + (registrationDone ? 2 : 1)) / totalWithReg) * 100;

  // Format currency helper
  const formatCurrency = (value) => {
    if (!value) return '';
    const numbers = value.replace(/\D/g, '');
    if (!numbers) return '';
    const number = parseInt(numbers) / 100;
    return number.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };

  const handleInputChange = (id, value, type = 'text') => {
    let formattedValue = value;
    if (type === 'currency' || type === 'currency_period') {
        // Remove currency symbol for standard input handling if needed, 
        // strictly speaking we usually store raw numbers or keep formatted string.
        // Let's keep formatted string for UI consistency as per previous implementation logic
        formattedValue = formatCurrency(value);
    }
    
    setFormData(prev => ({
      ...prev,
      [id]: formattedValue
    }));
  };

  const handleCompositeChange = (parentId, fieldId, value, type) => {
     let formattedValue = value;
     if (type === 'currency') formattedValue = formatCurrency(value);

     setFormData(prev => ({
       ...prev,
       [parentId]: {
         ...(prev[parentId] || {}),
         [fieldId]: formattedValue
       }
     }));
  };

  // Handler for group list (e.g. Partners, Employees) using an array in formData
  const handleGroupChange = (questionId, index, fieldId, value, type) => {
      let formattedValue = value;
      if (type === 'currency') {
          formattedValue = formatCurrency(value);
      } else if (fieldId === 'month') {
          // Format MM/AAAA
          let val = value.replace(/\D/g, ''); // Remove non-digits
          if (val.length > 2) {
              val = val.substring(0, 2) + '/' + val.substring(2, 6);
          }
          formattedValue = val;
      }

      setFormData(prev => {
          const currentArray = prev[questionId] || [];
          // Ensure array has objects up to index
          const newArray = [...currentArray];
          if (!newArray[index]) newArray[index] = {};
          
          newArray[index] = {
              ...newArray[index],
              [fieldId]: formattedValue
          };
          
          return { ...prev, [questionId]: newArray };
      });
  };

  const { dashboardData, updateDashboardData } = useDashboard();

  useEffect(() => {
    if (dashboardData?.formData) {
      setFormData(dashboardData.formData);
    }
    // Show registration FIRST if client has no credentials yet (and not editing)
    if (!isEditing && dashboardData && !dashboardData._hasCredentials && !registrationDone) {
      setShowRegistration(true);
    }
  }, [dashboardData]);

  // On initial mount, resume from the last step that was filled
  useEffect(() => {
    if (!isEditing && dashboardData?.formData && Object.keys(dashboardData.formData).length > 0) {
      const fd = dashboardData.formData;
      // Find first step without data
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

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContinue = () => {
    // Auto-save on every step advance so user doesn't lose progress
    updateDashboardData(formData);
    if (currentStepIndex < totalSteps - 1) {
      setDirection(1);
      setCurrentStepIndex(prev => prev + 1);
    } else {
      // Last step — mark onboarding complete and close
      const completedFormData = { ...formData, onboarding_completed: true };
      updateDashboardData(completedFormData);
      if (onComplete) onComplete(completedFormData);
    }
  };

  const handleRegistrationSubmit = async () => {
    if (!regEmail || !regPassword || !regConfirm) {
      setRegError('Preencha todos os campos.');
      return;
    }
    if (regPassword.length < 6) {
      setRegError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (regPassword !== regConfirm) {
      setRegError('As senhas não conferem.');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const hash = params.get('hash');
    if (!hash) {
      setRegError('Hash não encontrado na URL.');
      return;
    }

    setRegLoading(true);
    setRegError('');
    try {
      const res = await fetch(`${API_URL}/api/client/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash, email: regEmail, password: regPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error || 'Erro ao registrar.');
        setRegLoading(false);
        return;
      }
      // Registration done — proceed to onboarding steps
      setRegistrationDone(true);
      setShowRegistration(false);
      setRegLoading(false);
    } catch {
      setRegError('Erro de conexão. Tente novamente.');
      setRegLoading(false);
    }
  };

  const handleBack = () => {
    if (isSubmitting) return;
    if (currentStepIndex > 0) {
      setDirection(-1);
      setCurrentStepIndex(prev => prev - 1);
    } else {
      onClose();
    }
  };

  // --- RENDER HELPERS ---

  const renderSingleInput = (question) => {
      if (question.type === 'currency' || question.type === 'text') {
          return (
            <input
              type="text"
              value={formData[question.id] || ''}
              onChange={(e) => handleInputChange(question.id, e.target.value, question.type)}
              placeholder={question.placeholder}
              className="font-['Plus_Jakarta_Sans'] font-medium bg-transparent border-b-2 border-[#333333] focus:border-white outline-none pb-3 transition-colors w-full"
              style={{
                fontSize: '24px',
                lineHeight: '32px',
                color: 'rgba(255, 255, 255, 0.9)'
              }}
              autoFocus
            />
          );
      }
      if (question.type === 'currency_period') {
          return (
              <div className="flex gap-4">
                  <input
                    type="text"
                    value={formData[question.id]?.amount || ''}
                    onChange={(e) => {
                        const val = formatCurrency(e.target.value);
                        setFormData(prev => ({
                            ...prev, 
                            [question.id]: { ...(prev[question.id] || {}), amount: val }
                        }))
                    }}
                    placeholder={question.placeholder}
                    className="flex-1 font-['Plus_Jakarta_Sans'] font-medium bg-transparent border-b-2 border-[#333333] focus:border-white outline-none pb-3 transition-colors"
                    style={{ fontSize: '24px', color: 'rgba(255, 255, 255, 0.9)' }}
                  />
                  <select 
                     className="bg-[#333] text-white rounded px-3 py-2 outline-none border-none"
                     onChange={(e) => {
                        setFormData(prev => ({
                            ...prev, 
                            [question.id]: { ...(prev[question.id] || {}), period: e.target.value }
                        }))
                     }}
                     value={formData[question.id]?.period || 'Mensal'}
                  >
                      <option value="Mensal">Mensal</option>
                      <option value="Anual">Anual</option>
                  </select>
              </div>
          )
      }
      return null;
  };

  const renderComposite = (question) => {
      return (
          <div className={`${question.gridLayout ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-6'}`}>
              {question.fields.map(field => {
                  // Check hidden fields
                  if (field.hidden) return null;
                  // Check visibility logic
                  if (field.dependsOn) {
                      const dependencyValue = formData[question.id]?.[field.dependsOn];
                      if (dependencyValue !== field.dependsValue) return null;
                  }
                  if (field.dependsOnGlobal) {
                      const [depQ, depF] = field.dependsOnGlobal.split('.');
                      const dependencyValue = formData[depQ]?.[depF];
                      if (dependencyValue !== field.dependsValue) return null;
                  }
                  if (field.hideIfGlobal) {
                      const [depQ, depF] = field.hideIfGlobal.field.split('.');
                      const dependencyValue = formData[depQ]?.[depF];
                      if (dependencyValue === field.hideIfGlobal.value) return null;
                  }

                  // Auto-persist defaultValue for readOnly fields that are visible but not yet saved
                  if (field.defaultValue && field.readOnly && !formData[question.id]?.[field.id]) {
                      setTimeout(() => {
                          setFormData(prev => ({
                              ...prev,
                              [question.id]: { ...(prev[question.id] || {}), [field.id]: field.defaultValue }
                          }));
                      }, 0);
                  }

                  return (
                    <div key={field.id}>
                        <label className="text-xs text-secondary mb-1 opacity-70 flex justify-between items-center">
                            {field.label}
                            {field.helpText && (
                                <div className="group relative flex items-center">
                                    <span className="text-white/50 cursor-pointer hover:text-white transition-colors text-[10px]">(?)</span>
                                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-48 p-2 bg-[#333] border border-[#444] text-white text-[10px] rounded shadow-xl z-50 text-right pointer-events-none">
                                        {field.helpText}
                                    </div>
                                </div>
                            )}
                        </label>
                        {field.type === 'select' ? (
                             <select
                                className="font-['Plus_Jakarta_Sans'] font-medium bg-transparent border-b border-[#333333] focus:border-white outline-none pb-2 transition-colors w-full text-[18px] text-[rgba(255,255,255,0.9)]"
                                value={formData[question.id]?.[field.id] || ''}
                                onChange={(e) => handleCompositeChange(question.id, field.id, e.target.value, field.type)}
                             >
                                <option value="" className="bg-[#1D1D1D]">Selecione</option>
                                {field.options && field.options.map(opt => (
                                    <option key={opt} value={opt} className="bg-[#1D1D1D]">{opt}</option>
                                ))}
                             </select>
                        ) : field.type === 'autocomplete' ? (
                            <AutocompleteField
                                field={field}
                                value={formData[question.id]?.[field.id] || ''}
                                onChange={(val) => handleCompositeChange(question.id, field.id, val, field.type)}
                            />
                        ) : field.type === 'file' ? (
                            <div className="flex items-center justify-between border-b border-[#333333] hover:border-[#FFC100] transition-colors pb-2">
                                <label className="cursor-pointer flex items-center flex-1 text-[18px] text-[rgba(255,255,255,0.9)] font-['Plus_Jakarta_Sans'] font-medium">
                                    <span className="opacity-70 hover:opacity-100 transition-opacity">
                                        {formData[question.id]?.[field.id] ? "Alterar Imagem Anexada" : field.placeholder}
                                    </span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                    setCropSource(reader.result);
                                                    setCropTarget({ questionId: question.id, fieldId: field.id });
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                </label>
                                {formData[question.id]?.[field.id] && (
                                    <div className="w-8 h-8 rounded-full bg-[#1A1A1A] overflow-hidden border border-[#333] shrink-0 ml-4">
                                        <img src={formData[question.id]?.[field.id]} alt="Preview" className="w-full h-full object-cover" />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <input
                                type="text"
                                value={formData[question.id]?.[field.id] || field.defaultValue || ''}
                                onChange={(e) => !field.readOnly && handleCompositeChange(question.id, field.id, e.target.value, field.type)}
                                placeholder={field.placeholder}
                                readOnly={field.readOnly}
                                className={`font-['Plus_Jakarta_Sans'] font-medium bg-transparent border-b border-[#333333] focus:border-white outline-none pb-2 transition-colors w-full ${field.readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
                                style={{ fontSize: '18px', color: 'rgba(255, 255, 255, 0.9)' }}
                            />
                        )}
                    </div>
                  );
              })}
              {question.infoText && (
                  <div className="mt-4 p-3 bg-[#FFC100]/10 border border-[#FFC100]/30 rounded-lg">
                      <p className="text-[#FFC100] text-xs">{question.infoText}</p>
                  </div>
              )}
          </div>
      );
  };

  const renderGroupList = (question) => {
      // Need a way to render N items. 
      // For simplicity, let's render a fixed set or allow adding. 
      // Given the design constraints, let's render `maxItems` blocks but compact.
      return (
          <div className="flex flex-col gap-6 max-h-[400px] overflow-y-auto pr-2">
              {[...Array(question.maxItems)].map((_, idx) => (
                  <div key={idx} className="p-4 bg-[#2A2A2A] rounded-lg border border-[#333]">
                      <div className="text-xs text-[#FFC100] mb-2 font-bold uppercase">{question.itemLabel} {idx + 1}</div>
                      <div className="grid grid-cols-2 gap-4">
                          {question.fields.map(field => (
                              <div key={field.id} className={field.id === 'name' ? 'col-span-2' : ''}>
                                  <label className="block text-[10px] text-gray-400 mb-1">{field.label}</label>
                                  {field.type === 'select' ? (
                                      <select
                                        className="w-full bg-[#1A1A1A] text-white text-sm p-2 rounded border border-[#444] outline-none"
                                        onChange={(e) => handleGroupChange(question.id, idx, field.id, e.target.value, field.type)}
                                        value={formData[question.id]?.[idx]?.[field.id] || ''}
                                      >
                                          <option value="">Selecione</option>
                                          {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                      </select>
                                  ) : field.type === 'file' ? (
                                      <div className="flex items-center gap-2 mt-1">
                                          <label className="cursor-pointer flex items-center justify-center bg-[#2A2A2A] border border-[#444] hover:border-[#FFC100] text-white text-xs px-3 py-1.5 rounded transition-colors w-full">
                                              <span>{formData[question.id]?.[idx]?.[field.id] ? "Alterar Foto" : field.placeholder}</span>
                                              <input
                                                  type="file"
                                                  accept="image/*"
                                                  className="hidden"
                                                  onChange={(e) => {
                                                      const file = e.target.files[0];
                                                      if (file) {
                                                          const reader = new FileReader();
                                                          reader.onloadend = () => {
                                                              handleGroupChange(question.id, idx, field.id, reader.result, field.type);
                                                          };
                                                          reader.readAsDataURL(file);
                                                      }
                                                  }}
                                              />
                                          </label>
                                          {formData[question.id]?.[idx]?.[field.id] && (
                                              <img src={formData[question.id]?.[idx]?.[field.id]} alt="Preview" className="w-6 h-6 rounded-full object-cover border border-[#444]" />
                                          )}
                                      </div>
                                  ) : (
                                      <input
                                        type="text"
                                        value={formData[question.id]?.[idx]?.[field.id] || ''}
                                        onChange={(e) => handleGroupChange(question.id, idx, field.id, e.target.value, field.type)}
                                        placeholder={field.placeholder}
                                        className="w-full bg-transparent border-b border-[#444] text-white text-sm pb-1 outline-none focus:border-[#FFC100]"
                                      />
                                  )}
                              </div>
                          ))}
                      </div>
                  </div>
              ))}
          </div>
      );
  };

  // --- CALCULATIONS ---
  const calculateProLabore = (value) => {
    if (!value) return 0;
    const num = parseFloat(value.toString().replace(/\D/g, '')) / 100;
    // Rule: Cost = ProLabore + (ProLabore * 0.11)
    return num + (num * 0.11);
  };

  const calculateCLT = (baseSalary) => {
    if (!baseSalary) return { total: 0, breakdown: [] };
    const salary = parseFloat(baseSalary.toString().replace(/\D/g, '')) / 100;
    
    // Formula items
    const fgts = salary * 0.08;
    const prov13 = salary / 12;
    const provFerias = (salary * 1.3333) / 12;
    const fgtsProv = (prov13 + provFerias) * 0.08;
    const multa = (fgts + fgtsProv) * 0.50; // 40% employee + 10% social
    const aviso = salary / 12;
    
    const total = salary + fgts + prov13 + provFerias + fgtsProv + multa + aviso;

    return {
        total,
        breakdown: [
            { item: '01', comp: 'Salário Base', formula: 'Valor Nominal', val: salary, desc: 'Valor bruto em contrato.' },
            { item: '02', comp: 'FGTS Mensal', formula: 'Salário * 0.08', val: fgts, desc: 'Depósito mensal obrigatório.' },
            { item: '03', comp: 'Provisão 13º', formula: 'Salário / 12', val: prov13, desc: 'Reserva para 13º salário.' },
            { item: '04', comp: 'Provisão Férias', formula: '(Salário * 1.3333)/12', val: provFerias, desc: 'Férias + 1/3 constitucional.' },
            { item: '05', comp: 'FGTS s/ Prov.', formula: '(13º + Férias) * 0.08', val: fgtsProv, desc: 'FGTS sobre provisões.' },
            { item: '06', comp: 'Reserva Multa', formula: '(FGTS Total) * 0.50', val: multa, desc: 'Multa rescisória (40% + 10%).' },
            { item: '07', comp: 'Aviso Prévio', formula: 'Salário / 12', val: aviso, desc: 'Provisão para indenização.' },
        ]
    };
  };

  const calculateDepreciation = (value, lifespan) => {
      if(!value || !lifespan) return 0;
      const val = parseFloat(value.toString().replace(/\D/g, '')) / 100;
      const years = parseFloat(lifespan);
      if(years <= 0) return 0;
      return val / (years * 12);
  };

  // State for CLT Help Modal
  const [showCLTHelp, setShowCLTHelp] = useState(null); // stores employee index/id or data

  // Dynamic List Handler
  const handleAddDynamicItem = (questionId) => {
      const question = onboardingQuestions.find(q => q.id === questionId);
      let newItem = {};

      // Pre-fill defaultValues from field definitions
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
  };

  const handleRemoveDynamicItem = (questionId, index) => {
      setFormData(prev => {
          const newArr = [...(prev[questionId] || [])];
          newArr.splice(index, 1);
          return { ...prev, [questionId]: newArr };
      });
  };

  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const getMonthLabel = (question, item, idx) => {
      if (question.id === 'revenue_history' && item.month) {
          const parts = item.month.split('/');
          if (parts.length === 2) {
              const monthIdx = parseInt(parts[0], 10) - 1;
              if (monthIdx >= 0 && monthIdx <= 11) {
                  return `${monthNames[monthIdx]} ${parts[1]}`;
              }
          }
      }
      return `${question.itemLabel} ${idx + 1}`;
  };

  const renderDynamicListCalc = (question) => {
      // Initialize with minItems if specified (e.g., revenue_history needs 3)
      const minItems = question.minItems || 1;
      let items = formData[question.id];
      if (!items || items.length === 0) {
          // Auto-generate items with pre-filled months for revenue_history
          if (question.id === 'revenue_history') {
              const now = new Date();
              items = Array.from({ length: minItems }, (_, i) => {
                  const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1);
                  const mm = String(d.getMonth() + 1).padStart(2, '0');
                  const yyyy = d.getFullYear();
                  return { month: `${mm}/${yyyy}` };
              });
              // Auto-set in form data
              setFormData(prev => ({ ...prev, [question.id]: items }));
          } else {
              items = Array.from({ length: minItems }, () => {
                  // Pre-fill defaultValues from fields
                  const defaults = {};
                  question.fields.forEach(f => { if (f.defaultValue) defaults[f.id] = f.defaultValue; });
                  return defaults;
              });
              if (Object.keys(items[0]).length > 0) {
                  setFormData(prev => ({ ...prev, [question.id]: items }));
              }
          }
      }

      return (
          <div className="flex flex-col gap-4 max-h-[500px] overflow-y-auto pr-2">
              {question.infoText && (
                  <div className="p-3 bg-[#FFC100]/10 border border-[#FFC100]/30 rounded-lg">
                      <p className="text-[#FFC100] text-xs">{question.infoText}</p>
                  </div>
              )}
              {items.map((item, idx) => {
                  // Calculate Display Values based on type
                  let costDisplay = null;
                  let cltData = null;

                  if (question.calcType === 'pro_labore') {
                      const cost = calculateProLabore(item.pro_labore);
                      if (cost > 0) costDisplay = `Custo Real: ${cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
                  } else if (question.calcType === 'clt_cost' && item.regime === 'CLT') {
                      cltData = calculateCLT(item.base_salary);
                      const premio = parseFloat((item.premio || '0').toString().replace(/\D/g, '')) / 100 || 0;
                      const totalWithPremio = cltData.total + premio;
                      if (totalWithPremio > 0) costDisplay = `Custo Fantasma: ${totalWithPremio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}${premio > 0 ? ` (inclui prêmio ${premio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})` : ''}`;
                  } else if (question.calcType === 'depreciation') {
                      const dep = calculateDepreciation(item.value, item.lifespan);
                      if(dep > 0) costDisplay = `Depreciação Mensal: ${dep.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
                  }

                  return (
                    <div key={idx} className="p-4 bg-[#2A2A2A] rounded-lg border border-[#333] relative">
                        <div className="flex justify-between items-center mb-3">
                            <div className="text-xs text-[#FFC100] font-bold uppercase">{getMonthLabel(question, item, idx)}</div>
                            {items.length > (question.minItems || 1) && (
                                <button onClick={() => handleRemoveDynamicItem(question.id, idx)} className="text-red-500 text-xs hover:underline">Remover</button>
                            )}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            {question.fields.map(field => {
                                if (field.type === 'separator') {
                                    return (
                                        <div key={field.id} className="col-span-2 flex items-center gap-3 mt-2 mb-1">
                                            <div className="h-px flex-1 bg-[#444]" />
                                            <span className="text-[10px] text-[#888] font-semibold uppercase tracking-wider whitespace-nowrap">{field.label}</span>
                                            <div className="h-px flex-1 bg-[#444]" />
                                        </div>
                                    );
                                }
                                // Conditional field visibility within dynamic list item
                                if (field.dependsOn) {
                                    const depValue = item[field.dependsOn.field];
                                    if (depValue !== field.dependsOn.value) return null;
                                }
                                return (
                                <div key={field.id} className={field.id === 'name' || field.dependsOn ? 'col-span-2' : ''}>
                                    <label className="text-[10px] text-gray-400 mb-1 flex justify-between items-center relative z-10">
                                        {field.label}
                                        {(field.helpText || field.tooltip) && (
                                            <div className="group relative flex items-center">
                                                <span className="text-white/50 cursor-pointer hover:text-white transition-colors">(?)</span>
                                                <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-48 p-2 bg-[#333] border border-[#444] text-white text-[10px] rounded shadow-xl z-50 text-right pointer-events-none">
                                                    {field.helpText || field.tooltip}
                                                </div>
                                            </div>
                                        )}
                                    </label>
                                    
                                    {field.type === 'select' ? (
                                        <select
                                            className="w-full bg-[#1A1A1A] text-white text-sm p-2 rounded border border-[#444] outline-none"
                                            onChange={(e) => handleGroupChange(question.id, idx, field.id, e.target.value, field.type)}
                                            value={item[field.id] || ''}
                                        >
                                            <option value="">Selecione</option>
                                            {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    ) : field.type === 'file' ? (
                                        <div className="flex items-center gap-2 mt-1">
                                            <label className="cursor-pointer flex items-center justify-center bg-[#2A2A2A] border border-[#444] hover:border-[#FFC100] text-white text-xs px-3 py-1.5 rounded transition-colors w-full">
                                                <span>{item[field.id] ? "Alterar Foto" : field.placeholder}</span>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const file = e.target.files[0];
                                                        if (file) {
                                                            const reader = new FileReader();
                                                            reader.onloadend = () => {
                                                                handleGroupChange(question.id, idx, field.id, reader.result, field.type);
                                                            };
                                                            reader.readAsDataURL(file);
                                                        }
                                                    }}
                                                />
                                            </label>
                                            {item[field.id] && (
                                                <img src={item[field.id]} alt="Preview" className="w-6 h-6 rounded-full object-cover border border-[#444]" />
                                            )}
                                        </div>
                                    ) : (
                                        <input
                                            type="text"
                                            value={item[field.id] || field.defaultValue || ''}
                                            onChange={(e) => !field.readOnly && handleGroupChange(question.id, idx, field.id, e.target.value, field.type)}
                                            placeholder={field.placeholder}
                                            readOnly={field.readOnly}
                                            className={`w-full bg-transparent border-b border-[#444] text-white text-sm pb-1 outline-none focus:border-[#FFC100] ${field.readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
                                        />
                                    )}
                                </div>
                                );
                            })}
                        </div>

                        {/* Cost Display & Helpers */}
                        {costDisplay && (
                            <div className="mt-3 p-2 bg-[#151515] rounded border border-[#FFC100]/30 flex items-center justify-between">
                                <span className="text-[#FFC100] text-xs font-semibold">{costDisplay}</span>
                                {question.calcType === 'clt_cost' && item.regime === 'CLT' && (
                                    <button 
                                        onClick={() => setShowCLTHelp(cltData)}
                                        className="w-5 h-5 rounded-full bg-[#333] flex items-center justify-center text-[10px] text-white hover:bg-white hover:text-black transition-colors"
                                        title="Ver cálculo detalahdo"
                                    >
                                        ?
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                  );
              })}
              
              <button 
                onClick={() => handleAddDynamicItem(question.id)}
                className="py-3 border border-dashed border-[#444] rounded-lg text-sm text-[#888] hover:border-[#FFC100] hover:text-[#FFC100] transition-colors"
              >
                  + Adicionar {question.itemLabel}
              </button>
          </div>
      );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        className="fixed right-0 top-0 bottom-0 w-full md:w-[70%] bg-[#1D1D1D] flex flex-col z-50 rounded-none md:rounded-[15px]"
      >
        {/* CLT HELP MODAL OVERLAY */}
         {showCLTHelp && (
            <div className="absolute inset-0 z-60 bg-black/80 flex items-center justify-center p-8 backdrop-blur-sm" onClick={() => setShowCLTHelp(null)}>
                <div className="bg-[#1E1E1E] rounded-xl border border-[#333] max-w-[600px] w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-white">Custo Real Funcionário (CLT)</h3>
                        <button onClick={() => setShowCLTHelp(null)} className="text-[#888] hover:text-white">✕</button>
                    </div>
                    
                    <div className="border border-[#333] rounded-lg overflow-hidden">
                        <div className="grid grid-cols-12 bg-[#2A2A2A] text-[10px] text-[#888] uppercase font-bold p-3 border-b border-[#333]">
                            <div className="col-span-1">Item</div>
                            <div className="col-span-3">Componente</div>
                            <div className="col-span-3">Cálculo</div>
                            <div className="col-span-2 text-right">Valor</div>
                            <div className="col-span-3 pl-2">Descrição</div>
                        </div>
                        {showCLTHelp.breakdown.map((row) => (
                            <div key={row.item} className="grid grid-cols-12 text-[11px] text-white p-3 border-b border-[#333] hover:bg-[#252527]">
                                <div className="col-span-1 text-[#FFC100]">{row.item}</div>
                                <div className="col-span-3 font-semibold">{row.comp}</div>
                                <div className="col-span-3 text-[#888] font-mono bg-[#111] px-1 rounded w-fit">{row.formula}</div>
                                <div className="col-span-2 text-right">{row.val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                                <div className="col-span-3 pl-2 text-[#888] text-[10px]">{row.desc}</div>
                            </div>
                        ))}
                         <div className="grid grid-cols-12 bg-[#FFC100]/10 text-[12px] text-[#FFC100] font-bold p-4">
                            <div className="col-span-7 text-right pr-4">CUSTO MENSAL EFETIVO:</div>
                            <div className="col-span-5">{showCLTHelp.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                        </div>
                    </div>
                </div>
            </div>
        )}


        {/* Progress Bar - Segmented */}
        <div className="absolute top-[60px] md:top-[100px] left-0 right-0 flex gap-1 px-[5%] md:px-[10%]">
          {[...Array(totalWithReg)].map((_, i) => (
            <div 
              key={i}
              className="h-[4px] flex-1 transition-all duration-300"
              style={{
                background: (showRegistration || i <= currentStepIndex) ? '#FFC100' : 'rgba(255, 255, 255, 0.1)',
                borderRadius: '2px',
                opacity: (showRegistration || i <= currentStepIndex) ? 1 : 0.3
              }}
            />
          ))}
        </div>

        {/* User Profile - Top Right (Only shows when typed) */}
        {formData?.user_info?.user_name && (
          <div className="absolute right-4 md:right-[55px] top-[16px] md:top-[28px] flex items-center gap-2 md:gap-[11px]">
            {formData?.user_info?.user_photo ? (
              <img src={formData.user_info.user_photo} alt="" className="w-[46px] h-[46px] rounded-full object-cover" />
            ) : (
              <div className="w-[46px] h-[46px] rounded-full bg-[#FDD688] flex items-center justify-center">
                <span className="font-['Plus_Jakarta_Sans'] font-semibold text-[14px] text-black">
                  {(formData?.user_info?.user_name || "U").substring(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex flex-col gap-[3px]">
              <div className="font-['Plus_Jakarta_Sans'] font-medium text-[14px] leading-[18px] text-white">
                {formData?.user_info?.user_name}
              </div>
              <div className="font-['Plus_Jakarta_Sans'] font-medium text-[10px] leading-[13px] text-[#A0A0A0]">
                Proprietário da Conta
              </div>
            </div>
          </div>
        )}

        {/* Header - Top Left */}
        <div className="absolute left-4 md:left-[66px] top-[38px] md:top-[79px]">
          <div className="font-['Plus_Jakarta_Sans'] font-semibold text-[12px] md:text-[14px] leading-[18px] text-white mb-1 md:mb-2">
            {showRegistration ? `Passo 1 de ${totalWithReg}` : `Passo ${currentStepIndex + (registrationDone ? 2 : 1)} de ${totalWithReg}`}
          </div>
          <div className="font-['Plus_Jakarta_Sans'] font-semibold text-[14px] text-white/20">
            {showRegistration ? 'Crie seu Acesso' : currentQuestion.section}
          </div>
        </div>

        {showRegistration ? (
        /* REGISTRATION STEP */
        <div className="flex flex-col md:flex-row flex-1 mt-[80px] md:mt-[160px] px-4 md:px-[66px] gap-6 md:gap-20 overflow-y-auto">
            <div className="hidden md:block md:w-1/3 pt-10">
                <div className="font-['Plus_Jakarta_Sans'] font-semibold text-[12px] text-white/80 uppercase tracking-wider mb-4">
                    Último Passo
                </div>
                <h2 className="font-['Plus_Jakarta_Sans'] font-semibold text-[24px] leading-[1.2] text-white/50 mb-6">
                    Crie seu acesso permanente
                </h2>
                <p className="font-['Plus_Jakarta_Sans'] font-medium text-[14px] leading-normal text-white/30">
                    Cadastre seu email e uma senha para acessar seu painel a qualquer momento, sem precisar do link.
                </p>
            </div>

            <div className="flex-1 pt-4 md:pt-12 max-w-full md:max-w-[500px]">
                <div className="font-['Plus_Jakarta_Sans'] font-semibold text-[12px] text-white mb-6">
                    Seus Dados de Acesso
                </div>

                <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
                    <div className="flex flex-col gap-5">
                        <div>
                            <label className="block text-[11px] font-semibold text-[#888] mb-2 uppercase tracking-wider">Email</label>
                            <input 
                                type="email" 
                                value={regEmail}
                                onChange={(e) => { setRegEmail(e.target.value); setRegError(''); }}
                                className={`w-full bg-[#161616] border ${regError ? 'border-red-500/50' : 'border-[#333]'} rounded-xl px-5 py-4 text-[15px] text-white outline-none focus:border-[#FFC100] transition-all placeholder-[#444]`}
                                placeholder="seu@email.com"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-[#888] mb-2 uppercase tracking-wider">Senha</label>
                            <input 
                                type="password" 
                                value={regPassword}
                                onChange={(e) => { setRegPassword(e.target.value); setRegError(''); }}
                                className={`w-full bg-[#161616] border ${regError ? 'border-red-500/50' : 'border-[#333]'} rounded-xl px-5 py-4 text-[15px] text-white outline-none focus:border-[#FFC100] transition-all placeholder-[#444]`}
                                placeholder="Mínimo 6 caracteres"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-[#888] mb-2 uppercase tracking-wider">Confirmar Senha</label>
                            <input 
                                type="password" 
                                value={regConfirm}
                                onChange={(e) => { setRegConfirm(e.target.value); setRegError(''); }}
                                className={`w-full bg-[#161616] border ${regError ? 'border-red-500/50' : 'border-[#333]'} rounded-xl px-5 py-4 text-[15px] text-white outline-none focus:border-[#FFC100] transition-all placeholder-[#444]`}
                                placeholder="Repita a senha"
                            />
                        </div>

                        {regError && (
                            <div className="flex items-center gap-2">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="#EF4444" strokeWidth="2"/>
                                    <path d="M12 8V12" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/>
                                    <circle cx="12" cy="16" r="1" fill="#EF4444"/>
                                </svg>
                                <span className="text-red-500 text-[12px] font-medium">{regError}</span>
                            </div>
                        )}
                    </div>
                </motion.div>

                <div className="flex flex-wrap items-center gap-4 mt-8 md:mt-12 pb-20 md:pb-4">
                    <button
                        onClick={handleRegistrationSubmit}
                        disabled={regLoading}
                        className={`flex items-center justify-center gap-[10px] bg-[#FFC100] rounded-full h-[50px] px-8 transition-colors ${regLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#ffdb65]'}`}
                    >
                        <span className="font-['Plus_Jakarta_Sans'] font-bold text-[14px] text-black">
                            {regLoading ? 'Criando...' : 'Criar Acesso e Continuar'}
                        </span>
                    </button>
                    <button
                        onClick={() => setShowRegistration(false)}
                        className="font-['Plus_Jakarta_Sans'] font-semibold text-[14px] text-white/50 hover:text-white transition-colors px-4"
                    >
                        Voltar
                    </button>
                </div>
            </div>
        </div>
        ) : (
        /* ONBOARDING QUESTIONS */
        <div className="flex flex-col md:flex-row flex-1 mt-[80px] md:mt-[160px] px-4 md:px-[66px] gap-4 md:gap-20 overflow-y-auto">
            {/* Left Column - Context (hidden on mobile) */}
            <div className="hidden md:block md:w-1/3 pt-10">
                <div className="font-['Plus_Jakarta_Sans'] font-semibold text-[12px] text-white/80 uppercase tracking-wider mb-4">
                    Contexto
                </div>
                <h2 className="font-['Plus_Jakarta_Sans'] font-semibold text-[24px] leading-[1.2] text-white/50 mb-6">
                    {currentQuestion.title}
                </h2>
                <p className="font-['Plus_Jakarta_Sans'] font-medium text-[14px] leading-normal text-white/30">
                    {currentQuestion.description}
                </p>
            </div>

            {/* Right Column - Question Input */}
            <div className="flex-1 pt-2 md:pt-12 max-w-full md:max-w-[500px]">
                <div className="font-['Plus_Jakarta_Sans'] font-semibold text-[12px] text-white mb-6">
                    Sua Resposta
                </div>

                <AnimatePresence mode='wait' custom={direction}>
                    <motion.div
                        key={currentStepIndex}
                        custom={direction}
                        initial={{ opacity: 0, x: direction > 0 ? 50 : -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: direction > 0 ? -50 : 50 }}
                        transition={{ duration: 0.3 }}
                    >
                        {/* Dynamic Input Rendering */}
                        {currentQuestion.type === 'composite' 
                            ? renderComposite(currentQuestion) 
                            : currentQuestion.type === 'dynamic_list_calc'
                                ? renderDynamicListCalc(currentQuestion)
                                : currentQuestion.type === 'group_list' // Legacy fallback
                                    ? renderGroupList(currentQuestion)
                                    : renderSingleInput(currentQuestion)
                        }
                    </motion.div>
                </AnimatePresence>

                {/* Navigation Buttons */}
                <div className="flex flex-wrap items-center gap-4 mt-8 md:mt-12 pb-20 md:pb-4">
                    <button
                        onClick={handleContinue}
                        disabled={isSubmitting}
                        className={`flex items-center justify-center gap-[10px] bg-[#FFC100] rounded-full h-[50px] px-8 transition-colors ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#ffdb65]'}`}
                    >
                        <span className="font-['Plus_Jakarta_Sans'] font-bold text-[14px] text-black">
                            {currentStepIndex === totalSteps - 1 ? 'Próximo' : 'Continuar'}
                        </span>
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M6.75 3.75L12 9L6.75 14.25" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>

                    {currentStepIndex > 0 && (
                         <button
                            onClick={handleBack}
                            className="font-['Plus_Jakarta_Sans'] font-semibold text-[14px] text-white/50 hover:text-white transition-colors px-4"
                        >
                            Voltar
                        </button>
                    )}

                    {/* Cancelar - inline on mobile */}
                    <button
                      onClick={onClose}
                      className="md:hidden font-['Plus_Jakarta_Sans'] font-semibold text-[12px] text-white/40 hover:text-white transition-colors ml-auto"
                    >
                      Cancelar
                    </button>
                </div>
            </div>
        </div>
        )}

        {/* Close/Back - Bottom Left (desktop only) */}
        <button
          onClick={onClose}
          className="hidden md:block absolute left-[75px] bottom-[50px] font-['Plus_Jakarta_Sans'] font-semibold text-[14px] text-white hover:opacity-80 transition-opacity"
        >
          Cancelar Onboarding
        </button>
      </motion.div>
      <AnimatePresence>
        {cropSource && (
          <ImageCropModal 
            src={cropSource}
            onClose={() => {
              setCropSource(null);
              setCropTarget(null);
            }}
            onConfirm={(croppedImage) => {
              handleCompositeChange(cropTarget.questionId, cropTarget.fieldId, croppedImage, 'file');
              setCropSource(null);
              setCropTarget(null);
            }}
          />
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
};

export default OnboardingForm;
