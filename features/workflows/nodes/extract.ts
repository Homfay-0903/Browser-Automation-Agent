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
  // Accept string, structured object, array, or null for extraction.
  // Some LLMs (e.g. DeepSeek) naturally return structured JSON objects even
  // when asked for a string, causing Zod validation failures. Accepting both
  // prevents the extraction from being discarded when the LLM returns richer
  // structured data. The downstream normalisation already handles strings
  // (including JSON-encoded strings), objects, and null correctly.
  const schema = z.object({
    extraction: z
      .union([z.string(), z.record(z.string(), z.any()), z.array(z.any())])
      .nullable()
      .describe(
        format ??
          "The extracted content — can be a plain string, a structured object, or an array. Return null only if nothing matching the instruction is found on the page.",
      ),
  })

  let result: { extraction: unknown } | undefined

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