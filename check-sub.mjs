import { drizzle } from "drizzle-orm/mysql2";

const db = drizzle(process.env.DATABASE_URL);

async function checkData() {
  try {
    const result = await db.execute(`
      SELECT s.id, s.userId, s.stripeCustomerId, s.stripeSubscriptionId, s.status, s.startedAt, s.isInInitialPeriod, u.openId, u.name, u.email 
      FROM subscriptions s 
      LEFT JOIN users u ON s.userId = u.id 
      ORDER BY s.id DESC 
      LIMIT 5
    `);
    console.log("Subscriptions with users:", JSON.stringify(result[0], null, 2));
  } catch (error) {
    console.error("Error:", error);
  }
  process.exit(0);
}

checkData();
