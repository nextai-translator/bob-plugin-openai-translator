import { describe, expect, it } from 'bun:test';
import {
  formatDevelopmentVersion,
  validateReleaseVersion,
} from '../package.mts';

describe('development package version', () => {
  it('uses an installable build suffix without changing the release line', () => {
    expect(formatDevelopmentVersion('1.2.3', 123)).toBe('1.2.3dev123');
  });
});

describe('release version validation', () => {
  it('allows a CI-owned version advance and idempotent reruns', () => {
    expect(() =>
      validateReleaseVersion('5.0.0', '4.3.4', ['4.3.4']),
    ).not.toThrow();
    expect(() =>
      validateReleaseVersion('5.0.0', '5.0.0', ['4.3.4']),
    ).not.toThrow();
    expect(() =>
      validateReleaseVersion('5.0.0', '5.0.0', ['5.0.0']),
    ).not.toThrow();
  });

  it('rejects a downgrade from the project version', () => {
    expect(() => validateReleaseVersion('4.3.5', '5.0.0', ['4.3.4'])).toThrow(
      'older than project version',
    );
  });

  it('rejects a downgrade from a released version', () => {
    expect(() => validateReleaseVersion('5.0.0', '5.0.0', ['5.0.1'])).toThrow(
      'older than latest Appcast version',
    );
  });

  it('rejects non-canonical stable versions', () => {
    expect(() => validateReleaseVersion('05.0.0', '5.0.0', ['4.3.4'])).toThrow(
      'Invalid semantic version',
    );
  });
});
