const { db, pool } = require('./src/db/client');
const t = require('./src/db/schema-bpo');
const { eq } = require('drizzle-orm');

async function main() {
  const hash = 'r743zcvib886f44b8y5x2';
  console.log(`Restoring data for client: ${hash}`);

  // Comprehensive Demo Data
  const demoData = {
    restaurant: { name: "Terra e Mar 360", category: "Gastronomia" },
    user: { name: "Paulo", role: "Proprietário", initials: "P" },
    period: { date: "17 de fev. de 2026", status: "Lucrativo", statusColor: "#E2FD89" },
    overview: {
        title: "Terra e Mar 360",
        subtitle: "Dados de demonstração restaurados.",
        tags: [
            { label: 'Faturamento', active: false },
            { label: 'Lucro: R$ 15.000,00', active: true, color: '#E2FD89' },
            { label: 'Margem: 15%', active: false }
        ]
    },
    revenue: {
        total: "100.000,00",
        month: "Fevereiro",
        history: [85000, 92000, 88000, 95000, 98000, 105000, 102000, 108000, 110000, 115000, 90000, 100000], 
        annualTotal: "1.200.000,00",
        status: "Positivo",
        change: "5%",
        risk: { label: "Estável", count: "0" },
        cards: [
            { label: "Custos Fixos Totais", value: "R$ 30.000,00", percentage: "30%", status: "neutral", icon: "wallet" },
            { label: "Custos Variáveis (CMV)", value: "R$ 35.000,00", percentage: "35%", status: "neutral", icon: "pie" }
        ]
    },
    breakEven: {
        percentage: 65,
        current: "65.000,00",
        min: "0",
        max: "150.000,00",
        base: { value: "65", status: "Saudável", range: "0 a 70" }
    },
    marketComparison: [],
    operational: {
        fichas: [],
        insumos: []
    },
    menuEngineering: [
        { id: 1, name: "Filet Mignon", category: "Pratos Principais", sales: 120, price: 85, cost: 25 },
        { id: 2, name: "Hamburguer Artesanal", category: "Lanches", sales: 250, price: 35, cost: 15 },
        { id: 3, name: "Salmão Grelhado", category: "Pratos Principais", sales: 95, price: 78, cost: 22 },
        { id: 4, name: "Refrigerante Lata", category: "Bebidas", sales: 500, price: 8, cost: 2 },
        { id: 5, name: "Vinho Especial", category: "Bebidas", sales: 8, price: 220, cost: 60 }
    ],
    cards: {
        moneyOnTable: { total: "100.000,00", lost: "0,00", recovered: "15.000,00", percentage: "15%" },
        technicalSheets: [
            { label: 'CMV Teórico', value: '35%' }, 
            { label: 'Fichas Desatualizadas', value: '2' }, 
            { label: 'Produtos Sem Ficha', value: '5' },
            { label: 'CMV real', value: '38%' }
        ],
        costStructure: {
            total: "65.000,00",
            percentage: "65%",
            breakdown: [
                { label: 'Pessoal + Sócios', value: 'R$ 20.000,00' },
                { label: 'Infraestrutura', value: 'R$ 5.000,00' },
                { label: 'CMV (Insumos)', value: 'R$ 35.000,00' },
                { label: 'Admin e Mkt', value: 'R$ 5.000,00' }
            ]
        }
    },
    tips: [],
    // RESTORED FORM DATA MOCK
    formData: {
        revenue_jan: "85000", revenue_feb: "100000", revenue_mar: "88000",
        rent: "5000",
        partners: [{ name: "Sócio A", salary: "10000" }],
        employees: [{ name: "Chef", salary: "5000" }, { name: "Garçom", salary: "5000" }],
        variable_costs: "35000",
        tax_regime: "Simples Nacional"
    }
  };

  await db.update(t.client)
    .set({ data: JSON.stringify(demoData), updatedAt: new Date() })
    .where(eq(t.client.hash, hash));

  console.log("Data restored successfully.");
}

main()
  .catch(e => console.error(e))
  .finally(async () => await pool.end());
