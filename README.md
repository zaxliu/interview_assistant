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

## Configuration

### AI Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_AI_API_KEY` | Your AI provider API key | Required |
| `VITE_AI_MODEL` | Model to use | `gpt-4` |
| `VITE_AI_BASE_URL` | AI provider URL (local dev) | `https://api.openai.com` |
| `AI_API_BASE_URL` | AI provider URL (Docker) | `https://api.openai.com` |

**Note**: The AI provider URL is configured server-side via environment variables, not in browser settings. API keys are stored in browser localStorage and sent with each request.

### Feishu Configuration

| Variable | Description |
|----------|-------------|
| `VITE_FEISHU_APP_ID` | Feishu app ID |
| `VITE_FEISHU_APP_SECRET` | Feishu app secret |

**Note**: CORS proxy is built-in. No need to run `local-cors-proxy` anymore.

## Usage

1. **Configure Settings**: Click the gear icon to set up API keys and your interviewer name

2. **Sync Calendar** (Optional): Click "Sync Calendar" to fetch interviews from Feishu Calendar

3. **Create Position**: Add a job position with description and evaluation criteria

4. **Add Candidate**: Add candidate with resume (PDF upload or URL)

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

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

## Architecture

### API Proxy

The app uses built-in CORS proxies for both local development and Docker deployment:

| Environment | AI API | Feishu API |
|-------------|--------|------------|
| Local (`npm run dev`) | Vite proxy → `VITE_AI_BASE_URL` | Vite proxy → Feishu |
| Docker | nginx proxy → `AI_API_BASE_URL` | nginx proxy → Feishu |

### Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Zustand (state management)
- pdfjs-dist (PDF parsing)
- Vercel AI SDK
- Feishu Open Platform API
