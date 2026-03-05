CREATE TABLE `error_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`appName` varchar(100) NOT NULL,
	`operation` varchar(100) NOT NULL,
	`errorMessage` text NOT NULL,
	`context` text,
	`userComment` text,
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `error_reports_id` PRIMARY KEY(`id`)
);
