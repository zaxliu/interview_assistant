# Guidance Memory Redesign Implementation Plan

## Summary

- Replace the current `event -> count -> guidance text` flow with a memory-style pipeline: `feedback events -> structured memory items -> rendered guidance -> generation prompt`.
- Use lazy, on-demand memory refresh as the main path: events are recorded immediately, but LLM-based memory updates happen only when generation is about to use that memory and refresh conditions are met.
- Add a second, explicit manual path on the position page: users can click a button to refresh question/summary guidance on demand.
- Make every memory refresh visible and metered: whenever refresh runs, show a clear “updating memory/guidance” step and surface token usage for that refresh separately from generation token usage.

## Current Logic Analysis

- Today the app records feedback events immediately and recomputes guidance immediately inside `src/store/positionStore.ts`.
- The synthesis in `src/lib/guidance.ts` is purely local counting:
  - question guidance = accepted dimensions/sources + edit pattern frequencies
  - summary guidance = rewrite preference frequencies + rewrite intensity frequencies
- The generated text is injected directly into question/summary prompts in `src/api/ai.ts`.
- User-visible UI today:
  - Position detail page shows the latest guidance text and sample/update metadata.
  - Usage admin shows feedback-loop metrics, not memory content.
  - Interview/summary generation pages use guidance implicitly but do not expose a separate memory-refresh step.

## Key Changes

- Introduce structured position memory in `src/types/index.ts`:
  - `generationMemory`:
    - `questionMemoryItems`
    - `summaryMemoryItems`
    - `questionGuidancePrompt`
    - `summaryGuidancePrompt`
    - `updatedAt`
    - `sampleSize`
    - `version`
  - `memoryState`:
    - `dirtyScopes`
    - `lastQuestionRefreshAt`
    - `lastSummaryRefreshAt`
    - `pendingQuestionEventCount`
    - `pendingSummaryEventCount`
    - `pendingQuestionCandidateCount`
    - `pendingSummaryCandidateCount`
    - `lastQuestionRefreshUsage`
    - `lastSummaryRefreshUsage`
    - `lastManualRefreshAt`
- Each memory item should be structured:
  - `id`
  - `kind`: `prefer | avoid | preserve | prioritize`
  - `scope`: `question_generation | summary_generation`
  - `instruction`
  - `rationale`
  - `evidenceCount`
  - `lastSeenAt`
  - `confidence`

## Memory Update Strategy

- Event write path:
  - `recordFeedbackEvent(...)` stores the raw event immediately.
  - It does not call the LLM.
  - It marks the affected scope as dirty and increments pending counters.
- Scope mapping:
  - `question_asked`, `question_edited`, `question_deleted` dirty `question_generation`
  - `summary_rewritten` dirty `summary_generation`
- Main path: lazy refresh before generation
  - Before question generation, call `ensureGenerationMemoryFresh(positionId, 'question_generation')`
  - Before summary generation, call `ensureGenerationMemoryFresh(positionId, 'summary_generation')`
- Refresh conditions for lazy path:
  - refresh if scope is dirty and any of these is true:
    - pending events >= 5
    - pending candidates >= 2
    - last refresh older than 7 days
    - user is explicitly generating and memory is dirty
  - apply cooldown: same position + same scope should not refresh more than once within 30 minutes unless this is an explicit generation-time refresh
- Extra path: manual refresh from position page
  - Add a button on the position page to manually refresh guidance/memory
  - This path bypasses the normal thresholds and can refresh both scopes in one action
  - Cooldown may still be shown to the user, but manual refresh should be allowed unless a refresh is already in progress
- Refresh flow:
  - collect recent evidence from the latest 20 candidates
  - include existing memory items for the relevant scope(s)
  - call LLM memory synthesis
  - validate and normalize response
  - save structured items + rendered guidance + refresh usage + timestamps
  - clear dirty flags/counters for refreshed scopes only on success
  - on failure, keep old memory and keep the scope dirty

## Events to Items Flow

- Add an intermediate evidence layer in a new memory utility module, replacing direct count synthesis:
  - normalize raw feedback events into compact evidence packets
  - examples:
    - accepted AI question with text/source/dimension/context
    - edited AI question with before/after and inferred edit intent
    - deleted AI question with source/dimension and nearby duplication hints
    - summary rewrite with AI draft vs final insight and extracted preferences
- Add new AI API in `src/api/ai.ts`:
  - `synthesizePositionMemory(scope, existingMemoryItems, evidencePackets)`
  - output:
    - structured memory items
    - rendered guidance prompt for that scope
- The LLM prompt must frame this as memory maintenance:
  - merge duplicates
  - ignore one-off noise
  - keep stable actionable preferences
  - preserve older high-confidence memory unless contradicted by newer evidence
  - emit concise, reusable instructions rather than counts

## User-Visible UX Changes

- Position detail page:
  - replace the current guidance-only presentation with:
    - rendered question/summary guidance
    - latest memory update time
    - latest memory refresh token usage
    - whether memory is currently dirty / waiting for next refresh
  - add a visible manual action button:
    - label such as `更新 AI 指引` or `刷新岗位记忆`
  - on click:
    - show in-progress state
    - show refresh result status
    - show token usage for this manual refresh
    - update both question and summary guidance if refresh succeeds
- Interview generation UX in `src/components/interview/InterviewPanel.tsx`:
  - when question generation triggers a lazy memory refresh, show a visible pre-step:
    - `正在更新岗位问题记忆...`
  - after refresh completes, show memory refresh token usage separately from question generation token usage
  - if refresh is skipped because memory is already fresh, show nothing extra
- Summary generation UX in `src/components/summary/SummaryEditor.tsx`:
  - same pattern:
    - `正在更新岗位面评记忆...`
    - then show refresh token usage separately from summary generation token usage
- Usage presentation:
  - keep existing generation usage panels
  - add a second usage line/card for memory refresh:
    - `问题记忆更新`
    - `面评记忆更新`
  - distinguish clearly between:
    - memory maintenance cost
    - actual content generation cost

## Public API / Interface Changes

- Add new types for:
  - `GenerationMemory`
  - `GenerationMemoryItem`
  - `GenerationMemoryState`
  - `MemoryRefreshScope`
  - `MemoryEvidencePacket`
- Update AI hook in `src/hooks/useAI.ts`:
  - expose `synthesizePositionMemory(...)`
  - expose refresh helpers for:
    - lazy scope refresh before generation
    - manual full refresh from the position page
- Update generation consumers to read:
  - `position.generationMemory?.questionGuidancePrompt`
  - `position.generationMemory?.summaryGuidancePrompt`

## Test Plan

- Unit tests:
  - event-to-evidence normalization for each feedback type
  - memory response parsing and validation
  - refresh condition logic: thresholds, cooldown, stale-window behavior
  - manual refresh path bypasses thresholds correctly
- Store tests:
  - recording feedback marks the correct scope dirty without calling synthesis
  - successful lazy refresh clears dirty state and stores usage
  - failed refresh preserves old memory and leaves dirty state intact
  - manual refresh updates both scopes and stores per-scope usage
- UI tests:
  - position page shows the manual refresh button
  - clicking manual refresh shows loading state and updates displayed guidance
  - question generation shows visible memory-refresh step when refresh is triggered
  - summary generation shows visible memory-refresh step when refresh is triggered
  - refresh usage and generation usage are displayed separately
- Regression tests:
  - generation still works with no memory
  - generation still works when memory refresh fails
  - position detail page still shows meaningful fallback when no memory exists

## Assumptions

- Default chosen: structured local memory with lazy refresh plus manual refresh.
- Scope remains position-scoped and local-storage-backed; no backend memory service is added in this iteration.
- Lazy refresh is the primary path; manual refresh is an explicit override for users who want to force an update.
- Token usage for memory refresh is captured and displayed separately so users can understand the cost of this step.
