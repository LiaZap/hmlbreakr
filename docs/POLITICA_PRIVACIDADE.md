# Política de Privacidade — Breakr

**Última atualização:** 25 de maio de 2026
**Em conformidade com:** Lei nº 13.709/2018 (LGPD)

**Versão online:** <https://app.breakr.com.br/privacidade>
**Arquivo-fonte:** `src/components/PoliticaPrivacidade.jsx`

> Este `.md` é o **espelho legível** do conteúdo da página JSX. Sirva como referência para revisão jurídica e arquivamento. Para alterar a política em produção, edite o arquivo `.jsx` e faça redeploy — o `.md` deve ser atualizado em paralelo para manter consistência.

---

## ℹ️ Resumo em uma linha

Coletamos só o necessário pra te entregar nosso serviço de BPO Financeiro, não vendemos seus dados, e você pode baixar/excluir tudo a qualquer momento em **Configurações → Privacidade**.

---

## 1. Quem é o controlador

A **BREAKR ASSESSORIA LTDA**, inscrita no CNPJ sob o nº **46.539.926/0001-50**, é a *controladora* dos dados pessoais tratados nesta plataforma, conforme definido pelo Art. 5º VI da LGPD.

**Encarregado de Proteção de Dados (DPO):** em conformidade com o Art. 41 da LGPD, nosso DPO pode ser contatado pelo email **juridico@breakr.com.br**.

---

## 2. Quais dados coletamos

Coletamos somente o necessário pra entregar o serviço. Os dados se dividem em quatro categorias:

### 2.1 Dados de identificação

- Nome completo do titular da conta
- Email e telefone
- CPF (opcional, usado para notas fiscais)
- Foto de perfil (opcional, quando você sobe)

### 2.2 Dados operacionais do seu restaurante

- Nome, categoria e dados de identificação do estabelecimento (CNPJ, endereço)
- Cadastro de sócios, funcionários (incluindo CPF e salário quando informados)
- Fichas técnicas, insumos, fornecedores
- Faturamento histórico e diário
- Dados bancários e movimentações financeiras (quando você usa o módulo BPO)

### 2.3 Dados de pagamento

- Dados de assinatura processados pelo **Stripe** (status, plano, datas)
- **NÃO armazenamos números de cartão, CVV, ou códigos PIX.** Esses dados ficam exclusivamente nos servidores do Stripe (PCI-DSS Level 1)

### 2.4 Dados técnicos e de uso

- Endereço IP (para auditoria de acessos e prevenção a fraudes)
- User-agent (navegador e sistema operacional)
- Datas de login e ações realizadas (trilha de auditoria interna)
- Cookies de sessão (autenticação) e preferências de UI

---

## 3. Para que usamos seus dados

- **Execução do serviço:** dashboards, fichas técnicas, BPO Financeiro, relatórios
- **Comunicação:** emails transacionais (cadastro, recuperação de senha, fim de teste), suporte
- **Cobrança:** processamento da assinatura via Stripe
- **Segurança:** detecção de acessos suspeitos, auditoria, backups
- **Melhoria do produto:** análises agregadas e anônimas de uso (sem identificação)
- **Cumprimento de obrigações legais:** registros contábeis, fiscais e regulatórios

---

## 4. Bases legais (LGPD Art. 7º)

Cada finalidade tem uma base legal específica:

- **Execução de contrato (II):** entrega do serviço que você contratou
- **Consentimento (I):** comunicações de marketing (opt-in) e cookies não-essenciais
- **Legítimo interesse (IX):** segurança, prevenção a fraudes, melhoria do produto
- **Obrigação legal (II):** retenção de registros fiscais/contábeis (até 5 anos)
- **Proteção do crédito (X):** análise antifraude de pagamento (via Stripe)

---

## 5. Com quem compartilhamos (sub-processadores)

Para entregar o serviço, contratamos sub-processadores especializados. Todos têm contratos de proteção de dados (DPA) e atendem padrões internacionais (GDPR, ISO 27001 ou equivalentes).

| Sub-processador | Finalidade | Localização | Dados envolvidos |
|---|---|---|---|
| **Clerk Inc.** | Autenticação (login, senhas, MFA) | EUA | Email, senha hash, sessões |
| **Stripe Inc.** | Cobrança e processamento de pagamentos | EUA | Email, CPF/CNPJ, dados de cartão (não passam pelos nossos servidores) |
| **OpenAI L.L.C.** | Sugestões de conciliação bancária (opcional) | EUA | Descrição da transação, valor, data, nome de fornecedor |
| **Hostinger Brasil** | Envio de emails transacionais (SMTP) | Brasil | Email do destinatário, conteúdo do email |
| **Easypanel / VPS** | Hospedagem da aplicação e banco de dados | Brasil | Todos os dados acima (em ambiente próprio criptografado) |

**Não vendemos seus dados.** Não compartilhamos com terceiros para fins de marketing ou venda.

---

## 6. Por quanto tempo retemos

- **Conta ativa:** enquanto você for cliente do Breakr
- **Pós-encerramento:** dados pessoais (nome, email, telefone, CPF) anonimizados em até **30 dias**
- **Snapshots e backups:** mantidos por até 90 dias para fins de recuperação contra falhas
- **Trilha de auditoria de segurança:** 2 anos (logs de login, IP de acesso)
- **Registros contábeis e fiscais:** até **5 anos**, conforme art. 195 do Código Tributário Nacional e legislação fiscal aplicável
- **Dados anonimizados:** podem ser mantidos indefinidamente para análises estatísticas (deixam de ser dados pessoais)

---

## 7. Seus direitos (LGPD Art. 18)

Como titular dos dados, você tem os seguintes direitos garantidos por lei:

| Direito | O que significa | Como exercer |
|---|---|---|
| **I — Confirmação** | Confirmar se tratamos seus dados | Email para o DPO |
| **II — Acesso** | Receber cópia dos seus dados pessoais | Config → Privacidade → Baixar meus dados |
| **III — Correção** | Corrigir dados incorretos ou desatualizados | Config → Conta |
| **IV — Anonimização** | Solicitar anonimização de dados desnecessários | Email para o DPO |
| **V — Portabilidade** | Receber seus dados em formato aberto (JSON) | Config → Privacidade → Baixar meus dados |
| **VI — Eliminação** | Solicitar exclusão dos dados pessoais | Config → Zona de perigo → Excluir conta |
| **VII — Informação** | Saber com quem compartilhamos | Vide seção 5 desta política |
| **VIII — Revogação** | Revogar o consentimento dado | Config → Privacidade |
| **IX — Oposição** | Opor-se a tratamento que não exija seu consentimento | Email para o DPO |

> ✅ Conforme exigência da LGPD, o atendimento dos seus direitos é **gratuito e facilitado**. Respondemos em até **15 dias úteis**.

---

## 8. Como protegemos seus dados

- **Criptografia em trânsito:** todo o tráfego é HTTPS (TLS 1.3)
- **Senhas:** nunca armazenadas em texto plano. Hash via bcrypt (rounds=10) e gestão pelo Clerk
- **Isolamento multi-tenant:** dados de cada cliente são logicamente segregados por `clientId`
- **Backups diários:** automáticos, criptografados, com retenção de 30 dias
- **Auditoria:** todas as ações sensíveis (login, alterações de dados, exportação, exclusão) são registradas
- **Controle de acesso:** RBAC interno (apenas funcionários autorizados acessam dados; cada acesso é logado)
- **Webhooks Stripe assinados:** validação criptográfica de cada evento recebido

> ⚠️ **Importante:** nenhum sistema é 100% imune a incidentes. Caso ocorra um vazamento que afete seus dados, você será notificado em até **72 horas** conforme exigência da ANPD, com descrição do incidente e medidas adotadas.

---

## 9. Cookies e armazenamento local

Usamos cookies e LocalStorage exclusivamente para:

- **Sessão de autenticação** (essencial — não pode ser desativado)
- **Preferências de UI** (sidebar expandida, modo do banner admin, etc.)
- **Estado de modais e dicas** (para não repetir avisos já dispensados)

**Não usamos cookies de tracking de terceiros**, pixels publicitários ou Google Analytics. Métricas internas são agregadas e anônimas.

---

## 10. Transferência internacional de dados

Alguns sub-processadores (Clerk, Stripe, OpenAI) operam nos EUA. Estas transferências são realizadas com base no Art. 33 da LGPD, em especial nas *cláusulas contratuais padrão* e/ou em *garantias específicas* oferecidas pelos parceiros (SOC 2, ISO 27001, GDPR compliance).

---

## 11. Menores de idade

O Breakr é uma ferramenta B2B para gestão de restaurantes. **Não coletamos intencionalmente dados de menores de 18 anos.** Se você é responsável legal e identificou cadastro indevido de um menor, contate-nos em **juridico@breakr.com.br** para remoção imediata.

---

## 12. Alterações nesta política

Podemos atualizar esta política a qualquer momento, mas mudanças materiais (que afetem seus direitos ou alterem finalidades) serão comunicadas por email e através de notificação no app com pelo menos **30 dias de antecedência**.

Sempre que houver alteração, a data no topo desta página será atualizada. Histórico de versões anteriores está disponível mediante solicitação ao DPO.

---

## 13. Contato

### Encarregado de Dados (DPO)
*Dúvidas sobre privacidade e exercício de direitos*

📧 **juridico@breakr.com.br**

### Suporte geral
*Funcionalidades e uso do produto*

📧 **contato@breakr.com.br**

---

Caso considere que seus direitos não foram atendidos adequadamente, você pode apresentar reclamação à **Autoridade Nacional de Proteção de Dados (ANPD)** através do site oficial [gov.br/anpd](https://www.gov.br/anpd).

---

## Identificação legal

**BREAKR ASSESSORIA LTDA** · CNPJ **46.539.926/0001-50** · Breakr v1.2

[Voltar ao app](https://app.breakr.com.br)
