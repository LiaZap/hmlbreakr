CREATE TABLE "CompanyProfile" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"clientId" text NOT NULL,
	"restaurantName" text,
	"restaurantCategory" text,
	"taxRegime" text,
	"isMei" boolean DEFAULT false NOT NULL,
	"simplesRate" numeric(5, 2),
	"rentMonthly" numeric(18, 2),
	"iptuAnnual" numeric(18, 2),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "FixedCostItem" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"clientId" text NOT NULL,
	"legacyId" text,
	"costGroup" text NOT NULL,
	"costKey" text,
	"label" text,
	"amount" numeric(18, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Employee" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"clientId" text NOT NULL,
	"legacyId" text,
	"name" text,
	"regime" text,
	"baseSalary" numeric(18, 2),
	"bonus" numeric(18, 2),
	"transportValue" numeric(18, 2),
	"transportQty" integer,
	"workDays" integer,
	"foodCost" numeric(18, 2),
	"active" boolean DEFAULT true NOT NULL,
	"isDeleted" boolean DEFAULT false NOT NULL,
	"deletedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Partner" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"clientId" text NOT NULL,
	"legacyId" text,
	"name" text,
	"proLabore" numeric(18, 2),
	"personalAccountBank" text,
	"personalAccountAgency" text,
	"personalAccountNumber" text,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Equipment" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"clientId" text NOT NULL,
	"legacyId" text,
	"name" text,
	"value" numeric(18, 2),
	"lifespanYears" numeric(5, 2) DEFAULT '5',
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Vehicle" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"clientId" text NOT NULL,
	"legacyId" text,
	"description" text,
	"installment" numeric(18, 2),
	"maintenanceMonthly" numeric(18, 2),
	"insuranceAnnual" numeric(18, 2),
	"ipvaAnnual" numeric(18, 2),
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "CardMachine" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"clientId" text NOT NULL,
	"legacyId" text,
	"provider" text,
	"debitRate" numeric(5, 2),
	"creditRate" numeric(5, 2),
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Marketplace" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"clientId" text NOT NULL,
	"legacyId" text,
	"provider" text,
	"customProvider" text,
	"commission" numeric(5, 2),
	"salesPercentage" numeric(5, 2),
	"monthlyFee" numeric(18, 2),
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MetricSnapshot" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"clientId" text NOT NULL,
	"periodKey" text NOT NULL,
	"drivers" jsonb,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "CompanyProfile_clientId_uq" ON "CompanyProfile" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "FixedCostItem_client_group_idx" ON "FixedCostItem" USING btree ("clientId","costGroup");--> statement-breakpoint
CREATE INDEX "Employee_clientId_idx" ON "Employee" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "Partner_clientId_idx" ON "Partner" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "Equipment_clientId_idx" ON "Equipment" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "Vehicle_clientId_idx" ON "Vehicle" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "CardMachine_clientId_idx" ON "CardMachine" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "Marketplace_clientId_idx" ON "Marketplace" USING btree ("clientId");--> statement-breakpoint
CREATE UNIQUE INDEX "MetricSnapshot_client_period_uq" ON "MetricSnapshot" USING btree ("clientId","periodKey");--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "FixedCostItem" ADD CONSTRAINT "FixedCostItem_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CardMachine" ADD CONSTRAINT "CardMachine_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Marketplace" ADD CONSTRAINT "Marketplace_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE cascade ON UPDATE no action;