import type { Stagehand } from "@browserbasehq/stagehand"
import { z } from "zod"
import { logger } from "@trigger.dev/sdk"

export async function extract({
  stagehand,
  instruction,
  format,
}: {
  stagehand: Stagehand
  instruction: string
  /** Natural-language description of the expected output shape, e.g.
   *  "a list of article titles and their URLs as JSON array". When provided,
   *  a matching Zod schema is passed to Stagehand so the LLM outputs
   *  structured data instead of a flat string. */
  format?: string
}) {
  // Build a schema whose extraction field accepts both string and null so the
  // LLM returning `{"extraction":null}` (actual JSON null) doesn't cause a
  // Zod validation crash. Stagehand's defaultExtractSchema uses z.string()
  // which rejects null and throws a fatal error.
  const buildSchema = (description?: string) => {
    const field = z.string().nullable().describe(
      description ??
        "The extracted content as a string. Return null if nothing matching the instruction is found on the page.",
    )
    return z.object({ extraction: field })
  }

  let result: { extraction: string | null } | undefined

  // --- Attempt 1: instruction + optional format schema ---
  try {
    const schema = format ? buildSchema(format) : buildSchema()
    result = await stagehand.extract(instruction, schema)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.log(`Extract attempt 1 failed: ${message}`)
  }

  // --- Attempt 2: if attempt 1 returned null, retry with a simpler prompt ---
  if (!result || result.extraction === null || result.extraction === "null") {
    try {
      logger.log(
        "Extract returned null, retrying with simplified instruction",
      )
      const simpleSchema = buildSchema(
        "Extract the requested content as plain text. Return the raw text found on the page, or null if not found.",
      )
      // Append a hint so the LLM knows it MUST return text, not null
      const boostedInstruction = `${instruction}\n\nIf the page is a search results page, look at the search result snippets, knowledge panels, or featured snippets. Return whatever relevant text you can find. Do NOT return null if ANY relevant content exists on the page.`
      result = await stagehand.extract(boostedInstruction, simpleSchema)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.log(`Extract attempt 2 failed: ${message}`)
    }
  }

  const extraction: unknown = result?.extraction ?? null

  // Normalise the literal string "null" and empty strings to actual null so
  // downstream interpolation renders an empty string.
  if (extraction === "null" || extraction === "") {
    return { extraction: null }
  }

  // Try to parse a JSON-encoded array or object inside the extraction field
  // so downstream nodes can reference individual fields.
  if (typeof extraction === "string") {
    try {
      const parsed = JSON.parse(extraction)
      return {
        extraction:
          typeof parsed === "object" && parsed !== null ? parsed : extraction,
      }
    } catch {
      // Not JSON — return the raw string as-is.
    }
  }

  return { extraction }
}