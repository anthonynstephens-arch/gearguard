import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);
const PIN_HASH_PREFIX = "scrypt";

export async function hashMemberPin(pin: string) {
  const salt = randomBytes(16);
  const derived = (await scrypt(pin, salt, 32)) as Buffer;
  return `${PIN_HASH_PREFIX}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyMemberPin(pin: string, encoded: string) {
  const [prefix, saltHex, hashHex] = encoded.split("$");
  if (prefix !== PIN_HASH_PREFIX || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(pin, Buffer.from(saltHex, "hex"), expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function derivePinSessionPassword(memberId: string) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Supabase server credentials are not configured");
  return `${createHmac("sha256", secret).update(`gearguard-pin-session:${memberId}`).digest("hex")}Aa1!`;
}

export function pinAttemptIdentifier(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`gearguard-pin-attempt:${address}`).digest("hex");
}
