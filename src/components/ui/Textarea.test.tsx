import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('adjusts height to match scrollHeight when autoResize is enabled', () => {
    render(<Textarea aria-label="自适应文本框" autoResize value={'第一行'} onChange={() => {}} />);

    const textarea = screen.getByLabelText('自适应文本框') as HTMLTextAreaElement;

    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      value: 168,
    });

    fireEvent.change(textarea, {
      target: { value: '第一行\n第二行\n第三行' },
    });

    expect(textarea.style.height).toBe('168px');
  });
});
