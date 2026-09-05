import "server-only";
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}
export function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SECRET_KEY,
  );
}
export function appUrl(path: string) {
  const base = new URL(env("APP_URL"));
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:")
    throw new Error("APP_URL must use HTTPS");
  return new URL(path, base).toString();
}
