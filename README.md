# Interview Assistant

A web-based interview assistant that helps interviewers prepare for interviews, take notes, and generate structured interview summaries.

## Features

- **Auto-sync from Feishu Calendar**: Automatically fetches interview events with title pattern `面试安排：{candidate_name}({team}{position})`
- **Question Generation**: AI-powered question generation based on job description and resume
- **Note Taking**: Record interview notes inline with questions
- **Structured Summary**: Editable interview result with evaluation dimensions, scores, and comprehensive assessment
- **Multiple Export Options**: Export to Notion database or Feishu Doc

## Quick Start

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

## Configuration

### AI Configuration
- `VITE_AI_API_KEY`: Your AI provider API key
- `VITE_AI_BASE_URL`: API endpoint (default: OpenAI)
- `VITE_AI_MODEL`: Model to use (e.g., gpt-4)

### Notion Configuration
- `VITE_NOTION_API_KEY`: Notion integration secret
- `VITE_NOTION_DATABASE_ID`: Database ID for storing interview results

### Feishu Configuration
- `VITE_FEISHU_APP_ID`: Feishu app ID
- `VITE_FEISHU_APP_SECRET`: Feishu app secret

## Usage

1. **Configure Settings**: Click the gear icon to set up API keys and your interviewer name

2. **Sync Calendar** (Optional): Click "Sync Calendar" to fetch interviews from Feishu Calendar

3. **Create Position**: Add a job position with description and evaluation criteria

4. **Add Candidate**: Add candidate with resume (PDF upload or URL)

5. **Generate Questions**: Use AI to generate interview questions based on JD and resume

6. **Take Notes**: During the interview, add notes below each question

7. **Generate Summary**: After the interview, generate a structured summary

8. **Export**: Export to Notion or Feishu Doc

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
```

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Zustand (state management)
- pdfjs-dist (PDF parsing)
- Vercel AI SDK
- Notion SDK
- Feishu Open Platform API
