import React, { useRef, useEffect, useCallback } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  autoResize?: boolean;
}

export const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  autoResize = false,
  className = '',
  id,
  value,
  onChange,
  ...props
}) => {
  const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea && autoResize) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [autoResize]);

  // Adjust height on mount and when value changes
  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (autoResize) {
      adjustHeight();
    }
    onChange?.(e);
  };

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={textareaId}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label}
        </label>
      )}
      <textarea
        ref={textareaRef}
        id={textareaId}
        value={value}
        onChange={handleChange}
        className={`
          w-full px-3 py-2 text-sm border rounded-md shadow-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          disabled:bg-gray-100 disabled:cursor-not-allowed
          ${autoResize ? 'resize-none overflow-hidden' : 'resize-y min-h-[80px]'}
          ${error ? 'border-red-500' : 'border-gray-300'}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};
