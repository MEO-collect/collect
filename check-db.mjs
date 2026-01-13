import { drizzle } from "drizzle-orm/mysql2";
import dotenv from "dotenv";
dotenv.config();

const db = drizzle(process.env.DATABASE_URL);

async function checkData() {
  const result = await db.execute("SELECT id, userId, stripeCustomerId, stripeSubscriptionId, status, startedAt, isInInitialPeriod FROM subscriptions ORDER BY id DESC LIMIT 5");
  console.log("Subscriptions:", JSON.stringify(result[0], null, 2));
  
  const profiles = await db.execute("SELECT id, userId, contactName, companyName FROM member_profiles ORDER BY id DESC LIMIT 5");
  console.log("Profiles:", JSON.stringify(profiles[0], null, 2));
  
  const users = await db.execute("SELECT id, openId, name, email FROM users ORDER BY id DESC LIMIT 5");
  console.log("Users:", JSON.stringify(users[0], null, 2));
  
  process.exit(0);
}

checkData().catch(console.error);
