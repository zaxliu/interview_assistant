# AGENTS.md

This file defines how agents should collaborate in this repository.

## Purpose

- Keep parallel work fast and predictable.
- Reduce merge conflicts across multiple agents and multiple git worktrees.
- Make integration ownership explicit.

## Repository Context

- App type: React 18 + TypeScript + Vite.
- Main state and UI work should preserve existing project patterns.
- Prefer focused edits over broad refactors unless explicitly assigned.

## Global Rules

- Do not revert changes made by the user or by other agents.
- Prefer the smallest change that satisfies the task.
- Keep unrelated formatting changes out of functional edits.
- If you notice unexpected changes in files relevant to your task, adapt to them instead of overwriting them.
- If task boundaries become unclear, stop and report the conflict instead of guessing.

## Parallel Work Policy

- Parallel work is encouraged when tasks have clear boundaries.
- Default split is by feature area, module, or test scope.
- Avoid assigning multiple agents to the same file unless shared-file work is explicitly approved.
- The main agent is responsible for final integration, verification, and conflict resolution unless another integration owner is explicitly assigned.

## Worktree Policy

- Agents may work in separate git worktrees.
- Separate worktrees do not remove the need for ownership boundaries.
- Before editing, each agent should assume other worktrees may contain concurrent changes.
- When changes from multiple worktrees are merged, preserve behavior first and refactor second.

## Shared File Rule

- Multiple agents may edit the same file only when they are assigned distinct sections with minimal overlap.
- Shared-file work must name the intended section or responsibility, such as a component, hook, utility block, or test block.
- Do not rewrite, reorder, or reformat unrelated parts of a shared file.
- If an assigned change starts to overlap with another agent's logic, stop and report instead of guessing.
- One integration owner must merge and reconcile all shared-file edits.

## Ownership Model

- Each agent must have a clearly stated scope before starting work.
- Scope should include both responsibility and write surface.
- Good ownership examples:
  - UI for a specific route or component tree
  - A single store or utility module
  - A specific proxy or API integration
  - Tests for one feature area
- Bad ownership examples:
  - "frontend"
  - "fix bugs everywhere"
  - "refactor as needed"

## Editing Guidelines

- Preserve existing naming, component structure, and state-management patterns unless the task requires a change.
- Avoid broad file moves or large-scale renames during parallel work.
- Add brief comments only where logic is not obvious.
- Keep code ASCII unless a file already relies on non-ASCII content.

## Verification Rules

- Every agent should run the narrowest verification that matches its change when feasible.
- Prefer targeted checks first, then broader checks if needed.
- Relevant commands in this repo include:
  - `npm run lint`
  - `npm run test`
  - `npm run build`
- If you cannot run verification, state that clearly in the handoff.

## Required Handoff Format

Each agent should report:

- Scope handled
- Files changed
- What changed
- Tests or checks run
- Risks, assumptions, or blockers

## Conflict Handling

- If another agent already changed a file you need, read the latest version carefully before editing.
- If edits are compatible, integrate with the existing change rather than replacing it.
- If edits are not clearly compatible, stop and report the overlap.
- Do not force-resolve conflicts by dropping another agent's work without explicit instruction.

## Recommended Parallel Patterns

- Feature implementation in one module while another agent adds tests.
- One agent updates UI while another updates a non-overlapping store or utility.
- One agent investigates code paths while another prepares isolated test coverage.
- One agent works in a dedicated worktree on a risky branch while the main agent continues integration in the primary worktree.

## Anti-Patterns

- Multiple agents editing the same function at the same time.
- Large refactors mixed with feature delivery in parallel.
- Repo-wide formatting while feature work is in flight.
- Changing public interfaces without explicitly notifying dependent tasks.

## Default Role Split

Use this split unless the user gives a better one:

- Main agent: planning, integration, validation, final review
- Worker agent 1: primary implementation
- Worker agent 2: adjacent but non-overlapping implementation
- Worker agent 3: tests, validation, or code review

## Decision Standard

- Optimize for low-conflict parallel progress, not maximum theoretical concurrency.
- If a task can be split by file, do that first.
- If it cannot be split by file, split by code section.
- If it cannot be split by code section safely, keep it with a single agent.
