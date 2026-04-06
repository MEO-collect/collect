CREATE TABLE `token_balances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`monthlyBalance` int NOT NULL DEFAULT 0,
	`bonusBalance` int NOT NULL DEFAULT 0,
	`lastGrantedAt` bigint,
	`nextResetAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `token_balances_id` PRIMARY KEY(`id`),
	CONSTRAINT `token_balances_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `token_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('grant_monthly','consume','purchase','expire') NOT NULL,
	`amount` int NOT NULL,
	`appName` varchar(100),
	`feature` varchar(100),
	`metadata` text,
	`stripePaymentIntentId` varchar(255),
	`balanceAfterMonthly` int,
	`balanceAfterBonus` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `token_transactions_id` PRIMARY KEY(`id`)
);
