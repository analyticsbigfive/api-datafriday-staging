import { Test, TestingModule } from '@nestjs/testing';
import { SyncTrackerService, SyncJob } from './sync-tracker.service';

describe('SyncTrackerService', () => {
  let service: SyncTrackerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SyncTrackerService],
    }).compile();

    service = module.get<SyncTrackerService>(SyncTrackerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startSync', () => {
    it('should create a new sync job', () => {
      const jobId = service.startSync('tenant-123', 'transactions');

      expect(jobId).toBeDefined();
      expect(jobId).toContain('tenant-123');
      expect(jobId).toContain('transactions');
    });

    it('should track running syncs', () => {
      service.startSync('tenant-123', 'transactions');
      service.startSync('tenant-123', 'events');

      const runningSyncs = service.getRunningSyncs('tenant-123');

      expect(runningSyncs).toHaveLength(2);
      expect(runningSyncs.every(s => s.status === 'running')).toBe(true);
    });
  });

  describe('updateProgress', () => {
    it('should update job progress', () => {
      const jobId = service.startSync('tenant-123', 'transactions');

      service.updateProgress(jobId, 50, 100);

      const syncs = service.getRunningSyncs('tenant-123');
      const job = syncs.find(s => s.id === jobId);

      expect(job?.progress).toEqual({ current: 50, total: 100 });
    });

    it('should handle non-existent job id', () => {
      // Should not throw
      expect(() => service.updateProgress('non-existent', 50, 100)).not.toThrow();
    });
  });

  describe('completeSync', () => {
    it('should mark sync as completed', () => {
      const jobId = service.startSync('tenant-123', 'transactions');

      service.completeSync(jobId);

      // After completion, isRunning should check updated status
      const allJobs = service.getRunningSyncs('tenant-123');
      // The job exists but is marked as completed (not included in running syncs)
      expect(allJobs.filter(s => s.id === jobId && s.status === 'running')).toHaveLength(0);
    });
  });

  describe('failSync', () => {
    it('should mark sync as failed with error', () => {
      const jobId = service.startSync('tenant-123', 'transactions');

      service.failSync(jobId, 'Test error');

      // After failure, isRunning should check updated status
      const runningJobs = service.getRunningSyncs('tenant-123').filter(
        s => s.status === 'running',
      );
      expect(runningJobs).toHaveLength(0);
    });
  });

  describe('getRunningSyncs', () => {
    it('should return only running syncs for tenant', () => {
      service.startSync('tenant-123', 'transactions');
      service.startSync('tenant-456', 'events');

      const syncs = service.getRunningSyncs('tenant-123');

      expect(syncs).toHaveLength(1);
      expect(syncs[0].tenantId).toBe('tenant-123');
    });

    it('should return empty array when no syncs', () => {
      const syncs = service.getRunningSyncs('tenant-123');

      expect(syncs).toEqual([]);
    });
  });

  describe('isRunning', () => {
    it('should return true when type is syncing', () => {
      service.startSync('tenant-123', 'transactions');

      const result = service.isRunning('tenant-123', 'transactions');

      expect(result).toBe(true);
    });

    it('should return false when type is not syncing', () => {
      service.startSync('tenant-123', 'transactions');

      const result = service.isRunning('tenant-123', 'events');

      expect(result).toBe(false);
    });
  });
});
