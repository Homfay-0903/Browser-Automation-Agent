"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { PlusIcon, WorkflowIcon } from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { NewWorkflowDialog } from "@/features/workflows/components/new-workflow-dialog"
import type { Workflow } from "@/lib/db/schema"

interface WorkflowNavProps {
  workflows: Workflow[]
}

export function WorkflowNav({ workflows }: WorkflowNavProps) {
  const { state } = useSidebar()
  const pathname = usePathname()
  const [dialogOpen, setDialogOpen] = useState(false)

  const workflowItems = workflows.map((workflow) => (
    <SidebarMenuItem key={workflow.id}>
      <SidebarMenuButton
        asChild
        isActive={pathname === `/workflows/${workflow.id}`}
      >
        <Link href={`/workflows/${workflow.id}`}>
          <span>{workflow.name}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  ))

  if (state === "collapsed") {
    return (
      <>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Popover>
                  <PopoverTrigger asChild>
                    <SidebarMenuButton tooltip="Workflows">
                      <WorkflowIcon />
                      <span>Workflows</span>
                    </SidebarMenuButton>
                  </PopoverTrigger>
                  <PopoverContent side="right" align="start" className="p-1">
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          onClick={() => setDialogOpen(true)}
                        >
                          <PlusIcon />
                          <span>New workflow</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                    <SidebarSeparator className="mx-0" />
                    <SidebarMenu className="gap-y-0.5">{workflowItems}</SidebarMenu>
                  </PopoverContent>
                </Popover>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <NewWorkflowDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      </>
    )
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Workflows</SidebarGroupLabel>
        <SidebarGroupAction
          title="New workflow"
          onClick={() => setDialogOpen(true)}
        >
          <PlusIcon />
          <span className="sr-only">New workflow</span>
        </SidebarGroupAction>
        <SidebarGroupContent>
          <SidebarMenu className="gap-y-0.5">{workflowItems}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <NewWorkflowDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}
