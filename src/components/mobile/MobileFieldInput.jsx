import { useState, useRef } from 'react';
import { formatCurrency } from '../../utils/onboardingCalculations';

const MobileFieldInput = ({ field, value, onChange, allValues, globalData }) => {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  // dependsOn visibility
  if (field.dependsOn) {
    const dep = typeof field.dependsOn === 'object' ? field.dependsOn : { field: field.dependsOn, value: field.dependsValue };
    if (allValues?.[dep.field] !== dep.value) return null;
  }
  if (field.dependsOnGlobal && globalData) {
    const [stepId, fieldId] = field.dependsOnGlobal.split('.');
    if (globalData[stepId]?.[fieldId] !== field.dependsValue) return null;
  }
  if (field.hideIfGlobal && globalData) {
    const [stepId, fieldId] = field.hideIfGlobal.split('.');
    if (globalData[stepId]?.[fieldId] === field.hideValue) return null;
  }
  if (field.hidden) return null;
  if (field.type === 'separator') {
    return (
      <div className="pt-4 pb-1">
        <div className="text-[11px] font-semibold text-[#F5A623] uppercase tracking-wider">{field.label}</div>
      </div>
    );
  }

  const handleCurrencyChange = (raw) => {
    const formatted = formatCurrency(raw);
    onChange(field.id, formatted, 'currency');
  };

  const handleBlurCurrency = () => {
    setFocused(false);
    if (value && typeof value === 'string') {
      const formatted = formatCurrency(value);
      if (formatted) onChange(field.id, formatted, 'currency');
    }
  };

  const baseInputClass = `w-full min-h-[48px] px-4 py-3 bg-[#2A2A2C] rounded-[12px] text-white text-[16px] outline-none border transition-colors ${
    focused ? 'border-[#F5A623]' : 'border-transparent'
  }`;

  const renderInput = () => {
    switch (field.type) {
      case 'currency':
        return (
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-[#868686]">R$</span>
            <input
              ref={inputRef}
              className={`${baseInputClass} pl-10`}
              inputMode="numeric"
              enterKeyHint="next"
              placeholder={field.placeholder?.replace('R$ ', '') || '0,00'}
              value={value || ''}
              readOnly={field.readOnly}
              onFocus={() => setFocused(true)}
              onBlur={handleBlurCurrency}
              onChange={(e) => handleCurrencyChange(e.target.value)}
            />
          </div>
        );

      case 'percentage':
        return (
          <div className="relative">
            <input
              ref={inputRef}
              className={`${baseInputClass} pr-10`}
              inputMode="decimal"
              enterKeyHint="next"
              placeholder={field.placeholder || '0%'}
              value={value || ''}
              readOnly={field.readOnly}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(e) => onChange(field.id, e.target.value, 'percentage')}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-[#868686]">%</span>
          </div>
        );

      case 'number':
        return (
          <input
            ref={inputRef}
            className={baseInputClass}
            inputMode="decimal"
            enterKeyHint="next"
            placeholder={field.placeholder || '0'}
            value={value || ''}
            readOnly={field.readOnly}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => onChange(field.id, e.target.value, 'number')}
          />
        );

      case 'select':
        return (
          <select
            className={`${baseInputClass} appearance-none`}
            value={value || ''}
            onChange={(e) => onChange(field.id, e.target.value, 'select')}
          >
            <option value="" disabled>Selecionar...</option>
            {field.options?.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case 'autocomplete':
        return (
          <AutocompleteField
            field={field}
            value={value}
            onChange={onChange}
            focused={focused}
            setFocused={setFocused}
            baseInputClass={baseInputClass}
          />
        );

      case 'file':
        return (
          <FileUploadField
            field={field}
            value={value}
            onChange={onChange}
          />
        );

      default: // text
        return (
          <input
            ref={inputRef}
            className={baseInputClass}
            inputMode="text"
            enterKeyHint="next"
            placeholder={field.placeholder || ''}
            value={value || ''}
            readOnly={field.readOnly}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => onChange(field.id, e.target.value, 'text')}
          />
        );
    }
  };

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1.5">
        <label className="text-[12px] font-medium text-[#A0A0A0]">{field.label}</label>
        {field.helpText && (
          <div className="group relative">
            <span className="text-[10px] text-[#868686] bg-[#333] rounded-full w-4 h-4 flex items-center justify-center cursor-help">?</span>
            <div className="absolute bottom-6 left-0 bg-[#333] text-[11px] text-white p-2 rounded-lg w-[200px] hidden group-hover:block z-50">
              {field.helpText}
            </div>
          </div>
        )}
      </div>
      {renderInput()}
    </div>
  );
};

// Autocomplete sub-component (fullscreen overlay on mobile)
const AutocompleteField = ({ field, value, onChange, focused, setFocused, baseInputClass }) => {
  const [showList, setShowList] = useState(false);
  const [filter, setFilter] = useState('');

  const normalize = (str) => str?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '';
  const filtered = (field.options || []).filter(opt => normalize(opt).includes(normalize(filter || value)));

  return (
    <div className="relative">
      <input
        className={baseInputClass}
        inputMode="text"
        enterKeyHint="done"
        placeholder={field.placeholder || ''}
        value={value || ''}
        onFocus={() => { setFocused(true); setShowList(true); setFilter(''); }}
        onChange={(e) => { onChange(field.id, e.target.value, 'text'); setFilter(e.target.value); }}
      />
      {showList && (
        <div className="fixed inset-0 bg-[#1D1D1D] z-50 flex flex-col">
          <div className="flex items-center gap-3 p-4 border-b border-white/10">
            <button onClick={() => setShowList(false)} className="text-[#F5A623] text-[14px] font-medium">Fechar</button>
            <input
              autoFocus
              className="flex-1 bg-[#2A2A2C] rounded-[12px] px-4 py-3 text-white text-[16px] outline-none"
              placeholder="Buscar..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.map(opt => (
              <button
                key={opt}
                className="w-full text-left px-4 py-4 text-white text-[16px] border-b border-white/5 active:bg-white/10"
                onClick={() => { onChange(field.id, opt, 'text'); setShowList(false); setFocused(false); }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// File upload sub-component
const FileUploadField = ({ field, value, onChange }) => {
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(field.id, reader.result, 'file');
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
      <button
        className="w-full min-h-[48px] px-4 py-3 bg-[#2A2A2C] rounded-[12px] text-[14px] text-[#868686] text-left flex items-center gap-3 active:bg-[#333]"
        onClick={() => fileRef.current?.click()}
      >
        {value ? (
          <div className="flex items-center gap-3">
            <img src={value} alt="" className="w-10 h-10 rounded-full object-cover" />
            <span className="text-white">Foto selecionada</span>
          </div>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="#868686" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {field.placeholder || 'Anexar foto'}
          </>
        )}
      </button>
    </div>
  );
};

export default MobileFieldInput;
