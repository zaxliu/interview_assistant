import { create } from 'zustand';
import type { Settings, User } from '@/types';
import { loadSettingsFromStorage, saveSettingsToStorage } from '@/utils/storage';

interface SettingsState extends Settings {
  feishuUser: User | null;
  interviewSplitRatio: number;
  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
  setFeishuAppId: (id: string) => void;
  setFeishuAppSecret: (secret: string) => void;
  setFeishuUserAccessToken: (token: string) => void;
  setFeishuRefreshToken: (token: string) => void;
  setAutomationServiceUrl: (url: string) => void;
  setFeishuUser: (user: User | null) => void;
  setInterviewSplitRatio: (ratio: number) => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const getDefaultSettings = () => ({
  aiApiKey: import.meta.env.VITE_AI_API_KEY || '',
  aiModel: import.meta.env.VITE_AI_MODEL || 'gpt-4',
  feishuAppId: import.meta.env.VITE_FEISHU_APP_ID || '',
  feishuAppSecret: import.meta.env.VITE_FEISHU_APP_SECRET || '',
  feishuUserAccessToken: '',
  feishuRefreshToken: '',
  automationServiceUrl: 'http://127.0.0.1:3456',
  feishuUser: null,
  interviewSplitRatio: 0.5,
});

const preferEnvString = (envValue: string, storedValue?: string): string => {
  return envValue || storedValue || '';
};

const persistSettings = (state: SettingsState) => {
  const settings: Settings & { feishuUser: User | null; interviewSplitRatio: number } = {
    aiApiKey: state.aiApiKey,
    aiModel: state.aiModel,
    feishuAppId: state.feishuAppId,
    feishuAppSecret: state.feishuAppSecret,
    feishuUserAccessToken: state.feishuUserAccessToken,
    feishuRefreshToken: state.feishuRefreshToken,
    automationServiceUrl: state.automationServiceUrl,
    feishuUser: state.feishuUser,
    interviewSplitRatio: state.interviewSplitRatio,
  };

  saveSettingsToStorage(settings);
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
  setAutomationServiceUrl: (url) => updateAndPersist(set, () => ({ automationServiceUrl: url })),
  setFeishuUser: (user) => updateAndPersist(set, () => ({ feishuUser: user })),
  setInterviewSplitRatio: (ratio) => updateAndPersist(set, () => ({ interviewSplitRatio: ratio })),

  loadFromStorage: () => {
    try {
      const data = loadSettingsFromStorage<
        Partial<Settings> & {
          feishuUser?: User | null;
          interviewSplitRatio?: number;
        }
      >();
      if (!data) {
        return;
      }
      const defaults = getDefaultSettings();

      set({
        aiApiKey: preferEnvString(defaults.aiApiKey, data.aiApiKey),
        aiModel: preferEnvString(defaults.aiModel, data.aiModel),
        feishuAppId: preferEnvString(defaults.feishuAppId, data.feishuAppId),
        feishuAppSecret: preferEnvString(defaults.feishuAppSecret, data.feishuAppSecret),
        feishuUserAccessToken: data.feishuUserAccessToken || '',
        feishuRefreshToken: data.feishuRefreshToken || '',
        automationServiceUrl: data.automationServiceUrl || defaults.automationServiceUrl,
        feishuUser: data.feishuUser || null,
        interviewSplitRatio: data.interviewSplitRatio ?? defaults.interviewSplitRatio,
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
