CREATE TABLE `generated_contents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`storeProfileHash` varchar(64) NOT NULL,
	`format` varchar(100) NOT NULL,
	`generatedText` text NOT NULL,
	`charCount` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `generated_contents_id` PRIMARY KEY(`id`)
);
