import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Get user from database to check profile and subscription status
      const dbUser = await db.getUserByOpenId(userInfo.openId);
      
      if (dbUser) {
        // Check subscription status FIRST
        const subscription = await db.getSubscription(dbUser.id);
        
        if (!subscription || subscription.status !== "active") {
          // No active subscription - redirect to subscription page first
          // User must subscribe before registering profile
          res.redirect(302, "/subscription");
          return;
        }
        
        // Has active subscription - check if user has a member profile
        const profile = await db.getMemberProfile(dbUser.id);
        
        if (!profile) {
          // Has subscription but no profile - redirect to registration
          res.redirect(302, "/register");
          return;
        }
        
        // Has profile and active subscription - redirect to app home
        res.redirect(302, "/home");
        return;
      }

      // Fallback - redirect to subscription if user not found (shouldn't happen)
      res.redirect(302, "/subscription");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
