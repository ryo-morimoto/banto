# Devin (Cognition AI) Research

Date: 2026-03-07
Sources:
- https://devin.ai
- https://cognition.ai

Commercial cloud-based autonomous AI software engineer. Created by Cognition Labs (CEO Scott Wu, CTO Steven Hao). $10.2B valuation. GA December 2024. Devin 2.0 released April 2025. Acquired Windsurf IDE in December 2025 for ~$250M. $73M ARR as of June 2025.

---

## Overview

Devin is a fully autonomous AI coding agent that operates in a cloud-based sandboxed environment. Users assign tasks via web UI, Slack, Linear, CLI, or API. Devin plans, writes code, runs tests, debugs, and opens PRs with minimal human supervision. Positioned as "an AI teammate" rather than an IDE extension.

Key numbers (as of early 2026):
- $73M ARR (up from $1M in Sept 2024)
- 67% PR merge rate (up from 34% in first year)
- 4x faster problem-solving vs. year prior
- Hundreds of thousands of PRs merged
- Used by Goldman Sachs, Santander, Nubank, and thousands of companies
- Cognition uses Devin internally: 659 Devin PRs merged in a single week

### Pricing

| Plan | Price | ACUs Included | Overage |
|------|-------|---------------|---------|
| Core | $20/mo | Pay-as-you-go | $2.25/ACU |
| Team | $500/mo | 250 ACUs | $2.00/ACU |
| Enterprise | Custom | Custom | Custom |

**ACU (Agent Compute Unit)** measures VM time + model inference + networking per task. Devin auto-sleeps after ~0.1 ACUs of inactivity.

History: Launched at $500/mo flat. Devin 2.0 dropped entry to $20/mo (96% reduction) in April 2025.

### Cognition + Windsurf Acquisition

In December 2025, Cognition acquired Windsurf (formerly Codeium) for ~$250M after Google reverse-acquihired Windsurf's CEO and senior leadership for $2.4B.

Cognition acquired:
- Windsurf IDE, IP, trademark, and brand
- ~$82M ARR and 350+ enterprise clients
- 250-person team

Strategic rationale: Cognition now owns both the autonomous agent (Devin) and the IDE workspace (Windsurf). Windsurf handles real-time AI-assisted coding at the desk; Devin handles autonomous background tasks. Integration in progress.

### Summary Comparison with banto

| Aspect | Devin | banto |
|--------|-------|-------|
| Execution | Cloud VMs (Cognition-hosted) | Local nixos-containers |
| Cost model | ACU-based (unpredictable) | Local hardware (fixed) |
| Session memory | None (cold start each time) | Opportunity to persist |
| Agent model | Proprietary models | Claude Code (CC only) |
| Interface | Web, Slack, Linear, CLI, API | PWA dashboard |
| Isolation | Per-session Docker/VM | Per-session nixos-container |
| Target user | Teams, enterprises | Solo developer, multi-project |
| Strengths | Scale, migrations, enterprise | Visibility, cost, simplicity |

---

## Architecture

### Session-Level VM Isolation

Each Devin session boots a fresh **Ubuntu 22.04 VM** (running inside Docker containers). The VM provides:
- Bash terminal
- VS Code-style editor
- Chrome browser instance (for web interaction)
- Full filesystem access

Sessions are isolated — multiple Devins can run in parallel without interference. Each session starts with a fresh VM (re-clone, re-install), though VM snapshots can be saved and reused.

### Brain vs. Execution Split

Devin's architecture separates intelligence from execution:

1. **Devin Brain (Intelligence Layer)** — The core reasoning system that processes context and determines actions. Hosted in Cognition's infrastructure. Uses proprietary models trained with reinforcement learning.
2. **Devin VM (Execution Environment)** — The sandboxed development environment where actions are executed. Can be deployed in customer VPC for enterprise.

Session-level Brain containers are created per session. Secrets are decrypted at session start, loaded as env vars, then re-encrypted. The system is stateless — no data stored at rest outside the customer environment (for VPC deployments).

### Memory Layer

Beneath the workspace sits a memory layer that stores:
- Vectorized snapshots of the codebase
- Full replay timeline of every command, file diff, and browser tab
- Session Insights analysis for process improvement

**Critical limitation**: Devin does not maintain long-term memory across sessions. Each session starts fresh. Described by critics as "a capable but amnesiac contractor who needs fresh onboarding every time."

### Enterprise VPC Deployment

For enterprise customers, the execution environment deploys inside the customer's VPC while the Brain remains in Cognition's tenant. This enables access to proprietary resources behind corporate firewalls with fine-grained access controls.

### Interactive Planning

When a session starts, Devin analyzes the repository and generates a step-by-step plan with file citations within seconds. Users review and modify the plan before autonomous execution begins. This addresses the core problem of misaligned execution — the agent shows its intended approach before writing code.

### Devin Search

Agentic codebase exploration tool. Users ask questions about their codebase and get detailed answers with cited code. "Deep Mode" available for queries requiring extensive investigation. Powered by automatic repository indexing.

### Devin Wiki (DeepWiki)

Automatically indexes repositories every ~2 hours, generating:
- Detailed wikis with architecture diagrams
- Direct links to source code
- Comprehensive documentation

Configurable via `.devin/wiki.json` in repo root. Used by Ask Devin to understand codebase context before sessions. One bank used it to document 400,000+ repositories, enabling team reallocation.

### Playbooks

Reusable prompt templates for recurring tasks. A good Playbook includes:
- Desired outcomes and required steps
- Post-conditions and validation criteria
- Corrective instructions for agent priors
- Forbidden actions and required context

Examples: Redshift data ingestion, database migrations, Stripe/Plaid/Modal integrations, `!triage-bug` workflow.

Can be triggered on schedules (via Schedules page) with email notifications.

### MCP Integration

Devin supports Model Context Protocol with a marketplace of one-click integrations:
- Sentry, Datadog, Vercel, Notion, Asana, Neon
- Database connectors (Redshift, PostgreSQL, Snowflake, BigQuery)
- Slack bridge for session management
- Parallel Search for web research

### Multi-Agent & Parallel Sessions

Multiple Devin instances can run simultaneously, each in its own isolated VM/IDE. Patterns:
- One customer auto-triggers 3 test-writing agents per new feature
- API-driven zero-human-loop workflows: Sentry crash -> investigation -> PR
- Multi-agent operation: one agent dispatches tasks to other agents

### DANA (Data Analyst Agent)

Specialized agent variant for data analysis. Connects to data warehouses via MCP, maintains automatic schema knowledge, accessible via Slack or web agent picker.

### Devin Review

Automated PR review with:
- Smart diff organization
- Copy and move detection
- Automated bug detection with autofix
- Codebase-aware contextual chat

### Self-Assessed Confidence

Later versions include confidence evaluation — asks for clarification when not confident enough rather than proceeding blindly. (Though critics note this still doesn't work well enough.)

---

## Well-Regarded Features

### 1. Interactive Planning
Users consistently praise the plan-first approach. Seeing Devin's intended steps before execution reduces wasted compute and misaligned work. This is Devin's most differentiated UX feature.

### 2. Parallel Session Execution
Running multiple Devins simultaneously on different tasks is a genuine productivity multiplier for teams with large backlogs of well-defined work.

### 3. Automated Migrations at Scale
The standout enterprise use case. Examples:
- SAS -> PySpark, COBOL, Angular -> React, .NET Framework -> .NET Core
- 10x faster than human engineers on proprietary ETL framework migration (3-4 hrs vs 30-40 hrs per file)
- 14x faster on Java version upgrades

### 4. Security Fix Automation
5-10% total developer time saved. 20x efficiency on vulnerability remediation (1.5 min vs 30 min per vuln).

### 5. Test Coverage Expansion
Teams report coverage increases from 50-60% to 80-90% when using Devin for test writing.

### 6. Devin Wiki / DeepWiki
Automatic codebase documentation is genuinely useful for onboarding and legacy code understanding.

### 7. Multi-Interface Access
Slack, Linear, web, CLI, API — work starts where you already are.

### 8. Playbooks
Reusable automation templates that encode institutional knowledge. Good for recurring operational tasks.

---

## Poorly-Regarded Features / Pain Points

### 1. Unpredictable Reliability
The most consistent criticism. Answer.AI's month-long test: 14 failures, 3 inconclusive, 3 successes out of 20 tasks. "Even tasks similar to our early wins would fail in complex, time-consuming ways."

### 2. Looping / Hallucination Under Failure
When stuck, Devin presses forward rather than recognizing blockers. It spent over a day attempting impossible Railway deployments, "hallucinating non-existent features." Gets trapped in faulty script -> wrong data -> rewrite -> wrong data cycles.

### 3. Hidden Supervision Cost ("Babysitting Tax")
Devin isn't set-and-forget. Senior engineers must review, guide, and course-correct. "For complex tasks, I spend more time steering the agent than I would have spent writing the code myself."

### 4. Unpredictable ACU-Based Costs
ACU consumption varies per task complexity, making budgeting difficult. Credits can run out mid-task, pausing work. "A nightmare for anyone trying to manage a budget."

### 5. No Cross-Session Memory
Each session starts from scratch. No accumulated learning about your codebase conventions, preferences, or past failures. Fresh onboarding every time.

### 6. Overcomplexity / Code Quality
Generates "spaghetti code" and unnecessary abstractions. One reviewer: "Tasks it can do are those that are so small and well-defined that I may as well do them myself, faster, my way."

### 7. Poor Performance on Ambiguous Tasks
Cannot handle open-ended or ambiguous work. Needs clear, specific instructions. "Can't independently tackle an ambiguous coding project end-to-end like a senior engineer could."

### 8. Higher Defect Rates
Anecdotal reports of 1.5-2x higher defect rates vs. senior-developer-authored code for equivalent complexity.

### 9. Misleading Early Marketing
The initial Upwork demo was debunked by multiple developers. SWE-bench results had caveats glossed over in marketing. This eroded community trust significantly.

---

## User Feedback Summary

### Answer.AI (Month-Long Test, Jan 2025)
- 20 tasks attempted: 14 failures, 3 inconclusive, 3 successes
- Successes: Notion-to-Google Sheets integration, planet tracker app, Discord bot research
- Failures: web scraping (stuck in loops), HTMX app (hallucinated APIs), security review (false positives), SSH debugging (fixated on wrong area)
- Key quote (Johno Whitaker): "Tasks it can do are those that are so small and well-defined that I may as well do them myself, faster, my way."
- Key quote (Hamel Husain): Devin struggled with internal tooling despite documentation; Cursor worked better because you can nudge incrementally.
- Conclusion: "Real-world utility is minimal despite polished UX and significant funding."

### The Register (Jan 2025)
- "First AI software engineer is bad at its job"
- Cited Answer.AI's 15% success rate prominently
- Noted hallucination of non-existent features and days spent on impossible tasks

### Cognition's Own 2025 Performance Review
- 67% PR merge rate (implies 33% still fail/get rejected)
- Best at "tasks with clear, upfront requirements and verifiable outcomes that would take a junior engineer 4-8 hrs"
- Acknowledged: cannot handle ambiguity, iterative collaboration, or soft skills
- Internally pushed ~1/3 of web app commits

### Enterprise Customers (Cognition-Reported)
- Large bank: 10x faster ETL migrations
- Security teams: 20x faster vulnerability fixes
- QE teams: 40% test coverage increase
- Data teams: 3x more features shipped

### Product Manager Test (Non-Coder)
- Built a working SaaS app (Python backend + React frontend) in 2 days
- "Something that would take developers at least a week"
- Handled database setup and frontend without constant oversight

### Ethan Mollick (Wharton Professor)
- Tasked Devin with posting on Reddit to offer website building
- Devin autonomously decided to charge $50-100/hour
- Mollick concluded Devin "wasn't good enough as yet"

### Developer Community Sentiment (HN, Reddit)
- Dominant view: significantly overhyped relative to actual capabilities
- Generally seen as inferior to human-in-the-loop tools (Cursor, Claude Code) for most work
- Grudging respect for narrow, well-defined task automation
- "AI that replaces you will fail; AI that partners with you will make you faster"

---

## Learnings for banto

### What Users Actually Want
- **Visibility into agent reasoning is critical.** Devin's Interactive Planning is its most praised feature. Showing the plan before execution builds trust and reduces wasted work. banto should make the agent's plan/reasoning visible before and during execution, not just show terminal output.
- **Well-scoped tasks win; ambiguous tasks fail.** Every evaluation confirms: autonomous agents excel at clear, bounded, 4-8 hour junior-level tasks and fail at ambiguous senior-level work. banto's "jot, throw, watch" model should encourage task decomposition — help users break large goals into agent-sized chunks.
- **The babysitting tax is real.** Full autonomy is a lie in 2026. Users must monitor, review, and intervene. banto's single-screen dashboard watching multiple sessions is the right UX for this reality. Optimize for fast human intervention, not full autonomy.
- **Playbooks / reusable templates are high-value.** Encoding recurring workflows as playbooks dramatically improves success rates. banto could support task templates that capture prompt structure, expected steps, and validation criteria.

### Technical Design Lessons
- **Session isolation is table stakes.** Per-session VMs with full tool access (terminal, editor, browser) is the proven pattern. banto's nixos-container approach is aligned. The key insight: isolation enables safe parallelism.
- **Cross-session memory is a differentiator.** Devin's biggest architectural gap is no persistent memory across sessions. Every session is a cold start. banto can differentiate by accumulating task context, codebase conventions, and past session outcomes that inform future sessions. This directly addresses the "amnesiac contractor" problem.
- **Automatic codebase understanding is valuable.** DeepWiki's auto-generated documentation and search are genuinely useful. banto could benefit from codebase indexing to give agents better context, though this is lower priority than core task execution.

### UX Pattern Lessons
- **Multi-interface triggers matter.** Devin works because tasks start where engineers already are (Slack, Linear, CLI, API). banto's PWA approach is good, but consider API/webhook triggers for CI/CD integration later.
- **Cost predictability matters.** ACU-based pricing is a persistent complaint. banto runs locally on user hardware, which is inherently cost-predictable. This is an advantage worth preserving.

### Business & Ecosystem Lessons
- **Trust is earned through transparency, not marketing.** Devin's misleading early demos permanently damaged community trust. banto should show real capabilities honestly. The dashboard paradigm (watch what's happening in real-time) inherently provides transparency.

---

## Sources

- [Cognition | Devin 2.0](https://cognition.ai/blog/devin-2)
- [Cognition | Devin's 2025 Performance Review](https://cognition.ai/blog/devin-annual-performance-review-2025)
- [Cognition | How Cognition Uses Devin to Build Devin](https://cognition.ai/blog/how-cognition-uses-devin-to-build-devin)
- [Cognition | Windsurf Acquisition](https://cognition.ai/blog/windsurf)
- [Thoughts On A Month With Devin - Answer.AI](https://www.answer.ai/posts/2025-01-08-devin.html)
- [First AI software engineer is bad at its job - The Register](https://www.theregister.com/2025/01/23/ai_developer_devin_poor_reviews/)
- [Devin AI Review: The Good, Bad & Costly Truth - Trickle](https://trickle.so/blog/devin-ai-review)
- [Agent-Native Development: Devin 2.0 Technical Design - Medium](https://medium.com/@takafumi.endo/agent-native-development-a-deep-dive-into-devin-2-0s-technical-design-3451587d23c0)
- [Cognition acquires Windsurf - TechCrunch](https://techcrunch.com/2025/07/14/cognition-maker-of-the-ai-coding-agent-devin-acquires-windsurf/)
- [Devin AI - Wikipedia](https://en.wikipedia.org/wiki/Devin_AI)
- [Devin VPC Deployment Docs](https://docs.devin.ai/enterprise/vpc/overview)
- [DeepWiki Docs](https://docs.devin.ai/work-with-devin/deepwiki)
- [Cognition | Devin's MCP Marketplace](https://cognition.ai/blog/mcp-marketplace)
- [How Cognition Uses Devin - Nader Dabit](https://nader.substack.com/p/how-cognition-uses-devin-to-build)
- [Devin Pricing](https://devin.ai/pricing)
