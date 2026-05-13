/**
 * NeoZip Token Service authentication tests
 * 
 * Unit tests for the authentication and calendar discovery functionality.
 */

import {
  TokenServiceClient,
  CalendarManager,
  type CalendarConfig,
} from '../../src/token-service';

// =============================================================================
// TokenServiceClient Tests
// =============================================================================

describe('TokenServiceClient', () => {
  describe('constructor', () => {
    it('should use default server URL', () => {
      const client = new TokenServiceClient();
      expect(client.getServerUrl()).toBe('https://testnet.token-service.neozip.io');
    });

    it('should use custom server URL', () => {
      const client = new TokenServiceClient({ serverUrl: 'https://custom.server.com' });
      expect(client.getServerUrl()).toBe('https://custom.server.com');
    });

  });

  describe('authentication types', () => {
    it('should export auth request/response types', () => {
      const tokenService = require('../../src/token-service');
      expect(tokenService.TokenServiceClient).toBeDefined();
      expect(tokenService.registerEmail).toBeDefined();
      expect(tokenService.verifyEmailCode).toBeDefined();
    });
  });

  describe('calendar discovery types', () => {
    it('should export calendar-related module (types are compile-time only)', () => {
      const tokenService = require('../../src/token-service');
      expect(tokenService.TokenServiceClient).toBeDefined();
      expect(tokenService.CalendarManager).toBeDefined();
      expect(tokenService.getCalendarIdentity).toBeDefined();
      expect(tokenService.checkCalendarHealth).toBeDefined();
    });
  });
});

// =============================================================================
// CalendarManager Tests
// =============================================================================

describe('CalendarManager', () => {
  const testCalendars: CalendarConfig[] = [
    { url: 'https://alpha.test.com', priority: 1 },
    { url: 'https://beta.test.com', priority: 2 },
    { url: 'https://gamma.test.com', priority: 3 },
  ];

  describe('constructor', () => {
    it('should initialize with empty calendars', () => {
      const manager = new CalendarManager();
      expect(manager.count).toBe(0);
      expect(manager.getCalendars()).toEqual([]);
    });

    it('should initialize with provided calendars', () => {
      const manager = new CalendarManager(testCalendars);
      expect(manager.count).toBe(3);
    });

    it('should sort calendars by priority', () => {
      const unsorted: CalendarConfig[] = [
        { url: 'https://c.com', priority: 3 },
        { url: 'https://a.com', priority: 1 },
        { url: 'https://b.com', priority: 2 },
      ];
      const manager = new CalendarManager(unsorted);
      const sorted = manager.getCalendars();
      
      expect(sorted[0].url).toBe('https://a.com');
      expect(sorted[1].url).toBe('https://b.com');
      expect(sorted[2].url).toBe('https://c.com');
    });
  });

  describe('addCalendar', () => {
    it('should add a calendar', () => {
      const manager = new CalendarManager();
      manager.addCalendar({ url: 'https://new.com', priority: 1 });
      expect(manager.count).toBe(1);
    });

    it('should reject duplicate URLs', () => {
      const manager = new CalendarManager([{ url: 'https://existing.com' }]);
      expect(() => {
        manager.addCalendar({ url: 'https://existing.com' });
      }).toThrow('Calendar already exists');
    });

    it('should maintain priority order after adding', () => {
      const manager = new CalendarManager([
        { url: 'https://a.com', priority: 1 },
        { url: 'https://c.com', priority: 3 },
      ]);
      manager.addCalendar({ url: 'https://b.com', priority: 2 });
      
      const calendars = manager.getCalendars();
      expect(calendars[1].url).toBe('https://b.com');
    });
  });

  describe('removeCalendar', () => {
    it('should remove a calendar', () => {
      const manager = new CalendarManager(testCalendars);
      const removed = manager.removeCalendar('https://beta.test.com');
      
      expect(removed).toBe(true);
      expect(manager.count).toBe(2);
    });

    it('should return false for non-existent calendar', () => {
      const manager = new CalendarManager(testCalendars);
      const removed = manager.removeCalendar('https://nonexistent.com');
      
      expect(removed).toBe(false);
      expect(manager.count).toBe(3);
    });
  });

  describe('getHealthyCalendars', () => {
    it('should return all calendars when none checked', () => {
      const manager = new CalendarManager(testCalendars);
      const healthy = manager.getHealthyCalendars();
      
      // All calendars assumed healthy until checked
      expect(healthy.length).toBe(3);
    });
  });

  describe('getClient', () => {
    it('should return client for configured calendar', () => {
      const manager = new CalendarManager(testCalendars);
      const client = manager.getClient('https://alpha.test.com');
      
      expect(client).toBeInstanceOf(TokenServiceClient);
      expect(client.getServerUrl()).toBe('https://alpha.test.com');
    });

    it('should throw for non-configured calendar', () => {
      const manager = new CalendarManager(testCalendars);
      
      expect(() => {
        manager.getClient('https://nonexistent.com');
      }).toThrow('Calendar not configured');
    });
  });

  describe('getBestClient', () => {
    it('should return client for highest priority healthy calendar', () => {
      const manager = new CalendarManager(testCalendars);
      const client = manager.getBestClient();
      
      expect(client).not.toBeNull();
      expect(client!.getServerUrl()).toBe('https://alpha.test.com');
    });

    it('should return null when no calendars configured', () => {
      const manager = new CalendarManager();
      const client = manager.getBestClient();
      
      expect(client).toBeNull();
    });
  });

  describe('clearCache', () => {
    it('should clear status cache', () => {
      const manager = new CalendarManager(testCalendars);
      
      // Manually set a status
      (manager as any).statusCache.set('https://alpha.test.com', {
        url: 'https://alpha.test.com',
        available: true,
        lastChecked: new Date(),
      });
      
      expect(manager.getStatus('https://alpha.test.com')).toBeDefined();
      
      manager.clearCache();
      
      expect(manager.getStatus('https://alpha.test.com')).toBeUndefined();
    });
  });
});

// =============================================================================
// Integration with existing exports
// =============================================================================

describe('Module Exports', () => {
  it('should export all expected functions', () => {
    const tokenService = require('../../src/token-service');
    
    // Core functions
    expect(tokenService.submitDigest).toBeDefined();
    expect(tokenService.verifyDigest).toBeDefined();
    expect(tokenService.pollForConfirmation).toBeDefined();
    
    // Auth functions
    expect(tokenService.registerEmail).toBeDefined();
    expect(tokenService.verifyEmailCode).toBeDefined();
    
    // Calendar functions
    expect(tokenService.getCalendarIdentity).toBeDefined();
    expect(tokenService.checkCalendarHealth).toBeDefined();
    
    // Classes
    expect(tokenService.TokenServiceClient).toBeDefined();
    expect(tokenService.CalendarManager).toBeDefined();
  });

  it('should export metadata constants', () => {
    const tokenService = require('../../src/token-service');
    
    expect(tokenService.SUBMIT_METADATA).toBeDefined();
    expect(tokenService.TIMESTAMP_METADATA).toBeDefined();
    expect(tokenService.NFT_METADATA).toBeDefined();
  });
});
