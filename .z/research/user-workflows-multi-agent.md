# Real-World Multi-Agent Coding Workflows: User Behavior Research

Date: 2026-03-07
Sources:
- Hacker News discussion threads (10+ threads, 2025-2026)
- Simon Willison's blog (simonwillison.net)
- Addy Osmani's blog (addyosmani.com)
- Cursor blog (cursor.com/blog/scaling-agents)
- Cognition AI blog (cognition.ai/blog)
- CodeRabbit State of AI Code Generation report
- DORA Report 2025
- Towards Data Science, DEV Community, Medium posts
- Various Show HN tool launches (ccmux, gwt-claude, DevSwarm, Claude Squad)

Ethnographic-style research into how real developers use AI coding agents (Claude Code, Cursor, Codex, Devin) in daily workflows, with emphasis on pain points, organic behaviors, and surprises. Sources are primarily first-person accounts from Hacker News, developer blogs, and tool creators who built solutions for their own problems.

---

## Overview

This research captures what developers actually do (not what they say they want) when running AI coding agents, especially in parallel setups. The findings come from 2025-2026 discussions across Hacker News, developer blogs, and the ecosystem of community tools built to address workflow gaps.

Key finding: The dominant pain points are not about agent intelligence. They are about **session management, context loss, review bottleneck, and cognitive overhead** -- the operational friction of running agents as part of a real workflow.

---

## Architecture

N/A -- this is a user behavior study, not a tool analysis.

---

## Well-Regarded Features

(Reframed as: What actually works well in multi-agent workflows)

### 1. Git Worktree Isolation
The single most praised pattern across all sources. Developers who use git worktrees for parallel agents report dramatically less friction than those using branch-switching or stashing.

> "Isolating Claude Code per branch avoids a lot of context loss when juggling bugfixes and features." -- mishrapravin441, HN

Claude Code shipped native `--worktree` support (Feb 2026), validating this as the standard isolation mechanism.

### 2. Scout/Exploration Agents
Using agents with no intent to land their code -- purely to explore a codebase and understand the problem space.

> "Send out a scout. Hand the AI agent a task just to find out where the sticky bits are, so you don't have to make those mistakes." -- Josh Bleecher Snyder, via Simon Willison

### 3. Specification-First Workflow
Writing detailed specs before sending work to agents massively reduces review burden.

> "Reviewing code that lands on your desk out of nowhere is a lot of work -- you first have to derive the goals, decide if the project needs it, and evaluate whether the approach fits. Code that started from your own specification is much less effort to review." -- Simon Willison

### 4. Context Firewall Pattern
Giving each agent a narrow, isolated context scope rather than full codebase access.

> "Use agents as context firewalls. Let them read files, run tests, research bugs...pass essential data back." -- aroussi, HN (Show HN: PM system for Claude Code)

---

## Poorly-Regarded Features / Pain Points

### 1. Terminal/Session Sprawl (HIGH resonance)
The #1 complaint across all multi-agent discussions. Developers lose track of which agent is doing what, which terminal needs attention, and which branch is which.

> "Terminals everywhere, editor windows everywhere, and you lose track of basics like which agent is on which branch and what is ready for review." -- DevSwarm 2.0 Show HN (7 points)

> "Parallel agent sessions get unwieldy fast." -- jlongo78, HN

> "which session was working on X is exactly where things break down" -- jlongo78, HN

This pain point spawned an entire ecosystem of tools: Claude Squad (6.2k stars), ccmux, gwt-claude, DevSwarm, Vibe Kanban (9.4k stars).

### 2. Context Loss / Compaction Amnesia (HIGH resonance)
Claude Code's context compaction (triggered at ~95% of 200k token window) silently discards important context, causing the agent to forget conventions, undo recent work, or violate project instructions.

> "Claude Code compaction silently destroyed 4 hours of my work." -- DEV Community post title

> "GitHub Issue #9796: project instructions were followed perfectly before compaction but violated 100% of the time after compaction." -- Oct 2025

> "There are few things in life that can kill the vibes like this." -- Du'An Lightfoot, on compaction mid-session

Workarounds: external memory files, proactive `/compact`, `--resume` flag (many users don't know it exists), structured task documentation that survives compaction.

### 3. Code Review Bottleneck (HIGH resonance, data-backed)
Agents generate code faster than humans can review it. This is the fundamental scaling constraint.

> "AI-generated code needs to be reviewed, which means the natural bottleneck on all of this is how fast I can review the results." -- Simon Willison

Hard data:
- AI-authored PRs contain 10.83 issues/PR vs 6.45 for human-only (CodeRabbit, 470 PRs)
- AI PRs have 1.7x more major issues, 1.4x more critical issues
- 67.3% of AI-generated PRs get rejected vs 15.6% manual (LinearB)
- Monthly code pushes crossed 82M on GitHub; merged PRs hit 43M; ~41% AI-assisted (Octoverse)

> "The review process needs to be diligent and all-encompassing and is, quite frankly, exhausting." -- adriand, HN

> "If you don't review the LLM's code, it breaks very quickly." -- stavros, HN

### 4. Mental Overhead of Monitoring (MEDIUM-HIGH resonance)
Running multiple agents is "surprisingly effective" but psychologically draining.

> "[Parallel agents are] surprisingly effective at getting a lot done quickly, but it's also mentally taxing to monitor multiple AI threads." -- Addy Osmani (Google)

> "the only people I've heard are using parallel agents successfully are senior+ engineers." -- Gergely Orosz

Most developers settle on 1 main agent + occasional secondary, despite tooling supporting many more.

### 5. Agent Drift / Design Intent Erosion (MEDIUM resonance)
Agents gradually deviate from stated design goals over iterations, especially in longer sessions.

> "I wanted the code to look a certain way, but it kept pulling back to the way it wanted to do things... Eventually it was easier just to quit fighting it and let it do things the way it wanted." -- daxfohl, HN (38 days ago)

The model has a "gravitational pull toward training data patterns" that makes maintaining novel architectural decisions difficult.

### 6. Black Box Execution (MEDIUM resonance)
When agents hide their reasoning process, users lose ability to course-correct early.

> "[Claude Code] now functions as a black box forcing users to wait for completion before reviewing git diffs -- after spending significant token budget without visibility into reasoning." -- jarjoura, HN (CTO)

> "I would often see the model 'think' differently from the response" and could previously interrupt when Claude wasn't pursuing necessary investigation paths. -- trb, HN

Users want to see: which files the agent is reading, what search queries it's running, what reasoning path it's following -- all in real time.

### 7. Merge Conflicts in Parallel Work (MEDIUM resonance)
Even with worktrees, parallel agents touching overlapping files create painful merges.

> "Having more than one agent working in parallel felt like a recipe for disaster -- too much code to review and ugly conflicts due to agents all modifying the same files in different ways." -- Gergely Orosz

Teams limit to max 3 parallel branches and require senior developers to manage merges (aroussi, HN).

Cursor's own research found that self-coordination via shared files failed: "agents would hold locks for too long, or forget to release them entirely."

### 8. Session Persistence / Crash Recovery (MEDIUM resonance)
Long-running sessions killed by connection drops, terminal closes, or crashes.

> "The 'survive interruptions' piece is underrated. Anyone who has had a long agentic run get killed by a dropped connection knows the pain." -- HN commenter

Many developers don't know about `claude --resume` or `-c` flags. Session recovery is a hidden feature, not a first-class workflow.

### 9. Slow Feedback Loop (Devin-specific, HIGH resonance)
Asynchronous agents like Devin have 12-15 minute response cycles, creating frustrating wait times.

> "I don't want to make an ask and wait 15 minutes for a pull request... I much prefer Cursor's workflow where I have all of this right in my local environment." -- Devin user

> One tester: "It took 36 minutes to do the task himself, and six hours for Devin to fail to do it."

### 10. Reading Atrophy / Skill Degradation (LOW-MEDIUM resonance)
Developers stop reading docs and understanding code "in their bones."

> "I don't really understand the code 'in my bones'... if there was a SEV0 bug, am I confident enough I could fix it?" -- nemothekid, HN

> "Reading atrophy" -- developers stop consulting documentation entirely. -- CharlieDigital, HN

---

## User Feedback Summary

### Hacker News (10+ threads, 2025-2026)

**What users actually DO when monitoring agents:**
- Press Esc to interrupt questionable search patterns (bonoboTP)
- Check git diffs after completion rather than mid-session (jarjoura)
- Enable verbose mode to see file access patterns (multiple users)
- Search past conversations by content for context recovery (jlongo78)
- Switch between named sessions using mouse/keybindings (raykamp)
- Force agents to write summaries of changes and reasoning (mac-mc)
- Spin up a separate agent instance to review the first agent's diff (CuriouslyC)
- Use branch names as quick task indicators, but "branch name gets you partway there but doesn't capture intent" (jlongo78)

**Organic workflows that emerged:**
1. **Plan-then-execute pipeline**: Use powerful model (Opus) for planning, fast model (Haiku) for execution
2. **Writer/Reviewer pattern**: One agent writes code, another reviews with cleared context
3. **Multi-pass development**: "structure emerges out of chaos" through iterative agent runs (allisdust)
4. **Git commits as save points**: Commit after each small agent task for quick rollback (Addy Osmani)
5. **AST-parsing for context reduction**: Strip function bodies, feed only signatures/types to reduce tokens (storystarling)
6. **Named sessions tied to task scope**: Not just terminal tabs but semantic units (jlongo78)
7. **Three parallel branches max**: Self-imposed limit to keep merge conflicts manageable (aroussi)
8. **Waterfall in 15 minutes**: Rapid structured planning before any code generation (Addy Osmani)

**Pushback on parallelism hype:**
> "I don't need 10 parallel agents making 50-100 PRs a week, I need 1 agent that successfully solves the most important problem." -- HN commenter, Jan 2026

### Simon Willison (simonwillison.net)

Key insights from running 6 parallel agents:
- "There is a definite knack to spotting opportunities for parallel agents"
- Low-stakes maintenance tasks are ideal candidates; high-stakes work should stay single-agent
- He runs agents in YOLO mode (no approvals) for trusted, isolated tasks
- "It's difficult -- there's a lot of depth to understanding the tools and plenty of traps to avoid"
- Recommends Docker containers for safety isolation (learned the hard way)

### Addy Osmani (Google, addyosmani.com)

- Sticks to 1 main agent despite experimenting with parallel setups
- LLMs "write code with complete conviction -- including bugs or nonsense -- and won't tell you something is wrong unless you catch it"
- Developer who "leaned heavily on AI generation for a rush project" ended up with "an inconsistent mess -- duplicate logic, mismatched method names, no coherent architecture"
- Using LLMs for programming is "difficult and unintuitive"

### Cursor Engineering Blog (cursor.com/blog/scaling-agents)

On their own multi-agent system:
- Self-coordination via shared files failed completely
- "Agents would hold locks for too long, or forget to release them entirely"
- Solution: strict role separation (planners vs workers), not flat coordination
- "Agents occasionally run for far too long. They still need periodic fresh starts to combat drift"
- GPT-5.2 much better than Opus 4.5 at extended autonomous work without drift

### Cognition AI (Devin maker)

Acknowledged the fundamental gap:
> "The feeling that people have of extreme productivity with coding agents in their vibecoded prototypes, vs the disappointing feeling that most people actually see in the useful output" is "the great mystery of our time."

### Quality Data (DORA Report 2025, CodeRabbit, LinearB, METR)

- 90% AI adoption increase correlates with 9% climb in bug rates, 91% increase in code review time, 154% increase in PR size (DORA 2025)
- METR study: experienced maintainers were 19% slower with AI tools while believing they were 20% faster -- a 39-percentage-point perception gap
- An agent writing 1,000 PRs/week with a 1% vulnerability rate creates 10 new vulnerabilities weekly

---

## Learnings for banto

### What Users Actually Want
- A single view showing which agents are running, what they're working on, and which ones need attention -- the "air traffic control" view
- Named sessions tied to task intent, not just terminal IDs or branch names
- Real-time visibility into agent reasoning/file access without waiting for completion
- Easy session recovery after crashes/disconnects without losing context
- A way to manage the review bottleneck -- knowing what's ready for review vs still in progress
- Notification when an agent needs input, without constant monitoring
- Cost/token visibility per session

### Technical Design Lessons
- Git worktree isolation is the proven standard for parallel agent work -- banto should assume this pattern
- Context compaction/loss is a fundamental problem; external state (event ledger, task metadata) that survives agent restarts is essential
- Self-coordination between agents via shared state fails at scale; hierarchical role separation (planner/worker) works better
- Session persistence is non-negotiable -- users expect to close a terminal and come back later
- The `--resume` pattern is powerful but most users don't discover it; banto should make session resumption automatic/obvious
- Docker/container isolation for safety is a pattern power users adopt; consider making it easy

### UX Pattern Lessons
- Terminal sprawl is the #1 UX problem -- banto's single dashboard view directly addresses this
- Status at a glance matters most: running / waiting for input / completed / failed / ready for review
- Branch name alone doesn't capture intent -- task description + branch + status is the minimum useful unit
- Users want to interrupt agents mid-stream when they see bad paths (not wait for completion)
- Review is exhausting; any way to pre-filter or summarize agent changes before human review adds value
- Signal-to-noise in AI output is a universal complaint -- structured summaries > raw output

### Business & Ecosystem Lessons
- The parallel agent space is exploding with community tools (Claude Squad 6.2k stars, Vibe Kanban 9.4k stars) -- all solving sprawl/monitoring
- Most tools are CLI/TUI; web dashboards are underserved (only Marc Nuri, AgentOS)
- Senior engineers are the primary users of parallel agents; the UX should not assume beginners
- Cost unpredictability is a real concern -- token/credit visibility per task is a differentiator
- The industry consensus is shifting from "more agents" to "better orchestrated agents" -- quality over quantity
- Devin's async/remote model ($500/mo) is losing to local agent tools (free/cheap) -- local-first is winning

---

## Sources

- https://news.ycombinator.com/item?id=47168068 -- DevSwarm 2.0: parallel Claude Code sprawl
- https://news.ycombinator.com/item?id=47223142 -- ccmux: context switching for parallel sessions
- https://news.ycombinator.com/item?id=46384500 -- gwt-claude: git worktrees for parallel sessions
- https://news.ycombinator.com/item?id=43575127 -- Claude Squad: managing multiple Claude Code instances
- https://news.ycombinator.com/item?id=44960594 -- PM system for Claude Code
- https://news.ycombinator.com/item?id=46771564 -- Random notes from Claude coding
- https://news.ycombinator.com/item?id=46978710 -- Claude Code quality degradation
- https://news.ycombinator.com/item?id=46766961 -- AI code review bubble
- https://news.ycombinator.com/item?id=47096937 -- Excessive token usage in Claude Code
- https://news.ycombinator.com/item?id=45181577 -- Claude Code subagents for parallelization
- https://simonwillison.net/2025/Oct/5/parallel-coding-agents/ -- Simon Willison: parallel coding agent lifestyle
- https://addyosmani.com/blog/ai-coding-workflow/ -- Addy Osmani: LLM coding workflow going into 2026
- https://cursor.com/blog/scaling-agents -- Cursor: scaling agents (self-coordination failures)
- https://cognition.ai/blog/devin-annual-performance-review-2025 -- Devin 2025 performance review
- https://cognition.ai/blog/devin-review -- Devin Review: AI to Stop Slop
- https://trickle.so/blog/devin-ai-review -- Devin AI: good, bad, and costly truth
- https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report -- AI vs human code gen: 1.7x more issues
- https://pullflow.com/state-of-ai-code-review-2025 -- 1 in 7 PRs now involve AI agents
- https://towardsdatascience.com/how-to-run-coding-agents-in-parallell/ -- How to run coding agents in parallel
- https://www.eqengineered.com/insights/multiple-coding-agents -- Power and peril of multiple agents
- https://mikemason.ca/writing/ai-coding-agents-jan-2026/ -- Coherence through orchestration
- https://dev.to/gonewx/claude-code-lost-my-4-hour-session-heres-the-0-fix-that-actually-works-24h6 -- Claude Code lost 4-hour session
- https://dev.to/kaz123/how-i-solved-claude-codes-context-loss-problem-with-a-lightweight-session-manager-265d -- Context loss session manager
- https://medium.com/coding-nexus/claude-code-context-recovery-stop-losing-progress-when-context-compacts-772830ee7863 -- Context recovery after compaction
