import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export function token() {
  return randomBytes(32).toString("base64url");
}
export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
