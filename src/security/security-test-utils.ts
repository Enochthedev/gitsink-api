/**
 * Security Test Utilities
 * Helper functions and constants for security testing
 */

export const SQL_INJECTION_PAYLOADS = [
  "'; DROP TABLE users; --",
  "' OR '1'='1",
  "' UNION SELECT * FROM users --",
  "'; INSERT INTO users (email) VALUES ('hacker@evil.com'); --",
  "' OR 1=1 --",
  "admin'--",
  "admin'/*",
  "' OR 'x'='x",
  "'; EXEC xp_cmdshell('dir'); --",
  "' AND (SELECT COUNT(*) FROM users) > 0 --",
  "' UNION SELECT username, password FROM users --",
  "'; UPDATE users SET password='hacked' WHERE id=1; --",
];

export const XSS_PAYLOADS = [
  '<script>alert("XSS")</script>',
  '<img src="x" onerror="alert(1)">',
  'javascript:alert("XSS")',
  '<svg onload="alert(1)">',
  '<iframe src="javascript:alert(1)"></iframe>',
  '"><script>alert("XSS")</script>',
  "'; alert('XSS'); //",
  '<body onload="alert(1)">',
  '<object data="javascript:alert(1)">',
  '<embed src="javascript:alert(1)">',
  '<link rel="stylesheet" href="javascript:alert(1)">',
  '<style>@import "javascript:alert(1)";</style>',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<form><button formaction="javascript:alert(1)">Click</button></form>',
];

export const NOSQL_INJECTION_PAYLOADS = [
  { $ne: null },
  { $gt: '' },
  { $regex: '.*' },
  { $where: 'this.password.length > 0' },
  { $or: [{ email: 'admin' }, { role: 'admin' }] },
  { $and: [{ $gt: '' }, { $lt: 'zzz' }] },
  { $exists: true },
  { $in: ['admin', 'root', 'administrator'] },
  { $nin: [] },
  { $size: 0 },
];

export const PATH_TRAVERSAL_PAYLOADS = [
  '../../../etc/passwd',
  '..\\..\\..\\windows\\system32\\config\\sam',
  '/etc/passwd',
  'C:\\Windows\\System32\\config\\SAM',
  '....//....//....//etc/passwd',
  '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
  '..%2F..%2F..%2Fetc%2Fpasswd',
  '..%252f..%252f..%252fetc%252fpasswd',
  '..\\..\\..\\etc\\passwd',
  '/var/www/../../etc/passwd',
];

export const REGEX_BOMB_PAYLOADS = [
  'a'.repeat(10000) + '!',
  '(a+)+$',
  '([a-zA-Z]+)*$',
  '(a|a)*$',
  '(a|b)*aaac',
  '(a+)+b',
  '([a-zA-Z]+)*c',
  '(a*)*b',
  '(a+a+)+b',
  '([a-z]*)*A',
];

export const MALICIOUS_USER_AGENTS = [
  'sqlmap/1.0',
  'Nikto/2.1.6',
  'Mozilla/5.0 (compatible; Nmap Scripting Engine)',
  'w3af.org',
  'Burp Suite Professional',
  'OWASP ZAP',
  'Acunetix',
  'Nessus',
  'OpenVAS',
  'Metasploit',
];

export const MALICIOUS_ORIGINS = [
  'http://evil.com',
  'https://malicious-site.com',
  'http://localhost:3000.evil.com',
  'https://gitsink.com.evil.com',
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'file:///etc/passwd',
  'ftp://malicious.com',
];

export const OVERSIZED_INPUTS = {
  title: 'x'.repeat(10000),
  description: 'x'.repeat(100000),
  tags: Array.from({ length: 1000 }, (_, i) => `tag${i}`),
  repoUrl: `https://github.com/user/${'x'.repeat(1000)}`,
  email: `${'x'.repeat(1000)}@example.com`,
  username: 'x'.repeat(1000),
  bio: 'x'.repeat(50000),
};

export const MALICIOUS_FILE_TYPES = [
  {
    filename: '../../../etc/passwd',
    content: 'root:x:0:0:root:/root:/bin/bash',
    mimeType: 'text/plain',
  },
  {
    filename: 'malicious.php',
    content: '<?php system($_GET["cmd"]); ?>',
    mimeType: 'application/x-php',
  },
  {
    filename: 'script.js',
    content: 'alert("XSS")',
    mimeType: 'application/javascript',
  },
  {
    filename: 'virus.exe',
    content: 'MZ\x90\x00',
    mimeType: 'application/x-msdownload',
  },
  {
    filename: 'shell.jsp',
    content: '<%@ page import="java.io.*" %>',
    mimeType: 'application/x-jsp',
  },
  {
    filename: 'backdoor.asp',
    content: '<%eval request("cmd")%>',
    mimeType: 'application/x-asp',
  },
  {
    filename: 'large-file.txt',
    content: 'x'.repeat(10 * 1024 * 1024),
    mimeType: 'text/plain',
  },
];

export const INVALID_JWT_TOKENS = [
  'invalid-token',
  'Bearer invalid-token',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
  '',
  'null',
  'undefined',
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid',
];

export const INVALID_API_KEYS = [
  'short',
  'x'.repeat(100),
  'invalid-chars-!@#$%^&*()',
  '',
  'null',
  'undefined',
  '12345',
  'api-key-with-spaces ',
  'api_key_with_underscores',
];

export interface SecurityTestConfig {
  maxRequestsPerMinute: number;
  maxPayloadSize: number;
  maxFileSize: number;
  allowedFileTypes: string[];
  blockedUserAgents: string[];
  trustedOrigins: string[];
  sessionTimeout: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
}

export const DEFAULT_SECURITY_CONFIG: SecurityTestConfig = {
  maxRequestsPerMinute: 100,
  maxPayloadSize: 1024 * 1024, // 1MB
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'text/plain', 'application/pdf'],
  blockedUserAgents: MALICIOUS_USER_AGENTS,
  trustedOrigins: ['http://localhost:3000', 'https://gitsink.com'],
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  maxLoginAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes
};

export class SecurityTestHelper {
  static generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static generateRandomEmail(): string {
    return `${this.generateRandomString(10)}@${this.generateRandomString(8)}.com`;
  }

  static generateRandomIP(): string {
    return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  }

  static generateMaliciousPayload(type: 'sql' | 'xss' | 'nosql' | 'path' | 'regex'): any {
    switch (type) {
      case 'sql':
        return SQL_INJECTION_PAYLOADS[Math.floor(Math.random() * SQL_INJECTION_PAYLOADS.length)];
      case 'xss':
        return XSS_PAYLOADS[Math.floor(Math.random() * XSS_PAYLOADS.length)];
      case 'nosql':
        return NOSQL_INJECTION_PAYLOADS[
          Math.floor(Math.random() * NOSQL_INJECTION_PAYLOADS.length)
        ];
      case 'path':
        return PATH_TRAVERSAL_PAYLOADS[Math.floor(Math.random() * PATH_TRAVERSAL_PAYLOADS.length)];
      case 'regex':
        return REGEX_BOMB_PAYLOADS[Math.floor(Math.random() * REGEX_BOMB_PAYLOADS.length)];
      default:
        return 'malicious-payload';
    }
  }

  static createBruteForceAttempts(count: number, baseValue: string): string[] {
    return Array.from({ length: count }, (_, i) => `${baseValue}-${i.toString().padStart(6, '0')}`);
  }

  static measureResponseTime(fn: () => Promise<any>): Promise<{ result: any; duration: number }> {
    const startTime = Date.now();
    return fn().then(result => ({
      result,
      duration: Date.now() - startTime,
    }));
  }

  static async testRateLimit(
    requestFn: () => Promise<any>,
    maxRequests: number,
    timeWindow: number = 60000,
  ): Promise<{
    totalRequests: number;
    rateLimitedRequests: number;
    averageResponseTime: number;
  }> {
    const requests = Array.from({ length: maxRequests }, () => requestFn());
    const startTime = Date.now();

    const responses = await Promise.all(requests);
    const endTime = Date.now();

    const rateLimitedRequests = responses.filter(res => res.status === 429).length;
    const averageResponseTime = (endTime - startTime) / maxRequests;

    return {
      totalRequests: maxRequests,
      rateLimitedRequests,
      averageResponseTime,
    };
  }

  static validateSecurityHeaders(headers: Record<string, string>): {
    valid: boolean;
    missing: string[];
    present: string[];
  } {
    const requiredHeaders = [
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection',
      'strict-transport-security',
      'content-security-policy',
    ];

    const present = requiredHeaders.filter(header => headers[header]);
    const missing = requiredHeaders.filter(header => !headers[header]);

    return {
      valid: missing.length === 0,
      missing,
      present,
    };
  }

  static sanitizeForLog(data: any): any {
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential'];

    if (typeof data === 'string') {
      return data.length > 100 ? `${data.substring(0, 100)}...` : data;
    }

    if (typeof data === 'object' && data !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeForLog(value);
        }
      }
      return sanitized;
    }

    return data;
  }

  static createSecurityTestReport(results: any[]): {
    summary: {
      totalTests: number;
      passed: number;
      failed: number;
      vulnerabilities: number;
    };
    vulnerabilities: any[];
    recommendations: string[];
  } {
    const totalTests = results.length;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const vulnerabilities = results.filter(r => r.vulnerability).length;

    const recommendations = [
      'Implement proper input validation and sanitization',
      'Use parameterized queries to prevent SQL injection',
      'Implement proper authentication and authorization',
      'Add rate limiting to prevent brute force attacks',
      'Use HTTPS for all communications',
      'Implement proper session management',
      'Add security headers to all responses',
      'Regularly update dependencies to patch vulnerabilities',
      'Implement proper error handling to prevent information disclosure',
      'Use Content Security Policy (CSP) to prevent XSS attacks',
    ];

    return {
      summary: {
        totalTests,
        passed,
        failed,
        vulnerabilities,
      },
      vulnerabilities: results.filter(r => r.vulnerability),
      recommendations,
    };
  }
}

export default SecurityTestHelper;
