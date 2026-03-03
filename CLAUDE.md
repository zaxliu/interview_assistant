# CLAUDE.md

This file provides guidance for Claude Code when working with this project.

## Overview

Interview Assistant is a web-based application that helps interviewers prepare for interviews, take notes, and generate structured interview summaries with AI assistance.

**Key Features**:
- AI-powered question generation from job description and resume
- PDF resume viewer with text selection and highlighting
- Structured interview notes with 4 evaluation dimensions (专业能力, 通用素质, 适配度, 管理能力)
- Calendar sync with Feishu
- Interview summary generation with evaluation scores and export options

## Project Structure

```
interview_assitant/
├── src/
│   ├── api/              # External API integrations
│   │   ├── ai.ts         # OpenAI/AI SDK for question & summary generation
│   │   ├── feishu.ts     # Feishu Calendar and Doc API
│   │   └── pdf.ts        # PDF parsing utilities
│   ├── components/
│   │   ├── calendar/     # Calendar sync and upcoming interviews
│   │   ├── candidates/   # Candidate cards, forms, and lists
│   │   ├── interview/    # Interview panel, questions, notes
│   │   ├── positions/    # Job position management
│   │   ├── settings/     # API key configuration
│   │   ├── summary/      # Interview result editor and export
│   │   └── ui/           # Reusable UI components (Button, Card, Input, etc.)
│   ├── hooks/            # Custom React hooks
│   ├── store/            # Zustand state stores
│   ├── types/            # TypeScript type definitions
│   └── utils/            # Utility functions
├── App.tsx               # Main app with view routing
└── main.tsx              # Entry point
```

## Setup & Installation

### Local Development

```bash
npm install
cp .env.example .env
# Configure VITE_AI_API_KEY and other settings in .env
npm run dev
```

### Docker Deployment

```bash
cp .env.example .env
# Configure environment variables
docker-compose up --build
```

**Environment Variables**:

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_AI_API_KEY` | AI provider API key | Required |
| `VITE_AI_MODEL` | Model name | `gpt-4` |
| `VITE_AI_BASE_URL` | AI provider URL | `https://api.openai.com` |
| `VITE_FEISHU_APP_ID` | Feishu app ID | Optional |
| `VITE_FEISHU_APP_SECRET` | Feishu app secret | Optional |

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint on TypeScript files |
| `docker-compose up --build` | Build and run Docker container |

## Deployment

The app is designed for VPS deployment via Docker:

1. Copy `.env.example` to `.env` and configure
2. Run `docker-compose up -d`
3. App available on port 3000

See `Dockerfile` and `docker-compose.yml` for configuration details.

## Architecture

### State Management
- **Zustand** stores in `src/store/`
- `positionStore.ts`: Positions, candidates, questions, results
- `settingsStore.ts`: API keys, user preferences
- Data persisted to localStorage

### Component Patterns
- UI components in `src/components/ui/` are reusable primitives
- Feature components organized by domain (calendar, candidates, interview, etc.)
- Auto-resize textareas using `autoResize` prop

### Evaluation Dimensions
Four dimensions used throughout:
1. **专业能力** (Professional Skills)
2. **通用素质** (General Qualities)
3. **适配度** (Fit)
4. **管理能力** (Management Skills)

### PDF Handling
- Resumes stored in IndexedDB via `src/utils/pdfStorage.ts`
- Rendered with pdfjs-dist in `src/components/ui/PDFViewer.tsx`
- CMap support for CJK fonts

### API Proxy (Built-in CORS)
The app uses built-in CORS proxies - no external proxy needed:

| Environment | AI API | Feishu API |
|-------------|--------|------------|
| Local (`npm run dev`) | Vite proxy → `VITE_AI_BASE_URL` | Vite proxy → Feishu |
| Docker | nginx proxy → `VITE_AI_BASE_URL` | nginx proxy → Feishu |

- **Proxy endpoints**: `/api/ai/*` and `/api/feishu/*`
- **API keys**: Stored in browser localStorage, sent via Authorization header
- **Server never stores keys**: Keys are pass-through only

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| PDF | pdfjs-dist |
| AI | Vercel AI SDK + OpenAI |
| Calendar | Feishu Open API |
| Storage | localStorage + IndexedDB |

## Key Conventions

1. **Type Definitions**: All types in `src/types/index.ts`
2. **API Layer**: External calls in `src/api/`
3. **Component Props**: Use TypeScript interfaces
4. **Styling**: Tailwind utility classes, no CSS modules
5. **State Updates**: Use Zustand's update patterns, never mutate directly

## Candidate Status Flow

```
pending → scheduled → in_progress → completed
                ↓
            cancelled (soft delete from calendar sync)
```

## Data Storage

All data stored client-side:
- **localStorage**: Positions, candidates, settings (via Zustand persist)
- **IndexedDB**: PDF files (to avoid localStorage size limits)
