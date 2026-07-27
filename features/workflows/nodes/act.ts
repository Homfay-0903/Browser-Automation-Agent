import type { Stagehand } from "@browserbasehq/stagehand"
import { logger } from "@trigger.dev/sdk"

export async function act({
  stagehand,
  instruction,
  submit = false,
}: {
  stagehand: Stagehand
  instruction: string
  /** When true, presses Enter after the act to submit forms / trigger search.
   *  Use this when your instruction includes typing into a search box or form
   *  that needs to be submitted before the next step. */
  submit?: boolean
}) {
  const result = await stagehand.act(instruction)
  const page = stagehand.context.pages()[0]

  // Stagehand's act() with smaller LLMs (e.g. DeepSeek V4 Flash) often fills
  // an input but skips the submit step described in the instruction. When the
  // user enables this flag, we press Enter after the act so the form/search
  // actually fires — the next node then reads the post-submit page instead of
  // the pre-submit form.
  if (submit) {
    logger.log("Act completed, pressing Enter to submit")
    await page.keyPress("Enter")
    // Allow time for navigation / search results to load
    await page.waitForLoadState("load", 10000)
  }

  return { success: result.success, message: result.message, url: page.url() }
}
