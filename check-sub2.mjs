import { drizzle } from "drizzle-orm/mysql2";

const db = drizzle(process.env.DATABASE_URL);

async function checkData() {
  try {
    const result = await db.execute(`SELECT * FROM subscriptions ORDER BY id DESC LIMIT 5`);
    console.log("All subscriptions:", JSON.stringify(result[0], null, 2));
    
    const profiles = await db.execute(`SELECT * FROM member_profiles ORDER BY id DESC LIMIT 5`);
    console.log("All profiles:", JSON.stringify(profiles[0], null, 2));
  } catch (error) {
    console.error("Error:", error);
  }
  process.exit(0);
}

checkData();
