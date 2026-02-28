import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { StateDatabase } from '../src/database/state.js';
import type { RunRecord, UsageRecord, ActivityRecord } from '../src/database/state.js';

let tempDir: string;
let db: StateDatabase;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'openclaw-db-'));
  db = new StateDatabase(join(tempDir, 'test.db'));
});

afterEach(() => {
  db.close();
});

describe('StateDatabase', () => {
  it('creates tables on initialization', () => {
    // If we got here without error, tables were created
    expect(db).toBeInstanceOf(StateDatabase);
  });

  describe('runs', () => {
    const run: RunRecord = {
      id: 'run-1',
      jobId: 'job-1',
      jobTitle: 'Daily Digest',
      agentId: 'researcher',
      agentName: 'Researcher',
      startedAt: '2026-02-27T08:00:00Z',
      completedAt: null,
      durationSeconds: null,
      status: 'running',
      tokensUsed: null,
      costUsd: null,
      error: null,
    };

    it('inserts and retrieves a run', () => {
      db.runs.insert(run);
      const retrieved = db.runs.get('run-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe('run-1');
      expect(retrieved!.jobId).toBe('job-1');
      expect(retrieved!.status).toBe('running');
    });

    it('completes a run', () => {
      db.runs.insert(run);
      db.runs.complete('run-1', {
        status: 'success',
        durationSeconds: 120,
        tokensUsed: 5000,
        costUsd: 0.05,
      });

      const completed = db.runs.get('run-1');
      expect(completed!.status).toBe('success');
      expect(completed!.durationSeconds).toBe(120);
      expect(completed!.tokensUsed).toBe(5000);
      expect(completed!.costUsd).toBe(0.05);
    });

    it('lists recent runs', () => {
      db.runs.insert(run);
      db.runs.insert({ ...run, id: 'run-2', startedAt: '2026-02-27T09:00:00Z' });

      const recent = db.runs.listRecent(10);
      expect(recent).toHaveLength(2);
      expect(recent[0].id).toBe('run-2'); // Most recent first
    });

    it('lists runs for a job', () => {
      db.runs.insert(run);
      db.runs.insert({ ...run, id: 'run-2', jobId: 'job-2' });

      const forJob = db.runs.listForJob('job-1');
      expect(forJob).toHaveLength(1);
      expect(forJob[0].jobId).toBe('job-1');
    });

    it('lists runs for an agent', () => {
      db.runs.insert(run);
      db.runs.insert({ ...run, id: 'run-2', agentId: 'other' });

      const forAgent = db.runs.listForAgent('researcher');
      expect(forAgent).toHaveLength(1);
    });

    it('returns null for nonexistent run', () => {
      expect(db.runs.get('nonexistent')).toBeNull();
    });
  });

  describe('usage', () => {
    const usage: UsageRecord = {
      id: 'usage-1',
      date: '2026-02-27',
      agentId: 'researcher',
      agentName: 'Researcher',
      model: 'claude-sonnet-4-5',
      tokensInput: 1000,
      tokensOutput: 500,
      tokensTotal: 1500,
      costUsd: 0.015,
    };

    it('inserts and queries usage by date range', () => {
      db.usage.upsert(usage);

      const records = db.usage.getByDateRange('2026-02-01', '2026-02-28');
      expect(records).toHaveLength(1);
      expect(records[0].agentId).toBe('researcher');
    });

    it('upserts (accumulates) on conflict', () => {
      db.usage.upsert(usage);
      db.usage.upsert({ ...usage, id: 'usage-2', tokensInput: 200, tokensOutput: 100, tokensTotal: 300, costUsd: 0.003 });

      const records = db.usage.getByDateRange('2026-02-27', '2026-02-27');
      expect(records).toHaveLength(1);
      expect(records[0].tokensTotal).toBe(1800); // 1500 + 300
      expect(records[0].costUsd).toBeCloseTo(0.018);
    });

    it('gets totals for a date range', () => {
      db.usage.upsert(usage);
      db.usage.upsert({
        ...usage,
        id: 'usage-2',
        date: '2026-02-26',
        agentId: 'planner',
        tokensTotal: 2000,
        costUsd: 0.02,
      });

      const totals = db.usage.getTotals('2026-02-26', '2026-02-27');
      expect(totals.tokensTotal).toBe(3500);
      expect(totals.costUsd).toBeCloseTo(0.035);
    });

    it('gets per-agent totals', () => {
      db.usage.upsert(usage);
      db.usage.upsert({
        ...usage,
        id: 'usage-2',
        date: '2026-02-26',
        agentId: 'planner',
        agentName: 'Planner',
        tokensTotal: 2000,
        costUsd: 0.02,
      });

      const perAgent = db.usage.getPerAgentTotals('2026-02-26', '2026-02-27');
      expect(perAgent).toHaveLength(2);
      // Ordered by costUsd DESC
      expect(perAgent[0].agentId).toBe('planner');
    });

    it('gets usage by agent', () => {
      db.usage.upsert(usage);
      db.usage.upsert({
        ...usage,
        id: 'usage-2',
        date: '2026-02-26',
        agentId: 'other',
      });

      const forAgent = db.usage.getByAgent('researcher');
      expect(forAgent).toHaveLength(1);
    });
  });

  describe('activity', () => {
    const activity: ActivityRecord = {
      id: 'act-1',
      agentId: 'researcher',
      agentName: 'Researcher',
      eventType: 'run_completed',
      summary: 'Daily digest completed',
      detail: 'Processed 50 items',
      timestamp: '2026-02-27T08:05:00Z',
      tokensUsed: 3000,
      costUsd: 0.03,
      rawLog: null,
    };

    it('inserts and lists recent activity', () => {
      db.activity.insert(activity);
      db.activity.insert({
        ...activity,
        id: 'act-2',
        timestamp: '2026-02-27T09:00:00Z',
        summary: 'Another event',
      });

      const recent = db.activity.listRecent(10);
      expect(recent).toHaveLength(2);
      expect(recent[0].id).toBe('act-2'); // Most recent first
    });

    it('lists activity for an agent', () => {
      db.activity.insert(activity);
      db.activity.insert({ ...activity, id: 'act-2', agentId: 'other' });

      const forAgent = db.activity.listForAgent('researcher');
      expect(forAgent).toHaveLength(1);
    });

    it('lists activity by type', () => {
      db.activity.insert(activity);
      db.activity.insert({ ...activity, id: 'act-2', eventType: 'error' });

      const byType = db.activity.listByType('run_completed');
      expect(byType).toHaveLength(1);
    });

    it('searches activity by text', () => {
      db.activity.insert(activity);
      db.activity.insert({
        ...activity,
        id: 'act-2',
        summary: 'Error occurred',
        detail: 'Connection timeout',
      });

      const results = db.activity.search('digest');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('act-1');

      const results2 = db.activity.search('timeout');
      expect(results2).toHaveLength(1);
      expect(results2[0].id).toBe('act-2');
    });
  });
});
