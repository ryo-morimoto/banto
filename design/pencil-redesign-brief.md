# banto Dashboard Redesign Brief

## Product context

- Product: banto (coding task dashboard for autonomous agents)
- Primary usage: one-person operation from desktop, sometimes mobile
- Core flow: jot task -> run agent session -> monitor result

## Current pain

- The current UI is functionally correct but visually generic.
- Information hierarchy is weak, so scanability suffers.
- The layout works, but emotional tone is not intentional.

## Non-negotiables

- Keep the existing information architecture:
  - left: task list grouped by project
  - middle: task detail and controls
  - right: terminal/session output
- Preserve mobile behavior (sidebar toggle, responsive layout).
- Keep Japanese UI copy support.
- Prioritize function over decoration.

## Visual direction

- Build a practical "operator console" tone, not a default SaaS clone.
- Improve typography hierarchy (titles, metadata, action labels, status).
- Use a coherent token set for color, spacing, borders, and emphasis.
- Make states obvious at a glance:
  - no session
  - provisioning/running/waiting
  - done
  - failed

## Desired output

- One polished direction that can be implemented incrementally.
- Component-level guidance for:
  - root layout shell
  - task list rows and group headers
  - task detail panel actions
  - terminal container framing and status overlays
- Tokens that can be mapped to Tailwind classes/CSS variables.
