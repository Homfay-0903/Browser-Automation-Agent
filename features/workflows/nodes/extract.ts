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
  const schema = z.object({
    extraction: z
      .string()
      .nullable()
      .describe(
        format ??
          "The extracted content as a string. Return null if nothing matching the instruction is found on the page.",
      ),
  })

  let result: { extraction: string | null } | undefined

  try {
    result = await stagehand.extract(instruction, schema)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.log(`Extract failed (attempt 1): ${message}`)

    // Retry once with a boosted instruction that nudges the LLM harder
    try {
      logger.log("Extract: retrying with boosted instruction")
      result = await stagehand.extract(
        `${instruction}\n\nReturn whatever relevant content you can find on the page. Do not return null.`,
        schema,
      )
    } catch (retryError) {
      const retryMsg =
        retryError instanceof Error ? retryError.message : String(retryError)
      logger.log(`Extract failed (attempt 2): ${retryMsg}`)
      return { extraction: null }
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