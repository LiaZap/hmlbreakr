/**
 * ConfigPrivacidade — secao Privacidade da pagina /configuracoes.
 *
 * Direitos do titular conforme LGPD Art. 18:
 *   II  — Acesso aos dados
 *   V   — Portabilidade
 *
 * Aciona o backend GET /client/:hash/export-my-data que faz strip de
 * campos sensiveis (password/resetToken/clerkUserId) e devolve JSON.
 *
 * O direito de eliminacao (Art. 18 VI) fica na secao "Zona de perigo".
 */
import { useState } from 'react';
import SectionHeader from './_SectionHeader';

const ConfigPrivacidade = ({ hash }) => {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleExport = async () => {
    setError(''); setSuccess(''); setExporting(true);
    try {
      const res = await fetch(`/api/client/${hash}/export-my-data`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || 'Erro ao exportar dados.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `breakr-meus-dados-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccess('Download iniciado. Guarde o arquivo em local seguro.');
    } catch (err) {
      console.error(err);
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <SectionHeader title="Privacidade" description="Seus dados e direitos garantidos pela Lei Geral de Proteção de Dados (LGPD)." />

      {/* Card: explicacao dos direitos */}
      <div className="bg-[#141416] border border-white/[0.06] rounded-[14px] p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-[#5B8DEF]/15 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B8DEF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-semibold text-white mb-1">Seus dados, seus direitos</h3>
            <p className="text-[11px] text-[#868686] leading-relaxed">
              Conforme o <strong>Art. 18 da LGPD</strong>, você tem direito de acessar, portar e eliminar
              dados pessoais que tratamos. A exclusão de conta fica na seção "Zona de perigo".
            </p>
          </div>
        </div>

        <div className="space-y-1.5 text-[11px] text-[#CFCFCF]">
          <PrivacyRight title="Acesso (Art. 18 II)" desc="Saber quais dados pessoais estão na nossa base" />
          <PrivacyRight title="Portabilidade (Art. 18 V)" desc="Receber seus dados em formato aberto (JSON)" />
          <PrivacyRight title="Correção (Art. 18 III)" desc="Atualizar dados imprecisos — use a aba Conta" />
          <PrivacyRight title="Eliminação (Art. 18 VI)" desc="Solicitar exclusão — veja Zona de perigo" />
        </div>
      </div>

      {/* Acao: exportar dados */}
      <div className="bg-[#141416] border border-white/[0.06] rounded-[14px] p-5 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-white/[0.04] flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CFCFCF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-semibold text-white mb-1">Baixar meus dados</h3>
            <p className="text-[11px] text-[#868686] mb-3 leading-relaxed">
              Receba um arquivo JSON com todos os dados pessoais e operacionais da sua conta.
              Inclui perfil, fichas técnicas, insumos, formulários de onboarding e configurações.
              <span className="text-[#5C5C5E]"> Não inclui senhas nem tokens internos.</span>
            </p>
            <button type="button" onClick={handleExport} disabled={exporting}
              className="bg-[#1A1A1A] hover:bg-[#252527] disabled:opacity-50 text-white font-semibold text-[12px] px-4 py-2 rounded-[8px] border border-white/[0.08] hover:border-white/[0.16] transition-colors">
              {exporting ? 'Gerando arquivo…' : 'Baixar em JSON'}
            </button>
            {error && <p className="text-[11px] text-[#E5484D] mt-2">{error}</p>}
            {success && <p className="text-[11px] text-[#00B37E] mt-2">{success}</p>}
          </div>
        </div>
      </div>

      {/* Card de transparencia */}
      <div className="bg-[#141416]/50 border border-white/[0.04] border-dashed rounded-[14px] p-4">
        <p className="text-[11px] text-[#5C5C5E] leading-relaxed">
          <strong className="text-[#868686]">Quer saber mais?</strong> Consulte nossa{' '}
          <a href="/privacidade" target="_blank" rel="noopener" className="text-[#F5A623] hover:underline">
            Política de Privacidade
          </a>
          {' '}para detalhes sobre como tratamos, armazenamos e protegemos seus dados.
        </p>
      </div>
    </div>
  );
};

const PrivacyRight = ({ title, desc }) => (
  <div className="flex items-start gap-2">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#00B37E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
    <span><strong className="text-white">{title}:</strong> {desc}</span>
  </div>
);

export default ConfigPrivacidade;
