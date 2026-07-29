"use client"

import { useState } from "react"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { NewWorkflowDialog } from "@/features/workflows/components/new-workflow-dialog"

export function NewWorkflowButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        New workflow
      </Button>
      <NewWorkflowDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
