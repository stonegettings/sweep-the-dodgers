// The site's public address. Share links always use the main production
// domain, never a single deployment's address: Vercel protects deployment
// addresses (like project-abc123-team.vercel.app) so only the owner can open them.
export const APP_VERSION = "1.8";

export function siteUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
