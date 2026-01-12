CREATE TABLE `member_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`contactName` varchar(255) NOT NULL,
	`companyName` varchar(255) NOT NULL,
	`contactEmail` varchar(320) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`stripeCustomerId` varchar(255),
	`stripeSubscriptionId` varchar(255),
	`status` enum('active','canceled','past_due','trialing','incomplete','incomplete_expired','unpaid') NOT NULL DEFAULT 'incomplete',
	`startedAt` bigint,
	`initialPeriodEndsAt` bigint,
	`isInInitialPeriod` boolean NOT NULL DEFAULT true,
	`currentPeriodEnd` bigint,
	`canceledAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptions_userId_unique` UNIQUE(`userId`)
);
