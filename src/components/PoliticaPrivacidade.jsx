/**
 * PoliticaPrivacidade — pagina publica /privacidade.
 *
 * Pagina LGPD-compliant para SaaS BPO Financeiro. Cobre os 13 topicos
 * exigidos/recomendados pela ANPD (Autoridade Nacional de Protecao de
 * Dados) para SaaS B2B:
 *   1. Controlador e Encarregado/DPO
 *   2. Dados coletados (por categoria)
 *   3. Finalidades
 *   4. Bases legais (Art. 7)
 *   5. Compartilhamento com sub-processadores
 *   6. Retencao
 *   7. Direitos do titular (Art. 18)
 *   8. Seguranca
 *   9. Cookies
 *  10. Transferencia internacional
 *  11. Menores
 *  12. Alteracoes nesta politica
 *  13. Contato
 *
 * ATENCAO: este conteudo e um BOILERPLATE adaptado ao contexto Breakr.
 * Recomendado submeter ao juridico antes de divulgar oficialmente.
 *
 * Acessivel via:
 *   - URL direta: https://app.breakr.com.br/privacidade
 *   - Link na pagina /configuracoes > Privacidade
 *   - Link no rodape dos emails (futuro)
 */

const APP_NAME = 'Breakr';
const COMPANY = 'BREAKR ASSESSORIA LTDA';
const CNPJ = '46.539.926/0001-50';
const DPO_EMAIL = 'juridico@breakr.com.br';
const SUPPORT_EMAIL = 'contato@breakr.com.br';
const LAST_UPDATED = '25 de maio de 2026';

const PoliticaPrivacidade = () => {
  return (
    <div className="min-h-screen bg-[#0F0F11] text-white font-jakarta">
      {/* Header */}
      <header className="border-b border-white/[0.06] sticky top-0 bg-[#0F0F11]/95 backdrop-blur-sm z-10">
        <div className="max-w-[820px] mx-auto px-5 md:px-8 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-black rounded-[8px] flex items-center justify-center border border-white/[0.08]">
              <span className="text-[#F5A623] font-extrabold text-[14px]">B</span>
            </div>
            <span className="text-[14px] font-bold tracking-tight">{APP_NAME}</span>
          </a>
          <a href="/" className="text-[12px] text-[#868686] hover:text-white transition-colors">
            ← Voltar ao app
          </a>
        </div>
      </header>

      <main className="max-w-[820px] mx-auto px-5 md:px-8 py-8 md:py-12">
        {/* Title */}
        <div className="mb-10">
          <span className="text-[11px] text-[#5C5C5E] font-semibold uppercase tracking-widest">Documento legal</span>
          <h1 className="text-[28px] md:text-[36px] font-extrabold mt-1 leading-tight">Política de Privacidade</h1>
          <p className="text-[13px] text-[#868686] mt-3 leading-relaxed">
            Última atualização: <strong className="text-white">{LAST_UPDATED}</strong> · Em conformidade com a
            {' '}<strong className="text-white">Lei nº 13.709/2018 (LGPD)</strong>.
          </p>
        </div>

        {/* Summary */}
        <Box variant="info">
          <p className="text-[13px] leading-relaxed">
            <strong>Resumo em uma linha:</strong> coletamos só o necessário pra te entregar nosso serviço de BPO Financeiro,
            não vendemos seus dados, e você pode baixar/excluir tudo a qualquer momento em {' '}
            <a href="/?config=privacidade" className="text-[#F5A623] hover:underline">Configurações → Privacidade</a>.
          </p>
        </Box>

        {/* Sections */}
        <Section n="1" title="Quem é o controlador">
          <p>
            O <strong>{COMPANY}</strong>, inscrita no CNPJ sob o nº {CNPJ},
            é a <em>controladora</em> dos dados pessoais tratados nesta plataforma,
            conforme definido pelo Art. 5º VI da LGPD.
          </p>
          <p>
            <strong>Encarregado de Proteção de Dados (DPO):</strong> em conformidade com o Art. 41 da LGPD,
            nosso DPO pode ser contatado pelo email{' '}
            <a href={`mailto:${DPO_EMAIL}`} className="text-[#F5A623] hover:underline">{DPO_EMAIL}</a>.
          </p>
        </Section>

        <Section n="2" title="Quais dados coletamos">
          <p>Coletamos somente o necessário pra entregar o serviço. Os dados se dividem em quatro categorias:</p>

          <SubBlock title="2.1 Dados de identificação">
            <ul>
              <li>Nome completo do titular da conta</li>
              <li>Email e telefone</li>
              <li>CPF (opcional, usado para notas fiscais)</li>
              <li>Foto de perfil (opcional, quando você sobe)</li>
            </ul>
          </SubBlock>

          <SubBlock title="2.2 Dados operacionais do seu restaurante">
            <ul>
              <li>Nome, categoria e dados de identificação do estabelecimento (CNPJ, endereço)</li>
              <li>Cadastro de sócios, funcionários (incluindo CPF e salário quando informados)</li>
              <li>Fichas técnicas, insumos, fornecedores</li>
              <li>Faturamento histórico e diário</li>
              <li>Dados bancários e movimentações financeiras (quando você usa o módulo BPO)</li>
            </ul>
          </SubBlock>

          <SubBlock title="2.3 Dados de pagamento">
            <ul>
              <li>Dados de assinatura processados pelo <strong>Stripe</strong> (status, plano, datas)</li>
              <li><strong>NÃO armazenamos números de cartão, CVV, ou códigos PIX.</strong> Esses dados ficam exclusivamente nos servidores do Stripe (PCI-DSS Level 1)</li>
            </ul>
          </SubBlock>

          <SubBlock title="2.4 Dados técnicos e de uso">
            <ul>
              <li>Endereço IP (para auditoria de acessos e prevenção a fraudes)</li>
              <li>User-agent (navegador e sistema operacional)</li>
              <li>Datas de login e ações realizadas (trilha de auditoria interna)</li>
              <li>Cookies de sessão (autenticação) e preferências de UI</li>
            </ul>
          </SubBlock>
        </Section>

        <Section n="3" title="Para que usamos seus dados">
          <ul>
            <li><strong>Execução do serviço:</strong> dashboards, fichas técnicas, BPO Financeiro, relatórios</li>
            <li><strong>Comunicação:</strong> emails transacionais (cadastro, recuperação de senha, fim de teste), suporte</li>
            <li><strong>Cobrança:</strong> processamento da assinatura via Stripe</li>
            <li><strong>Segurança:</strong> detecção de acessos suspeitos, auditoria, backups</li>
            <li><strong>Melhoria do produto:</strong> análises agregadas e anônimas de uso (sem identificação)</li>
            <li><strong>Cumprimento de obrigações legais:</strong> registros contábeis, fiscais e regulatórios</li>
          </ul>
        </Section>

        <Section n="4" title="Bases legais (LGPD Art. 7º)">
          <p>Cada finalidade tem uma base legal específica:</p>
          <ul>
            <li><strong>Execução de contrato (II):</strong> entrega do serviço que você contratou</li>
            <li><strong>Consentimento (I):</strong> comunicações de marketing (opt-in) e cookies não-essenciais</li>
            <li><strong>Legítimo interesse (IX):</strong> segurança, prevenção a fraudes, melhoria do produto</li>
            <li><strong>Obrigação legal (II):</strong> retenção de registros fiscais/contábeis (até 5 anos)</li>
            <li><strong>Proteção do crédito (X):</strong> análise antifraude de pagamento (via Stripe)</li>
          </ul>
        </Section>

        <Section n="5" title="Com quem compartilhamos (sub-processadores)">
          <p>
            Para entregar o serviço, contratamos sub-processadores especializados.
            Todos têm contratos de proteção de dados (DPA) e atendem padrões internacionais
            (GDPR, ISO 27001 ou equivalentes).
          </p>
          <Table
            headers={['Sub-processador', 'Finalidade', 'Localização', 'Dados envolvidos']}
            rows={[
              ['Clerk Inc.',         'Autenticação (login, senhas, MFA)',   'EUA',          'Email, senha hash, sessões'],
              ['Stripe Inc.',        'Cobrança e processamento de pagamentos', 'EUA',       'Email, CPF/CNPJ, dados de cartão (não passam pelos nossos servidores)'],
              ['OpenAI L.L.C.',      'Sugestões de conciliação bancária (opcional)', 'EUA', 'Descrição da transação, valor, data, nome de fornecedor'],
              ['Hostinger Brasil',   'Envio de emails transacionais (SMTP)', 'Brasil',     'Email do destinatário, conteúdo do email'],
              ['Easypanel / VPS',    'Hospedagem da aplicação e banco de dados', 'Brasil', 'Todos os dados acima (em ambiente próprio criptografado)'],
            ]}
          />
          <p className="text-[12px] text-[#868686] mt-3">
            <strong>Não vendemos seus dados.</strong> Não compartilhamos com terceiros para fins de marketing ou venda.
          </p>
        </Section>

        <Section n="6" title="Por quanto tempo retemos">
          <ul>
            <li><strong>Conta ativa:</strong> enquanto você for cliente do {APP_NAME}</li>
            <li><strong>Pós-encerramento:</strong> dados pessoais (nome, email, telefone, CPF) anonimizados em até <strong>30 dias</strong></li>
            <li><strong>Snapshots e backups:</strong> mantidos por até 90 dias para fins de recuperação contra falhas</li>
            <li><strong>Trilha de auditoria de segurança:</strong> 2 anos (logs de login, IP de acesso)</li>
            <li><strong>Registros contábeis e fiscais:</strong> até <strong>5 anos</strong>, conforme art. 195 do Código Tributário Nacional e legislação fiscal aplicável</li>
            <li><strong>Dados anonimizados:</strong> podem ser mantidos indefinidamente para análises estatísticas (deixam de ser dados pessoais)</li>
          </ul>
        </Section>

        <Section n="7" title="Seus direitos (LGPD Art. 18)">
          <p>Como titular dos dados, você tem os seguintes direitos garantidos por lei:</p>
          <Table
            headers={['Direito', 'O que significa', 'Como exercer']}
            rows={[
              ['I — Confirmação',     'Confirmar se tratamos seus dados',                       'Email para o DPO'],
              ['II — Acesso',         'Receber cópia dos seus dados pessoais',                   'Config → Privacidade → Baixar meus dados'],
              ['III — Correção',      'Corrigir dados incorretos ou desatualizados',             'Config → Conta'],
              ['IV — Anonimização',   'Solicitar anonimização de dados desnecessários',          'Email para o DPO'],
              ['V — Portabilidade',   'Receber seus dados em formato aberto (JSON)',             'Config → Privacidade → Baixar meus dados'],
              ['VI — Eliminação',     'Solicitar exclusão dos dados pessoais',                   'Config → Zona de perigo → Excluir conta'],
              ['VII — Informação',    'Saber com quem compartilhamos',                           'Vide seção 5 desta política'],
              ['VIII — Revogação',    'Revogar o consentimento dado',                            'Config → Privacidade'],
              ['IX — Oposição',       'Opor-se a tratamento que não exija seu consentimento',    'Email para o DPO'],
            ]}
          />
          <Box variant="success" className="mt-4">
            <p className="text-[12px]">
              Conforme exigência da LGPD, o atendimento dos seus direitos é{' '}
              <strong>gratuito e facilitado</strong>. Respondemos em até <strong>15 dias úteis</strong>.
            </p>
          </Box>
        </Section>

        <Section n="8" title="Como protegemos seus dados">
          <ul>
            <li><strong>Criptografia em trânsito:</strong> todo o tráfego é HTTPS (TLS 1.3)</li>
            <li><strong>Senhas:</strong> nunca armazenadas em texto plano. Hash via bcrypt (rounds=10) e gestão pelo Clerk</li>
            <li><strong>Isolamento multi-tenant:</strong> dados de cada cliente são logicamente segregados por <code>clientId</code></li>
            <li><strong>Backups diários:</strong> automáticos, criptografados, com retenção de 30 dias</li>
            <li><strong>Auditoria:</strong> todas as ações sensíveis (login, alterações de dados, exportação, exclusão) são registradas</li>
            <li><strong>Controle de acesso:</strong> RBAC interno (apenas funcionários autorizados acessam dados; cada acesso é logado)</li>
            <li><strong>Webhooks Stripe assinados:</strong> validação criptográfica de cada evento recebido</li>
          </ul>
          <Box variant="warning" className="mt-4">
            <p className="text-[12px]">
              <strong>Importante:</strong> nenhum sistema é 100% imune a incidentes. Caso ocorra um vazamento que
              afete seus dados, você será notificado em até <strong>72 horas</strong> conforme exigência da ANPD,
              com descrição do incidente e medidas adotadas.
            </p>
          </Box>
        </Section>

        <Section n="9" title="Cookies e armazenamento local">
          <p>Usamos cookies e LocalStorage exclusivamente para:</p>
          <ul>
            <li><strong>Sessão de autenticação</strong> (essencial — não pode ser desativado)</li>
            <li><strong>Preferências de UI</strong> (sidebar expandida, modo do banner admin, etc.)</li>
            <li><strong>Estado de modais e dicas</strong> (para não repetir avisos já dispensados)</li>
          </ul>
          <p>
            <strong>Não usamos cookies de tracking de terceiros</strong>, pixels publicitários ou Google
            Analytics. Métricas internas são agregadas e anônimas.
          </p>
        </Section>

        <Section n="10" title="Transferência internacional de dados">
          <p>
            Alguns sub-processadores (Clerk, Stripe, OpenAI) operam nos EUA. Estas transferências são
            realizadas com base no Art. 33 da LGPD, em especial nas <em>cláusulas contratuais padrão</em>
            e/ou em <em>garantias específicas</em> oferecidas pelos parceiros (SOC 2, ISO 27001, GDPR
            compliance).
          </p>
        </Section>

        <Section n="11" title="Menores de idade">
          <p>
            O {APP_NAME} é uma ferramenta B2B para gestão de restaurantes. <strong>Não coletamos
            intencionalmente dados de menores de 18 anos.</strong> Se você é responsável legal e
            identificou cadastro indevido de um menor, contate-nos em{' '}
            <a href={`mailto:${DPO_EMAIL}`} className="text-[#F5A623] hover:underline">{DPO_EMAIL}</a>
            {' '}para remoção imediata.
          </p>
        </Section>

        <Section n="12" title="Alterações nesta política">
          <p>
            Podemos atualizar esta política a qualquer momento, mas mudanças materiais (que afetem
            seus direitos ou alterem finalidades) serão comunicadas por email e através de
            notificação no app com pelo menos <strong>30 dias de antecedência</strong>.
          </p>
          <p>
            Sempre que houver alteração, a data no topo desta página será atualizada.
            Histórico de versões anteriores está disponível mediante solicitação ao DPO.
          </p>
        </Section>

        <Section n="13" title="Contato">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 not-prose">
            <ContactCard
              title="Encarregado de Dados (DPO)"
              subtitle="Dúvidas sobre privacidade e exercício de direitos"
              email={DPO_EMAIL}
            />
            <ContactCard
              title="Suporte geral"
              subtitle="Funcionalidades e uso do produto"
              email={SUPPORT_EMAIL}
            />
          </div>
          <p className="text-[12px] text-[#868686] mt-4">
            Caso considere que seus direitos não foram atendidos adequadamente, você pode
            apresentar reclamação à <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong>
            {' '}através do site oficial{' '}
            <a href="https://www.gov.br/anpd" target="_blank" rel="noopener" className="text-[#F5A623] hover:underline">
              gov.br/anpd
            </a>.
          </p>
        </Section>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-white/[0.06] text-center">
          <p className="text-[11px] text-[#5C5C5E]">
            {COMPANY} · CNPJ {CNPJ} · {APP_NAME} v1.2
          </p>
          <p className="text-[11px] text-[#5C5C5E] mt-1">
            <a href="/" className="hover:text-white transition-colors">Voltar ao app</a>
          </p>
        </footer>
      </main>
    </div>
  );
};

// ─── Subcomponentes ────────────────────────────────────────────────────────

const Section = ({ n, title, children }) => (
  <section className="mb-10 scroll-mt-20" id={`secao-${n}`}>
    <div className="flex items-baseline gap-3 mb-4 border-b border-white/[0.06] pb-2">
      <span className="text-[12px] font-mono text-[#5C5C5E] shrink-0">{n}.</span>
      <h2 className="text-[18px] md:text-[20px] font-bold leading-tight">{title}</h2>
    </div>
    <div className="prose prose-invert prose-sm max-w-none text-[#CFCFCF] leading-relaxed
                    [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:ml-1 [&_ul]:space-y-1.5
                    [&_li]:text-[13px] [&_p]:text-[13px]
                    [&_li]:pl-4 [&_li]:relative [&_li]:before:content-['•'] [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:text-[#5C5C5E]
                    [&_strong]:text-white [&_strong]:font-semibold
                    [&_code]:text-[12px] [&_code]:bg-[#1A1A1A] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[#F5A623]">
      {children}
    </div>
  </section>
);

const SubBlock = ({ title, children }) => (
  <div className="mt-4 mb-3">
    <h3 className="text-[13px] font-semibold text-white mb-2">{title}</h3>
    {children}
  </div>
);

const Box = ({ variant = 'info', children, className = '' }) => {
  const styles = {
    info:    { border: 'border-[#5B8DEF]/30', bg: 'bg-[#5B8DEF]/[0.06]' },
    success: { border: 'border-[#00B37E]/30', bg: 'bg-[#00B37E]/[0.06]' },
    warning: { border: 'border-[#F5A623]/30', bg: 'bg-[#F5A623]/[0.06]' },
  };
  const s = styles[variant] || styles.info;
  return (
    <div className={`p-4 rounded-[12px] border ${s.border} ${s.bg} text-[#CFCFCF] mb-6 ${className}`}>
      {children}
    </div>
  );
};

const Table = ({ headers, rows }) => (
  <div className="overflow-x-auto -mx-1 my-4">
    <table className="w-full text-[12px] border-collapse">
      <thead>
        <tr className="border-b border-white/[0.08]">
          {headers.map(h => (
            <th key={h} className="text-left font-semibold text-[10px] uppercase tracking-wider text-[#868686] py-2 px-2">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-white/[0.04] last:border-0">
            {row.map((cell, j) => (
              <td key={j} className={`py-2 px-2 align-top ${j === 0 ? 'text-white font-semibold' : 'text-[#CFCFCF]'}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const ContactCard = ({ title, subtitle, email }) => (
  <div className="bg-[#141416] border border-white/[0.06] rounded-[12px] p-4">
    <p className="text-[12px] font-semibold text-white mb-0.5">{title}</p>
    <p className="text-[10px] text-[#868686] mb-2">{subtitle}</p>
    <a href={`mailto:${email}`} className="text-[12px] text-[#F5A623] hover:underline font-semibold">
      {email}
    </a>
  </div>
);

export default PoliticaPrivacidade;
