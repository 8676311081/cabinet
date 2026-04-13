"use client";

import { useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MentionDropdown } from "./mention-dropdown";
import { MentionChips } from "./mention-chips";
import type { UseComposerReturn, MentionableItem } from "@/hooks/use-composer";

export interface ComposerInputProps {
  composer: UseComposerReturn;
  placeholder?: string;
  submitLabel?: string;
  showKeyHint?: boolean;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  variant?: "card" | "inline";
  items?: MentionableItem[];
}

export function ComposerInput({
  composer,
  placeholder = "Type something...",
  submitLabel = "Send",
  showKeyHint = true,
  className,
  minHeight = "80px",
  maxHeight = "260px",
  autoFocus = false,
  disabled = false,
  header,
  footer,
  variant = "card",
  items = [],
}: ComposerInputProps) {
  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => composer.textareaRef.current?.focus(), 100);
    }
  }, [autoFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDisabled = disabled || composer.submitting;

  return (
    <div className={cn("relative flex flex-col", className)}>
      <div
        className={cn(
          "relative flex flex-col",
          variant === "card" &&
            "rounded-2xl border border-border bg-card",
        )}
      >
        {header}
        <div className="relative flex flex-col">
          {composer.showDropdown && composer.filteredItems.length > 0 && (
            <MentionDropdown
              items={composer.filteredItems}
              activeIndex={composer.dropdownIndex}
              onSelect={composer.insertMention}
            />
          )}
          <textarea
            ref={composer.textareaRef}
            value={composer.input}
            onChange={composer.handleChange}
            onKeyDown={composer.handleKeyDown}
            placeholder={placeholder}
            disabled={isDisabled}
            style={{ minHeight, maxHeight }}
            className="w-full resize-none overflow-y-auto bg-transparent px-4 pt-4 pb-2 text-[13px] text-foreground caret-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        <MentionChips
          mentionedPaths={composer.mentions.paths}
          mentionedAgents={composer.mentions.agents}
          items={items}
          onRemove={composer.removeMention}
        />

        <div className="flex items-center justify-end px-4 pb-3">
          <Button
            className="h-8 gap-2 text-xs"
            onClick={() => void composer.submit()}
            disabled={isDisabled || !composer.input.trim()}
          >
            {composer.submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {submitLabel}
          </Button>
        </div>

        {footer}
      </div>

      {showKeyHint && (
        <div className="flex items-center justify-between px-2 pt-2">
          <span className="text-[11px] text-muted-foreground/50">
            use <kbd className="rounded border border-border/50 bg-muted/50 px-1 py-0.5 font-mono text-[10px]">@</kbd> to mention
          </span>
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground/50">
            <kbd className="rounded border border-border/50 bg-muted/50 px-1 py-0.5 font-mono text-[10px]">Shift</kbd>
            <span>+</span>
            <kbd className="rounded border border-border/50 bg-muted/50 px-1 py-0.5 font-mono text-[10px]">↵</kbd>
            <span className="ml-0.5">new line</span>
          </div>
        </div>
      )}
    </div>
  );
}
