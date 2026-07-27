import Browserbase from "@browserbasehq/sdk"

// Server-only Browserbase client for observability calls (session replays, logs).
// It carries the secret API key, so it must never be imported into client code.
// Returns null when BROWSERBASE_API_KEY is not configured, which means Browserbase
// features (session replay) are unavailable — callers should handle gracefully.
const apiKey = process.env.BROWSERBASE_API_KEY
export const browserbase = apiKey ? new Browserbase({ apiKey }) : null
