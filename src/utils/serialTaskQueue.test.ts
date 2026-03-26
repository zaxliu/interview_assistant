import { describe, expect, it } from 'vitest';
import { enqueueSerialTask } from './serialTaskQueue';

describe('enqueueSerialTask', () => {
  it('runs tasks one by one in submission order', async () => {
    const events: string[] = [];

    const first = enqueueSerialTask(async () => {
      events.push('first-start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      events.push('first-end');
      return 'first';
    });

    const second = enqueueSerialTask(async () => {
      events.push('second-start');
      events.push('second-end');
      return 'second';
    });

    await Promise.all([first, second]);

    expect(events).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
  });

  it('continues with later tasks after a failure', async () => {
    const events: string[] = [];

    await expect(
      enqueueSerialTask(async () => {
        events.push('first');
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    await enqueueSerialTask(async () => {
      events.push('second');
    });

    expect(events).toEqual(['first', 'second']);
  });
});
