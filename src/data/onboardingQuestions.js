export const onboardingQuestions = [
  // ==================================================================================
  // FASE 0: Dados do Usuário
  // ==================================================================================
  
  // Etapa 00: Perfil do Usuário
  {
    id: 'user_info',
    section: 'Perfil do Usuário',
    title: 'Seus Dados',
    description: 'Como devemos te chamar no sistema?',
    type: 'composite',
    fields: [
      { id: 'user_name', label: 'Seu Nome', type: 'text', placeholder: 'Ex: Paulo' },
      { id: 'user_phone', label: 'WhatsApp', type: 'text', placeholder: '(11) 99999-9999' },
      { id: 'user_photo', label: 'Sua Foto (Opcional)', type: 'file', placeholder: 'Anexar sua foto' }
    ]
  },

  // ==================================================================================
  // FASE 1: Identidade e Equipe
  // ==================================================================================
  
  // Etapa 01: Identidade do Negócio (Opcional)
  {
    id: 'identity',
    section: 'Identidade e Equipe',
    title: 'Identidade do Negócio',
    description: 'Vamos começar com o básico do seu estabelecimento.',
    type: 'composite',
    fields: [
      { id: 'restaurant_name', label: 'Nome do Restaurante', type: 'text', placeholder: 'Ex: Meu Restaurante' },
      { id: 'cuisine_type', label: 'Tipo de Negócio', type: 'autocomplete', placeholder: 'Ex: Italiana, Japonesa...', options: ['Italiana', 'Japonesa', 'Brasileira', 'Contemporânea', 'Fast Food', 'Pizzaria', 'Hamburgueria', 'Asiática', 'Árabe', 'Mexicana', 'Vegetariana/Vegana', 'Cafeteria', 'Doceria/Confeitaria', 'Padaria', 'Bar/Pub', 'Steakhouse/Churrascaria', 'Frutos do Mar', 'Bistrô', 'Buffet', 'Outros'] },
      { id: 'business_logo', label: 'Logo da Empresa (Opcional)', type: 'file', placeholder: 'Anexar logo' },
      { id: 'tax_regime', label: 'Regime Tributário', type: 'select', options: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'] },
      // Logic for MEI will be handled in form if Simples is selected
      { id: 'is_mei', label: 'É MEI?', type: 'select', options: ['Não', 'Sim'], dependsOn: 'tax_regime', dependsValue: 'Simples Nacional' }
    ]
  },

  // Etapa 02: Sócios e Gestão (Pró-Labore)
  {
    id: 'partners',
    section: 'Identidade e Equipe',
    title: 'Sócios e Gestão',
    description: 'Cadastre os sócios e seus Pró-Labores (valor fiscal para custo fixo).',
    type: 'dynamic_list_calc', // Special type for list with internal calculation
    itemLabel: 'Sócio',
    calcType: 'pro_labore', // Trigger pro-labore logic
    fields: [
      { id: 'name', label: 'Nome', type: 'text', placeholder: 'Nome do Sócio' },
      { id: 'role', label: 'Cargo', type: 'text', placeholder: 'Ex: Diretor' },
      { id: 'pro_labore', label: 'Pró-Labore (R$)', type: 'currency', placeholder: 'R$ 0,00', helpText: 'Valor fiscal retirado pelo sócio. Não o valor de Lucro.' },
      { id: 'photo', label: 'Foto (Opcional)', type: 'file', placeholder: 'Anexar foto' }
    ]
  },

  // Etapa 03: Funcionários (Salários e Encargos Reais)
  {
    id: 'employees',
    section: 'Identidade e Equipe',
    title: 'Funcionários',
    description: 'Cadastre sua equipe. O sistema calculará automaticamente o "Custo Fantasma" para CLT.',
    type: 'dynamic_list_calc',
    itemLabel: 'Funcionário',
    calcType: 'clt_cost', // Trigger CLT logic
    fields: [
      { id: 'name', label: 'Nome', type: 'text', placeholder: 'Nome' },
      { id: 'role', label: 'Cargo', type: 'text', placeholder: 'Ex: Cozinheiro' },
      { id: 'base_salary', label: 'Salário Base (R$)', type: 'currency', placeholder: 'R$ 0,00' },
      { id: 'premio', label: 'Prêmio (R$)', type: 'currency', placeholder: 'R$ 0,00', tooltip: 'Pagamento de Prêmio ou valor a mais pago fora da Folha de pagamento.' },
      { id: 'regime', label: 'Regime', type: 'select', options: ['CLT', 'Freelancer', 'PJ'] },
      { id: '_separator_benefits', type: 'separator', label: 'Benefícios e Alimentação' },
      { id: 'transport_value', label: 'Valor do Vale Transporte (R$)', type: 'currency', placeholder: 'R$ 0,00' },
      { id: 'transport_qty', label: 'Qtd Vales/Dia', type: 'number', placeholder: 'Ex: 2' },
      { id: 'work_days', label: 'Dias Trabalhados/Mês', type: 'number', placeholder: 'Ex: 22' },
      { id: 'food_cost', label: 'Custo Refeição/Dia (R$)', type: 'currency', placeholder: 'R$ 0,00' }
    ]
  },

  // ==================================================================================
  // FASE 2: Infraestrutura
  // ==================================================================================

  // Etapa 05: Aluguel e IPTU
  {
    id: 'location_costs',
    section: 'Infraestrutura',
    title: 'Imóvel',
    description: 'Custos com o ponto comercial.',
    type: 'composite',
    fields: [
      { id: 'rent', label: 'Valor do Aluguel (Mensal)', type: 'currency', placeholder: 'R$ 0,00' },
      { id: 'iptu_annual', label: 'Valor IPTU (Anual)', type: 'currency', placeholder: 'R$ 0,00' }
    ]
  },

  // Etapa 06: Utilidades Básicas
  {
    id: 'utilities',
    section: 'Infraestrutura',
    title: 'Utilidades Básicas',
    description: 'Custos mensais de operação.',
    type: 'composite',
    fields: [
      { id: 'energy', label: 'Energia Elétrica', type: 'currency', placeholder: 'R$ 0,00' },
      { id: 'water', label: 'Água / Esgoto', type: 'currency', placeholder: 'R$ 0,00' },
      { id: 'internet', label: 'Internet', type: 'currency', placeholder: 'R$ 0,00' },
      { id: 'telefone', label: 'Telefone', type: 'currency', placeholder: 'R$ 0,00' },
      { id: 'security', label: 'Alarme', type: 'currency', placeholder: 'R$ 0,00', helpText: 'Sistema eletrônico de alarme monitorado.' },
      { id: 'security_guard', label: 'Segurança / Ronda / Vigia', type: 'currency', placeholder: 'R$ 0,00', helpText: 'Ronda: patrulha periódica. Vigia: presença constante no local.' }
    ]
  },

  // Etapa 07: Serviços Recorrentes (Opcional)
  {
    id: 'recurring_services',
    section: 'Infraestrutura',
    title: 'Serviços Recorrentes',
    description: 'Outros custos de manutenção.',
    type: 'composite',
    infoText: '⚠️ Sempre informe o valor MENSAL. Se o serviço for trimestral, semestral ou anual, divida o valor pelo período. Ex: Trimestral R$ 150 → R$ 50/mês. Anual R$ 600 → R$ 50/mês.',
    fields: [
      { id: 'pest_control', label: 'Dedetização', type: 'currency', placeholder: 'R$ 0,00', helpText: 'Valor MENSAL. Se for trimestral R$ 150, informe R$ 50.' },
      { id: 'waste_removal', label: 'Lixo Especial', type: 'currency', placeholder: 'R$ 0,00', helpText: 'Valor MENSAL. Se for por coleta, calcule média mensal.' },
      { id: 'cleaning_supplies', label: 'Material de Limpeza', type: 'currency', placeholder: 'R$ 0,00', helpText: 'Valor MENSAL. Se compra a cada 3 meses, divida por 3.' }
    ]
  },

  // Etapa 08: Gás, Óleo e Descartáveis (Operacional Fixo)
  {
    id: 'operational_fixed',
    section: 'Infraestrutura',
    title: 'Custos Operacionais Fixos',
    description: 'Gás de cozinha, Óleo e Descartáveis. Recomendamos considerar fixo para simplificação.',
    type: 'composite',
    infoText: 'Estes custos são normalmente considerados como custos variáveis, portanto use a metodologia Breaker para aumentar a precificação.',
    fields: [
      { id: 'kitchen_gas', label: 'Gás de Cozinha (Média)', type: 'currency', placeholder: 'R$ 0,00' },
      { id: 'kitchen_oil', label: 'Óleo / Gordura (Média)', type: 'currency', placeholder: 'R$ 0,00' },
      { id: 'disposables', label: 'Descartáveis (Média)', type: 'currency', placeholder: 'R$ 0,00', helpText: 'Embalagens delivery/salão, copos, talheres, guardanapos. Média dos últimos 3 meses.' }
    ]
  },

  // Etapa 08b: Serviços Recorrentes Mensais
  {
    id: 'monthly_services',
    section: 'Infraestrutura',
    title: 'Serviços Recorrentes Mensais',
    description: 'Adicione serviços recorrentes mensais contratados.',
    type: 'dynamic_list_calc',
    itemLabel: 'Serviço',
    calcType: 'none',
    fields: [
      { id: 'name', label: 'Descrição do Serviço', type: 'text', placeholder: 'Ex: Manutenção de ar-condicionado' },
      { id: 'value', label: 'Valor Mensal', type: 'currency', placeholder: 'R$ 0,00' }
    ]
  },

  // ==================================================================================
  // FASE 3: Ativos e Inteligência
  // ==================================================================================

  // Etapa 09: Inventário e Depreciação
  {
    id: 'equipment',
    section: 'Ativos e Inteligência',
    title: 'Equipamentos (Depreciação)',
    description: 'Liste grandes equipamentos para calcular a depreciação mensal.',
    type: 'dynamic_list_calc',
    itemLabel: 'Equipamento',
    calcType: 'depreciation',
    infoText: 'Use o custo fixo com duração de 5 anos para abater esse valor.',
    fields: [
        { id: 'name', label: 'Equipamento', type: 'text', placeholder: 'Ex: Forno Combinado' },
        { id: 'value', label: 'Valor Pago', type: 'currency', placeholder: 'R$ 0,00' },
        { id: 'lifespan', label: 'Vida Útil (Anos)', type: 'number', placeholder: '5', readOnly: true, defaultValue: '5' }
    ]
  },

  // Etapa 10: Inteligência e Administrativo
  {
    id: 'admin_systems',
    section: 'Ativos e Inteligência',
    title: 'Sistemas e Adm.',
    description: 'Softwares, serviços e impostos.',
    type: 'composite',
    fields: [
        { id: 'systems_count', label: 'Quantos sistemas você usa?', type: 'select', options: ['1 Sistema', '2 Sistemas', '3+ Sistemas'] },
        { id: 'software_pdv', label: 'Software / Sistema (Mensal)', type: 'currency', placeholder: 'R$ 0,00' },
        { id: 'accountant', label: 'Serviços Contábeis', type: 'currency', placeholder: 'R$ 0,00' },
        { id: 'taxes_das', label: 'Imposto Fixo (MEI/DAS)', type: 'currency', placeholder: 'R$ 87,05', defaultValue: '87,05', readOnly: true, dependsOnGlobal: 'identity.is_mei', dependsValue: 'Sim' },
        { id: 'simples_rate', label: 'Alíquota Simples Nacional (%)', type: 'text', placeholder: 'Automático (Via Fat. Anual)', hidden: true },
        { id: 'card_machine_rent', label: 'Aluguel Maquininha', type: 'currency', placeholder: 'R$ 0,00', helpText: 'Caso você alugue a máquina.' }
    ]
  },

  // Etapa 11: Veículos (Opcional)
  {
    id: 'vehicles',
    section: 'Ativos e Inteligência',
    title: 'Veículos da Operação',
    description: 'Custos com veículos da empresa.',
    type: 'dynamic_list_calc',
    itemLabel: 'Veículo',
    calcType: 'vehicle_cost',
    fields: [
        { id: 'name', label: 'Veículo', type: 'text', placeholder: 'Ex: Fiorino' },
        { id: 'installment', label: 'Parcela/Financ. (Mensal)', type: 'currency', placeholder: 'R$ 0,00' },
        { id: 'insurance_annual', label: 'Seguro (Anual)', type: 'currency', placeholder: 'R$ 0,00' },
        { id: 'ipva_annual', label: 'IPVA (Anual)', type: 'currency', placeholder: 'R$ 0,00' },
        { id: 'maintenance_monthly', label: 'Combustível/Manut. (Mensal)', type: 'currency', placeholder: 'R$ 0,00' }
    ]
  },

  // ==================================================================================
  // FASE 4: Marketing e Vendas
  // ==================================================================================

  // Etapa 12: Marketing
  {
    id: 'marketing_structure',
    section: 'Marketing e Vendas',
    title: 'Estrutura de Marketing',
    description: 'Investimento fixo mensal.',
    type: 'composite',
    fields: [
        { id: 'agency', label: 'Agência / Freelancer', type: 'currency', placeholder: 'R$ 0,00' },
        { id: 'ads_budget', label: 'Investimento em Tráfego Pago', type: 'currency', placeholder: 'R$ 0,00' },
        { id: 'ads_platform', label: 'Plataforma / Canal', type: 'text', placeholder: 'Ex: Google Ads, Instagram...' },
        { id: 'gifts_cost', label: 'Custo Brindes (Unit)', type: 'currency', placeholder: 'R$ 0,00' },
        { id: 'gifts_qty', label: 'Qtd Brindes/Mês', type: 'number', placeholder: 'Ex: 50' }
    ]
  },

  // Etapa 13: Taxas (Marketplace e Cartão)
  {
    id: 'fees_marketplaces',
    section: 'Marketing e Vendas',
    title: 'Marketplaces (Delivery)',
    description: 'Cadastre seus canais de venda.',
    type: 'dynamic_list_calc',
    itemLabel: 'Canal',
    calcType: 'none',
    fields: [
        { id: 'provider', label: 'Plataforma', type: 'select', options: ['iFood', 'Rappi', 'Delivery Much', 'App Próprio', 'Outro'] },
        { id: 'custom_provider', label: 'Nome da Plataforma', type: 'text', placeholder: 'Ex: Uber Eats, 99Food...', dependsOn: { field: 'provider', value: 'Outro' } },
        { id: 'monthly_fee', label: 'Mensalidade Fixa', type: 'currency', placeholder: 'R$ 0,00' },
        { id: 'commission', label: '% Comissão', type: 'percentage', placeholder: 'Ex: 12%' },
        { id: 'sales_percentage', label: '% das Vendas Totais', type: 'percentage', placeholder: 'Ex: 25%', helpText: 'Percentual do faturamento total que vem deste canal' }
    ]
  },
  {
    id: 'fees_cards',
    section: 'Marketing e Vendas',
    title: 'Taxas de Cartão',
    description: 'Cadastre suas maquininhas.',
    type: 'dynamic_list_calc',
    itemLabel: 'Operadora',
    calcType: 'none',
    fields: [
        { id: 'provider', label: 'Operadora', type: 'select', options: ['PagSeguro', 'Stone', 'Cielo', 'Rede', 'Getnet', 'Outra'] },
        { id: 'custom_provider', label: 'Nome da Operadora', type: 'text', placeholder: 'Ex: Sumup, Mercado Pago...', dependsOn: { field: 'provider', value: 'Outra' } },
        { id: 'debit_rate', label: 'Taxa Débito (%)', type: 'percentage', placeholder: '1.99%' },
        { id: 'credit_rate', label: 'Taxa Crédito (%)', type: 'percentage', placeholder: '3.49%' }
    ]
  },

  // Etapa 14: Outros Custos Fixos (movido para antes do faturamento)
  {
    id: 'other_fixed_costs',
    section: 'Infraestrutura',
    title: 'Outros Custos Fixos',
    description: 'Adicione outros custos fixos não listados anteriormente.',
    type: 'dynamic_list_calc',
    itemLabel: 'Custo',
    calcType: 'none',
    fields: [
        { id: 'name', label: 'Descrição', type: 'text', placeholder: 'Ex: Manutenção predial' },
        { id: 'value', label: 'Valor Mensal', type: 'currency', placeholder: 'R$ 0,00' }
    ]
  },

  // Etapa 15: Faturamento
  {
    id: 'revenue_history',
    section: 'Marketing e Vendas',
    title: 'Histórico de Faturamento',
    description: 'Faturamento bruto dos últimos meses disponível.',
    type: 'dynamic_list_calc',
    itemLabel: 'Mês',
    minItems: 3,
    infoText: 'Preencha o máximo de histórico de faturamento possível. Recomendamos no mínimo 3 meses.',
    fields: [
        { id: 'month', label: 'Mês/Ano', type: 'text', placeholder: 'MM/AAAA' },
        { id: 'amount', label: 'Faturamento', type: 'currency', placeholder: 'R$ 0,00' }
    ]
  }
];
