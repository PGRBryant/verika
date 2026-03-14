import { describe, it, expect } from 'vitest';
import {
  FLAG_EVALUATE,
  FLAG_WRITE,
  CONTENT_GENERATE_FLAVOR,
  METRICS_READ,
  STREAM_SUBSCRIBE,
  SESSION_READ,
  IDENTITY_TOKEN_ISSUE,
  REGISTRY_READ,
  AllCapabilities,
  FlagCapabilities,
  ContentCapabilities,
} from './capabilities.js';

describe('Capabilities', () => {
  it('individual constants have correct values', () => {
    expect(FLAG_EVALUATE).toBe('flag.evaluate');
    expect(FLAG_WRITE).toBe('flag.write');
    expect(CONTENT_GENERATE_FLAVOR).toBe('content.generate.flavor');
    expect(METRICS_READ).toBe('metrics.read');
    expect(STREAM_SUBSCRIBE).toBe('stream.subscribe');
    expect(SESSION_READ).toBe('session.read');
    expect(IDENTITY_TOKEN_ISSUE).toBe('identity.token.issue');
    expect(REGISTRY_READ).toBe('registry.read');
  });

  it('grouped objects match individual constants', () => {
    expect(FlagCapabilities.EVALUATE).toBe(FLAG_EVALUATE);
    expect(FlagCapabilities.WRITE).toBe(FLAG_WRITE);
    expect(ContentCapabilities.GENERATE_FLAVOR).toBe(CONTENT_GENERATE_FLAVOR);
  });

  it('AllCapabilities contains all domain groups', () => {
    expect(Object.keys(AllCapabilities)).toEqual([
      'Flag', 'Events', 'Content', 'Experiments', 'Audit',
      'Metrics', 'Stream', 'Session', 'Identity', 'Registry',
    ]);
  });
});
