"use client"

import { Component, type ReactNode } from "react"
import { PricingTable } from "@clerk/nextjs"

// Catches the "cannot_render_billing_disabled" error Clerk throws when billing
// hasn't been enabled in the dashboard, and shows a helpful message instead of
// crashing the page. Also handles any other rendering error from PricingTable.
class BillingErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props)
    this.state = { hasError: false, errorMessage: "" }
  }

  static getDerivedStateFromError(error: Error) {
    const isBillingDisabled = error.message?.includes("cannot_render_billing_disabled")
    return {
      hasError: true,
      errorMessage: isBillingDisabled
        ? "Billing is not yet enabled for this application. Enable it in the Clerk Dashboard under Billing Settings to offer Pro plans."
        : error.message,
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="rounded-lg border border-border p-6 text-center">
          <h2 className="text-lg font-semibold">Billing Unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {this.state.errorMessage}
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

export function BillingTable() {
  return (
    <BillingErrorBoundary
      fallback={
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <h2 className="text-lg font-semibold">Pro Plan — Coming Soon</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Billing is not yet configured for this application.
            <br />
            Enable it in the{" "}
            <a
              href="https://dashboard.clerk.com/last-active?path=billing/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Clerk Dashboard → Billing Settings
            </a>{" "}
            to unlock the Pro plan with Agent nodes and session replays.
          </p>
        </div>
      }
    >
      <PricingTable
        for="organization"
        newSubscriptionRedirectUrl="/billing"
      />
    </BillingErrorBoundary>
  )
}
