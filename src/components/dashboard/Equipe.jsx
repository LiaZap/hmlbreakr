import React, { useState, useEffect } from 'react';

const Equipe = () => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form State
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [formError, setFormError] = useState('');

  const hash = new URLSearchParams(window.location.search).get('hash');

  const fetchMembers = async () => {
    try {
      const res = await fetch(`/api/client/${hash}/team`);
      if (!res.ok) throw new Error('Falha ao carregar equipe');
      const data = await res.json();
      setMembers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!newName || !newEmail || !newPassword) {
      setFormError('Preencha todos os campos.');
      return;
    }

    try {
      const res = await fetch(`/api/client/${hash}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, email: newEmail, password: newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar conta.');

      // Refresh list
      setMembers([...members, data.member]);
      
      // Reset form
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setIsCreating(false);
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir esta conta? O acesso será revogado imediatamente.')) return;

    try {
      const res = await fetch(`/api/client/${hash}/team/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Erro ao excluir membro.');
      
      setMembers(members.filter(m => m.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="p-8 text-white font-jakarta">Carregando equipe...</div>;

  return (
    <div className="flex flex-col min-h-screen bg-[#101010] p-4 md:p-6 lg:p-10 font-jakarta text-white overflow-y-auto">
      <div className="max-w-4xl w-full mx-auto">
        
        {/* Header */}
        <div className="mb-8">
          <div className="text-[12px] text-[#868686] mb-1">Configurações &gt; Equipe</div>
          <h1 className="text-[28px] font-bold leading-tight">Membros da Equipe</h1>
          <p className="text-[14px] text-[#868686] mt-2">
            Crie acessos secundários para que seus gerentes possam preencher fichas e gerenciar vendas.
            <br />
            Você pode criar até <span className="font-bold text-white">3 acessos operacionais</span>.
          </p>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl mb-6">{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Members List */}
          <div className="flex flex-col gap-4">
            <h2 className="text-[16px] font-bold text-white mb-2">Acessos Ativos ({members.length}/3)</h2>
            
            {members.length === 0 ? (
              <div className="bg-[#1A1A1A] border border-[#2A2A2C] rounded-[20px] p-8 text-center">
                <p className="text-[#868686] text-[14px]">Nenhum membro cadastrado ainda.</p>
              </div>
            ) : (
              members.map((member) => (
                <div key={member.id} className="bg-[#1A1A1A] border border-[#2A2A2C] rounded-[20px] p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-[44px] h-[44px] rounded-full bg-[#e2fd89]/10 text-[#e2fd89] flex items-center justify-center font-bold text-[16px]">
                      {member.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-[16px] text-white leading-tight">{member.name}</p>
                      <p className="font-normal text-[12px] text-[#868686]">{member.email}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDelete(member.id)}
                    className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-red-500/10 text-[#555] hover:text-red-500 transition-colors"
                    title="Excluir Acesso"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Create Form */}
          <div>
             <div className="bg-[#161616] border border-[#2A2A2C] rounded-[24px] p-6 lg:p-8">
                <h2 className="text-[18px] font-bold text-white mb-6">Cadastrar Novo Gerente</h2>
                
                {members.length >= 3 ? (
                  <div className="p-4 bg-[#FF9406]/10 border border-[#FF9406]/30 text-[#FF9406] rounded-[14px] text-sm">
                    Você atingiu o limite máximo de 3 acessos simultâneos. Para cadastrar um novo gerente, você precisa excluir um acesso existente.
                  </div>
                ) : (
                  <form onSubmit={handleCreate} className="flex flex-col gap-5">
                    
                    <div>
                      <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Nome</label>
                      <input 
                        type="text" 
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all"
                        placeholder="Nome do gerente"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">E-mail de Login</label>
                      <input 
                        type="email" 
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all"
                        placeholder="gerente@restaurante.com"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Senha Provisória</label>
                      <input 
                        type="text" 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all"
                        placeholder="Senha para este usuário"
                        required
                      />
                      <p className="text-[10px] text-[#666] mt-2 pl-2">O gerente poderá entrar e redefinir sua senha pelo menu de Perfil.</p>
                    </div>

                    {formError && <div className="text-red-500 text-[13px] font-medium px-1">{formError}</div>}

                    <button 
                      type="submit"
                      disabled={isCreating}
                      className="mt-2 w-full bg-[#F5A623] hover:bg-[#E5961E] disabled:opacity-50 text-black font-bold text-[15px] rounded-[14px] py-4 transition-colors"
                    >
                      {isCreating ? 'Criando...' : 'Criar Acesso'}
                    </button>
                  </form>
                )}
             </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default Equipe;
