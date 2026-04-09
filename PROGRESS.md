# Progress

[2026-04-10] Fix false "Update 0.2.6 available" shown when already on 0.2.6. Root cause: stale cabinet-release.json (0.2.4) was used as current version instead of package.json. Updated the manifest and made readBundledReleaseManifest always use package.json version as source of truth.

[2026-04-10] Added Connect section to the About settings tab with Discord link (recommended) and email (hi@runcabinet.com).

[2026-04-10] Added default White and Black themes (neutral, no accent color) to the appearance tab. Reduced blur on coming-soon overlays from 3px to 2px with higher opacity.

[2026-04-10] Notifications settings tab now shows a blurred preview with "Coming Soon" overlay, matching the integrations tab treatment.

[2026-04-10] Integrations settings tab now shows a blurred preview of the MCP servers and scheduling UI with a centered "Coming Soon" overlay card on top.

[2026-04-10] Moved About section from Providers tab into its own About tab in settings with correct version (0.2.6) and product info.

[2026-04-10] Settings page tabs now sync with the URL hash (e.g. #/settings/updates, #/settings/appearance). Browser back/forward navigates between tabs. Added min-h-0 + overflow-hidden to the ScrollArea so tab content is properly scrollable.

[2026-04-09] Fix pty.node macOS Gatekeeper warning: added xattr quarantine flag removal before ad-hoc codesigning of extracted native binaries in Electron main process.

[2026-04-09] Added `export const dynamic = "force-dynamic"` to all `/api/system/*` route handlers. Without this, Next.js could cache these routes during production builds, potentially serving stale update check results and triggering a false "update available" popup on fresh installs.

[2026-04-09] Added Apple Developer certificate import step to release workflow for proper codesigning and notarization in CI. Deduplicated getNvmNodeBin() in cabinet-daemon.ts to use the shared nvm-path.ts utility.

[2026-04-09] Cap prompt containers to max-h with vertical-only scrolling. Added "Open Transcript" button to the prompt section in conversation-result-view (matching the existing one in Artifacts). Also added anchor link on the full transcript page.

[2026-04-09] Apply markdown rendering to Prompt section on transcript page via ContentViewer. Extracted parsing logic into shared transcript-parser.ts so server components can pre-render text blocks as HTML (client hydration doesn't work on this standalone page). Both prompt and transcript text blocks now render with full prose markdown styling.

[2026-04-09] Improved transcript viewer: pre-processes embedded diff headers glued to text, detects cabinet metadata blocks (SUMMARY/CONTEXT/ARTIFACT inside fenced blocks), renders orphaned diff lines with proper green/red coloring, renders markdown links and inline code in text blocks, styles token count as a badge footer. Also added +N/-N addition/removal counts in diff file headers.

[2026-04-09] Rich transcript viewer: diff blocks show green/red for additions/removals with file headers, fenced code blocks get language labels, structured metadata lines (SUMMARY, CONTEXT, ARTIFACT, DECISION, LEARNING, GOAL_UPDATE, MESSAGE_TO) render as colored badges. Copy button added to transcript section.

[2026-04-09] Render prompt as markdown on the transcript page too, with a copy button. Server-side markdown rendering via markdownToHtml, matching the prose styling used elsewhere.

[2026-04-09] Render conversation prompt as markdown in the ConversationResultView panel instead of plain text. Uses the existing render-md API endpoint with prose styling, falling back to plain text while loading.

[2026-04-09] Unified toolbar controls across all file types. Extracted Search, Terminal, AI Panel, and Theme Picker into a shared `HeaderActions` component. CSV, PDF, and Website/App viewers now include these global controls in their toolbars, matching the markdown editor experience.

[2026-04-09] Added "Open in Finder" option to each sidebar tree item's right-click context menu. Reveals the item in Finder (macOS) or Explorer (Windows) instead of only supporting the top-level knowledge base directory.

[2026-04-09] Fixed Claude CLI not being found in Electron DMG builds. The packaged app inherits macOS GUI PATH which lacks NVM paths. Added NVM bin detection (scans ~/.nvm/versions/node/) to RUNTIME_PATH in provider-cli.ts, enrichedPath in cabinet-daemon.ts, and commandCandidates in claude-code provider.

