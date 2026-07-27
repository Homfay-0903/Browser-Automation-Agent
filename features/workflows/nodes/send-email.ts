import { resend } from "@/lib/resend"

export async function sendEmail({
  to,
  subject,
  body,
}: {
  to: string
  subject: string
  body: string
}) {
  // Guard against empty / unresolved-interpolation bodies that would cause
  // Resend to reject the request with "Missing `html` or `text` field."
  const html = (body && body.trim() && body !== "null" && body !== "undefined")
    ? body
    : `<p>(No content was extracted from the page — the extraction step returned empty.)</p>`

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
    to,
    subject,
    html,
  })

  // The Resend SDK returns { data, error } and does not throw on API errors.
  // Throw so the run marks this step failed instead of looking successful.
  if (error || !data) {
    throw new Error(error?.message ?? "Resend returned no email id")
  }

  return { id: data.id }
}
