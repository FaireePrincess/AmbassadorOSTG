# Ambassador OS Dev Log

## Snapshot
This log summarizes the major changes implemented across recent iterations, based on commits currently on `main`.

## Completed Work

### 1) Stability and interaction fixes
- Improved web click/tap reliability across tasks and profile tabs.
- Fixed profile persistence and hydration-related issues.
- Stabilized submission edit flow and route behavior.

Related commits:
- `d2e5b06`, `dfff703`, `03f1861`, `1e6e1a9`, `4bd5292`

### 2) Leaderboards, analytics, and region tooling
- Added leaderboard experience and regional leaderboard flows.
- Added regional analytics and X metrics automation/admin telemetry.
- Moved X metrics into dedicated admin areas and improved admin filters/navigation.

Related commits:
- `2778d69`, `a217ee4`, `a8bcfec`, `040155a`, `83c9081`

### 3) Telegram integrations
- Added Telegram platform integration for operational messaging.
- Added channel broadcast for newly active tasks.
- Added event reminder broadcasts (meeting reminder support), then reduced polling cadence to daily.
- Updated task broadcast format to support task imagery.

Related commits:
- `97f986a`, `875261d`, `6f06dee`, `9557f3e`

### 4) Regional dashboard and X follower metrics
- Added date-range filtering for regional dashboard views.
- Added true X follower sync support in regional analytics pipeline.

Related commit:
- `6c909be`

### 5) Admin UX consolidation
- Created `Admin Only` hub and merged previous review/admin pathways.
- Simplified admin navigation by splitting old grouped sections into focused screens.

Related commits:
- `420bdf4`, `395ccaa`

### 6) Home and tab navigation updates
- Added `What's News` section on Home backed by latest X timeline post.
- Added manual admin refresh for X news when needed.
- Reordered tabs so Leaderboard sits between Tasks and Assets.
- Made `Tasks Completed` card tappable to open Tasks.
- Added X post media rendering in `What's News` when available.

Related commits:
- `9cac135`, `714b985`, `d4003bf`, `51b84ed`

### 7) Recap card and role-based access
- Redesigned user recap card UI and cleaned profile display behavior.
- Enforced role-based access:
  - Admin controls roles/regions.
  - Ambassadors limited to own region view for regional leaderboard.
  - Regional Leads can view all regional leaderboards + regional dashboard.

Related commits:
- `db40f83`, `7b28355`

### 8) Assets download/open behavior
- Patched real asset open/download behavior for better file handling.

Related commit:
- `f45dab2`

## Current Operational Notes
- Backend logs indicate memory DB fallback when DB endpoint/token are not set.
- Telegram channel broadcasting is working with correct `chat_id` format (`-100...`).

## Next Candidate Milestones
1. Add cached server-side `What's News` endpoint to reduce X API pressure further.
2. Expand regional dashboard cards and chart interactions (drill-down by date/region).
3. Add audit logging for admin role/region changes.
4. Introduce daily mini crossword feature in isolated `CrossCraft/` prototype before app integration.
