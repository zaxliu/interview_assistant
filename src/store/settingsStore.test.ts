import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('settingsStore', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('does not persist sensitive settings fields when updating the store', async () => {
    const { useSettingsStore } = await import('./settingsStore');

    useSettingsStore.getState().setApiKey('secret-key');
    useSettingsStore.getState().setFeishuAppId('app-id');
    useSettingsStore.getState().setFeishuAppSecret('app-secret');
    useSettingsStore.getState().setFeishuUserAccessToken('access-token');
    useSettingsStore.getState().setFeishuRefreshToken('refresh-token');
    useSettingsStore.getState().setModel('gpt-4.1');
    useSettingsStore.getState().setInterviewSplitRatio(0.7);

    expect(JSON.parse(localStorage.getItem('interview-assistant-settings') || '{}')).toEqual({
      aiModel: 'gpt-4.1',
      feishuUser: null,
      interviewSplitRatio: 0.7,
    });
  });

  it('cleans previously persisted sensitive settings during load', async () => {
    localStorage.setItem(
      'interview-assistant-settings',
      JSON.stringify({
        aiApiKey: 'secret-key',
        aiModel: 'gpt-4.1',
        feishuAppId: 'app-id',
        feishuAppSecret: 'app-secret',
        feishuUserAccessToken: 'access-token',
        feishuRefreshToken: 'refresh-token',
        interviewSplitRatio: 0.6,
      })
    );

    const { useSettingsStore } = await import('./settingsStore');
    useSettingsStore.getState().loadFromStorage();

    expect(useSettingsStore.getState().aiApiKey).not.toBe('secret-key');
    expect(useSettingsStore.getState().feishuAppId).not.toBe('app-id');
    expect(useSettingsStore.getState().feishuAppSecret).not.toBe('app-secret');
    expect(useSettingsStore.getState().feishuUserAccessToken).toBe('');
    expect(useSettingsStore.getState().feishuRefreshToken).toBe('');
    expect(JSON.parse(localStorage.getItem('interview-assistant-settings') || '{}')).toEqual({
      aiModel: 'gpt-4.1',
      interviewSplitRatio: 0.6,
    });
  });
});
