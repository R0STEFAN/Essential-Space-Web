<div align="center">
  <img src="public/icon.png" width="96" height="96" alt="Essential Space Logo" />
  <h1>ESSENTIAL SPACE // WEB DASHBOARD</h1>
  <p><b>A self-hosted, cloud-synchronized web companion for Nothing OS Essential Space</b></p>
  <p>Built with <b>Next.js 15</b> &bull; <b>React 19</b> &bull; <b>TypeScript</b> &bull; <b>Tailwind CSS</b> &bull; <b>Dexie IndexedDB</b></p>

  <p>
    <img src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js" alt="Next.js 15" />
    <img src="https://img.shields.io/badge/React-19-141416?style=flat-square&logo=react" alt="React 19" />
    <img src="https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=flat-square&logo=tailwind-css" alt="Tailwind CSS" />
    <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker" alt="Docker Ready" />
    <img src="https://img.shields.io/badge/Cloudflare_Pages-Compatible-F38020?style=flat-square&logo=cloudflare" alt="Cloudflare Pages" />
    <img src="https://img.shields.io/badge/License-MIT-26262A?style=flat-square" alt="License" />
  </p>
</div>

---

## ✦ Overview

**Essential Space Web Dashboard** is a standalone web application and client designed to view, edit, organize, and synchronize notes from the **Nothing OS Essential Space** app found on Nothing smartphones (Nothing Phone (1), Phone (2), Phone (2a), etc.).

Engineered with authentic **Nothing OS design principles** (dot-matrix `NDot-57` typography, minimalist monochrome aesthetics, high-contrast dark mode, and signature Nothing Red `#D71921` accents), the dashboard provides complete parity with the mobile app and is deployable anywhere via **Docker**, **Coolify**, or **Cloudflare Pages**.

---

## 🌟 Key Features

### 🔄 Authentic Nothing Cloud Synchronization
- **Direct Cloud Sync**: Communicates directly with Nothing Cloud Storage (`https://essential-space.nothingtech.link`).
- **Android Room DB Schema Parity**: Serializes request payloads to match the Nothing OS Android app internal SQLite/Room database structures (`cards`, `card_resources`, `card_events`, and `card_collection_cross_ref`).
- **End-to-End Encryption**: Implements AES-128-CBC encryption with RSA session key negotiation identical to official Nothing Phone device requests.
- **Offline-First Storage**: Local persistence powered by Dexie IndexedDB enables instant loading and offline availability with automatic cloud reconciliation.

### 📝 Comprehensive Multi-Modal Cards
- 🎙️ **Voice Notes & Audio**: Built-in audio player, visual waveform seekbar, and complete **Whisper AI** transcripts with 1-click clipboard copy.
- 🔗 **Smart Web Bookmarks**: Automatic OpenGraph metadata extraction (previews, site names, favicons, domain tags), direct links, and full compatibility with the Nothing OS Android Share Sheet.
- ☑️ **Interactive To-Do & Checklists**: Interactive checkboxes with instant sync, timestamps, and collapsible AI task suggestions.
- 📝 **Rich Text & Clipped Notes**: Clean formatted text, AI-generated bullet points, and structured information extraction blocks.
- 🖼️ **Image & Screenshot Cards**: High-resolution image view with browser IndexedDB blob caching to preserve images in trash even if cloud assets are cleaned.

### 📁 Multi-Collection Management (Many-to-Many)
- **Assign Multiple Collections**: Supports assigning a single note to multiple collections simultaneously, fully compatible with Nothing OS `card_collection_cross_ref`.
- **On-the-Fly Collection Creation**: Create new collections instantly within note detail or creation modals with automatic cloud synchronization.
- **Multi-Selection Everywhere**: Multi-collection assignment available across the note detail modal, note creation dialog, and bulk action bar.
- **Pure Monochrome Design**: Strict Nothing OS styling without arbitrary color pickers.

### 🗑️ Trash & Recovery
- **Two-Way Trash Lifecycle**: Soft delete, restore notes back to active status, or permanently purge them with full Nothing Cloud synchronization.
- **In-Trash Media Retention**: Caches image blobs locally in IndexedDB so deleted notes retain their visual previews while in the trash.
- **Quick Action Bar**: Dedicated bottom actions panel for notes inside the trash.

### ⚡ Search, Organization & Bulk Actions
- **Instant Search**: Real-time filtering across titles, note content, and Whisper AI voice transcripts.
- **Bento Grid Layout**: Responsive grid layout that arranges cards by type, aspect ratio, and priority.
- **Bulk Operations**: Select multiple notes to bulk-assign collections, delete, or restore simultaneously.
- **"For You" AI Tab**: Automated grouping, AI task prioritization, and structured insights.

---

## 🔐 Authentication Modes

1. **Nothing Account SSO**:
   - Sign in securely using your official Nothing Account email and password.
   - Exchanges credentials for bearer tokens directly with Nothing Auth services.
2. **Token / ADB Authentication**:
   - Paste an existing `accessToken` extracted via ADB or developer inspection from `com.nothing.user.center`.
3. **Demo Mode**:
   - Explore the dashboard with pre-populated sample cards, audio waveforms, tasks, and collections without logging in.

---

## 🚀 Deployment

### Option A: Docker / Coolify (Recommended)

Essential Space Web includes a multi-stage `Dockerfile` and `docker-compose.yml` optimized for standalone Next.js production hosting.

#### 1. Coolify Setup
1. In your Coolify dashboard, create a **+ New Application** &rarr; **Public Git Repository**.
2. Set the repository URL: `https://github.com/R0STEFAN/Essential-Space-Web.git` (or your fork).
3. Set **Base Directory** to `/` (or `/web` if monorepo).
4. Under **Storages**, add a persistent volume:
   - **Name**: `essential_data`
   - **Destination path**: `/app/data`
5. Under **Environment Variables**, define:
   ```env
   NODE_ENV=production
   PORT=3000
   DATA_DIR=/app/data
   SESSION_SECRET=your-secure-random-64-character-string
   NOTHING_API_URL=https://essential-space.nothingtech.link/essentialSpace
   ```
6. Assign your custom domain (e.g., `https://space.yourdomain.com`). Traefik will automatically provision an SSL certificate via Let's Encrypt.
7. Click **Deploy**.

#### 2. Docker Compose
```bash
# Clone the repository
git clone https://github.com/R0STEFAN/Essential-Space-Web.git
cd Essential-Space-Web

# Copy and configure environment variables
cp .env.example .env

# Run with Docker Compose
docker compose up -d
```

---

### Option B: Cloudflare Pages

Essential Space Web can be exported statically to Cloudflare Pages with zero-configuration edge API routing:

1. Connect the repository to **Cloudflare Pages**.
2. **Build Settings**:
   - **Framework preset**: `Next.js (Static HTML Export)`
   - **Build command**: `npm run build`
   - **Build output directory**: `out`
3. The included `/functions` directory provides serverless edge proxies for Nothing Cloud requests to avoid CORS restrictions in browsers.

---

## 💻 Local Development

### Prerequisites
- **Node.js**: `v20.x` or `v22.x`
- **npm** or **pnpm**

```bash
# 1. Clone the repository
git clone https://github.com/R0STEFAN/Essential-Space-Web.git
cd Essential-Space-Web

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚙️ Environment Variables

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `NODE_ENV` | Application environment | `production` |
| `PORT` | HTTP server listening port | `3000` |
| `DATA_DIR` | Path to persistent storage volume | `/app/data` |
| `SESSION_SECRET` | Secret key for JWT signing (minimum 32-64 hex chars) | `openssl rand -hex 32` |
| `NOTHING_API_URL` | Base Nothing Cloud API URL | `https://essential-space.nothingtech.link/essentialSpace` |
| `NOTHING_API_KEY` | Nothing Space Client API Key | Embedded Nothing client key |

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Standalone build)
- **UI Library**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with custom Nothing OS design system & dot-matrix font
- **Local DB**: [Dexie.js](https://dexie.com/) (IndexedDB wrapper for client-side storage)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Cryptography**: [Node-Forge](https://github.com/digitalbazaar/forge) & [jose](https://github.com/panva/jose) (AES-128-CBC, RSA encryption)

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Designed with reverence for Nothing OS aesthetics. Not officially affiliated with Nothing Technology Limited.</sub>
</div>
