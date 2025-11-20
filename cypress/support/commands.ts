/// <reference types="cypress" />

// Custom command for login
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.visit('/');
  cy.get('input[type="email"]').type(email);
  cy.get('input[type="password"]').type(password);
  cy.get('button[type="submit"]').click();
  cy.url().should('include', '/dashboard');
});

// Example: Override console.error to catch React errors
Cypress.on('window:before:load', (win) => {
  const originalError = win.console.error;
  win.console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning:') || args[0].includes('React'))
    ) {
      throw new Error(`Console Error: ${args[0]}`);
    }
    originalError(...args);
  };
});
