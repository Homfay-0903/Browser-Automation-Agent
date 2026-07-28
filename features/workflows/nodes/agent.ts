import type { Stagehand } from "@browserbasehq/stagehand"
import { logger } from "@trigger.dev/sdk"

export async function agent({
  stagehand,
  instruction,
  maxSteps: maxStepsInput,
}: {
  stagehand: Stagehand
  instruction: string
  /** Maximum number of agent steps (user-configurable, stored as string). */
  maxSteps?: string
}) {
  // agent() inherits the model configured on the Stagehand instance.
  // Explicit maxSteps prevents the agent from looping infinitely when
  // the LLM gets stuck on a step.
  const maxSteps = maxStepsInput ? parseInt(maxStepsInput, 10) : 30

  logger.log(`Agent starting — instruction: "${instruction}", maxSteps: ${maxSteps}`)

  const result = await stagehand.agent().execute({
    instruction,
    maxSteps,
  })

  logger.log(`Agent done — success: ${result.success}, completed: ${result.completed}`)

  return {
    success: result.success,
    message: result.message,
    completed: result.completed,
  }
}
