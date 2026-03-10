import React, { useState, useEffect } from 'react';
import boltIcon from '../../assets/bolt.svg';

const AdminPanel = () => {
  const [clients, setClients] = useState([]);
  const [newClientName, setNewClientName] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch('/api/admin/clients')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setClients(data);
      })
      .catch(err => console.error("Failed to fetch clients", err));
  }, []);

  // Removed unused generateHash

  const handleCreateClient = () => {
    if (!newClientName.trim()) return;

    fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newClientName })
    })
    .then(res => res.json())
    .then(newClient => {
      setClients(prev => [...prev, newClient]);
      setNewClientName('');
      setShowModal(false);
    })
    .catch(() => alert("Erro ao criar cliente"));
  };

  const copyLink = (hash) => {
    const url = `${window.location.origin}/?hash=${hash}`;
    navigator.clipboard.writeText(url);
    alert('Link copiado para a área de transferência!');
  };

  const handleDeleteClient = (id) => {
    if (!window.confirm("ATENÇÃO: Tem certeza que deseja excluir esse cliente? Todos os dados dele serão apagados.")) return;

    fetch(`/api/admin/clients/${id}`, {
      method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
       if (data.success) {
          setClients(prev => prev.filter(c => c.id !== id));
       } else {
          alert(data.error || "Erro ao excluir cliente");
       }
    })
    .catch(err => {
       console.error(err);
       alert("Erro de conexão ao tentar excluir.");
    });
  };

  return (
    <div className="min-h-screen bg-[#101010] font-jakarta text-white p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <div className="w-[48px] h-[48px] bg-[#1E1E1E] rounded-[16px] flex items-center justify-center">
              <div className="w-[32px] h-[32px] bg-black rounded-[8px] flex items-center justify-center">
                <img src={boltIcon} alt="Breakr" className="w-[14px]" />
              </div>
            </div>
            <div>
              <h1 className="text-[20px] font-bold">Painel Administrativo</h1>
              <p className="text-[#868686] text-[12px]">Gerencie os acessos dos clientes</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowModal(true)}
              className="bg-[#F5A623] text-black font-semibold text-[14px] px-6 py-3 rounded-[12px] hover:bg-[#E5961E] transition-colors flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 5V19M5 12H19" stroke="black" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Novo Cliente
            </button>
            <button
              onClick={() => { sessionStorage.removeItem('breaker-admin'); window.location.href = '/'; }}
              className="text-[#868686] hover:text-white text-[12px] font-medium transition-colors px-3 py-3"
            >
              Sair
            </button>
          </div>
        </div>

        {/* Clients List */}
        <div className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[20px] overflow-hidden">
          <div className="p-6 border-b border-[#2A2A2C]">
            <h2 className="font-semibold text-[16px]">Clientes Cadastrados</h2>
          </div>
          
          <div className="divide-y divide-[#2A2A2C]">
            {clients.length === 0 ? (
              <div className="p-12 text-center text-[#555]">
                Nenhum cliente cadastrado ainda.
              </div>
            ) : (
              clients.map(client => (
                <div key={client.id} className="p-5 flex items-center justify-between hover:bg-[#1E1E1E] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-[40px] h-[40px] rounded-full bg-[#252527] flex items-center justify-center text-[#868686] font-bold text-[14px]">
                      {client.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-white">{client.name}</div>
                      <div className="text-[12px] text-[#555]">Criado em {client.createdAt}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="px-3 py-1 rounded-full bg-[#252527] text-[#868686] text-[11px] font-medium border border-[#333]">
                      {client.status}
                    </div>
                    
                    <button
                      onClick={() => { window.open(`${window.location.origin}/?hash=${client.hash}`, '_blank'); }}
                      className="flex items-center gap-2 text-[12px] text-[#86D993] font-medium hover:underline"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M15 3H21V9M21 3L13 11M10 5H5C3.89543 5 3 5.89543 3 7V19C3 20.1046 3.89543 21 5 21H17C18.1046 21 19 20.1046 19 19V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Acessar Painel
                    </button>

                    <button
                      onClick={() => copyLink(client.hash)}
                      className="flex items-center gap-2 text-[12px] text-[#F5A623] font-medium hover:underline"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M13.8284 10.1716L16.6569 7.34315C17.4379 6.5621 18.7042 6.5621 19.4853 7.34315C20.2663 8.1242 20.2663 9.39052 19.4853 10.1716L16.6569 13M10.1716 13.8284L7.34315 16.6569C6.5621 17.4379 5.29577 17.4379 4.51472 16.6569C3.73367 15.8758 3.73367 14.6095 4.51472 13.8284L7.34315 11M8.75736 15.2426L15.2426 8.75736" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Copiar Link
                    </button>

                    <button 
                      onClick={() => handleDeleteClient(client.id)}
                      className="flex items-center gap-1.5 text-[12px] text-[#555] font-medium hover:text-[#FF4560] transition-colors"
                      title="Excluir Cliente"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                         <path d="M19 7L18.1327 19.1425C18.0579 20.1891 17.187 21 16.1378 21H7.86224C6.81296 21 5.94208 20.1891 5.86732 19.1425L5 7M10 11V17M14 11V17M15 7V4C15 3.44772 14.5523 3 14 3H10C9.44772 3 9 3.44772 9 4V7M4 7H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* New Client Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-[400px] bg-[#1B1B1D] rounded-[20px] p-6 border border-[#2A2A2C]">
            <h3 className="text-[18px] font-bold mb-4">Novo Cliente</h3>
            
            <div className="mb-6">
              <label className="block text-[12px] text-[#868686] mb-2">Nome do Restaurante</label>
              <input 
                type="text" 
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-4 py-3 text-white outline-none focus:border-[#F5A623] transition-colors"
                placeholder="Ex: Meu Restaurante"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 bg-[#252527] rounded-[10px] text-[#868686] text-[13px] font-semibold hover:bg-[#333] transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleCreateClient}
                className="flex-1 py-3 bg-[#F5A623] rounded-[10px] text-black text-[13px] font-semibold hover:bg-[#E5961E] transition-colors"
              >
                Criar Cliente
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminPanel;
