import crypto from "crypto";
import { NextRequest } from "next/server";

export const ADMIN_COOKIE = "mcq_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

const getPin = (): string => process.env.ADMIN_PIN || "7777";
const getSecret = (): string =>
  process.env.ADMIN_SESSION_SECRET ||
  "mcq-master-dev-only-secret-change-in-production";

const base64url = (value: string): string =>
  Buffer.from(value, "utf-8").toString("base64url");

const sign = (payload: string): string =>
  crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");

export const verifyAdminPin = (pin: string): boolean => {
  const expected = Buffer.from(getPin());
  const received = Buffer.from(String(pin || ""));
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
};

export const createAdminToken = (): string => {
  const payload = base64url(
    JSON.stringify({ v: 1, exp: Date.now() + SESSION_TTL_MS })
  );
  return `${payload}.${sign(payload)}`;
};

export const verifyAdminToken = (token?: string | null): boolean => {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload);
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signature);
  if (expectedBuf.length !== receivedBuf.length) return false;
  if (!crypto.timingSafeEqual(expectedBuf, receivedBuf)) return false;

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8")
    ) as { exp?: number };
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
};

export const isAdminRequest = (req: NextRequest): boolean => {
  const cookieToken = req.cookies.get(ADMIN_COOKIE)?.value;
  if (verifyAdminToken(cookieToken)) return true;

  const apiToken = process.env.ADMIN_API_TOKEN;
  if (apiToken) {
    const auth = req.headers.get("authorization") || "";
    if (auth === `Bearer ${apiToken}`) return true;
  }
  return false;
};

export const unauthorized = (): Response =>
  new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

export const adminCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_MS / 1000,
});
