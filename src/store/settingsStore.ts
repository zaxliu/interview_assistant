import { create } from 'zustand';
import type { Settings, User } from '@/types';

interface SettingsState extends Settings {
  feishuUser: User | null;
  interviewSplitRatio: number;
  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
  setFeishuAppId: (id: string) => void;
  setFeishuAppSecret: (secret: string) => void;
  setFeishuUserAccessToken: (token: string) => void;
  setFeishuRefreshToken: (token: string) => void;
  setFeishuUser: (user: User | null) => void;
  setInterviewSplitRatio: (ratio: number) => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const STORAGE_KEY = 'interview-assistant-settings';

const getDefaultSettings = () => ({
  aiApiKey: import.meta.env.VITE_AI_API_KEY || '',
  aiModel: import.meta.env.VITE_AI_MODEL || 'gpt-4',
  feishuAppId: import.meta.env.VITE_FEISHU_APP_ID || '',
  feishuAppSecret: import.meta.env.VITE_FEISHU_APP_SECRET || '',
  feishuUserAccessToken: '',
  feishuRefreshToken: '',
  feishuUser: null,
  interviewSplitRatio: 0.5,
});

const persistSettings = (state: SettingsState) => {
  const settings: Settings & { feishuUser: User | null; interviewSplitRatio: number } = {
    aiApiKey: state.aiApiKey,
    aiModel: state.aiModel,
    feishuAppId: state.feishuAppId,
    feishuAppSecret: state.feishuAppSecret,
    feishuUserAccessToken: state.feishuUserAccessToken,
    feishuRefreshToken: state.feishuRefreshToken,
    feishuUser: state.feishuUser,
    interviewSplitRatio: state.interviewSplitRatio,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

const updateAndPersist = (
  set: (fn: (state: SettingsState) => Partial<SettingsState>) => void,
  updater: (state: SettingsState) => Partial<SettingsState>
) => {
  set((state) => {
    const nextState = { ...state, ...updater(state) };
    persistSettings(nextState);
    return updater(state);
  });
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...getDefaultSettings(),

  setApiKey: (key) => updateAndPersist(set, () => ({ aiApiKey: key })),
  setModel: (model) => updateAndPersist(set, () => ({ aiModel: model })),
  setFeishuAppId: (id) => updateAndPersist(set, () => ({ feishuAppId: id })),
  setFeishuAppSecret: (secret) => updateAndPersist(set, () => ({ feishuAppSecret: secret })),
  setFeishuUserAccessToken: (token) => updateAndPersist(set, () => ({ feishuUserAccessToken: token })),
  setFeishuRefreshToken: (token) => updateAndPersist(set, () => ({ feishuRefreshToken: token })),
  setFeishuUser: (user) => updateAndPersist(set, () => ({ feishuUser: user })),
  setInterviewSplitRatio: (ratio) => updateAndPersist(set, () => ({ interviewSplitRatio: ratio })),

  loadFromStorage: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) {
        return;
      }

      const parsed = JSON.parse(data) as Partial<Settings> & {
        feishuUser?: User | null;
        interviewSplitRatio?: number;
      };
      const defaults = getDefaultSettings();

      set({
        aiApiKey: parsed.aiApiKey || defaults.aiApiKey,
        aiModel: parsed.aiModel || defaults.aiModel,
        feishuAppId: parsed.feishuAppId || defaults.feishuAppId,
        feishuAppSecret: parsed.feishuAppSecret || defaults.feishuAppSecret,
        feishuUserAccessToken: parsed.feishuUserAccessToken || '',
        feishuRefreshToken: parsed.feishuRefreshToken || '',
        feishuUser: parsed.feishuUser || null,
        interviewSplitRatio: parsed.interviewSplitRatio ?? defaults.interviewSplitRatio,
      });
    } catch (error) {
      console.error('Failed to load settings from storage:', error);
    }
  },

  saveToStorage: () => {
    try {
      persistSettings(get());
    } catch (error) {
      console.error('Failed to save settings to storage:', error);
    }
  },
}));
