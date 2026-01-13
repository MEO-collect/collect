import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

const [subscriptions] = await connection.execute("SELECT * FROM subscriptions ORDER BY id DESC LIMIT 5");
console.log("=== Subscriptions ===");
console.log(JSON.stringify(subscriptions, null, 2));

const [users] = await connection.execute("SELECT id, openId, name, email FROM users ORDER BY id DESC LIMIT 5");
console.log("\n=== Users ===");
console.log(JSON.stringify(users, null, 2));

await connection.end();
