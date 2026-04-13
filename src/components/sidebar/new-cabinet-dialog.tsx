"use client";

import { useState, useCallback } from "react";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTreeStore } from "@/stores/tree-store";
import { useAppStore } from "@/stores/app-store";
import { AgentPicker } from "@/components/agents/agent-picker";
import { useAgentPicker } from "@/hooks/use-agent-picker";

interface NewCabinetDialogProps {
  /** When provided, the dialog is controlled externally (context menu use case). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Parent path for the new cabinet (empty = root). */
  parentPath?: string;
  /** Pre-filled name. */
  defaultName?: string;
}

export function NewCabinetDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  parentPath = "",
  defaultName = "",
}: NewCabinetDialogProps) {
  const controlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlled ? controlledOpen : internalOpen;
  const setOpen = controlled
    ? controlledOnOpenChange!
    : setInternalOpen;

  const [step, setStep] = useState<"name" | "agents">("name");
  const [name, setName] = useState(defaultName);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadTree = useTreeStore((s) => s.loadTree);
  const selectPage = useTreeStore((s) => s.selectPage);
  const setSection = useAppStore((s) => s.setSection);
  const picker = useAgentPicker();

  const reset = useCallback(() => {
    setStep("name");
    setName(defaultName);
    setCreating(false);
    setError(null);
  }, [defaultName]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      setOpen(next);
    },
    [setOpen, reset]
  );

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/cabinets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          parentPath,
          selectedAgents: picker.selectedSlugs,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create cabinet");
        setCreating(false);
        return;
      }

      const data = await res.json();
      await loadTree();
      selectPage(data.path);
      setSection({
        type: "cabinet",
        mode: "cabinet",
        cabinetPath: data.path,
      });
      handleOpenChange(false);
    } catch {
      setError("Failed to create cabinet");
      setCreating(false);
    }
  };

  const dialogContent = (
    <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {step === "name" ? "Create New Cabinet" : "Select Agents"}
        </DialogTitle>
      </DialogHeader>

      {step === "name" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) setStep("agents");
          }}
          className="space-y-3"
        >
          <Input
            placeholder="Cabinet name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={!name.trim()}>
              Next
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <AgentPicker
            agents={picker.agents}
            libraryTemplates={picker.templates}
            onToggle={picker.toggleAgent}
            loading={picker.loading}
          />
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep("name")}
            >
              Back
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create Cabinet"}
            </Button>
          </div>
        </div>
      )}
    </DialogContent>
  );

  // Controlled mode: no trigger, dialog managed externally
  if (controlled) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {dialogContent}
      </Dialog>
    );
  }

  // Uncontrolled mode: render with trigger button
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className="flex items-center gap-2 w-full text-sm px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer">
        <Archive className="h-4 w-4" />
        New Cabinet
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}
