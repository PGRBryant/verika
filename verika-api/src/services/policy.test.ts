import { describe, it, expect } from 'vitest';
import { PolicyService } from './policy.js';

describe('PolicyService', () => {
  const service = new PolicyService();

  // Simulated registry grants — mirrors seed-registry.ts
  const mystweaverGrants = [
    { capability: 'flag.evaluate', allowedCallers: ['room404-game-server'] },
    { capability: 'flag.evaluate.bulk', allowedCallers: ['room404-game-server'] },
    { capability: 'flag.write', allowedCallers: ['varunai'] },
    { capability: 'events.track', allowedCallers: ['room404-game-server'] },
    { capability: 'experiments.read', allowedCallers: ['varunai'] },
    { capability: 'audit.read', allowedCallers: ['varunai'] },
    { capability: 'metrics.read', allowedCallers: ['varunai'] },
    { capability: 'stream.subscribe', allowedCallers: ['varunai'] },
  ];

  const room404AiServiceGrants = [
    { capability: 'content.generate.flavor', allowedCallers: ['room404-game-server'] },
    { capability: 'content.generate.chaos', allowedCallers: ['room404-game-server'] },
    { capability: 'content.judge', allowedCallers: ['room404-game-server'] },
    { capability: 'content.generate.icon', allowedCallers: ['room404-game-server'] },
  ];

  const room404GameServerGrants = [
    { capability: 'session.read', allowedCallers: ['varunai'] },
    { capability: 'session.manage', allowedCallers: [] },
  ];

  describe('resolveCapabilities', () => {
    it('allows room404-game-server → mystweaver-api with correct capabilities', () => {
      const decision = service.resolveCapabilities(
        'room404-game-server',
        'mystweaver-api',
        mystweaverGrants,
      );

      expect(decision.allowed).toBe(true);
      expect(decision.capabilities).toEqual(['flag.evaluate', 'flag.evaluate.bulk', 'events.track']);
    });

    it('allows room404-game-server → room404-ai-service with content capabilities', () => {
      const decision = service.resolveCapabilities(
        'room404-game-server',
        'room404-ai-service',
        room404AiServiceGrants,
      );

      expect(decision.allowed).toBe(true);
      expect(decision.capabilities).toEqual([
        'content.generate.flavor',
        'content.generate.chaos',
        'content.judge',
        'content.generate.icon',
      ]);
    });

    it('allows varunai → mystweaver-api with its specific capabilities', () => {
      const decision = service.resolveCapabilities(
        'varunai',
        'mystweaver-api',
        mystweaverGrants,
      );

      expect(decision.allowed).toBe(true);
      // flag.evaluate is granted only to room404-game-server, not varunai,
      // so the intersection correctly excludes it
      expect(decision.capabilities).toEqual([
        'flag.write',
        'experiments.read',
        'audit.read',
        'metrics.read',
        'stream.subscribe',
      ]);
    });

    it('allows varunai → room404-game-server with session.read only', () => {
      const decision = service.resolveCapabilities(
        'varunai',
        'room404-game-server',
        room404GameServerGrants,
      );

      expect(decision.allowed).toBe(true);
      expect(decision.capabilities).toEqual(['session.read']);
    });

    it('denies room404-game-server → varunai (no canCall entry)', () => {
      const decision = service.resolveCapabilities(
        'room404-game-server',
        'varunai',
        [],
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('does not allow calls to');
    });

    it('denies mystweaver-api → room404-game-server (mystweaver has empty canCall)', () => {
      const decision = service.resolveCapabilities(
        'mystweaver-api',
        'room404-game-server',
        room404GameServerGrants,
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('does not allow calls to');
    });

    it('denies unknown caller', () => {
      const decision = service.resolveCapabilities(
        'unknown-service',
        'mystweaver-api',
        mystweaverGrants,
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('No policy for caller');
    });

    it('denies when policy allows call but target grants nothing to this caller', () => {
      // room404-game-server policy says it can call mystweaver-api,
      // but if mystweaver grants nothing to room404-game-server, intersection is empty
      const decision = service.resolveCapabilities(
        'room404-game-server',
        'mystweaver-api',
        [{ capability: 'flag.evaluate', allowedCallers: ['varunai'] }], // only varunai allowed
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('No overlapping capabilities');
    });

    it('respects wildcard allowedCallers', () => {
      const decision = service.resolveCapabilities(
        'room404-game-server',
        'mystweaver-api',
        [{ capability: 'flag.evaluate', allowedCallers: ['*'] }],
      );

      expect(decision.allowed).toBe(true);
      expect(decision.capabilities).toEqual(['flag.evaluate']);
    });

    it('filters to intersection — policy requests more than target grants', () => {
      // room404-game-server wants [flag.evaluate, flag.evaluate.bulk, events.track]
      // but target only grants flag.evaluate to this caller
      const decision = service.resolveCapabilities(
        'room404-game-server',
        'mystweaver-api',
        [{ capability: 'flag.evaluate', allowedCallers: ['room404-game-server'] }],
      );

      expect(decision.allowed).toBe(true);
      expect(decision.capabilities).toEqual(['flag.evaluate']);
    });
  });

  describe('resolveHumanRoles', () => {
    it('returns roles for room404-game-server', () => {
      const roles = service.resolveHumanRoles('room404-game-server');
      expect(roles).toEqual(['room404.presenter']);
    });

    it('returns roles for varunai including extended role', () => {
      const roles = service.resolveHumanRoles('varunai');
      // varunai.presenter extends room404.presenter, so both are included
      expect(roles).toEqual(['varunai.presenter', 'room404.presenter']);
    });

    it('returns roles for mystweaver-api', () => {
      const roles = service.resolveHumanRoles('mystweaver-api');
      expect(roles).toEqual(['mystweaver.admin', 'mystweaver.viewer']);
    });

    it('returns empty array for service with no humanRoles', () => {
      const roles = service.resolveHumanRoles('room404-ai-service');
      expect(roles).toEqual([]);
    });

    it('returns empty array for unknown service', () => {
      const roles = service.resolveHumanRoles('nonexistent');
      expect(roles).toEqual([]);
    });
  });

  describe('getPolicy', () => {
    it('returns policy for known service', () => {
      const policy = service.getPolicy('room404-game-server');
      expect(policy).toBeDefined();
      expect(policy!.service).toBe('room404-game-server');
      expect(policy!.canCall).toHaveLength(2);
    });

    it('returns undefined for unknown service', () => {
      expect(service.getPolicy('nonexistent')).toBeUndefined();
    });
  });
});
