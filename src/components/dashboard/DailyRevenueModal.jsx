import React, { useState, useMemo } from 'react';

// BAH-090: as datas de faturamento diário são chaves de calendário (YYYY-MM-DD)
// no fuso do Brasil. Resolvemos "hoje" em America/Sao_Paulo para que o valor
// padrão (ontem) e o limite máximo do input não fiquem errados perto da virada
// do dia ou para usuários acessando de outro fuso.
const getSaoPauloDateStr = (offsetDays = 0) => {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    // 'en-CA' formata como YYYY-MM-DD
    const todayStr = fmt.format(new Date());
    if (offsetDays === 0) return todayStr;
    const [y, m, d] = todayStr.split('-').map(Number);
    const shifted = new Date(Date.UTC(y, m - 1, d + offsetDays));
    return shifted.toISOString().split('T')[0];
  } catch {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split('T')[0];
  }
};

const DailyRevenueModal = ({ isOpen, onClose, onSave, existingEntries = {} }) => {
  const [date, setDate] = useState(getSaoPauloDateStr(-1));
  const [rawValue, setRawValue] = useState('');
  const [loading, setLoading] = useState(false);

  const formatCurrency = (value) => {
    if (!value) return '';
    const numbers = value.replace(/\D/g, '');
    if (!numbers) return '';
    const number = parseInt(numbers) / 100;
    return number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const parseCurrencyValue = (formatted) => {
    if (!formatted) return 0;
    const clean = formatted.replace(/\./g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  };

  const handleValueChange = (e) => {
    const input = e.target.value;
    setRawValue(formatCurrency(input));
  };

  // Current month entries sorted by date desc
  const recentEntries = useMemo(() => {
    return Object.entries(existingEntries)
      .map(([d, amount]) => ({ date: d, amount: typeof amount === 'number' ? amount : parseCurrencyValue(String(amount)) }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7);
  }, [existingEntries]);

  const handleSave = () => {
    const amount = parseCurrencyValue(rawValue);
    if (!date || amount <= 0) return;
    setLoading(true);
    onSave(date, amount);
    setLoading(false);
  };

  const handleEntryClick = (entry) => {
    setDate(entry.date);
    const formatted = entry.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setRawValue(formatted);
  };

  const formatDateLabel = (dateStr) => {
    const [, m, d] = dateStr.split('-');
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${parseInt(d)} ${months[parseInt(m) - 1]}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-sm bg-[#161616] border border-[#2A2A2C] rounded-[24px] p-4 sm:p-6 shadow-2xl overflow-hidden font-jakarta">
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-white">Faturamento Diário</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#252527] flex items-center justify-center text-[#868686] hover:text-white transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Date Field */}
        <div className="mb-4">
          <label className="block text-[11px] font-semibold text-[#666] mb-1.5 uppercase tracking-wider pl-1">Data</label>
          <input
            type="date"
            value={date}
            max={getSaoPauloDateStr(0)}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[12px] px-4 py-3 text-[14px] text-white outline-none focus:border-[#FF9406] transition-all [color-scheme:dark]"
          />
        </div>

        {/* Amount Field */}
        <div className="mb-5">
          <label className="block text-[11px] font-semibold text-[#666] mb-1.5 uppercase tracking-wider pl-1">Valor Faturado</label>
          <div className="flex items-center bg-[#1A1A1A] border border-[#2A2A2C] rounded-[12px] px-4 py-3 focus-within:border-[#FF9406] transition-all">
            <span className="text-[14px] text-[#666] mr-2">R$</span>
            <input
              type="text"
              inputMode="numeric"
              value={rawValue}
              onChange={handleValueChange}
              placeholder="0,00"
              className="flex-1 bg-transparent text-[14px] text-white outline-none"
            />
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={loading || !rawValue || !date}
          className="w-full bg-[#FF9406] hover:bg-[#E58505] disabled:opacity-40 text-black font-bold text-[14px] rounded-[12px] py-3.5 transition-colors mb-4"
        >
          {loading ? 'Salvando...' : 'Salvar'}
        </button>

        {/* Recent Entries */}
        {recentEntries.length > 0 && (
          <div>
            <div className="h-px w-full bg-[#2A2A2C]/50 mb-3" />
            <span className="block text-[10px] font-semibold text-[#555] uppercase tracking-wider mb-2 pl-1">Últimos lançamentos</span>
            <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto">
              {recentEntries.map((entry) => (
                <button
                  key={entry.date}
                  onClick={() => handleEntryClick(entry)}
                  className="flex items-center justify-between px-3 py-2 rounded-[10px] bg-[#1A1A1A] hover:bg-[#222] border border-transparent hover:border-[#2A2A2C] transition-all text-left"
                >
                  <span className="text-[12px] text-[#888]">{formatDateLabel(entry.date)}</span>
                  <span className="text-[12px] text-[#CACACA] font-medium">
                    R$ {entry.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyRevenueModal;
