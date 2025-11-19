interface LogoProps {
  className?: string;
  variant?: 'full' | 'horizontal';
}

export function Logo({ className = "w-32 h-10", variant = 'full' }: LogoProps) {
  // Logo para páginas de autenticação - logo_quizmed.png
  if (variant === 'full') {
    return (
      <img
        src="/logo_quizmed.png"
        alt="QuizMed"
        className={className}
      />
    );
  }

  // Logo horizontal para navbar - logo_horizontal.png
  return (
    <img
      src="/logo_horizontal.png"
      alt="QuizMed"
      className={className}
    />
  );
}
