// Cloudflare Pages Functions environment bindings for this project.
// Configure in the CF dashboard: Pages project → Settings → Functions.
export interface Env {
  // D1 database binding for the brainwave database.
  DB: D1Database;

  // Resend API key. When unset (e.g. first-time local testing), the
  // email sender falls back to logging the magic link URL to the
  // response so you can click it manually.
  RESEND_API_KEY?: string;

  // Verified Resend "from" address for outgoing magic-link emails.
  // Example: "Brainwave <login@brainwave.example>".
  RESEND_FROM?: string;

  // Public app URL used to construct magic-link targets.
  // Example: "https://brainwave.pages.dev". If unset we derive it
  // from the incoming request's origin.
  APP_URL?: string;
}
