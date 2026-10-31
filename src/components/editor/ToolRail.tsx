"use client";

import {
  Circle,
  Crosshair,
  Grid2x2,
  Image as ImageIcon,
  Minus,
  MousePointer2,
  Ruler,
  Square,
  Type,
} from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import type { Tool } from "@/lib/editor/types";
import { cn } from "@/lib/utils";

const TOOLS: { tool: Tool; label: string; key: string; icon: React.ReactNode }[] = [
  { tool: "select", label: "Select & move", key: "V", icon: <MousePointer2 size={17} /> },
  { tool: "text", label: "Text frame", key: "T", icon: <Type size={17} /> },
  { tool: "image", label: "Image frame", key: "I", icon: <ImageIcon size={17} /> },
  { tool: "rect", label: "Rectangle", key: "R", icon: <Square size={16} /> },
  { tool: "ellipse", label: "Ellipse", key: "O", icon: <Circle size={16} /> },
  { tool: "line", label: "Line", key: "L", icon: <Minus size={17} /> },
];

export function ToolRail() {
  const tool = useEditor((s) => s.tool);
  const showGuides = useEditor((s) => s.showGuides);
  const showRulers = useEditor((s) => s.showRulers);

  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-zinc-200 bg-white py-2">
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          type="button"
          title={`${t.label} (${t.key})`}
          aria-label={t.label}
          onClick={() => useEditor.getState().setTool(t.tool)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
            tool === t.tool
              ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300"
              : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800",
          )}
        >
          {t.icon}
        </button>
      ))}
      <div className="mt-auto flex flex-col items-center gap-1">
        <button
          type="button"
          title="Page guides — add your own guideline lines"
          aria-label="Page guides"
          onClick={() => useEditor.getState().setGuidesOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
        >
          <Crosshair size={16} />
        </button>
        <button
          type="button"
          title={showGuides ? "Hide guides (margins & custom)" : "Show guides (margins & custom)"}
          aria-label="Toggle guides"
          onClick={() => useEditor.getState().toggleGuides()}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md",
            showGuides ? "bg-zinc-100 text-pink-600" : "text-zinc-400 hover:bg-zinc-100",
          )}
        >
          <Grid2x2 size={16} />
        </button>
        <button
          type="button"
          title={showRulers ? "Hide rulers" : "Show rulers"}
          aria-label="Toggle rulers"
          onClick={() => useEditor.getState().toggleRulers()}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md",
            showRulers ? "bg-zinc-100 text-zinc-700" : "text-zinc-400 hover:bg-zinc-100",
          )}
        >
          <Ruler size={16} />
        </button>
      </div>
    </div>
  );
}
