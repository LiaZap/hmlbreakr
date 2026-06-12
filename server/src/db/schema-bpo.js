'use strict';
/**
 * schema-bpo.js — tabelas geridas historicamente pelo PRISMA, agora definidas
 * em Drizzle p/ a migração Prisma->Drizzle. Gerado de drizzle-pull (introspect),
 * sem os blocos foreignKey (o banco impõe as FKs; Drizzle só consulta).
 * NÃO usado p/ migração de DDL (Prisma ainda é dono do schema dessas tabelas).
 */
const { pgTable, index, uniqueIndex, text, boolean, timestamp, foreignKey, numeric, integer, serial } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");



const adminUser = pgTable("AdminUser", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	password: text(),
	clerkUserId: text(),
	role: text().notNull(),
	photo: text(),
	active: boolean().default(true).notNull(),
	invitedBy: text(),
	invitedAt: timestamp({ precision: 3, mode: 'string' }),
	lastLoginAt: timestamp({ precision: 3, mode: 'string' }),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	permissions: text().array().default(["RAY"]).notNull(),
}, (table) => [
	index("AdminUser_active_idx").using("btree", table.active.asc().nullsLast().op("bool_ops")),
	uniqueIndex("AdminUser_clerkUserId_key").using("btree", table.clerkUserId.asc().nullsLast().op("text_ops")),
	index("AdminUser_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
	uniqueIndex("AdminUser_email_key").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("AdminUser_role_idx").using("btree", table.role.asc().nullsLast().op("text_ops"))
]);

const financialCategory = pgTable("FinancialCategory", {
	id: text().primaryKey().notNull(),
	clientId: text().notNull(),
	name: text().notNull(),
	type: text().notNull(),
	parentId: text(),
	dreGroup: text(),
	color: text(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	index("FinancialCategory_clientId_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops"))
]);

const auditLog = pgTable("AuditLog", {
	id: text().primaryKey().notNull(),
	action: text().notNull(),
	entityType: text().notNull(),
	entityId: text(),
	actorType: text().notNull(),
	actorId: text(),
	actorLabel: text(),
	summary: text(),
	metadata: text(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	category: text(),
}, (table) => [
	index("AuditLog_action_createdAt_idx").using("btree", table.action.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	index("AuditLog_category_createdAt_idx").using("btree", table.category.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("AuditLog_createdAt_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("AuditLog_entityType_entityId_createdAt_idx").using("btree", table.entityType.asc().nullsLast().op("text_ops"), table.entityId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops"))
]);

const bankTransaction = pgTable("BankTransaction", {
	id: text().primaryKey().notNull(),
	bankAccountId: text().notNull(),
	externalId: text(),
	amount: numeric({ precision: 18, scale:  2 }).notNull(),
	date: timestamp({ precision: 3, mode: 'string' }).notNull(),
	description: text().notNull(),
	type: text().default('debit').notNull(),
	reconciledType: text(),
	reconciledId: text(),
	reconciledAt: timestamp({ precision: 3, mode: 'string' }),
	source: text().default('manual').notNull(),
	rawJson: text(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("BankTransaction_bankAccountId_date_idx").using("btree", table.bankAccountId.asc().nullsLast().op("timestamp_ops"), table.date.asc().nullsLast().op("text_ops")),
	index("BankTransaction_reconciledType_reconciledId_idx").using("btree", table.reconciledType.asc().nullsLast().op("text_ops"), table.reconciledId.asc().nullsLast().op("text_ops"))
]);

const bankTransfer = pgTable("BankTransfer", {
	id: text().primaryKey().notNull(),
	clientId: text().notNull(),
	fromAccountId: text().notNull(),
	toAccountId: text().notNull(),
	amount: numeric({ precision: 18, scale:  2 }).notNull(),
	date: timestamp({ precision: 3, mode: 'string' }).notNull(),
	description: text(),
	fee: numeric({ precision: 18, scale:  2 }).default('0').notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("BankTransfer_clientId_date_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops"), table.date.asc().nullsLast().op("text_ops"))
]);

const bpoEmployee = pgTable("BpoEmployee", {
	id: text().primaryKey().notNull(),
	clientId: text().notNull(),
	name: text().notNull(),
	cpf: text(),
	email: text(),
	phone: text(),
	bankCode: text(),
	agency: text(),
	account: text(),
	pixKey: text(),
	role: text().notNull(),
	isFreelancer: boolean().default(false).notNull(),
	isMotoboy: boolean().default(false).notNull(),
	baseSalary: numeric({ precision: 18, scale:  2 }),
	commissionPct: numeric({ precision: 5, scale:  2 }),
	tipsAmount: numeric({ precision: 18, scale:  2 }),
	overtimeAmount: numeric({ precision: 18, scale:  2 }),
	active: boolean().default(true).notNull(),
	hiredAt: timestamp({ precision: 3, mode: 'string' }),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	uniqueIndex("BpoEmployee_clientId_cpf_key").using("btree", table.clientId.asc().nullsLast().op("text_ops"), table.cpf.asc().nullsLast().op("text_ops")),
	index("BpoEmployee_clientId_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops"))
]);

const bpoPartner = pgTable("BpoPartner", {
	id: text().primaryKey().notNull(),
	clientId: text().notNull(),
	name: text().notNull(),
	cpf: text(),
	email: text(),
	phone: text(),
	prolaboreAmount: numeric({ precision: 18, scale:  2 }).notNull(),
	personalAccountBank: text(),
	personalAccountAgency: text(),
	personalAccountNumber: text(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	uniqueIndex("BpoPartner_clientId_cpf_key").using("btree", table.clientId.asc().nullsLast().op("text_ops"), table.cpf.asc().nullsLast().op("text_ops")),
	index("BpoPartner_clientId_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops"))
]);

const bpoTask = pgTable("BpoTask", {
	id: text().primaryKey().notNull(),
	clientId: text().notNull(),
	type: text().notNull(),
	severity: text().default('normal').notNull(),
	title: text().notNull(),
	description: text(),
	relatedType: text(),
	relatedId: text(),
	dueAt: timestamp({ precision: 3, mode: 'string' }),
	status: text().default('open').notNull(),
	resolvedAt: timestamp({ precision: 3, mode: 'string' }),
	assignedTo: text(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	index("BpoTask_clientId_status_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("BpoTask_status_severity_dueAt_idx").using("btree", table.status.asc().nullsLast().op("timestamp_ops"), table.severity.asc().nullsLast().op("text_ops"), table.dueAt.asc().nullsLast().op("text_ops"))
]);

const clientDataSnapshot = pgTable("ClientDataSnapshot", {
	id: text().primaryKey().notNull(),
	clientId: text().notNull(),
	data: text().notNull(),
	size: integer().notNull(),
	reason: text(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("ClientDataSnapshot_clientId_createdAt_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops"))
]);

const broadcast = pgTable("Broadcast", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	message: text().notNull(),
	imageUrl: text(),
	type: text().default('popup').notNull(),
	active: boolean().default(true).notNull(),
	targetCategory: text(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	expiresAt: timestamp({ precision: 3, mode: 'string' }),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("Broadcast_active_idx").using("btree", table.active.asc().nullsLast().op("bool_ops")),
	index("Broadcast_targetCategory_idx").using("btree", table.targetCategory.asc().nullsLast().op("text_ops"))
]);

const agency = pgTable("Agency", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	hash: text().notNull(),
	email: text().notNull(),
	password: text().notNull(),
	resetToken: text(),
	resetTokenAt: timestamp({ precision: 3, mode: 'string' }),
	stripeCustomerId: text(),
	stripeSubscriptionId: text(),
	plan: text().default('basic').notNull(),
	active: boolean().default(false).notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("Agency_active_idx").using("btree", table.active.asc().nullsLast().op("bool_ops")),
	uniqueIndex("Agency_email_key").using("btree", table.email.asc().nullsLast().op("text_ops")),
	uniqueIndex("Agency_hash_key").using("btree", table.hash.asc().nullsLast().op("text_ops"))
]);

const client = pgTable("Client", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	hash: text().notNull(),
	data: text().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	email: text(),
	password: text(),
	resetToken: text(),
	resetTokenAt: timestamp({ precision: 3, mode: 'string' }),
	stripeCustomerId: text(),
	stripeSubscriptionId: text(),
	active: boolean().default(true).notNull(),
	agencyId: integer(),
	clerkUserId: text(),
	bpoEnabled: boolean().default(false).notNull(),
	bpoActivatedAt: timestamp({ precision: 3, mode: 'string' }),
	subscriptionStatus: text(),
	subscriptionPlan: text(),
	trialEndsAt: timestamp({ precision: 3, mode: 'string' }),
	currentPeriodEnd: timestamp({ precision: 3, mode: 'string' }),
	pastDueSince: timestamp({ precision: 3, mode: 'string' }),
	canceledAt: timestamp({ precision: 3, mode: 'string' }),
	blockedByAdmin: boolean().default(false).notNull(),
	blockedAt: timestamp({ precision: 3, mode: 'string' }),
	blockedReason: text(),
	blockedByUserId: text(),
	readInsumosFromTables: boolean().default(false).notNull(),
	readFichasFromTables: boolean().default(false).notNull(),
	readMenuFromTables: boolean().default(false).notNull(),
	readFaturamentoFromTables: boolean().default(false).notNull(),
	readCustosFromTables: boolean().default(false).notNull(),
	readResidueFromTables: boolean().default(false).notNull(),
}, (table) => [
	index("Client_active_idx").using("btree", table.active.asc().nullsLast().op("bool_ops")),
	index("Client_agencyId_idx").using("btree", table.agencyId.asc().nullsLast().op("int4_ops")),
	index("Client_blockedByAdmin_idx").using("btree", table.blockedByAdmin.asc().nullsLast().op("bool_ops")),
	uniqueIndex("Client_clerkUserId_key").using("btree", table.clerkUserId.asc().nullsLast().op("text_ops")).where(sql`("clerkUserId" IS NOT NULL)`),
	uniqueIndex("Client_email_key").using("btree", table.email.asc().nullsLast().op("text_ops")),
	uniqueIndex("Client_hash_key").using("btree", table.hash.asc().nullsLast().op("text_ops")),
	index("Client_subscriptionStatus_idx").using("btree", table.subscriptionStatus.asc().nullsLast().op("text_ops"))
]);

const paymentMethod = pgTable("PaymentMethod", {
	id: text().primaryKey().notNull(),
	clientId: text().notNull(),
	name: text().notNull(),
	type: text().notNull(),
	feePercent: numeric({ precision: 5, scale:  2 }).default('0').notNull(),
	settlementDays: integer().default(0).notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	index("PaymentMethod_clientId_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops"))
]);

const paymentTransaction = pgTable("PaymentTransaction", {
	id: text().primaryKey().notNull(),
	payableId: text(),
	receivableId: text(),
	amount: numeric({ precision: 18, scale:  2 }).notNull(),
	paidAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	bankAccountId: text().notNull(),
	isPartial: boolean().default(false).notNull(),
	notes: text(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("PaymentTransaction_bankAccountId_paidAt_idx").using("btree", table.bankAccountId.asc().nullsLast().op("timestamp_ops"), table.paidAt.asc().nullsLast().op("text_ops")),
	index("PaymentTransaction_payableId_idx").using("btree", table.payableId.asc().nullsLast().op("text_ops")),
	index("PaymentTransaction_receivableId_idx").using("btree", table.receivableId.asc().nullsLast().op("text_ops"))
]);

const pdvIntegration = pgTable("PdvIntegration", {
	id: text().primaryKey().notNull(),
	clientId: text().notNull(),
	provider: text().notNull(),
	authConfig: text().notNull(),
	active: boolean().default(true).notNull(),
	lastSyncAt: timestamp({ precision: 3, mode: 'string' }),
	lastSyncStatus: text(),
	lastSyncError: text(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	index("PdvIntegration_clientId_active_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops"), table.active.asc().nullsLast().op("text_ops"))
]);

const loan = pgTable("Loan", {
	id: text().primaryKey().notNull(),
	clientId: text().notNull(),
	bankName: text().notNull(),
	contractNumber: text(),
	description: text(),
	principal: numeric({ precision: 18, scale:  2 }).notNull(),
	interestRateMonthly: numeric({ precision: 7, scale:  4 }).notNull(),
	totalInstallments: integer().notNull(),
	paidInstallments: integer().default(0).notNull(),
	startDate: timestamp({ precision: 3, mode: 'string' }).notNull(),
	installmentValue: numeric({ precision: 18, scale:  2 }).notNull(),
	totalToPay: numeric({ precision: 18, scale:  2 }).notNull(),
	totalInterest: numeric({ precision: 18, scale:  2 }).notNull(),
	currentBalance: numeric({ precision: 18, scale:  2 }).notNull(),
	status: text().default('active').notNull(),
	notes: text(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	index("Loan_clientId_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops")),
	index("Loan_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops"))
]);

const payable = pgTable("Payable", {
	id: text().primaryKey().notNull(),
	clientId: text().notNull(),
	supplierId: text(),
	amount: numeric({ precision: 18, scale:  2 }).notNull(),
	remainingAmount: numeric({ precision: 18, scale:  2 }).notNull(),
	dueDate: timestamp({ precision: 3, mode: 'string' }).notNull(),
	paymentForecast: timestamp({ precision: 3, mode: 'string' }).notNull(),
	emissionDate: timestamp({ precision: 3, mode: 'string' }),
	invoiceNumber: text(),
	description: text(),
	categoryId: text(),
	department: text(),
	status: text().default('pending').notNull(),
	recurrenceId: text(),
	parentId: text(),
	installmentNumber: integer(),
	attachments: text(),
	taxesRetained: text(),
	scheduledAt: timestamp({ precision: 3, mode: 'string' }),
	scheduledBankId: text(),
	scheduledStatus: text(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	requiresApproval: boolean().default(false).notNull(),
	approvedAt: timestamp({ precision: 3, mode: 'string' }),
	approvedBy: text(),
	rejectedAt: timestamp({ precision: 3, mode: 'string' }),
	rejectionReason: text(),
}, (table) => [
	index("Payable_clientId_requiresApproval_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops"), table.requiresApproval.asc().nullsLast().op("text_ops")),
	index("Payable_clientId_status_dueDate_idx").using("btree", table.clientId.asc().nullsLast().op("timestamp_ops"), table.status.asc().nullsLast().op("text_ops"), table.dueDate.asc().nullsLast().op("text_ops")),
	index("Payable_supplierId_idx").using("btree", table.supplierId.asc().nullsLast().op("text_ops"))
]);

const receivable = pgTable("Receivable", {
	id: text().primaryKey().notNull(),
	clientId: text().notNull(),
	payerName: text().notNull(),
	payerDocument: text(),
	amount: numeric({ precision: 18, scale:  2 }).notNull(),
	remainingAmount: numeric({ precision: 18, scale:  2 }).notNull(),
	dueDate: timestamp({ precision: 3, mode: 'string' }).notNull(),
	receiptForecast: timestamp({ precision: 3, mode: 'string' }).notNull(),
	emissionDate: timestamp({ precision: 3, mode: 'string' }),
	invoiceNumber: text(),
	description: text(),
	categoryId: text(),
	paymentMethodId: text(),
	department: text(),
	status: text().default('pending').notNull(),
	recurrenceId: text(),
	parentId: text(),
	installmentNumber: integer(),
	pdvSaleId: text(),
	attachments: text(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	index("Receivable_clientId_status_dueDate_idx").using("btree", table.clientId.asc().nullsLast().op("timestamp_ops"), table.status.asc().nullsLast().op("text_ops"), table.dueDate.asc().nullsLast().op("timestamp_ops"))
]);

const receivableAdvance = pgTable("ReceivableAdvance", {
	id: text().primaryKey().notNull(),
	clientId: text().notNull(),
	paymentMethodId: text(),
	description: text().notNull(),
	monthlyRate: numeric({ precision: 7, scale:  4 }).notNull(),
	averageValue: numeric({ precision: 18, scale:  2 }).notNull(),
	daysAdvanced: integer().notNull(),
	dailyRate: numeric({ precision: 9, scale:  6 }).notNull(),
	totalDiscount: numeric({ precision: 18, scale:  2 }).notNull(),
	finalValue: numeric({ precision: 18, scale:  2 }).notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	index("ReceivableAdvance_clientId_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops"))
]);

const supplier = pgTable("Supplier", {
	id: text().primaryKey().notNull(),
	clientId: text().notNull(),
	cnpj: text().notNull(),
	name: text().notNull(),
	email: text(),
	phone: text(),
	pixKey: text(),
	bankCode: text(),
	agency: text(),
	account: text(),
	defaultCategoryId: text(),
	defaultBankAccountId: text(),
	notes: text(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	active: boolean().default(true).notNull(),
}, (table) => [
	uniqueIndex("Supplier_clientId_cnpj_key").using("btree", table.clientId.asc().nullsLast().op("text_ops"), table.cnpj.asc().nullsLast().op("text_ops")),
	index("Supplier_clientId_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops"))
]);

const stripeEvent = pgTable("StripeEvent", {
	id: text().primaryKey().notNull(),
	type: text().notNull(),
	clientId: text(),
	payload: text().notNull(),
	processedAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("StripeEvent_clientId_processedAt_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops"), table.processedAt.asc().nullsLast().op("timestamp_ops")),
	index("StripeEvent_type_processedAt_idx").using("btree", table.type.asc().nullsLast().op("text_ops"), table.processedAt.asc().nullsLast().op("text_ops"))
]);

const reconciliationRule = pgTable("ReconciliationRule", {
	id: text().primaryKey().notNull(),
	clientId: text().notNull(),
	keyword: text().notNull(),
	matchType: text().default('contains').notNull(),
	supplierId: text(),
	payerName: text(),
	categoryId: text(),
	bankAccountId: text(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	index("ReconciliationRule_clientId_active_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops"), table.active.asc().nullsLast().op("text_ops"))
]);

const whatsappMessage = pgTable("WhatsappMessage", {
	id: text().primaryKey().notNull(),
	clientId: text(),
	fromNumber: text().notNull(),
	senderName: text(),
	messageType: text().default('text').notNull(),
	textContent: text(),
	mediaUrl: text(),
	mediaCaption: text(),
	conversationStep: text(),
	conversationData: text(),
	validatedAt: timestamp({ precision: 3, mode: 'string' }),
	validatedBy: text(),
	createdPayableId: text(),
	createdReceivableId: text(),
	status: text().default('pending').notNull(),
	rawJson: text(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	index("WhatsappMessage_clientId_status_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("WhatsappMessage_fromNumber_idx").using("btree", table.fromNumber.asc().nullsLast().op("text_ops")),
	index("WhatsappMessage_status_createdAt_idx").using("btree", table.status.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops"))
]);

const teamMember = pgTable("TeamMember", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	hash: text().notNull(),
	email: text().notNull(),
	password: text(),
	role: text().default('Gerente').notNull(),
	clientId: text().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	clerkUserId: text(),
	active: boolean().default(true).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	uniqueIndex("TeamMember_clerkUserId_key").using("btree", table.clerkUserId.asc().nullsLast().op("text_ops")),
	index("TeamMember_clientId_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops")),
	uniqueIndex("TeamMember_email_key").using("btree", table.email.asc().nullsLast().op("text_ops")),
	uniqueIndex("TeamMember_hash_key").using("btree", table.hash.asc().nullsLast().op("text_ops"))
]);

const bankAccount = pgTable("BankAccount", {
	id: text().primaryKey().notNull(),
	clientId: text().notNull(),
	bankCode: text().notNull(),
	bankName: text().notNull(),
	agency: text().notNull(),
	account: text().notNull(),
	type: text().default('corrente').notNull(),
	currentBalance: numeric({ precision: 18, scale:  2 }).default('0').notNull(),
	isManual: boolean().default(true).notNull(),
	openFinanceItemId: text(),
	openFinanceConnected: boolean().default(false).notNull(),
	lastSyncAt: timestamp({ precision: 3, mode: 'string' }),
	active: boolean().default(true).notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	index("BankAccount_clientId_idx").using("btree", table.clientId.asc().nullsLast().op("text_ops"))
]);

const recurrence = pgTable("Recurrence", {
	id: text().primaryKey().notNull(),
	frequency: text().notNull(),
	intervalCount: integer().default(1).notNull(),
	startDate: timestamp({ precision: 3, mode: 'string' }).notNull(),
	endDate: timestamp({ precision: 3, mode: 'string' }),
	occurrencesCount: integer(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("Recurrence_startDate_idx").using("btree", table.startDate.asc().nullsLast().op("timestamp_ops"))
]);

module.exports = { adminUser, financialCategory, auditLog, bankTransaction, bankTransfer, bpoEmployee, bpoPartner, bpoTask, clientDataSnapshot, broadcast, agency, client, paymentMethod, paymentTransaction, pdvIntegration, loan, payable, receivable, receivableAdvance, supplier, stripeEvent, reconciliationRule, whatsappMessage, teamMember, bankAccount, recurrence };
