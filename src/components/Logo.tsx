interface LogoProps {
  className?: string;
  variant?: 'full' | 'icon';
}

export function Logo({ className = "w-32 h-10", variant = 'full' }: LogoProps) {
  if (variant === 'icon') {
    return (
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        {/* Medical Cross/Symbol */}
        <circle cx="20" cy="20" r="18" fill="url(#gradient-icon)" opacity="0.2"/>
        <g transform="translate(20, 20)">
          {/* Medical Cross */}
          <rect x="-2" y="-10" width="4" height="20" rx="1" fill="url(#gradient-icon)"/>
          <rect x="-10" y="-2" width="20" height="4" rx="1" fill="url(#gradient-icon)"/>
          {/* Small circles at ends */}
          <circle cx="0" cy="-10" r="2.5" fill="#7CB342"/>
          <circle cx="0" cy="10" r="2.5" fill="#7CB342"/>
          <circle cx="-10" cy="0" r="2.5" fill="#0891B2"/>
          <circle cx="10" cy="0" r="2.5" fill="#0891B2"/>
        </g>
        <defs>
          <linearGradient id="gradient-icon" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0891B2"/>
            <stop offset="100%" stopColor="#7CB342"/>
          </linearGradient>
        </defs>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 160 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Icon Part - Medical Symbol */}
      <g>
        <circle cx="20" cy="20" r="18" fill="url(#gradient)" opacity="0.15"/>
        <g transform="translate(20, 20)">
          {/* Medical Cross */}
          <rect x="-1.5" y="-8" width="3" height="16" rx="1" fill="url(#gradient)"/>
          <rect x="-8" y="-1.5" width="16" height="3" rx="1" fill="url(#gradient)"/>
          {/* Dots at corners */}
          <circle cx="0" cy="-8" r="2" fill="#7CB342"/>
          <circle cx="0" cy="8" r="2" fill="#7CB342"/>
          <circle cx="-8" cy="0" r="2" fill="#0891B2"/>
          <circle cx="8" cy="0" r="2" fill="#0891B2"/>
        </g>
      </g>

      {/* Text Part - QuizMed */}
      <text
        x="45"
        y="27"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="20"
        fontWeight="700"
        fill="#2B3E6F"
      >
        Quiz
      </text>
      <text
        x="85"
        y="27"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="20"
        fontWeight="700"
        fill="url(#gradient)"
      >
        Med
      </text>

      {/* Gradient Definition */}
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0891B2"/>
          <stop offset="100%" stopColor="#7CB342"/>
        </linearGradient>
      </defs>
    </svg>
  );
}
