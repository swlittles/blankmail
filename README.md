<p align="center">
  <img src="assets/icon.png" alt="BlankMail" width="200" height="200" style="border-radius: 24px;" />
</p>

<h1 align="center">BlankMail</h1>

<p align="center">
  <strong>Email at the speed of thought.</strong>
</p>

<p align="center">
  A blazing-fast, keyboard-first desktop email client built with Tauri, React, and Rust.<br />
  Local-first. Privacy-focused. AI-powered.
</p>

<p align="center">
  <a href="#features">Features</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#installation">Installation</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="docs/keyboard-shortcuts.md">Shortcuts</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="docs/architecture.md">Architecture</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="docs/development.md">Development</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

## Why BlankMail?

Most email clients are slow, bloated, or send your data to someone else's server. BlankMail is different:

- **Local-first** -- Your emails live in a local SQLite database. No middleman servers. Read your mail offline.
- **Keyboard-driven** -- Superhuman-inspired shortcuts let you fly through your inbox without touching the mouse.
- **AI-enhanced** -- Summarize threads, generate replies, and search your inbox in natural language -- through OpenRouter, with your choice of model.
- **Native performance** -- Rust backend via Tauri v2. Small binary, low memory, instant startup.
- **Private by default** -- Remote images blocked, HTML sanitized, emails rendered in sandboxed iframes. Your data stays on your machine.

---

## Features

### Email

- Multi-account support: Gmail (API) and IMAP/SMTP (Outlook, Yahoo, iCloud, Fastmail, and more) with instant switching
- Threaded conversations with collapsible messages
- Full-text search with Gmail-style operators (`from:`, `to:`, `subject:`, `has:attachment`, `label:`, etc.)
- Command palette (`/` or `Ctrl+K`) for quick actions
- Drag-and-drop labels, multi-select, pin threads, mute threads, context menus
- Split inbox with category tabs (Primary, Updates, Promotions, Social, Newsletters)
- Inline reply, contact sidebar with Gravatar

### Composer

- TipTap v3 rich text editor (bold, italic, lists, code, links, images)
- Undo send, schedule send, auto-save drafts
- Multiple signatures, reusable templates with variables
- Send-as email aliases with from-address selector
- Drag-and-drop attachments with inline preview
- Frequency-ranked contact autocomplete

### Smart Inbox

- Snooze threads with presets or custom date/time
- Filters to auto-label, archive, trash, star, or mark read
- AI + rule-based auto-categorization (Primary, Updates, Promotions, Social, Newsletters)
- One-click unsubscribe (RFC 8058) and subscription manager
- Newsletter bundling with delivery schedules
- Smart folders / saved searches with dynamic query tokens
- Quick steps -- custom action chains for batch thread processing
- Follow-up reminders when you haven't received a reply

### AI

All AI runs through [OpenRouter](https://openrouter.ai), so one API key gives you models from Anthropic, OpenAI, Google and others. Pick any OpenRouter model ID in Settings (default: `anthropic/claude-haiku-4.5`).

Thread summaries, smart reply suggestions, AI compose & reply, text transform (improve/shorten/formalize), Ask My Inbox (natural language search). All results cached locally.

### Calendar

Google Calendar sync with month, week, and day views. Create events without leaving BlankMail.

### UI & Design

- Glassmorphism with animated gradient background
- Dark / light / system theme with 8 accent color presets
- Flexible reading pane (right, bottom, hidden), resizable panels
- Configurable density and font scaling
- Pop-out thread windows, custom titlebar, splash screen
- System tray with taskbar badge count

### Privacy & Security

- OAuth PKCE for Gmail -- no client secret, no backend servers
- Encrypted password/app-password storage for IMAP accounts (AES-256-GCM)
- Remote image blocking with per-sender allowlist
- Phishing link detection with 10 heuristic scoring rules
- SPF/DKIM/DMARC authentication display with badges and warnings
- DOMPurify + sandboxed iframe rendering
- AES-256-GCM encrypted token storage

### System Integration

- `mailto:` deep links, global compose shortcut
- Autostart (hidden in tray), single instance
- [Customizable keyboard shortcuts](docs/keyboard-shortcuts.md)

---

## Installation

Download the latest release for your platform:

**[Download BlankMail](https://github.com/swlittles/blankmail/releases/latest)** -- Windows `.msi` / `.exe` &nbsp;&bull;&nbsp; macOS `.dmg` &nbsp;&bull;&nbsp; Linux `.deb` / `.AppImage`

No build tools or programming knowledge required -- just download, install, and run.

### Account setup

**Gmail:** Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/) (enable Gmail API + Calendar API), then enter your Client ID in BlankMail's Settings. No client secret needed (PKCE).

**IMAP/SMTP:** Click "Add IMAP Account" in the account switcher. Enter your email and password -- BlankMail auto-discovers server settings for popular providers (Outlook, Yahoo, iCloud, Fastmail, etc.). For other providers, enter IMAP/SMTP server details manually. No Google Cloud project needed.

**AI (optional):** Create an [OpenRouter API key](https://openrouter.ai/keys) and add it in Settings > AI. Optionally choose a model.

### Building from source

For developers who want to build BlankMail themselves or contribute:

```bash
git clone https://github.com/swlittles/blankmail.git
cd blankmail
npm install
npm run tauri dev
```

**Prerequisites:** [Node.js](https://nodejs.org/) v18+, [Rust](https://www.rust-lang.org/tools/install), [Tauri v2 deps](https://v2.tauri.app/start/prerequisites/)

See [Development Guide](docs/development.md) for all commands, testing, and build instructions.

---

## Tech Stack

| | |
|--|--|
| **Framework** | Tauri v2 (Rust) + React 19 + TypeScript |
| **Styling** | Tailwind CSS v4 |
| **State** | Zustand 5 (8 stores) |
| **Editor** | TipTap v3 |
| **Email** | Gmail API, IMAP/SMTP (via async-imap + lettre in Rust) |
| **Database** | SQLite + FTS5 (33 tables) |
| **AI** | OpenRouter (any model) |
| **Testing** | Vitest + Testing Library |

See [Architecture](docs/architecture.md) for detailed design, data flow, and project structure.

---

## Building

```bash
npm run tauri build
```

**Windows** `.msi` / `.exe` &nbsp;&bull;&nbsp; **macOS** `.dmg` / `.app` &nbsp;&bull;&nbsp; **Linux** `.deb` / `.AppImage`

---

## License

[Apache-2.0](LICENSE). BlankMail is derived from an Apache-2.0 licensed project; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
