# Interview Assistant

A web-based interview assistant that helps interviewers prepare for interviews, take notes, and generate structured interview summaries.

## Features

- **Auto-sync from Feishu Calendar**: Automatically fetches interview events with title pattern `面试安排：{candidate_name}({team}{position})`
- **Question Generation**: AI-powered question generation based on job description and resume
- **Note Taking**: Record interview notes inline with questions
- **Structured Summary**: Editable interview result with evaluation dimensions, scores, and comprehensive assessment
- **Multiple Export Options**: Export to Feishu Doc
- **Built-in CORS Proxy**: No external proxy needed for API calls

## Quick Start

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Configure your API keys in `.env`

4. Start development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:3000

### Docker Deployment

1. Copy and configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

2. Build and run:
   ```bash
   docker-compose up --build
   ```

3. Open http://localhost:3000

Notes:

- Docker compose now starts a built-in `wintalent-proxy` sidecar automatically.
- If you need custom proxy target, set `DOCKER_WINTALENT_PROXY_URL` in `.env`.
- If you previously set `VITE_WINTALENT_PROXY_URL=http://127.0.0.1:8787` in `.env`, it can cause `502 Bad Gateway` in Docker (because `127.0.0.1` points to the nginx container itself, not your host).

## Configuration

### AI Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_AI_API_KEY` | Your AI provider API key | Required |
| `VITE_AI_MODEL` | Model to use | `gpt-4` |
| `VITE_AI_BASE_URL` | AI provider base URL, including OpenAI-compatible prefix such as `/v1` | `https://api.openai.com/v1` |
| `VITE_WINTALENT_PROXY_URL` | Wintalent backend proxy base URL | `http://127.0.0.1:8787` |

**Note**: The AI provider URL is configured server-side via environment variables, not in browser settings. It should point to the OpenAI-compatible API root, for example `https://api.openai.com/v1` or `https://api.openai-proxy.org/v1`. API keys are stored in browser localStorage and sent with each request.

### Feishu Configuration

| Variable | Description |
|----------|-------------|
| `VITE_FEISHU_APP_ID` | Feishu app ID |
| `VITE_FEISHU_APP_SECRET` | Feishu app secret |

**Note**: CORS proxy is built-in. No need to run `local-cors-proxy` anymore.

### Feishu OAuth Troubleshooting

If a user sees this error on Feishu login page:

`This account doesn't have permission to authorize login`

Check the following in Feishu Open Platform:

1. The app is published to your current tenant.
2. App availability scope includes that user's department/member.
3. If using test mode, the user is added to the tester list.
4. After changing scope or permissions, publish a new app version and retry login.

If a user sees:

`redirect_uri 请求不合法` (for example code `20029`)

Make sure Feishu app redirect URL includes the fixed callback URL of this app root:

- `http(s)://<your-domain>/`

This app now always uses the site root as OAuth `redirect_uri` and restores the original page through OAuth `state`.

## Usage

1. **Configure Settings**: Click the gear icon to set up API keys and your interviewer name

2. **Sync Calendar** (Optional): Click "Sync Calendar" to fetch interviews from Feishu Calendar

3. **Create Position**: Add a job position with description and evaluation criteria

4. **Add Candidate**: Add candidate with resume (PDF upload, URL, or Wintalent one-click import)

5. **Generate Questions**: Use AI to generate interview questions based on JD and resume

6. **Take Notes**: During the interview, add notes below each question

7. **Generate Summary**: After the interview, generate a structured summary

8. **Export**: Export to Feishu Doc

## Data Storage

All data is stored in the browser's localStorage. No backend required.

## Development

```bash
# Development server
npm run dev

# Start only Vite frontend (without Wintalent proxy)
npm run dev:vite

# Start only Wintalent resume proxy (for interview link -> PDF)
npm run proxy:wintalent

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

### Wintalent Proxy (Interview Link -> PDF)

`npm run dev` / `npm start` already starts this proxy automatically.

If you only need the proxy process, run:

```bash
npm run proxy:wintalent
```

Default address:

- `http://127.0.0.1:8787`
- `POST /api/wintalent/resolve` (resolve tokenized PDF URL)
- `POST /api/wintalent/download` (download PDF stream directly)
- `POST /api/wintalent/jd` (fetch position JD from interview link)

## Architecture

### API Proxy

The app uses built-in CORS proxies for both local development and Docker deployment:

| Environment | AI API | Feishu API | Wintalent API |
|-------------|--------|------------|---------------|
| Local (`npm run dev`) | Vite proxy → `VITE_AI_BASE_URL` | Vite proxy → Feishu | Vite proxy → `VITE_WINTALENT_PROXY_URL` |
| Docker | nginx proxy → `VITE_AI_BASE_URL` | nginx proxy → Feishu | nginx proxy → `VITE_WINTALENT_PROXY_URL` |

### Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Zustand (state management)
- pdfjs-dist (PDF parsing)
- Vercel AI SDK
- Feishu Open Platform API
