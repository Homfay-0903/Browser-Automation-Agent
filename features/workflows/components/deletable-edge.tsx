"use client"

import { useCallback, useState } from "react"
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A smoothstep edge with a delete button that appears on hover (or when the
 * edge is selected), rendered via React Flow's EdgeLabelRenderer so the
 * button sits on top of the SVG layer.
 */
export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const { deleteElements } = useReactFlow()
  const [hovered, setHovered] = useState(false)

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      // Don't let the click propagate to the canvas — it would deselect
      // other items or trigger a pane click.
      e.stopPropagation()
      deleteElements({ edges: [{ id }] })
    },
    [deleteElements, id],
  )

  const showButton = hovered || selected

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={
          selected
            ? { stroke: "var(--primary)", strokeWidth: 2 }
            : undefined
        }
        className={cn(
          "transition-colors",
          hovered && "!stroke-foreground/50"
        )}
        // React Flow doesn't support onMouseEnter/onMouseLeave on BaseEdge
        // directly, so we add a wider invisible interaction edge for hover.
      />

      {/* Invisible wider path for easier hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="cursor-pointer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className={cn(
            "flex items-center justify-center transition-opacity duration-150",
            showButton ? "opacity-100" : "opacity-0"
          )}
        >
          <button
            type="button"
            onClick={handleDelete}
            className="flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
            aria-label="Delete connection"
          >
            <X className="size-3" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
