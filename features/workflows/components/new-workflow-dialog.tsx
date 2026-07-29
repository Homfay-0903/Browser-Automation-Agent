"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { createWorkflowAction } from "@/features/workflows/actions"
import { generateSlug } from "@/features/workflows/lib/generate-slug"

interface NewWorkflowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewWorkflowDialog({
  open,
  onOpenChange,
}: NewWorkflowDialogProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState("")
  const [isPending, setIsPending] = useState(false)

  // Pre-fill with a generated name every time the dialog opens.
  useEffect(() => {
    if (open) {
      setName(generateSlug())
      // Focus and select the input after the dialog animation settles.
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [open])

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed || isPending) return

    setIsPending(true)
    try {
      // createWorkflowAction redirects on success; the router handles
      // the page change without a full reload, so we leave the dialog
      // open (it unmounts with the old page).
      await createWorkflowAction(trimmed)
    } catch {
      // If creation fails (e.g. network error), stay on the same page and
      // let the user try again. The dialog stays open.
      setIsPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workflow</DialogTitle>
          <DialogDescription>
            Give your workflow a name. You can change it later.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workflow-name">Name</Label>
          <Input
            ref={inputRef}
            id="workflow-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate()
            }}
            placeholder="My workflow"
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
