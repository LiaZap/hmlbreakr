CREATE TABLE IF NOT EXISTS "AdminUser" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text,
	"clerkUserId" text,
	"role" text NOT NULL,
	"photo" text,
	"active" boolean DEFAULT true NOT NULL,
	"invitedBy" text,
	"invitedAt" timestamp(3),
	"lastLoginAt" timestamp(3),
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"permissions" text[] DEFAULT '{"RAY"}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "FinancialCategory" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parentId" text,
	"dreGroup" text,
	"color" text,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "AuditLog" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text,
	"actorType" text NOT NULL,
	"actorId" text,
	"actorLabel" text,
	"summary" text,
	"metadata" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"category" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "BankTransaction" (
	"id" text PRIMARY KEY NOT NULL,
	"bankAccountId" text NOT NULL,
	"externalId" text,
	"amount" numeric(18, 2) NOT NULL,
	"date" timestamp(3) NOT NULL,
	"description" text NOT NULL,
	"type" text DEFAULT 'debit' NOT NULL,
	"reconciledType" text,
	"reconciledId" text,
	"reconciledAt" timestamp(3),
	"source" text DEFAULT 'manual' NOT NULL,
	"rawJson" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "BankTransfer" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"fromAccountId" text NOT NULL,
	"toAccountId" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"date" timestamp(3) NOT NULL,
	"description" text,
	"fee" numeric(18, 2) DEFAULT '0' NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "BpoEmployee" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"name" text NOT NULL,
	"cpf" text,
	"email" text,
	"phone" text,
	"bankCode" text,
	"agency" text,
	"account" text,
	"pixKey" text,
	"role" text NOT NULL,
	"isFreelancer" boolean DEFAULT false NOT NULL,
	"isMotoboy" boolean DEFAULT false NOT NULL,
	"baseSalary" numeric(18, 2),
	"commissionPct" numeric(5, 2),
	"tipsAmount" numeric(18, 2),
	"overtimeAmount" numeric(18, 2),
	"active" boolean DEFAULT true NOT NULL,
	"hiredAt" timestamp(3),
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "BpoPartner" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"name" text NOT NULL,
	"cpf" text,
	"email" text,
	"phone" text,
	"prolaboreAmount" numeric(18, 2) NOT NULL,
	"personalAccountBank" text,
	"personalAccountAgency" text,
	"personalAccountNumber" text,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "BpoTask" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'normal' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"relatedType" text,
	"relatedId" text,
	"dueAt" timestamp(3),
	"status" text DEFAULT 'open' NOT NULL,
	"resolvedAt" timestamp(3),
	"assignedTo" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ClientDataSnapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"data" text NOT NULL,
	"size" integer NOT NULL,
	"reason" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Broadcast" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"imageUrl" text,
	"type" text DEFAULT 'popup' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"targetCategory" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"expiresAt" timestamp(3),
	"updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Agency" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"hash" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"resetToken" text,
	"resetTokenAt" timestamp(3),
	"stripeCustomerId" text,
	"stripeSubscriptionId" text,
	"plan" text DEFAULT 'basic' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Client" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"hash" text NOT NULL,
	"data" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"email" text,
	"password" text,
	"resetToken" text,
	"resetTokenAt" timestamp(3),
	"stripeCustomerId" text,
	"stripeSubscriptionId" text,
	"active" boolean DEFAULT true NOT NULL,
	"agencyId" integer,
	"clerkUserId" text,
	"bpoEnabled" boolean DEFAULT false NOT NULL,
	"bpoActivatedAt" timestamp(3),
	"subscriptionStatus" text,
	"subscriptionPlan" text,
	"trialEndsAt" timestamp(3),
	"currentPeriodEnd" timestamp(3),
	"pastDueSince" timestamp(3),
	"canceledAt" timestamp(3),
	"blockedByAdmin" boolean DEFAULT false NOT NULL,
	"blockedAt" timestamp(3),
	"blockedReason" text,
	"blockedByUserId" text,
	"readInsumosFromTables" boolean DEFAULT false NOT NULL,
	"readFichasFromTables" boolean DEFAULT false NOT NULL,
	"readMenuFromTables" boolean DEFAULT false NOT NULL,
	"readFaturamentoFromTables" boolean DEFAULT false NOT NULL,
	"readCustosFromTables" boolean DEFAULT false NOT NULL,
	"readResidueFromTables" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PaymentMethod" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"feePercent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"settlementDays" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PaymentTransaction" (
	"id" text PRIMARY KEY NOT NULL,
	"payableId" text,
	"receivableId" text,
	"amount" numeric(18, 2) NOT NULL,
	"paidAt" timestamp(3) NOT NULL,
	"bankAccountId" text NOT NULL,
	"isPartial" boolean DEFAULT false NOT NULL,
	"notes" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PdvIntegration" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"provider" text NOT NULL,
	"authConfig" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"lastSyncAt" timestamp(3),
	"lastSyncStatus" text,
	"lastSyncError" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Loan" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"bankName" text NOT NULL,
	"contractNumber" text,
	"description" text,
	"principal" numeric(18, 2) NOT NULL,
	"interestRateMonthly" numeric(7, 4) NOT NULL,
	"totalInstallments" integer NOT NULL,
	"paidInstallments" integer DEFAULT 0 NOT NULL,
	"startDate" timestamp(3) NOT NULL,
	"installmentValue" numeric(18, 2) NOT NULL,
	"totalToPay" numeric(18, 2) NOT NULL,
	"totalInterest" numeric(18, 2) NOT NULL,
	"currentBalance" numeric(18, 2) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Payable" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"supplierId" text,
	"amount" numeric(18, 2) NOT NULL,
	"remainingAmount" numeric(18, 2) NOT NULL,
	"dueDate" timestamp(3) NOT NULL,
	"paymentForecast" timestamp(3) NOT NULL,
	"emissionDate" timestamp(3),
	"invoiceNumber" text,
	"description" text,
	"categoryId" text,
	"department" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"recurrenceId" text,
	"parentId" text,
	"installmentNumber" integer,
	"attachments" text,
	"taxesRetained" text,
	"scheduledAt" timestamp(3),
	"scheduledBankId" text,
	"scheduledStatus" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"requiresApproval" boolean DEFAULT false NOT NULL,
	"approvedAt" timestamp(3),
	"approvedBy" text,
	"rejectedAt" timestamp(3),
	"rejectionReason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Receivable" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"payerName" text NOT NULL,
	"payerDocument" text,
	"amount" numeric(18, 2) NOT NULL,
	"remainingAmount" numeric(18, 2) NOT NULL,
	"dueDate" timestamp(3) NOT NULL,
	"receiptForecast" timestamp(3) NOT NULL,
	"emissionDate" timestamp(3),
	"invoiceNumber" text,
	"description" text,
	"categoryId" text,
	"paymentMethodId" text,
	"department" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"recurrenceId" text,
	"parentId" text,
	"installmentNumber" integer,
	"pdvSaleId" text,
	"attachments" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ReceivableAdvance" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"paymentMethodId" text,
	"description" text NOT NULL,
	"monthlyRate" numeric(7, 4) NOT NULL,
	"averageValue" numeric(18, 2) NOT NULL,
	"daysAdvanced" integer NOT NULL,
	"dailyRate" numeric(9, 6) NOT NULL,
	"totalDiscount" numeric(18, 2) NOT NULL,
	"finalValue" numeric(18, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Supplier" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"cnpj" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"pixKey" text,
	"bankCode" text,
	"agency" text,
	"account" text,
	"defaultCategoryId" text,
	"defaultBankAccountId" text,
	"notes" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "StripeEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"clientId" text,
	"payload" text NOT NULL,
	"processedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ReconciliationRule" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"keyword" text NOT NULL,
	"matchType" text DEFAULT 'contains' NOT NULL,
	"supplierId" text,
	"payerName" text,
	"categoryId" text,
	"bankAccountId" text,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "WhatsappMessage" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text,
	"fromNumber" text NOT NULL,
	"senderName" text,
	"messageType" text DEFAULT 'text' NOT NULL,
	"textContent" text,
	"mediaUrl" text,
	"mediaCaption" text,
	"conversationStep" text,
	"conversationData" text,
	"validatedAt" timestamp(3),
	"validatedBy" text,
	"createdPayableId" text,
	"createdReceivableId" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"rawJson" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "TeamMember" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"hash" text NOT NULL,
	"email" text NOT NULL,
	"password" text,
	"role" text DEFAULT 'Gerente' NOT NULL,
	"clientId" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"clerkUserId" text,
	"active" boolean DEFAULT true NOT NULL,
	"updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "BankAccount" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"bankCode" text NOT NULL,
	"bankName" text NOT NULL,
	"agency" text NOT NULL,
	"account" text NOT NULL,
	"type" text DEFAULT 'corrente' NOT NULL,
	"currentBalance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"isManual" boolean DEFAULT true NOT NULL,
	"openFinanceItemId" text,
	"openFinanceConnected" boolean DEFAULT false NOT NULL,
	"lastSyncAt" timestamp(3),
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Recurrence" (
	"id" text PRIMARY KEY NOT NULL,
	"frequency" text NOT NULL,
	"intervalCount" integer DEFAULT 1 NOT NULL,
	"startDate" timestamp(3) NOT NULL,
	"endDate" timestamp(3),
	"occurrencesCount" integer,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AdminUser_active_idx" ON "AdminUser" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "AdminUser_clerkUserId_key" ON "AdminUser" USING btree ("clerkUserId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AdminUser_email_idx" ON "AdminUser" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "AdminUser_email_key" ON "AdminUser" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AdminUser_role_idx" ON "AdminUser" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FinancialCategory_clientId_idx" ON "FinancialCategory" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog" USING btree ("action","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AuditLog_category_createdAt_idx" ON "AuditLog" USING btree ("category","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog" USING btree ("entityType","entityId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BankTransaction_bankAccountId_date_idx" ON "BankTransaction" USING btree ("bankAccountId","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BankTransaction_reconciledType_reconciledId_idx" ON "BankTransaction" USING btree ("reconciledType","reconciledId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BankTransfer_clientId_date_idx" ON "BankTransfer" USING btree ("clientId","date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "BpoEmployee_clientId_cpf_key" ON "BpoEmployee" USING btree ("clientId","cpf");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BpoEmployee_clientId_idx" ON "BpoEmployee" USING btree ("clientId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "BpoPartner_clientId_cpf_key" ON "BpoPartner" USING btree ("clientId","cpf");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BpoPartner_clientId_idx" ON "BpoPartner" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BpoTask_clientId_status_idx" ON "BpoTask" USING btree ("clientId","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BpoTask_status_severity_dueAt_idx" ON "BpoTask" USING btree ("status","severity","dueAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ClientDataSnapshot_clientId_createdAt_idx" ON "ClientDataSnapshot" USING btree ("clientId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Broadcast_active_idx" ON "Broadcast" USING btree ("active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Broadcast_targetCategory_idx" ON "Broadcast" USING btree ("targetCategory");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Agency_active_idx" ON "Agency" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Agency_email_key" ON "Agency" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Agency_hash_key" ON "Agency" USING btree ("hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Client_active_idx" ON "Client" USING btree ("active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Client_agencyId_idx" ON "Client" USING btree ("agencyId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Client_blockedByAdmin_idx" ON "Client" USING btree ("blockedByAdmin");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Client_clerkUserId_key" ON "Client" USING btree ("clerkUserId") WHERE ("clerkUserId" IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Client_email_key" ON "Client" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Client_hash_key" ON "Client" USING btree ("hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Client_subscriptionStatus_idx" ON "Client" USING btree ("subscriptionStatus");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PaymentMethod_clientId_idx" ON "PaymentMethod" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PaymentTransaction_bankAccountId_paidAt_idx" ON "PaymentTransaction" USING btree ("bankAccountId","paidAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PaymentTransaction_payableId_idx" ON "PaymentTransaction" USING btree ("payableId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PaymentTransaction_receivableId_idx" ON "PaymentTransaction" USING btree ("receivableId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PdvIntegration_clientId_active_idx" ON "PdvIntegration" USING btree ("clientId","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Loan_clientId_idx" ON "Loan" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Loan_status_idx" ON "Loan" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Payable_clientId_requiresApproval_idx" ON "Payable" USING btree ("clientId","requiresApproval");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Payable_clientId_status_dueDate_idx" ON "Payable" USING btree ("clientId","status","dueDate");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Payable_supplierId_idx" ON "Payable" USING btree ("supplierId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Receivable_clientId_status_dueDate_idx" ON "Receivable" USING btree ("clientId","status","dueDate");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ReceivableAdvance_clientId_idx" ON "ReceivableAdvance" USING btree ("clientId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_clientId_cnpj_key" ON "Supplier" USING btree ("clientId","cnpj");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Supplier_clientId_idx" ON "Supplier" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "StripeEvent_clientId_processedAt_idx" ON "StripeEvent" USING btree ("clientId","processedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "StripeEvent_type_processedAt_idx" ON "StripeEvent" USING btree ("type","processedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ReconciliationRule_clientId_active_idx" ON "ReconciliationRule" USING btree ("clientId","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "WhatsappMessage_clientId_status_idx" ON "WhatsappMessage" USING btree ("clientId","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "WhatsappMessage_fromNumber_idx" ON "WhatsappMessage" USING btree ("fromNumber");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "WhatsappMessage_status_createdAt_idx" ON "WhatsappMessage" USING btree ("status","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "TeamMember_clerkUserId_key" ON "TeamMember" USING btree ("clerkUserId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "TeamMember_clientId_idx" ON "TeamMember" USING btree ("clientId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "TeamMember_email_key" ON "TeamMember" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "TeamMember_hash_key" ON "TeamMember" USING btree ("hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BankAccount_clientId_idx" ON "BankAccount" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Recurrence_startDate_idx" ON "Recurrence" USING btree ("startDate");