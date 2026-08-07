import type { Stagehand } from "@browserbasehq/stagehand"

export async function openUrl({
  stagehand,
  url,
}: {
  stagehand: Stagehand
  url: string
}) {
  const page = stagehand.context.pages()[0]

  // domcontentloaded fires as soon as the HTML is parsed — much faster than
  // "load" which waits for every image, font, and tracking script. Sites like
  // Google and Baidu load hundreds of sub-resources, making "load" stall.
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeoutMs: 30_000 })
  } catch {
    // Fallback: if domcontentloaded still times out (e.g. slow proxy),
    // retry with a commit-based trigger that fires on any navigation. The
    // underlying Playwright supports "commit"; Stagehand's LoadState type has
    // not caught up yet, so cast it through.
    await page.goto(url, {
      waitUntil: "commit" as "domcontentloaded",
      timeoutMs: 30_000,
    })
  }

  return { url: page.url(), title: await page.title() }
}
