import React, { useState } from 'react';
import { useDashboard } from '../../context/DashboardContext';

// Categorias padrao do sistema — usadas como referencia visual no modal.
// IMPORTANTE: estas listas precisam bater com as defaults usadas em
// FichaTecnica.jsx (linhas com defaultInsumoCats e defaultFichaCats).
// Single source of truth aqui: o resto do app re-define localmente
// porque sao usadas em contextos diferentes, mas qualquer mudanca
// deve ser propagada manualmente.
//
// "Insumo Pronto Preparado" foi REMOVIDO em 29/05/2026 — induzia
// cliente ao erro de cadastrar como ficha tecnica em vez de insumo.
const DEFAULT_INSUMO_CATS = [
  'Proteínas', 'Grãos', 'Vinhos', 'Molhos', 'Legumes',
  'Temperos', 'Óleos', 'Laticínios', 'Outros'
];
const DEFAULT_FICHA_CATS = [
  'Prato Principal', 'Entrada', 'Sobremesa',
  'Drinks, Coquetéis e Sucos', 'Acompanhamento'
];

const CategoriesModal = ({ onClose, defaultTab = 'insumos' }) => {
  const { dashboardData, updateDashboardData } = useDashboard();
  const [activeTab, setActiveTab] = useState(defaultTab); // 'insumos' or 'fichas'
  const [newCategory, setNewCategory] = useState('');

  const categories = dashboardData.operational?.categories || { insumos: [], fichas: [] };
  const customList = (activeTab === 'insumos' ? categories.insumos : categories.fichas) || [];
  const defaultList = activeTab === 'insumos' ? DEFAULT_INSUMO_CATS : DEFAULT_FICHA_CATS;

  // Lista combinada — defaults marcadas como readonly (origin='default')
  // + custom marcadas como editaveis (origin='custom'). Dedupe via Set
  // pra evitar duplicacao caso uma custom tenha exatamente o mesmo nome
  // que uma default (raro mas possivel).
  const defaultSet = new Set(defaultList.map(c => c.toLowerCase()));
  const customOnly = customList.filter(c => !defaultSet.has((c || '').toLowerCase()));
  const allCategories = [
    ...defaultList.map(name => ({ name, origin: 'default' })),
    ...customOnly.map(name => ({ name, origin: 'custom' })),
  ];

  const handleAddCategory = () => {
    if (!newCategory.trim()) return;

    // Capitalize first letter
    const formatted = newCategory.trim().charAt(0).toUpperCase() + newCategory.trim().slice(1);

    // Bloqueia duplicacao tanto contra defaults quanto contra customs existentes
    const allNames = [...defaultList, ...customList].map(c => c.toLowerCase());
    if (allNames.includes(formatted.toLowerCase())) {
      alert('Esta categoria já existe (padrão ou personalizada)!');
      return;
    }

    const updatedCategories = {
      ...categories,
      [activeTab]: [...customList, formatted]
    };

    updateDashboardData({
      operational: {
        ...dashboardData.operational,
        categories: updatedCategories
      }
    });

    setNewCategory('');
  };

  const handleDeleteCategory = (catToDelete) => {
    if (confirm(`Tem certeza que deseja excluir a categoria "${catToDelete}"?\n\nAs categorias PADRÃO do sistema continuam disponíveis — apenas esta categoria personalizada será removida.`)) {
      const updatedList = customList.filter(c => c !== catToDelete);
      const updatedCategories = {
        ...categories,
        [activeTab]: updatedList
      };

      updateDashboardData({
        operational: {
          ...dashboardData.operational,
          categories: updatedCategories
        }
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[95vw] sm:w-[90vw] max-w-[500px] max-h-[90vh] overflow-y-auto bg-[#1B1B1D] rounded-[20px] p-5 sm:p-8 shadow-2xl border border-[#2A2A2C]">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-[20px] font-bold text-white">Gerenciar Categorias</h2>
            <p className="text-[12px] text-[#868686] mt-1">Categorias padrão do sistema + suas categorias personalizadas</p>
          </div>
          <button onClick={onClose} className="w-[36px] h-[36px] rounded-[10px] bg-[#252527] flex items-center justify-center hover:bg-[#333] transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6L18 18" stroke="#868686" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-1 bg-[#121212] rounded-[12px] mb-6">
          <button
            onClick={() => setActiveTab('insumos')}
            className={`flex-1 py-2 text-[13px] font-medium rounded-[10px] transition-all ${
              activeTab === 'insumos' ? 'bg-[#252527] text-white shadow-lg' : 'text-[#868686] hover:text-[#CCC]'
            }`}
          >
            Categorias de Insumos
          </button>
          <button
            onClick={() => setActiveTab('fichas')}
            className={`flex-1 py-2 text-[13px] font-medium rounded-[10px] transition-all ${
              activeTab === 'fichas' ? 'bg-[#252527] text-white shadow-lg' : 'text-[#868686] hover:text-[#CCC]'
            }`}
          >
            Categorias de Pratos
          </button>
        </div>

        {/* Add New */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder={`Nova categoria de ${activeTab === 'insumos' ? 'insumo' : 'prato'}...`}
            className="flex-1 bg-[#252527] border border-[#2A2A2C] rounded-[12px] px-4 py-3 text-[13px] text-white outline-none focus:border-[#F5A623] transition-colors"
            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
          />
          <button
            onClick={handleAddCategory}
            className="bg-[#F5A623] hover:bg-[#E5961E] text-black font-semibold rounded-[12px] px-4 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Aviso explicativo — fix do bug onde cliente achava que defaults "sumiam" */}
        <p className="text-[11px] text-[#666] leading-relaxed mb-4 pl-1">
          Categorias <span className="text-[#FFD789]">amarelas</span> são padrão do sistema (sempre disponíveis).
          Categorias <span className="text-white">brancas</span> são personalizadas (você pode remover).
        </p>

        {/* List */}
        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {allCategories.map(({ name, origin }, idx) => (
            <div
              key={`${origin}-${idx}-${name}`}
              className={`flex items-center justify-between border rounded-[12px] p-3 group transition-colors ${
                origin === 'default'
                  ? 'bg-[#FFD789]/[0.04] border-[#FFD789]/15'
                  : 'bg-[#1E1E1E] border-[#2A2A2C] hover:border-[#F5A623]/30'
              }`}
            >
              <div className="flex items-center gap-2 pl-1">
                <span className={`text-[13px] font-medium ${origin === 'default' ? 'text-[#FFD789]' : 'text-white'}`}>
                  {name}
                </span>
                {origin === 'default' && (
                  <span className="text-[9px] uppercase tracking-wider text-[#FFD789]/60 font-semibold">padrão</span>
                )}
              </div>
              {origin === 'custom' && (
                <button
                  onClick={() => handleDeleteCategory(name)}
                  className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center text-[#555] sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-all"
                  title="Excluir categoria personalizada"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

export default CategoriesModal;
