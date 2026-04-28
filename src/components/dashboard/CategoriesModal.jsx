import React, { useState } from 'react';
import { useDashboard } from '../../context/DashboardContext';

const CategoriesModal = ({ onClose, defaultTab = 'insumos' }) => {
  const { dashboardData, updateDashboardData } = useDashboard();
  const [activeTab, setActiveTab] = useState(defaultTab); // 'insumos' or 'fichas'
  const [newCategory, setNewCategory] = useState('');

  const categories = dashboardData.operational?.categories || { insumos: [], fichas: [] };
  const currentList = (activeTab === 'insumos' ? categories.insumos : categories.fichas) || [];

  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    
    // Capitalize first letter
    const formatted = newCategory.charAt(0).toUpperCase() + newCategory.slice(1);

    if (currentList.includes(formatted)) {
      alert('Categoria já existe!');
      return;
    }

    const updatedCategories = {
      ...categories,
      [activeTab]: [...currentList, formatted]
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
    if (confirm(`Tem certeza que deseja excluir a categoria "${catToDelete}"?`)) {
      const updatedList = currentList.filter(c => c !== catToDelete);
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
            <p className="text-[12px] text-[#868686] mt-1">Adicione ou remova categorias do sistema</p>
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
        <div className="flex gap-2 mb-6">
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

        {/* List */}
        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {currentList.map((cat, idx) => (
            <div key={idx} className="flex items-center justify-between bg-[#1E1E1E] border border-[#2A2A2C] rounded-[12px] p-3 group hover:border-[#F5A623]/30 transition-colors">
              <span className="text-[13px] text-white font-medium pl-1">{cat}</span>
              <button 
                onClick={() => handleDeleteCategory(cat)}
                className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center text-[#555] sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-all"
                title="Excluir"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          ))}
          {currentList.length === 0 && (
            <div className="text-center py-8 text-[#555] text-[12px]">Nenhuma categoria cadastrada via gerenciador.</div>
          )}
        </div>

      </div>
    </div>
  );
};

export default CategoriesModal;
