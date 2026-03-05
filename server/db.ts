import { eq, and, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, memberProfiles, subscriptions, InsertMemberProfile, InsertSubscription, generatedContents, InsertGeneratedContent, errorReports, InsertErrorReport } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ==================== Member Profile Queries ====================

export async function getMemberProfile(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(memberProfiles).where(eq(memberProfiles.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertMemberProfile(profile: InsertMemberProfile) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(memberProfiles).values(profile).onDuplicateKeyUpdate({
    set: {
      contactName: profile.contactName,
      companyName: profile.companyName,
      contactEmail: profile.contactEmail,
    },
  });
}

// ==================== Subscription Queries ====================

export async function getSubscription(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getSubscriptionByStripeCustomerId(stripeCustomerId: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(subscriptions).where(eq(subscriptions.stripeCustomerId, stripeCustomerId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createSubscription(subscription: InsertSubscription) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(subscriptions).values(subscription);
}

export async function updateSubscription(userId: number, updates: Partial<InsertSubscription>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(subscriptions).set(updates).where(eq(subscriptions.userId, userId));
}

export async function updateSubscriptionByStripeId(stripeSubscriptionId: string, updates: Partial<InsertSubscription>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(subscriptions).set(updates).where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
}

export async function deleteSubscription(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
}

export async function getAllSubscriptions() {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(subscriptions);
  return result;
}

export async function getAllSubscriptionsWithUsers() {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      subscription: subscriptions,
      userName: users.name,
      userEmail: users.email,
      userOpenId: users.openId,
    })
    .from(subscriptions)
    .leftJoin(users, eq(subscriptions.userId, users.id));
  return result;
}

// ============ Generated Contents Helpers ============

export async function saveGeneratedContent(content: InsertGeneratedContent): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save generated content: database not available");
    return;
  }
  await db.insert(generatedContents).values(content);
}

export async function getRecentGeneratedContents(
  userId: number,
  storeProfileHash: string,
  format: string,
  limit: number = 5
) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(generatedContents)
    .where(
      and(
        eq(generatedContents.userId, userId),
        eq(generatedContents.storeProfileHash, storeProfileHash),
        eq(generatedContents.format, format)
      )
    )
    .orderBy(desc(generatedContents.createdAt))
    .limit(limit);
}

export async function getRecentGeneratedContentsByUser(
  userId: number,
  storeProfileHash: string,
  limit: number = 20
) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(generatedContents)
    .where(
      and(
        eq(generatedContents.userId, userId),
        eq(generatedContents.storeProfileHash, storeProfileHash)
      )
    )
    .orderBy(desc(generatedContents.createdAt))
    .limit(limit);
}

// ============ Error Reports Helpers ============

export async function createErrorReport(report: InsertErrorReport): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save error report: database not available");
    return;
  }
  await db.insert(errorReports).values(report);
}

export async function getErrorReports(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      report: errorReports,
      userName: users.name,
      userEmail: users.email,
    })
    .from(errorReports)
    .leftJoin(users, eq(errorReports.userId, users.id))
    .orderBy(desc(errorReports.createdAt))
    .limit(limit);
}
