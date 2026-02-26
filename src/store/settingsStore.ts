import { create } from 'zustand';
import type { Settings } from '@/types';

interface SettingsState extends Settings {
  setApiKey: (key: string) => void;
  setBaseUrl: (url: string) => void;
  setModel: (model: string) => void;
  setFeishuAppId: (id: string) => void;
  setFeishuAppSecret: (secret: string) => void;
  setFeishuCorsProxy: (proxy: string) => void;
  setFeishuUserAccessToken: (token: string) => void;
  setFeishuRefreshToken: (token: string) => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const STORAGE_KEY = 'interview-assistant-settings';

export const useSettingsStore = create<SettingsState>((set, get) => ({
  aiApiKey: import.meta.env.VITE_AI_API_KEY || '',
  aiBaseUrl: import.meta.env.VITE_AI_BASE_URL || 'https://api.openai.com/v1',
  aiModel: import.meta.env.VITE_AI_MODEL || 'gpt-4',
  feishuAppId: import.meta.env.VITE_FEISHU_APP_ID || '',
  feishuAppSecret: import.meta.env.VITE_FEISHU_APP_SECRET || '',
  feishuCorsProxy: import.meta.env.VITE_CORS_PROXY || '',
  feishuUserAccessToken: '',
  feishuRefreshToken: '',

  setApiKey: (key) => {
    set({ aiApiKey: key });
    get().saveToStorage();
  },

  setBaseUrl: (url) => {
    set({ aiBaseUrl: url });
    get().saveToStorage();
  },

  setModel: (model) => {
    set({ aiModel: model });
    get().saveToStorage();
  },

  setFeishuAppId: (id) => {
    set({ feishuAppId: id });
    get().saveToStorage();
  },

  setFeishuAppSecret: (secret) => {
    set({ feishuAppSecret: secret });
    get().saveToStorage();
  },

  setFeishuCorsProxy: (proxy) => {
    set({ feishuCorsProxy: proxy });
    get().saveToStorage();
  },

  setFeishuUserAccessToken: (token) => {
    set({ feishuUserAccessToken: token });
    get().saveToStorage();
  },

  setFeishuRefreshToken: (token) => {
    set({ feishuRefreshToken: token });
    get().saveToStorage();
  },

  loadFromStorage: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const settings = JSON.parse(data) as Partial<Settings>;
        set({
          aiApiKey: settings.aiApiKey || import.meta.env.VITE_AI_API_KEY || '',
          aiBaseUrl: settings.aiBaseUrl || import.meta.env.VITE_AI_BASE_URL || 'https://api.openai.com/v1',
          aiModel: settings.aiModel || import.meta.env.VITE_AI_MODEL || 'gpt-4',
          feishuAppId: settings.feishuAppId || import.meta.env.VITE_FEISHU_APP_ID || '',
          feishuAppSecret: settings.feishuAppSecret || import.meta.env.VITE_FEISHU_APP_SECRET || '',
          feishuCorsProxy: settings.feishuCorsProxy || import.meta.env.VITE_CORS_PROXY || '',
          feishuUserAccessToken: settings.feishuUserAccessToken || '',
          feishuRefreshToken: settings.feishuRefreshToken || '',
        });
      }
    } catch (error) {
      console.error('Failed to load settings from storage:', error);
    }
  },

  saveToStorage: () => {
    try {
      const state = get();
      const settings: Settings = {
        aiApiKey: state.aiApiKey,
        aiBaseUrl: state.aiBaseUrl,
        aiModel: state.aiModel,
        feishuAppId: state.feishuAppId,
        feishuAppSecret: state.feishuAppSecret,
        feishuCorsProxy: state.feishuCorsProxy,
        feishuUserAccessToken: state.feishuUserAccessToken,
        feishuRefreshToken: state.feishuRefreshToken,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings to storage:', error);
    }
  },
}));
