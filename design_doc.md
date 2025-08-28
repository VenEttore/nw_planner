# New World Planner - Electron App Planning Document

## 1. Application Overview

### 1.1 Purpose
A lightweight, portable calendar and task management application specifically designed for New World MMO players to track dailies, weeklies, and scheduled events across multiple characters on multiple servers and time zones. Designed for individual offline use with no external dependencies.

### 1.2 Target Users
- New World MMO players with multiple characters
- Players participating in organized company activities
- Players who want to optimize their daily/weekly progression
- Users who prefer standalone, portable applications

### 1.3 Key Requirements
- Fully offline operation (no internet required after installation)
- Portable executable (no installation required)
- Local data storage only
- Cross-platform compatibility
- Minimal resource usage

## 2. Core Features & Architecture

### 2.1 Character Management System
```
Character Entity:
- Character Name
- Server Name
- Server Time Zone
- Faction (Factionless, Marauders, Covenant, Syndicate) - defaults to Factionless
- Company (optional)
- Active Status (Active, Inactive)
- Creation Date
- Last Updated
- Custom Notes
- Character Avatar/Icon (optional)
```

### 2.2 Task Management System

#### 2.2.1 Daily Tasks
```
Daily Task Entity:
- Task Name
- Description
- Priority Level (Low, Medium, High, Critical)
- Rewards/Benefits
- Character Assignment (specific characters or all)
- Auto-reset at 5 AM server time
- Completion Status per Character
- Streak Counter
```

#### 2.2.2 Weekly Tasks
```
#### 2.2.3 One-time Tasks (NEW)
```
One-time Task Entity:
- Task Name
- Description
- Priority Level
- Rewards/Benefits
- Character Assignment (specific characters or all)
- Completion Behavior: when a character marks the task complete, the task is immediately unassigned from that character and disappears from their list
- No reset period; no streak tracking
```
Weekly Task Entity:
- Task Name
- Description
- Priority Level
- Rewards/Benefits
- Character Assignment
- Auto-reset on Tuesday at 5 AM server time
- Completion Status per Character
- Week Number Tracking
```

### 2.3 Event Management System

#### 2.3.1 Scheduled Game Events
```
Game Event Entity:
- Event Type (War, Invasion, Race, etc.)
- Server Name
- Event Time (server time)
- Participation Status (Signed Up, Confirmed, Absent, Tentative)
- Character Participating
- Event Details/Notes
- Recurring Pattern (if applicable)
- Notification Settings
```

### 2.3.X Participation Status — Customization and Unified Integration (Plan, UPDATED)

Objectives
- Allow users to define custom participation statuses (name + color + semantics) from Settings.
- Integrate the customizable list into the existing Events system without breaking existing data.
- Ensure a single, consistent CRUD/save/display pipeline across Events page, Dashboard, Calendar, and EventModal.
- Preserve stale-safety invariants introduced by the RSVP cleanup: await any in-flight RSVP save and open modals with a fresh event snapshot via `getEventById`.

Data Model & Migrations (UPDATED)
- Keep `events.participation_status` as TEXT (free-form) for resilience.
- New table `participation_statuses`:
  - id INTEGER PK AUTOINCREMENT
  - name TEXT UNIQUE NOT NULL (canonical label stored in events)
  - slug TEXT UNIQUE NOT NULL (stable key derived from name)
  - color_bg TEXT NOT NULL (chip/select field background class)
  - color_text TEXT NOT NULL (chip/select field text class)
  - sort_order INTEGER NOT NULL DEFAULT 0
  - is_absent BOOLEAN NOT NULL DEFAULT 0 (for “Hide Absent” filters)
- Migration tasks:
  - Create `participation_statuses` with indexes (slug, sort_order).
  - Seed defaults: Signed Up, Confirmed, Tentative, Absent (is_absent=1).
  - Drop legacy CHECK constraints in `events` and `event_templates` that restrict `participation_status` to a fixed set; rebuild tables preserving data.
  - Back-compat: existing events keep stored names; unknown names render neutrally until mapped.

Single Source of Truth & Access Layer (UPDATED)
- Main-process status service: CRUD, delete supports remap to replacement name across events.
- IPC: `status:getAll|create|update|delete`.
- Renderer: `api.getParticipationStatuses()` + statusRegistry (in-memory store) with invalidate() after Settings changes.
- Event row reconciliation pathway now standardized: after any RSVP change, call `api.getEventById(eventId)` and patch the list; when opening edit modals, await any pending save for that event and then fetch `getEventById` to initialize the form.

Unified UI & Save Flow (UPDATED)
- Shared `ParticipationStatusSelect` (thin): props { value, statuses, disabled, onChange(value) }.
  - Closed field recolors via `color_bg/color_text`; dropdown options are neutral.
  - Awaits `onChange` Promise; disables while saving.
- RSVP update helper (renderer): `updateEventStatus(eventId, nextName)` used by all views.
  - 1) Optimistically update local event
  - 2) `api.updateEventRsvp`
  - 3) `api.getEventById` patch to prevent stale modal opens
  - 4) When opening `EventModal`, if a save is in-flight for that event, await it before fetching `getEventById`.

Integration Points (UPDATED)
- EventModal: options from statusRegistry; modal opens with fresh `getEventById` snapshot.
- Events page & Dashboard: use shared select + helper; “Hide Absent” consults `is_absent`.
- Calendar: reads status name for display; edits via EventModal.

Settings UI
- Manage statuses with color preview, Absent flag, and reorder. Deleting prompts for replacement; service remaps events. Invalidate statusRegistry after changes.

Testing Plan (UPDATED)
- DB migrations; defaults seeded; no CHECK violations block writes.
- Settings CRUD and delete remap.
- RSVP change consistency across Events/Dashboard; persists immediately without navigation; opening the modal right after changing the dropdown reflects the updated status due to `getEventById` reconciliation and in-flight save awaiting.
- Hide Absent works with custom statuses.

#### 2.3.2 Guild/External Events
```
External Event Entity:
- Event Name
- Event Type (Raid, Meeting, VOD Review, Community Event, etc.)
- Date/Time
- Time Zone
- Character(s) Participating
- Location/Platform (Discord, In-game, etc.)
- Event Details/Description
- Recurring Pattern
- Notification Settings
- RSVP Status (per event instance)
```

### 2.4 Calendar System
```
Calendar Features:
- Multi-view support (Day, Week, Month)
- Server time zone display for each character
- Ability to set event times by server time, but display local time
- Color coding by character/event type
- Event conflict detection
- Drag-and-drop event scheduling
- Progress tracking visualization
```

## 3. Technical Architecture

### 3.1 Technology Stack
```
Frontend:
- Electron (main process)
- Svelte (renderer process)
- Tailwind CSS (styling)
- @fullcalendar/svelte (calendar component)

Backend/Data:
- SQLite (local database with better-sqlite3)
- Electron-store (app configuration)
- Node.js APIs for data management
- IPC (Inter-Process Communication) for secure renderer-main communication

Time Zone & Date Handling:
- date-fns (modern, tree-shakeable alternative to Moment.js)
- Intl.DateTimeFormat (native browser timezone support)
- Custom timezone service for New World server time calculations

Build & Packaging:
- Vite (build tool with ESM support)
- Electron-builder (packaging for portable executables)
- Cross-env (environment variable management)
- Concurrently (development workflow)
```

### 3.2 Database Schema
```sql
-- Characters table
CREATE TABLE characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    server_name TEXT NOT NULL,
    server_timezone TEXT NOT NULL,
                faction TEXT CHECK(faction IN ('Factionless', 'Marauders', 'Covenant', 'Syndicate')) DEFAULT 'Factionless',
    company TEXT,
    active_status BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    avatar_path TEXT
);

-- Task definitions
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT CHECK(type IN ('daily', 'weekly', 'one-time')) NOT NULL,
    priority TEXT CHECK(priority IN ('Low', 'Medium', 'High', 'Critical')) DEFAULT 'Medium',
    rewards TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Task assignments to characters
CREATE TABLE task_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, character_id)
);

-- Task completion tracking
CREATE TABLE task_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reset_period TEXT NOT NULL, -- '2024-01-15' for daily, '2024-W03' for weekly
    streak_count INTEGER DEFAULT 1,
    UNIQUE(task_id, character_id, reset_period)
);

-- Events table
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    event_type TEXT NOT NULL,
    server_name TEXT,
    event_time TIMESTAMP NOT NULL,
    timezone TEXT NOT NULL,
    character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
    participation_status TEXT CHECK(participation_status IN ('Signed Up', 'Confirmed', 'Absent', 'Tentative')) DEFAULT 'Signed Up',
    location TEXT,
    recurring_pattern TEXT,
    notification_enabled BOOLEAN DEFAULT 1,
    notification_minutes INTEGER DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Servers table (Added during implementation)
CREATE TABLE servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    region TEXT NOT NULL,
    timezone TEXT NOT NULL,
    active_status BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_characters_server ON characters(server_name);
CREATE INDEX idx_task_completions_character ON task_completions(character_id);
CREATE INDEX idx_task_completions_reset_period ON task_completions(reset_period);
CREATE INDEX idx_events_character ON events(character_id);
CREATE INDEX idx_events_time ON events(event_time);
CREATE INDEX idx_servers_region ON servers(region);
CREATE INDEX idx_servers_name ON servers(name);

-- Triggers for timestamp updates
CREATE TRIGGER update_character_timestamp 
    BEFORE UPDATE ON characters 
    FOR EACH ROW 
    BEGIN
        UPDATE characters SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
```

### 3.3 Time Zone Management Architecture
```javascript
// Core timezone service for server time calculations
class TimeZoneService {
    static serverTimeZones = {
        'Camelot': 'America/Los_Angeles',
        'Valhalla': 'America/New_York',
        'Hellheim': 'Europe/London',
        // Add more servers as needed
    };

    static getServerTime(serverName, localTime = new Date()) {
        const timezone = this.serverTimeZones[serverName];
        if (!timezone) throw new Error(`Unknown server: ${serverName}`);
        
        return new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).format(localTime);
    }

    static getNextResetTime(serverName, resetType) {
        const timezone = this.serverTimeZones[serverName];
        const now = new Date();
        
        if (resetType === 'daily') {
            // Next 5 AM server time
            const nextReset = new Date(now);
            nextReset.setHours(5, 0, 0, 0);
            if (nextReset <= now) {
                nextReset.setDate(nextReset.getDate() + 1);
            }
            return nextReset;
        } else if (resetType === 'weekly') {
            // Next Tuesday at 5 AM server time
            const nextReset = new Date(now);
            const daysUntilTuesday = (2 - now.getDay() + 7) % 7;
            nextReset.setDate(now.getDate() + daysUntilTuesday);
            nextReset.setHours(5, 0, 0, 0);
            if (nextReset <= now) {
                nextReset.setDate(nextReset.getDate() + 7);
            }
            return nextReset;
        }
    }
}
```

## 4. User Interface Design

### 4.1 Main Application Layout
```
Layout Structure:
├── Header Bar
│   ├── App Title/Logo
│   ├── Upcoming Events (next three)
│   ├── Local Time Display
│   └── Settings/Menu
├── Sidebar Navigation
│   ├── Dashboard
│   ├── Calendar View
│   ├── Characters
│   ├── Tasks Management
│   ├── Events
│   └── Settings
└── Main Content Area
    └── Dynamic content based on navigation
```

### 4.2 Key Views

#### 4.2.1 Dashboard
- Today's tasks for selected character(s)
- Upcoming events (next 24-48 hours)
- Reset timers (daily at 5 AM, weekly on Tuesday - calculated based on each server's time NOT local time)
- Quick completion checkboxes
- Header shows next three upcoming events
- Character-specific task summaries

#### 4.2.2 Calendar View
- Full calendar with scheduled events
- Color-coded by character/event type
- Quick event creation with server time input
- Local time display with server time tooltips
- Event conflict detection across characters

#### 4.2.3 Character Management
- Character list with server info and time zones
- Add/edit/deactivate characters
- Task assignment per character
- Character-specific statistics
- Avatar/icon management

### 4.2.6 Server Management (NEW)
- Complete server management interface
- Server CRUD operations (Create, Read, Update, Delete)
- Regional server organization (US East, US West, EU Central, AP Southeast, SA East)
- Timezone management per server
- Server active/inactive status control
- Pre-populated default New World servers

#### 4.2.4 Task Management
- Task library organized by category
- Custom task creation
- Bulk task assignment to characters
- Priority management system
- Progress tracking and streak monitoring
- Task completion history

#### 4.2.5 Event Management
- Event calendar with server time scheduling
- RSVP management (Signed Up, Confirmed, Absent, Tentative)
- Recurring event setup
- Notification configuration
- Platform/location specification (Discord, In-game)

## 5. Advanced Features

### 5.1 Time Zone Management
- Automatic server time calculation for each character
- Multiple server time zone display
- Event creation in server time with local time display
- Reset time notifications (5 AM daily, Tuesday at 5 AM weekly)
- Daylight saving time handling via native Intl.DateTimeFormat
- Time zone conversion tooltips

### 5.2 Notification System
- Desktop notifications for:
  - Daily resets (5 AM server time)
  - Weekly resets (Tuesday 5 AM server time)
  - Upcoming events (customizable lead time)
  - Task reminders
  - Streak maintenance alerts
- Customizable notification timing per character
- Sound alerts (optional)
- Notification scheduling based on server time zones

### 5.3 Data Management
- Simple JSON export/import functionality for character data
- SQLite database backup and restore
- Basic data validation and error recovery
- Export task completion history as CSV

### 5.4 Customization
- Theme support (dark/light mode)
- Custom task categories
- Editable server names and time zones
- Character color coding
- Basic layout preferences

## 6. Technical Considerations

### 6.1 Performance (Simplified for Small-Scale Use)
- Efficient SQLite queries with proper indexing
- Lightweight component rendering
- Memory usage target: < 100MB for typical use
- Fast startup time: < 2 seconds
- Responsive UI: < 300ms for common operations

### 6.2 Data Integrity
- Basic data validation for character assignments
- Automatic database backup on app close
- Simple error handling with user-friendly messages
- Input sanitization for all user inputs

### 6.3 Security (Minimal for Offline Use)
- Input validation and sanitization
- Secure file handling for avatars
- Optional local database encryption

### 6.4 Portability & Cross-Platform
- Portable executable (no installation required)
- Windows, macOS, and Linux support
- Consistent UI across platforms
- Self-contained with all dependencies bundled

### 6.5 Error Handling
- Graceful degradation for timezone calculation failures
- User-friendly error messages
- Simple retry mechanisms for database operations
- Toast notifications for user feedback
- Automatic error recovery where possible

### 6.6 Svelte-Specific Implementation
- Reactive stores for character selection and time zones
- Simple state management for task completion
- Custom components for calendar integration
- Efficient update patterns for real-time data

## 7. Build and Distribution

### 7.1 Build Configuration (UPDATED)
```json
{
  "appId": "com.newworld.planner",
  "productName": "New World Planner",
  "directories": { "output": "release" },
  "files": [
    "electron/**/*",
    "renderer/**/*",
    "assets/**/*",
    "src/services/**/*"
  ],
  "win": { "target": "portable" },
  "mac": { "target": "dir" },
  "linux": { "target": "AppImage" },
  "portable": { "artifactName": "NewWorldPlanner-${version}-portable.exe" }
}
```
Notes:
- Vite output is `renderer/` and `electron/main.js` loads from it in production. Packaging output is `release/`. Included `src/services` for dynamic imports.

### 7.2 Development Workflow
- Vite for fast development builds
- Hot module replacement for rapid iteration
- Simple npm scripts for build/package operations
- No complex CI/CD required for personal use

## 8. Deployment Strategy

### 8.1 Distribution
- Single portable executable per platform
- No installation required
- Self-contained with all dependencies
- Database created automatically on first run
- Configuration stored in user data directory

### 8.2 Updates (Optional)
- Manual update process (download new version)
- Data migration handled automatically
- Backup prompts before major updates
- Optional auto-updater for convenience

---

## 9. Implementation Updates & Changes

### 9.1 Server Management System (NEW)
**Added comprehensive server management functionality:**

```sql
-- Servers table (NEW)
CREATE TABLE servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    region TEXT NOT NULL,
    timezone TEXT NOT NULL,
    active_status BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for server management
CREATE INDEX idx_servers_region ON servers(region);
CREATE INDEX idx_servers_name ON servers(name);
```

**Server Entity Structure:**
```
Server Entity:
- Server Name (unique)
- Region (US East, US West, EU Central, AP Southeast, SA East)
- Timezone (region-specific timezones)
- Active Status (enable/disable for character selection)
- Creation Date
- Last Updated
```

**Pre-populated Default Servers:**
- **US East**: Hudsonland, Pangea, Valhalla
- **US West**: Aquarius, El Dorado
- **EU Central**: Aries, Nysa
- **AP Southeast**: Cerberus, Delos
- **SA East**: Alkaid, Devaloka

### 9.2 UI/UX Polish & Accessibility Improvements (NEW)
**Comprehensive interface refinements and accessibility enhancements:**

**Sidebar Optimization:**
- Fixed icon scaling issues with collapsed sidebar
- Adjusted collapsed width from 64px to 72px (`w-18`) for optimal icon proportions
- Conditional padding: `p-2` when collapsed, `p-3` when expanded
- Updated icon designs for better clarity:
  - Characters: Changed to single person/account icon
  - Events: Changed to clock icon for better timing representation

**Modal Accessibility Compliance:**
```html
<!-- Enhanced modal structure with proper ARIA roles -->
<div role="dialog" aria-modal="true" on:click={close} on:keydown={handleKeydown}>
  <div role="document" on:click|stopPropagation on:keydown|stopPropagation>
    <!-- Modal content -->
  </div>
</div>
```

**Settings Form Accessibility:**
- Converted standalone `<label>` elements to `<span>` elements
- Proper form control associations for screen readers
- Resolved 6 "form label must be associated with a control" warnings

**Database Status Enhancement:**
```javascript
// Added explicit database initialization logging
console.log('Database initialization status:', 
  dbReady ? 'SUCCESS ✅' : 'FAILED ❌');
```

**Code Quality Improvements:**
- Removed unused CSS selectors (`.faction-*` classes)
- Resolved 10+ build warnings and accessibility issues
- Clean build output with minimal warnings
- Enhanced keyboard navigation support
- **SA East**: Alkaid, Devaloka

### 9.2 Technical Fixes & Improvements
**Database Layer Improvements:**
- Fixed prepared statement async/await issues
- Fixed SQLite boolean binding (converted to integers)
- Added proper error handling for database operations
- Improved database initialization and service lifecycle

**Electron Integration Fixes:**
- Fixed Electron mode detection in API service
- Resolved preload script ES6 import issues (converted to CommonJS)
- Fixed NODE_ENV handling for development vs production modes
- Improved IPC communication reliability

**UI/UX Improvements:**
- Fixed modal text input interactions
- Added proper modal backdrop handling
- Improved error messaging and user feedback
- Enhanced form validation and user experience

### 9.3 Component Architecture Updates
**New Components Added:**
- `ServerModal.svelte` - Complete server management interface
- Enhanced `Settings.svelte` - Added server management section
- Improved modal handling across all components

**Service Layer Enhancements:**
- `serverService.js` - Complete server CRUD operations
- Enhanced `api.js` - Improved Electron/web mode detection
- Fixed database services - Proper async/await handling

---

### 9.4 Task System Rework (UPDATED)
The Task system must deliver per-character, server-time-aware daily/weekly workflows. This section updates the design and test plan to ensure the implementation fully achieves that purpose.

#### 9.4.1 Objectives
- Per-character visibility via explicit assignment (with bulk helpers)
- Accurate completion tracking by reset period using each character’s server timezone
- Fast CRUD with priorities; scalable list UX
- Clear reset behavior and streak semantics

#### 9.4.2 Data Model (compatible with current schema)
- Keep existing tables: `tasks`, `task_assignments`, `task_completions`
- Optional non-breaking columns (future):
  - `tasks.is_default BOOLEAN DEFAULT 0`
  - `tasks.archived BOOLEAN DEFAULT 0`
- Optional index: `CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);`

#### 9.4.3 Business Rules
- Only assigned tasks are shown for a character in Dashboard/Calendar
- Completion requires an assignment and records into the active reset period
- Reset periods are computed per character from their server IANA timezone:
  - Daily: boundary at 05:00 server time; token `YYYY-MM-DD`
  - Weekly: boundary Tuesday 05:00 server time; token `YYYY-Www`
- DST handled by Intl; no hardcoded offsets
- Streak increments when a new period is completed; removing a completion only affects that period
 
Additional rules for One-time tasks:
- One-time tasks do not participate in reset periods or streaks
- When a character marks a one-time task complete, the assignment is deleted for that character (task disappears)
- Marking incomplete is a no-op for one-time tasks (there is no completion record to revert)
 - Manual reset controls are available on the Tasks page (Daily/Weekly) to clear current-period completions

#### 9.4.4 API Contracts (Renderer → IPC → Service)
Task CRUD
```
createTask({ name, description?, type: 'daily'|'weekly'|'one-time', priority: 'Low'|'Medium'|'High'|'Critical', rewards? })
getTasks(); getTasksByType(type); getTaskById(id);
updateTask(id, partialTask); deleteTask(id);
```
Assignment
```
assignTaskToCharacter(taskId, characterId);
removeTaskAssignment(taskId, characterId);
getCharacterTasks(characterId); // defs only
getCharacterTasksWithStatus(characterId); // defs + {completed, resetPeriod}
// Bulk helpers (add)
assignTaskToCharacters(taskId, characterIds[]);
assignTasksToCharacter(taskIds[], characterId);
```
Completion
```
markTaskComplete(taskId, characterId, resetPeriod?);
markTaskIncomplete(taskId, characterId, resetPeriod?);
isTaskComplete(taskId, characterId, resetPeriod?);
getTaskCompletions(resetPeriod?);
getCharacterCompletions(characterId, resetPeriod?);
```
Statistics and Defaults
```
getTaskStats(); getCompletionStats(resetPeriod?);
initializeDefaultTasks(); // idempotent
```

#### 9.4.5 UI/UX Plan
- Tasks View
  - Tabs: All | Daily | Weekly | One-time; search + priority filters
  - Actions: Create, Edit, Delete, Import Defaults
  - Assignment manager: pick characters to assign/unassign; bulk helpers
  - Priority chips; compact list for scale
  - Two-row layout:
    - Row 1 (horizontal scroll): character cards showing assigned Daily then Weekly tasks with quick-complete checkboxes. Mouse wheel scroll converts to horizontal scroll for usability.
    - Row 2 (vertical scroll): master Task Library as compact rows with small type/priority chips and Edit/Delete actions.
  - One-time tasks appear in Row 1 under a separate section when assigned; checking them immediately unassigns and removes them from that character
  - Header quick actions: “Reset Daily” and “Reset Weekly”
- Dashboard
  - “Today’s Tasks” from selected character(s) with checkboxes
  - Priority labels; completed styling
 
- Notifications (optional)
  - Daily/weekly reset notifications per character; future task reminders

#### 9.4.6 Reset Period Algorithm (reference)
```
getCurrentResetPeriod(type, serverTimezone, now):
  nowServer = convert(now, serverTimezone)
  if type == 'daily':
    boundary = setTime(nowServer, 05:00)
    effective = nowServer if nowServer >= boundary else nowServer - 1 day
    return format(effective, 'YYYY-MM-DD')
  if type == 'weekly':
    boundary = nextOrCurrentTuesdayAt05(nowServer)
    effective = nowServer if nowServer >= boundary else nowServer - 7 days
    return formatISOWeek(effective) // 'YYYY-Www'
```

#### 9.4.7 Import/Export
- Export/import includes tasks, assignments, completions
- CSV export for `task_completions` with character, task, reset_period, completed_at, streak_count

#### 9.4.8 Performance & Reliability
- Prepared statements for CRUD/assignment/completion
- Index coverage for frequent queries; add as needed
- Virtualized lists when task count grows (future)

#### 9.4.9 Modal Input Reliability (Fix)
- Ensure all modal textareas are non-self-closing; invalid self-closing tags can prevent typing focus in some contexts.
- Add `on:keydown` on the backdrop and `on:keydown|stopPropagation` on the dialog container to prevent escape-key and focus issues.
- Focus the first input on open to guarantee typing works in create/edit flows.

#### 9.4.10 Default Task Set (UPDATED)
Seeded default tasks reflect a streamlined checklist commonly used by players (categories and counters omitted):
```
Weekly:
- Mutated Dungeons
- Hive of Gorgons
- Trial of the Devourer (Sandworm)
- FFA Goldcursed Coconut

Daily:
- Faction Bonus Missions
- Gypsum From Faction Vendor
```
These defaults are inserted idempotently on startup or via "Import Defaults" if missing.


### 9.5 Timezone & Reset Behaviour (UPDATED)
Daily/weekly resets must follow each character’s server timezone (05:00 daily; Tuesday 05:00 weekly). Countdown timers and period tokens must be derived from server time, not local time.

#### 9.5.1 Principles
- Compute server-local reset instants, then convert to an absolute instant (UTC) before doing any subtraction.
- A single source of truth for server → IANA timezone and reset boundary logic; avoid duplicating logic across services.
- Format period tokens (daily `YYYY-MM-DD`, weekly `YYYY-Www`) from server-local time only.

#### 9.5.2 Shared helpers (to live in timezone service)
- `getServerNowParts(serverName)` → extract server-local components via `Intl.DateTimeFormat(..., { timeZone })` + `formatToParts`.
- `getNextResetUTC(serverName, type)` → compute the next daily (05:00) or weekly (Tuesday 05:00) in server-local components, then materialize as a UTC `Date` representing that instant.
- `getServerPeriodToken(serverName, type)` → produce the current daily/weekly token from server-local time.

#### 9.5.3 Service responsibilities
- Reset timers (dashboard): use `getNextResetUTC` and compute `deltaMs = nextResetUTC.getTime() - Date.now()`; never mix server-local `Date` and local `Date` in subtraction.
- Task service (periods): reuse the same boundary logic to compute period tokens per character’s server timezone; keep token generation server-local.
- Keep a single timezone map; do not copy in multiple files.

#### 9.5.4 Do/Don’t
- Do: normalize both instants to UTC before subtracting.
- Do: derive server-local components via `formatToParts` to avoid locale string ambiguity.
- Don’t: construct `new Date('YYYY-MM-DDTHH:mm:ss')` without timezone and treat it as server time (parses as local time).
- Don’t: subtract a server-local `Date` from local `new Date()` directly.

#### 9.5.5 Risks & Mitigations
- Timezone math is error-prone without Temporal; stick to `Intl` + careful normalization. Consider adopting a lightweight library (e.g., `luxon`) if complexity grows.

### 9.6 Timezone & Reset Calculations — Updated Plan (Timezone-First)

Problem statement
- Current countdowns derive timezone from a hardcoded server-name→timezone map. Any DB server not in that map is treated as unknown, which yields blank/incorrect rows in diagnostics and UI.
- The wall-clock→UTC conversion currently builds a local Date and attempts to infer timezone offset via `toLocaleString`, which produces wrong instants when the local machine timezone differs from the server timezone and is error-prone around DST.

Design goals
- Time math must be done relative to an authoritative IANA timezone from the database (e.g., `America/New_York`).
- Countdown to resets must be DST-safe and consistent across OS timezones.
- Eliminate reliance on server-name heuristics for time computations.

Key decisions
- Make timezone the source of truth everywhere (servers carry `servers.timezone`; characters carry `characters.server_timezone`).
- Use `date-fns-tz` for robust conversions:
  - `utcToZonedTime(nowUtc, tz)` → server-local wall time
  - `zonedTimeToUtc(serverLocalDate, tz)` → correct UTC instant for 05:00 server time and for Tue 05:00 server time

API and service changes
- Add timezone-centric helpers in `src/services/timezone.js`:
  - `getServerTimeDisplayByTimezone(tz)` → returns `{ time, date, timezone }` for the server-local now
  - `getNextResetUTCByTimezone(tz, 'daily'|'weekly')` → returns the exact UTC instant for the next reset
  - `getTimeUntilResetByTimezone(tz, type)` → returns `{ hours, minutes, seconds, totalMs, formatted }`
- Refactor `src/services/resetTimerService.js` to accept server objects:
  - `startResetTimerForServer({ name, timezone }, callback)`
  - `getMultiServerResetInfo(servers)` where each item has `{ name, timezone }`
  - Name-based wrappers remain for legacy but internally resolve to timezone once.
- Extend `src/services/api.js`:
  - `getResetTimers(serversOrNames)` accepts either servers with `name/timezone` or, if names are given, resolves them via DB and then computes.
  - `startResetTimerForServer(server, callback)` for live updates in the dashboard.

UI updates
- Dashboard uses server objects (name+timezone) to compute initial timers and start live timers. No name→timezone lookup on the client anymore.
- A temporary Settings preview was used to validate calculations and has been removed after verification.
- Quick War schedules one hour from now.

Custom Dialogs (NEW)
- Replaced native `alert/confirm` with an in-app dialog component to avoid Electron focus issues.
- All warnings/confirmations now use in-app dialogs.

Modal Backdrop Interaction (NEW)
- Backdrop close requires mousedown and click on the backdrop element, preventing accidental closes when drag-selecting text that ends outside the input.

Correctness notes
- Daily reset is computed as the next 05:00 in the server’s local day using `zonedTimeToUtc` (roll forward one day if already past).
- Weekly reset is computed as the next Tuesday 05:00 in the server’s local calendar; if it’s already past that instant, add 7 days.
- All countdowns subtract `nowUtc` from the computed UTC instant — no mixing of wall time and UTC, so results are stable regardless of the user’s OS timezone.

Migration & compatibility
- Keep the legacy name map for display/testing only. All countdown logic uses DB timezones.
- Where inputs are still arrays of names, resolve them to `{ name, timezone }` via `servers` in the DB before computing.
- Removed the temporary Settings debug section post-validation.

Testing checklist
- For a set of servers covering NA/EU/APAC with mixed DST status:
  - Verify “server time” matches official local time for each server’s timezone.
  - On different local OS timezones, verify countdown numbers are identical (UTC subtraction only).
  - Around DST transitions, confirm daily and weekly next-reset UTC instants remain correct and advance monotonically.
  - On Thursday (local), validate weekly ≈ daily + 96h for most servers; differences allowed where server-local date differs.
  - Verify Tasks completion periods (daily/weekly) align with countdown reset boundaries for each character’s `server_timezone`.

### 9.7 Event Templates/Presets — Plan

Goals
- Speed up creation of frequently used events by letting users save reusable templates/presets.
- Replace “Quick War” with a general “New from Template” flow.
- Keep templates independent of characters; server time resolution happens at event creation time from the chosen character.

Scope and UX
- Templates live under Events: a compact "Templates" panel with Create, Edit, Delete.
- Creating an event:
  - From Events list or Calendar: buttons "Create Event" and a split-button/menu "New from Template".
  - From Dashboard upcoming events card: optional quick entry to "New from Template".
- EventModal:
  - "Apply Template" select at the top. Choosing a template sets relevant fields immediately (name, description, type, participation, location, notification settings). If the template defines a timing strategy, a local event time is computed.
  - The Local/Server segmented control is owned by EventModal; templates do not carry a preferred mode.
- Replace Quick War:
  - Remove single-purpose "Quick War". Seed a default "War" template with sensible defaults. Users can duplicate/modify to suit their company.

Data Model
- New table: `event_templates`
  - `id INTEGER PRIMARY KEY AUTOINCREMENT`
  - `name TEXT NOT NULL UNIQUE` (template label)
  - `event_type TEXT NOT NULL`
  - `description TEXT`
  - `location TEXT`
  - `participation_status TEXT CHECK(participation_status IN ('Signed Up','Confirmed','Absent','Tentative')) DEFAULT 'Signed Up'`
  - `notification_enabled BOOLEAN DEFAULT 1`
  - `notification_minutes INTEGER DEFAULT 30`
  - `time_strategy TEXT CHECK(time_strategy IN ('relative','fixed')) DEFAULT NULL`
  - `time_params TEXT` -- JSON blob; relative: `{ unit: 'hour'|'day'|'week' }`; fixed: `{ when: 'today'|'tomorrow'|'weekday', weekday?:0-6, timeOfDay:'HH:mm' }`
  - `payload_json TEXT`
  - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  - `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
- No server/character linkage at the template level; those are decided when instantiating the event.

Renderer → IPC → Service Contracts
- Renderer (api.js):
  - `getEventTemplates()` → Template[]
  - `createEventTemplate(template)`
  - `updateEventTemplate(id, partial)`
  - `deleteEventTemplate(id)`
- IPC channels:
  - `template:getAll`, `template:create`, `template:update`, `template:delete`
- Service (eventTemplateService.js):
  - Prepared statements for CRUD; validation of enums and ranges.
  - Seed default templates on first run if table empty: e.g., "War", "Company Meeting", "PvE Run".

Event Creation Flow with Templates
- When a template is chosen in `EventModal`:
  - Set `formData` fields: `name`, `description`, `event_type`, `location`, `participation_status`, `notification_enabled`, `notification_minutes`.
  - Templates no longer set a preferred time mode.
  - If `time_strategy` is present and the timezone source is resolvable (template server tz or selected character’s tz or local), compute `event_time` per strategy; otherwise leave empty and show helper.
  - Strategies:
    - `relativeOffset`: now + `offsetMinutes` (timezone-independent instant)
    - `nextDayAtTime`: tomorrow at `timeOfDay` in tzSource → UTC
    - `nextWeekdayAtTime`: next `weekday` at `timeOfDay` in tzSource → UTC
    - `fixedDateTime`: interpret `isoDateTime` as wall time in tzSource → UTC
-- Submission converts per current `timeMode`:
  - Local → `new Date(...).toISOString()`
  - Server → `zonedTimeToUtc(..., resolvedServerTimezone).toISOString()`

UI Changes
- Events page: add Templates panel (list + actions) and "New from Template" split-button.
- EventModal: add "Apply Template" select. When clicked/changed, populate fields as described above.
  - Show a small computed summary (e.g., "Next Tue 20:00 America/Los_Angeles → 2025-03-12T04:00Z"); recompute when character or time mode changes.

Dedicated Templates Manager UI (CRUD)
- Placement and entry points
  - Primary: Events view → Action bar → "Manage Templates" opens a dedicated manager (modal sized max-w-3xl or an inline panel below filters on desktop).
  - Secondary: Empty state CTA when no templates exist ("Create your first template").
- Layout (Manager modal/panel)
  - Header: Title + "New Template" button + search input (debounced) + sort (Name | Updated).
  - List: compact table with columns
    - Name
    - Type
    - Strategy
    - Updated
    - Actions (Apply → opens Event create with this template; Edit; Duplicate; Delete)
  - Footer: pagination when >50 templates (simple next/prev) or virtualized scroll.
- Interactions
  - Create: opens `TemplateModal` (reused) in create mode; validation only for template name; everything else optional.
  - Edit: row action; opens `TemplateModal` with current values; save updates list in-place.
  - Duplicate: copies template with suffix " (copy)"; focuses name field in modal.
  - Delete: confirms via custom dialog; deletes and refreshes list.
  - Apply: from row action, immediately opens EventModal in create mode and pre-selects this template (EventModal shows applied badge + summary).
  - Bulk delete (optional, later): multi-select checkboxes with "Delete selected".
- A11y & keyboard
  - Table rows focusable; Enter opens Edit; Shift+Enter opens Apply.
  - All buttons are <button> elements with labels; no click-only <div>s.
  - Manager modal has role="dialog" and ESC to close; focus trapped within.
- Empty states
  - No templates: illustrated message, "New Template" primary CTA, and a secondary "Seed Defaults" (inserts War/PvE/Meeting examples).
- Persistence & state
  - Search/sort persisted in localStorage under `nw_templates_ui` (planned).
  - After Save/Delete, list refreshes and preserves filters/sort.

Integration with Events Page
- Action bar
  - Keep "Add New Event".
  - "New from Template" split-button or select that lists templates by name (respects search state if the manager is open).
  - "Manage Templates" opens the manager described above.
- EventModal behavior
  - Applying a template re-fills fields; if it contains a timing strategy, a local wall time is computed (server-tz computation planned). Manual edits are respected.
- Calendar
  - Optional later: right-click date cell → "New from Template" → list; selecting opens EventModal with that template applied.

Error Handling & Messages
- Name uniqueness: friendly error in `TemplateModal` if duplicate name.
- Time compute: strategies compute local wall time; conversion to UTC on submit per EventModal mode.
- Deletion guard: deleting a template doesn’t affect existing events.

Testing Additions (Section 10)
- Templates Manager (new tests)
  - Create/Edit/Delete/Duplicate; unique-name validation; list updates and preserves filters.
  - Apply from row opens EventModal with fields populated and time summary computed.
  - Empty state seeding creates defaults; they appear in both manager and "New from Template".
- EventModal with active template
  - Shows applied template badge; re-apply updates fields; Clear removes linkage and stops recompute.
- Calendar: add context menu "New from Template" on date cell (optional, later).
- Remove "Quick War" button/action; point to Templates.

Migrations
- Add `event_templates` table and indexes; idempotent creation.
- Seed default templates if none exist or when specifically requested via a "Seed Defaults" button in Templates panel.

Edge Cases & Rules
- Template names must be unique (show friendly error on duplicate).
- Editing a template must not retroactively change existing events (templates are only used at creation time).
- Deleting a template does not affect existing events.
 

Testing Plan
- CRUD: create, update, delete templates; validation of unique name, enum values.
- Apply: selecting a template populates fields; switching templates updates fields; manual edits after apply persist for this event only.
- Time mode: applying a template toggles the segmented control; submit stores UTC correctly for both modes.
- Replacement: "Quick War" removed; seeded "War" template available; creating from this template yields expected defaults and correct time handling.
- Persistence: templates persist across app restarts; events created from templates are indistinguishable from manually created ones.

### 9.8 Events — Modal and UX updates

Recent fixes
- Form initialization: add an open-cycle guard keyed by `editingEvent?.id` or `__create__` to prevent reactive re-inits while the modal is open. Guard is cleared on close, cancel, delete, and after successful submit.
- Focus handling: focus the name field on open to guarantee keyboard navigation works on subsequent opens.
- Validation: require presence of fields; allow editing past events (no “must be future” constraint) to avoid blocking edits.
- Submission path: rely solely on the form’s `on:submit|preventDefault` handler; remove button click handler to prevent double submits. Add a `submitting` reentrancy flag and disable the button while submitting to avoid duplicates.

Implemented UX changes
- Events list is now split into two sections: “Upcoming Events” and “Past Events”.
  - Classification is automatic based on `event_time` versus the current time; updates in-place every 30s so items naturally move between sections.
  - Past events render compact and slightly dimmed; retain Edit/Delete actions.
- Event rows were compacted: smaller typography, tighter spacing, divider list, and condensed metadata row.

Testing checklist (Events)
- Verify Create and Edit flows can be used repeatedly without losing input focus or disabling inputs on the second open.
- Confirm editing a past-dated event saves successfully.
- Confirm no duplicate events are created on a single submit (button disabled while submitting, only one dispatch path).
- Verify Upcoming/Past classification updates within ~30s without reload.
- Confirm Past Events appear dimmed and use compact layout, with working Edit/Delete actions.

### 9.9 Calendar — Filtering and layout polish

Changes
- Replaced chip-row character filter with a scalable control:
  - Search box + All/None toggle stacked above a horizontally scrollable row of clickable character chips.
  - Chips support keyboard interaction (Enter/Space) and show pointer cursor.
  - The selector is width-limited (`md:max-w-md`) to reduce horizontal footprint.
- Removed duplicate navigation controls; rely on FullCalendar toolbar only.
- Moved legend below the calendar to prioritize the content area.
- Stabilized modal open/close from Calendar by deferring state clear with `queueMicrotask` to avoid focus loss.

Testing checklist (Calendar)
- With many characters, verify search filters chips and chip selection updates the events rendered.
- All/None toggle selects/deselects and persists via store while navigating.
- Keyboard interaction on chips (Enter/Space) toggles selection; chips show pointer cursor.
- Legend renders below the calendar; no duplicated navigation controls.
- Opening/closing the Event modal from Calendar repeatedly preserves focus and input interactivity; edited events save.

### 9.10 Dashboard — Information density & layout

Changes
- Removed the non-functional “Active Characters” section.
- Two-column layout: Left column stacks “Upcoming Events” above “Tasks”; right column shows “Reset Timers”.
- Tasks section:
  - Added character selector to switch which character’s tasks are displayed.
  - Shows all tasks (daily and weekly) for the selected character.
  - Completion toggles update only the selected character.
- Reduced footprint across all cards: smaller headings, tighter spacing, smaller controls.

Testing checklist (Dashboard)
- Upcoming Events appears above Tasks and mirrors the events page list content.
- Character selector switches task lists quickly and completion toggles persist per character.
- Reset Timers remain visible and responsive in the right column.

### 9.11 Tasks — Weekly reset behavior

Changes
- Weekly period token generation switched to ISO week calculation to align with Tuesday 05:00 boundaries.
- Tasks view listens to per-server reset timers; when the weekly countdown crosses 0, character task lists for that server auto-refresh.

Testing checklist (Tasks)
- Verify weekly reset tokens match server-local Tuesday 05:00 periods across timezones/DST.
- When the weekly reset occurs, assigned weekly tasks for affected characters re-render as incomplete without manual refresh.

## 10. Comprehensive Testing Protocol

### 10.1 Pre-Test Setup
**Environment Preparation:**
1. Build application: `npm run build-electron`
2. Run application: `npm run electron`
3. Verify application loads without errors
4. Open Developer Tools (F12) to monitor console for errors
5. Confirm database initialization message appears

### 10.2 Navigation & Layout Testing

**Test 1: Application Launch & Initial State**
- [x] Application window opens at correct size (1200x800)
- [x] Header displays "New World Planner" title and Upcoming Events section
- [x] Sidebar navigation is visible with all menu items
- [x] Dashboard is selected by default
- [x] No console errors on startup
- [x] Database initialization completes successfully (look for "Database initialization status: SUCCESS ✅" in console)

**Test 2: Navigation Testing**
- [x] Click "Dashboard" - loads dashboard view
- [x] Click "Calendar" - loads calendar view
- [x] Click "Characters" - loads character management view
- [x] Click "Tasks" - loads task management view
- [x] Click "Events" - loads event management view
- [x] Click "Settings" - loads settings view
- [x] Navigation highlights active section
- [x] Each view loads without errors

### 10.3 Server Management Testing (NEW)

**Test 3: Server Management - View & Navigation**
- [x] Navigate to Settings page
- [x] Locate "Server Management" section
- [x] Verify default servers are populated
- [x] Verify servers are sorted by region
- [x] Check server count displays correctly
- [x] Verify "Add Server" button is present

**Test 4: Server Creation**
- [x] Click "Add Server" button
- [x] Verify ServerModal opens with empty form
- [x] Test server name input field (type text)
- [x] Test region dropdown (select each region)
- [x] Verify timezone auto-populates based on region
- [x] Test timezone dropdown (select different timezones)
- [x] Test active status checkbox
- [x] Click "Create Server" with valid data
- [x] Verify server appears in server list
- [x] Verify success feedback/notification

**Test 5: Server Editing**
- [x] Click edit button (✏️) on an existing server
- [x] Verify ServerModal opens with populated data
- [x] Modify server name
- [x] Change region (verify timezone updates)
- [x] Change timezone manually
- [x] Toggle active status
- [x] Click "Update Server"
- [x] Verify changes are saved and reflected in list
- [x] Verify success feedback

**Test 6: Server Deletion**
- [x] Click delete button (🗑️) on a server
- [x] Verify delete confirmation dialog appears
- [x] Click "Cancel" - verify server is NOT deleted
- [x] Click delete button again
- [x] Click "Confirm Delete" - verify server is removed
- [x] Verify success feedback
- [x] Verify server count updates

**Test 7: Server Status Management**
- [x] Click active/inactive toggle on multiple servers
- [x] Verify status changes immediately
- [x] Verify inactive servers are visually distinguished
- [ ] Test bulk status changes on multiple servers

**Test 7.1: Retrieve Latest Servers (Spinner and Append)**
- [x] Click "Retrieve Server List"; spinner shows during fetch and hides on completion.
- [x] New servers append without duplicates; counts update.
- [x] Network error handled with in-app dialog.

**Test 7.2: Clear Unused Servers**
- [x] Run "Clear Unused"; servers without character/event references are removed.
- [x] Referenced servers remain.

### 10.4 Character Management Testing

**Test 8: Character Creation**
- [x] Navigate to Characters page
- [x] Click "Add Character" button
- [x] Test character name input field
- [x] Test server selection dropdown (shows active servers only)
- [x] Test faction selection (Factionless, Marauders, Covenant, Syndicate)
- [x] Test company name input (optional)
- [x] Test notes input (optional)
- [x] Test active status checkbox
- [x] Click "Create Character" with valid data
- [x] Verify character appears in character list
- [x] Verify character shows server timezone correctly

**Test 9: Character Editing**
- [x] Click edit button on existing character
- [x] Modify character name
- [x] Change server selection
- [x] Change faction
- [x] Update company name
- [x] Update notes
- [x] Toggle active status
- [x] Click "Update Character"
- [x] Verify changes are saved and displayed

**Test 10: Character Deletion**
- [x] Click delete button on character
- [x] Verify confirmation dialog
- [x] Test "Cancel" - character not deleted
- [x] Click delete again and confirm
- [x] Verify character is removed
- [x] Verify character no longer appears in character filters (Calendar)

**Test 11: Character Status Management**
- [x] Toggle active/inactive status on multiple characters
- [x] Verify status changes immediately
- [x] Verify inactive characters are visually marked

### 10.5 Task Management Testing

**Test 12: Task View & Navigation**
- [x] Navigate to Tasks page
- [x] Verify default tasks are loaded or importable via "Import Defaults"
- [x] Switch tabs/filters to view Daily vs Weekly vs One-time tasks
- [x] Verify priority chips render correctly (Low/Medium/High/Critical)
- [x] Verify assignment UI allows selecting characters (per task)
 - [x] Verify Row 1 horizontal scroll works with mouse wheel (vertical wheel scroll translates to horizontal)
 - [x] Verify Row 2 renders compact rows with type/priority chips and Edit/Delete actions

**Test 13: Task Completion**
- [x] Click completion checkbox on a daily task in Dashboard
- [x] Verify task is marked as completed (strike-through, chip updates)
- [x] Repeat for a weekly task
- [x] Assign a one-time task to a character; check the box and verify it disappears immediately from that character (unassigned)
- [ ] Verify completion persists on refresh (same reset period)
- [x] Uncheck to mark incomplete, verify persistence
 - [x] Manual reset buttons: verify Daily clears current-day completions and Weekly clears current-week completions across all characters (assignments stay)

**Test 14: Multi-Character Task Testing**
- [x] Verify only tasks assigned to each character appear where appropriate
- [x] Complete the same task on two different characters
- [x] Verify each character’s completion state is independent
- [ ] Verify reset period differences across servers with different timezones
 - [x] Verify one-time task completion unassigns only for the character who completed it; other characters retain their assignment

**Test 14.1: Assignment Management**
- [x] Assign a task to a character via Tasks view assignment UI
- [x] Verify it appears on Dashboard for that character
- [x] Remove assignment; verify it disappears from that character’s list
- - [x] Create a new task; confirm typing works in text inputs and textareas
- - [x] Edit an existing task; confirm typing works in text inputs and textareas
- - [x] Confirm Delete in library row removes the task and updates character cards

**Test 14.2: Dashboard Tasks Card Persistence**
- [x] Change view mode (By Character/By Type), type filter, selected character, and Show Completed.
- [x] Navigate away and back; verify selections persist.
- [x] Reload the app; verify persistence remains.
- [x] If the previously selected character was removed, fallback to first available without error.

### 10.6 Event Management Testing

**Test 15: Event Creation**
- [x] Navigate to Events page
- [x] Click "Create Event" button
- [x] Test event name input
- [x] Test event type selection (War, Invasion, Company Event)
- [x] Test date/time selection
- [x] Test character selection
- [x] Test description input
- [x] Test RSVP status selection
- [x] Create event and verify it appears in list

**Test 15.1: Event Time Mode (Local vs Server)**
- [x] Toggle Local vs Server segmented control; helper text updates accordingly.
- [x] In Server mode, selecting a character updates helper to that character's server timezone; switching character updates timezone.
- [x] Submit with Local mode and verify stored UTC corresponds to chosen local wall time.
- [x] Submit with Server mode and verify stored UTC corresponds to chosen server wall time using the selected character's timezone.
- [x] Re-open for edit: fields default to Local presentation; saving preserves correct UTC.

**Test 15.2: Apply Template in EventModal**
- [x] Choose a template; verify fields populate (name, type, location, participation, notifications, preferred time mode) with time left empty.
- [x] Preferred time mode sets the segmented control; conversion on submit is correct for the chosen mode.

**Test 16: Event Editing**
- [x] Click edit button on existing event
- [x] Modify event details
- [x] Change date/time
- [x] Change participating character
- [x] Update RSVP status
- [x] Save changes and verify updates
 - [x] Dashboard: click upcoming event to open edit modal; RSVP edits persist; dropdown styling remains stable

**Test 17: Event Deletion**
- [x] Click delete button on event
- [x] Verify confirmation dialog
- [x] Test deletion cancellation
- [x] Confirm deletion and verify event is removed
 - [x] Deletion uses custom confirm dialog (no native alerts)

### 10.7 Calendar Integration Testing

**Test 18: Calendar View**
- [x] Navigate to Calendar page
- [x] Verify calendar loads with current month
- [x] Test month navigation (previous/next)
- [x] Test view switching (month/week/day)
- [x] Verify events appear on calendar
- [x] Check event colors correspond to types

**Test 19: Calendar Event Creation**
- [x] Click on empty calendar date
- [x] Verify event creation modal opens
- [x] Fill event details
- [x] Save event
- [x] Verify event appears on calendar

**Test 20: Calendar Event Interaction**
- [x] Click on existing event on calendar
- [x] Verify event details modal opens
- [x] Edit event details
- [x] Save changes
- [x] Verify changes reflect on calendar

**Test 21: Calendar Drag & Drop**
- [x] Drag event to different date
- [x] Verify event time updates
- [x] Drag event to different time slot
- [x] Verify time change persists

**Test 20.1: New from Template via Calendar**
- [x] From a date cell, select "New from Template" and pick a template.
- [x] EventModal opens prefilled per template; user selects date/time and submits.
- [x] Verify preferred time mode sets segmented control and stored UTC is correct.

### 10.8 Time & Reset Timer Testing

**Test 22: Server Time Display**
- [x] Navigate to Dashboard
- [x] Verify server time updates for different timezones

**Test 23: Reset Timer Testing**
- [x] Navigate to Dashboard
- [x] Verify daily reset timer displays
- [x] Verify weekly reset timer displays
- [x] Check countdown format (HH:MM:SS)
- [x] Verify timers update in real-time

**Test 24: Reset Behavior**
- [x] Wait for or simulate daily reset time (5 AM server time)
- [x] Verify completed tasks reset to incomplete only for the new daily period
- [ ] Check weekly reset behavior (Tuesday 5 AM server time)
- [ ] Verify reset timers recalculate correctly per server timezone
- [ ] Confirm streak increments only when a new period shows completion

### 10.11 Error Handling & Edge Cases (UPDATED)

### 10.9 Settings & Preferences Testing

**Test 25: Settings Navigation**
- [x] Navigate to Settings page
- [x] Verify all settings sections are present
- [x] Check Server Management section
- [x] Check Application Settings section
- [x] Check Notifications section

**Test 26: Theme Testing**
- [x] Toggle Dark Mode on/off
- [x] Verify theme changes apply immediately
- [x] Check theme persistence on restart
- [x] Verify all components respect theme

**Test 27: Notification Settings**
- [ ] Toggle desktop notifications
- [ ] Toggle sound alerts
- [ ] Toggle daily reset notifications
- [ ] Toggle weekly reset notifications
- [ ] Toggle event notifications
- [ ] Verify settings persist

### 10.10 Header Upcoming Events (NEW)

**Test 28: Upcoming Events in Header**
- [x] Header shows up to three upcoming events ordered by soonest
- [x] Each event displays name, type, optional server, and local date/time
- [x] When creating/updating/deleting an event, header refreshes within a minute or on window focus
- [x] When there are no upcoming events, header shows a friendly empty state
 - [x] Only events within the next 20 hours appear in the header list

**Test 29: Form Validation**
- [x] Try creating character with empty name
- [x] Try creating server with duplicate name
- [x] Try creating event with invalid date
- [x] Verify proper error messages display
- [x] Test field validation on all forms

**Test 30: Data Consistency**
- [x] Delete server with associated characters
- [x] Verify proper dependency handling
- [x] Delete character with associated events
- [x] Check data integrity maintenance

**Test 31: Performance & Stability**
**Test 32: Modal Interaction Stability**
- [x] Drag-select inside inputs; release outside: modal remains open (backdrop requires mousedown+click)
- [x] ESC closes modal; backdrop click closes when intended
- [x] In-app dialogs don’t steal focus
- [ ] Create multiple characters (10+)
- [ ] Create multiple events (50+)
- [ ] Test application responsiveness
- [ ] Monitor memory usage
- [ ] Test with large datasets

### 10.12 Cross-Platform Testing

**Test 32: Build & Distribution**
- [ ] Test `npm run build-electron` completes successfully
- [ ] Test `npm run electron` launches application
- [ ] Verify portable executable creation
- [ ] Test application startup time (<2 seconds)
- [ ] Verify all features work in production build
- [ ] Confirm clean build output with minimal warnings (accessibility warnings resolved)

**Test 33: Database Persistence**
- [x] Create test data (characters, servers, events)
- [x] Close application
- [x] Restart application
- [x] Verify all data persists correctly
- [x] Test database initialization on first run

### 10.13 Integration Testing

**Test 34: End-to-End Character Workflow**
- [ ] Create new server
- [ ] Create character on that server
- [ ] Assign tasks to character
- [ ] Complete tasks
- [ ] Create events for character
- [ ] View character's events on calendar
- [ ] Verify server time calculations

**Test 35: Multi-Character Scenario**
- [ ] Create characters on different servers
- [ ] Create events for different characters
- [ ] Switch between characters
- [ ] Verify timezone calculations
- [ ] Test task completion independence
- [ ] Verify calendar shows all characters' events

### 10.14 Final System Testing

**Test 36: Full Application Stress Test**
- [ ] Create 5+ servers across different regions
- [ ] Create 10+ characters across different servers
- [ ] Create 20+ events across different dates
- [ ] Complete multiple tasks
- [ ] Navigate through all views multiple times
- [ ] Verify performance remains acceptable
- [ ] Check for memory leaks or crashes

**Test 37: User Experience Validation**
- [ ] Test complete new user onboarding flow
- [ ] Verify intuitive navigation
- [ ] Check error message clarity
- [ ] Validate form feedback
- [ ] Test accessibility (keyboard navigation)
- [ ] Verify responsive design

### 10.15 Testing Checklist Summary

**Critical Functions (Must Pass):**
- [ ] Application launches successfully
- [ ] All navigation works
- [ ] Server CRUD operations work
- [ ] Character CRUD operations work
- [ ] Task completion tracking works
- [ ] Event management works
- [ ] Calendar integration works
- [ ] Database persistence works
- [ ] Time calculations are accurate
- [ ] No critical errors in console

**Enhancement Functions (Should Pass):**
- [ ] Modal interactions are smooth
- [ ] Form validation is helpful
- [ ] UI feedback is clear
- [ ] Performance is acceptable
- [ ] Theme switching works
- [ ] Settings persist

**Edge Cases (Nice to Have):**
- [ ] Error recovery works
- [ ] Large dataset handling
- [ ] Concurrent operations
- [ ] Network interruption handling
- [ ] Cross-platform compatibility

---

## 11. Testing Notes & Requirements

### 11.1 Testing Environment
- **Operating System**: Windows 10+, macOS 10.14+, or Linux
- **RAM**: Minimum 4GB available
- **Storage**: 100MB free space
- **Node.js**: Version 18+ (for development testing)
- **Browser**: Chromium-based (Electron runtime)

### 11.2 Testing Tools
- **Manual Testing**: Primary testing method
- **Developer Tools**: For monitoring console errors
- **Database Browser**: For verifying data persistence
- **Timer**: For performance measurement

### 11.3 Test Result Documentation
For each test, document:
- [ ] **Pass/Fail Status**
- [ ] **Error Messages** (if any)
- [ ] **Console Warnings** (if any)
- [ ] **Performance Notes** (if applicable)
- [ ] **User Experience Issues** (if any)

### 11.4 Critical Test Failure Criteria
**Application is NOT ready for production if:**
- Database operations fail
- Character/Server CRUD operations fail
- Navigation breaks
- Time calculations are incorrect
- Data persistence fails
- Critical console errors appear

**Application is ready for production when:**
- All critical functions pass
- No data loss occurs
- Performance is acceptable
- User experience is intuitive
- Error handling is graceful

---

*This comprehensive testing protocol ensures every individual interaction in the New World Planner application is thoroughly validated before production release.*
