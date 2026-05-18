import React, { useState } from 'react';

import { useDashboard } from '../../context/DashboardContext';

// BAH-083: a Engenharia de Menu lista somente pratos vendáveis. A categoria
// "Insumo Pronto Preparado" gera uma ficha técnica auto-criada (ver
// FichaTecnica.jsx) que serve apenas como ingrediente de outras fichas —
// não é um item de cardápio. Itens com essa categoria não entram no menu.
const NON_MENU_CATEGORIES = new Set(['insumo pronto preparado']);

const isInsumoCategory = (categoryOrType) =>
  NON_MENU_CATEGORIES.has(String(categoryOrType || '').toLowerCase().trim());

const EngenhariaMenu = () => {
  const { dashboardData, updateDashboardData } = useDashboard();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, uploading, success, error

  const handleDownload = () => {
    // Create CSV content using semicolons for better PT-BR Excel compatibility
    const csvContent = "Nome;Preço;Custo;Vendas;Categoria\nPrato Exemplo;50.00;15.00;100;Pratos Principais";
    // Add UTF-8 BOM (\uFEFF) so Excel opens it with correct encoding for ç, ã, etc.
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "modelo_engenharia_menu.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadStatus('uploading');
      
      const formData = new FormData();
      formData.append('file', file);

      fetch('/api/menu/upload', {
        method: 'POST',
        body: formData
      })
      .then(res => {
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
      })
      .then(rawMenuItems => {
        // BAH-083: descarta itens importados cuja categoria indica insumo —
        // insumos não são pratos vendáveis e não pertencem à Engenharia de Menu.
        const menuItems = (rawMenuItems || []).filter(
          item => !isInsumoCategory(item.category || item.categoria)
        );

        // Merge with existing matrix (by name) — never wipe previous items
        const existingMenu = dashboardData.menuEngineering || [];
        const mergedMap = new Map(
          existingMenu.map(m => [m.name?.toLowerCase().trim(), m])
        );
        menuItems.forEach(item => {
          const key = item.name?.toLowerCase().trim();
          if (!key) return;
          mergedMap.set(key, { ...(mergedMap.get(key) || {}), ...item });
        });
        // BAH-083: também remove da matriz mesclada quaisquer itens-insumo
        // remanescentes de importações anteriores (auto-saneamento).
        const mergedMenu = Array.from(mergedMap.values()).filter(
          m => !isInsumoCategory(m.category)
        );

        // Create fichas técnicas for each imported item (existing fichas preserved)
        const existingFichas = dashboardData.operational?.fichas || [];
        const newFichas = [...existingFichas];

        menuItems.forEach((item, i) => {
          const alreadyExists = existingFichas.some(
            f => f.name?.toLowerCase().trim() === item.name?.toLowerCase().trim()
          );
          if (!alreadyExists && item.name) {
            const cost = item.cost || item.custo || '0';
            const price = item.price || item.preco || '0';
            // Parse cost/price - handle both "R$ 50,00" and "50.00" formats
            const parsedCost = typeof cost === 'number' ? cost : parseFloat(String(cost).replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.')) || 0;
            const parsedPrice = typeof price === 'number' ? price : parseFloat(String(price).replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.')) || 0;

            newFichas.push({
              id: `imp_eng_${Date.now()}_${i}`,
              createdAt: Date.now(),
              name: item.name,
              type: item.category || item.categoria || 'Prato Principal',
              progress: 0,
              insumos: 0,
              ingredients: [],
              custoInsumos: `R$ ${parsedCost.toFixed(2).replace('.', ',')}`,
              custoEmbalagem: "R$ 0,00",
              rendimento: "0gr",
              custoTotal: `R$ ${parsedCost.toFixed(2).replace('.', ',')}`,
              precoVenda: `R$ ${parsedPrice.toFixed(2).replace('.', ',')}`,
              vendasMes: item.sales || item.vendas || "0",
              isImported: true,
              lastUpdated: Date.now()
            });
          }
        });

        updateDashboardData({
          menuEngineering: mergedMenu,
          operational: {
            ...dashboardData.operational,
            fichas: newFichas
          }
        });

        setUploadStatus('success');
      })
      .catch(err => {
        console.error("Upload error", err);
        setUploadStatus('error');
      });
    }
  };

  const closeModal = () => {
    setShowUploadModal(false);
    setUploadStatus('idle');
  };

  return (
    <div className="flex flex-col w-full h-full min-h-screen bg-[#101010] font-jakarta text-white">
      
      {/* Header */}
      <div className="p-4 md:p-8 border-b border-[#1E1E1E]">
        <h1 className="text-[20px] md:text-[22px] font-bold text-white leading-tight">Engenharia de Menu</h1>
        <p className="text-[12px] text-[#868686] mt-2">Gerencie seus pratos e lucratividade via Excel</p>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 md:p-8 flex flex-col items-center justify-center gap-8">

        <div className="w-full max-w-[600px] bg-[#1B1B1D] border border-[#2A2A2C] rounded-[20px] p-5 md:p-8 flex flex-col items-center text-center">
          <div className="w-[64px] h-[64px] bg-[#252527] rounded-full flex items-center justify-center mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 2V8H20" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 13H16" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 17H16" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 9H9H8" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          
          <h2 className="text-[18px] font-bold text-white mb-2">Modelo de Importação</h2>
          <p className="text-[#868686] text-[13px] mb-8 max-w-[350px]">
            Baixe a planilha modelo, preencha com os dados do seu cardápio e suba novamente para atualizar o sistema.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full">
            <button
              onClick={handleDownload}
              className="flex-1 bg-[#252527] text-white font-medium py-3.5 rounded-[12px] hover:bg-[#333] transition-colors border border-[#333] flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M4 16V17C4 17.7956 4.31607 18.5587 4.87868 19.1213C5.44129 19.6839 6.20435 20 7 20H17C17.7956 20 18.5587 19.6839 19.1213 19.1213C19.6839 18.5587 20 17.7956 20 17V16M12 15L12 3M12 15L8 11M12 15L16 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Baixar Modelo
            </button>
            <button 
              onClick={() => setShowUploadModal(true)}
              className="flex-1 bg-[#F5A623] text-black font-semibold py-3.5 rounded-[12px] hover:bg-[#E5961E] transition-colors flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M4 16V17C4 17.7956 4.31607 18.5587 4.87868 19.1213C5.44129 19.6839 6.20435 20 7 20H17C17.7956 20 18.5587 19.6839 19.1213 19.1213C19.6839 18.5587 20 17.7956 20 17V16M16 8L12 4M12 4L8 8M12 4L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Enviar Planilha
            </button>
          </div>
        </div>

      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-[480px] bg-[#1B1B1D] rounded-[20px] p-5 sm:p-8 border border-[#2A2A2C]">
            <button onClick={closeModal} className="absolute right-4 sm:right-6 top-4 sm:top-6 text-[#868686] hover:text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>

            <h3 className="text-[20px] font-bold mb-6 text-center">Importar Menu</h3>

            {uploadStatus === 'idle' && (
              <div className="flex flex-col items-center">
                <label className="w-full h-[200px] border-2 border-dashed border-[#333] rounded-[16px] flex flex-col items-center justify-center cursor-pointer hover:border-[#F5A623] hover:bg-[#252527] transition-all group">
                  <div className="w-[48px] h-[48px] rounded-full bg-[#252527] group-hover:bg-[#333] flex items-center justify-center mb-4 transition-colors">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M4 16V17C4 17.7956 4.31607 18.5587 4.87868 19.1213C5.44129 19.6839 6.20435 20 7 20H17C17.7956 20 18.5587 19.6839 19.1213 19.1213C19.6839 18.5587 20 17.7956 20 17V16M16 8L12 4M12 4L8 8M12 4L12 16" stroke="#868686" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="text-[14px] font-medium text-white mb-1">Clique para selecionar</span>
                  <span className="text-[12px] text-[#555]">ou arraste o arquivo aqui</span>
                  <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleUpload} />
                </label>
              </div>
            )}

            {uploadStatus === 'uploading' && (
              <div className="flex flex-col items-center justify-center py-12">
                 <div className="w-10 h-10 border-4 border-[#333] border-t-[#F5A623] rounded-full animate-spin mb-4" />
                 <span className="text-[#868686] text-[14px]">Processando arquivo...</span>
              </div>
            )}

            {uploadStatus === 'success' && (
              <div className="flex flex-col items-center justify-center py-8">
                 <div className="w-[56px] h-[56px] bg-[#00B37E]/20 rounded-full flex items-center justify-center mb-4">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17L4 12" stroke="#00B37E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                 </div>
                 <h4 className="text-[18px] font-bold text-white mb-2">Sucesso!</h4>
                 <p className="text-[#868686] text-[13px] text-center mb-6">Seu cardápio foi importado corretamente.</p>
                 <button 
                   onClick={closeModal}
                   className="w-full bg-[#00B37E] text-white font-semibold py-3 rounded-[12px] hover:bg-[#009e6f] transition-colors"
                 >
                   Concluir
                 </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};

export default EngenhariaMenu;
