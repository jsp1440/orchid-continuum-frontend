import { describe, expect, it } from 'vitest';
import { retryTransientGitHubRead } from '../scripts/oc-dispatch-runtime';

function githubFailure(code: number) {
  return Object.assign(new Error(`gh exited with ${code}`), { stderr: `gh: HTTP ${code}\n` });
}

describe('read-only GitHub API gateway retry', () => {
  it('recovers a transient 504 on a later paginated GET without dropping the page', () => {
    let calls = 0;
    const waits: number[] = [];
    const page = [{ number: 701 }, { number: 702 }];
    const result = retryTransientGitHubRead('GET', () => {
      calls++;
      if (calls === 1) throw githubFailure(504);
      return page;
    }, ms => waits.push(ms));
    expect(result).toEqual(page);
    expect(calls).toBe(2);
    expect(waits).toEqual([1000]);
  });

  it('retries 502 and 503 only twice with bounded backoff', () => {
    const codes = [502, 503];
    const waits: number[] = [];
    let calls = 0;
    const value = retryTransientGitHubRead('GET', () => {
      calls++;
      if (codes.length) throw githubFailure(codes.shift()!);
      return { complete: true };
    }, ms => waits.push(ms));
    expect(value).toEqual({ complete: true });
    expect(calls).toBe(3);
    expect(waits).toEqual([1000, 2000]);
  });

  it('fails closed if the third GET also returns 504', () => {
    let calls = 0;
    const waits: number[] = [];
    expect(() => retryTransientGitHubRead('GET', () => {
      calls++;
      throw githubFailure(504);
    }, ms => waits.push(ms))).toThrow('gh exited with 504');
    expect(calls).toBe(3);
    expect(waits).toEqual([1000, 2000]);
  });

  it.each([403, 404, 429])('does not retry a non-gateway HTTP %s result', code => {
    let calls = 0;
    expect(() => retryTransientGitHubRead('GET', () => {
      calls++;
      throw githubFailure(code);
    }, () => { throw new Error('unexpected pause'); })).toThrow(`gh exited with ${code}`);
    expect(calls).toBe(1);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('never retries a %s mutation with unknown commit outcome', method => {
    let calls = 0;
    expect(() => retryTransientGitHubRead(method, () => {
      calls++;
      throw githubFailure(504);
    }, () => { throw new Error('unexpected pause'); })).toThrow('gh exited with 504');
    expect(calls).toBe(1);
  });

  it('does not interpret stdout or unrelated failures as retryable HTTP errors', () => {
    let calls = 0;
    const notGateway = Object.assign(new Error('bad JSON'), { stdout: 'HTTP 504', stderr: '' });
    expect(() => retryTransientGitHubRead('GET', () => {
      calls++;
      throw notGateway;
    }, () => { throw new Error('unexpected pause'); })).toThrow('bad JSON');
    expect(calls).toBe(1);
  });
});
