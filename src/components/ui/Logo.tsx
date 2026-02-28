import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

/**
 * Interview Assistant Logo
 * Design: A document with a checkmark, representing interview evaluation
 */
export const Logo: React.FC<LogoProps> = ({ className = '', size = 32 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background circle */}
      <circle cx="16" cy="16" r="15" fill="url(#gradient)" />

      {/* Document shape */}
      <path
        d="M10 8C10 7.44772 10.4477 7 11 7H21C21.5523 7 22 7.44772 22 8V24C22 24.5523 21.5523 25 21 25H11C10.4477 25 10 24.5523 10 24V8Z"
        fill="white"
        fillOpacity="0.95"
      />

      {/* Document lines */}
      <rect x="12" y="11" width="8" height="2" rx="0.5" fill="#3B82F6" />
      <rect x="12" y="15" width="6" height="1.5" rx="0.5" fill="#93C5FD" />
      <rect x="12" y="18" width="7" height="1.5" rx="0.5" fill="#93C5FD" />

      {/* Checkmark circle */}
      <circle cx="21" cy="22" r="5" fill="#10B981" />

      {/* Checkmark */}
      <path
        d="M18.5 22L20.5 24L23.5 20"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Gradient definition */}
      <defs>
        <linearGradient id="gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
    </svg>
  );
};
