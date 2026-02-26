/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_API_KEY: string
  readonly VITE_AI_BASE_URL: string
  readonly VITE_AI_MODEL: string
  readonly VITE_NOTION_API_KEY: string
  readonly VITE_NOTION_DATABASE_ID: string
  readonly VITE_FEISHU_APP_ID: string
  readonly VITE_FEISHU_APP_SECRET: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
