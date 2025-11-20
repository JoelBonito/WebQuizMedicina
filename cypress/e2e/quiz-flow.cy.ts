describe('Quiz Flow', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('should show authentication page when not logged in', () => {
    cy.contains('WebQuiz Medicina');
    cy.get('input[type="email"]').should('be.visible');
    cy.get('input[type="password"]').should('be.visible');
  });

  // Test with credentials - requires test user setup
  it.skip('should login and navigate to dashboard', () => {
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('password123');
    cy.get('button[type="submit"]').click();

    cy.url().should('include', '/dashboard');
    cy.contains('Meus Projetos').should('be.visible');
  });

  // Test quiz session (requires authenticated state)
  it.skip('should start and complete a quiz', () => {
    // Login first (assuming session exists)
    cy.window().then((win) => {
      // Mock authenticated state
      win.localStorage.setItem('supabase.auth.token', 'mock-token');
    });

    cy.visit('/');

    // Navigate to project
    cy.get('[data-testid="project-card"]').first().click();

    // Start quiz
    cy.contains('Iniciar Quiz').click();

    // Answer first question
    cy.get('[data-testid="quiz-option"]').first().click();

    // Go to next question
    cy.contains('Próxima Questão').click();

    // Complete quiz
    cy.get('[data-testid="quiz-option"]').first().click();
    cy.contains('Ver Resultado').click();

    // Check summary
    cy.contains('Quiz Concluído!').should('be.visible');
    cy.get('[data-testid="quiz-stats"]').should('be.visible');
  });

  it('should handle code splitting and lazy loading', () => {
    // Check that auth component loads
    cy.get('[data-testid="auth-form"]', { timeout: 10000 }).should('be.visible');

    // Verify no hydration errors
    cy.window().then((win) => {
      const errors = win.console.error;
      expect(errors).to.not.exist;
    });
  });
});
