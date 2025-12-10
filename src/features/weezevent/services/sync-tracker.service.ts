import { Injectable } from '@nestjs/common';

export interface SyncJob {
    id: string;
    tenantId: string;
    type: 'transactions' | 'events' | 'products';
    status: 'running' | 'completed' | 'failed';
    startedAt: Date;
    completedAt?: Date;
    error?: string;
    progress?: {
        current: number;
        total: number;
    };
}

@Injectable()
export class SyncTrackerService {
    private jobs: Map<string, SyncJob> = new Map();

    /**
     * Start tracking a sync job
     */
    startSync(tenantId: string, type: SyncJob['type']): string {
        const id = `${tenantId}-${type}-${Date.now()}`;
        const job: SyncJob = {
            id,
            tenantId,
            type,
            status: 'running',
            startedAt: new Date(),
        };
        this.jobs.set(id, job);
        return id;
    }

    /**
     * Update sync progress
     */
    updateProgress(id: string, current: number, total: number) {
        const job = this.jobs.get(id);
        if (job) {
            job.progress = { current, total };
            this.jobs.set(id, job);
        }
    }

    /**
     * Mark sync as completed
     */
    completeSync(id: string) {
        const job = this.jobs.get(id);
        if (job) {
            job.status = 'completed';
            job.completedAt = new Date();
            this.jobs.set(id, job);

            // Clean up after 5 minutes
            setTimeout(() => this.jobs.delete(id), 5 * 60 * 1000);
        }
    }

    /**
     * Mark sync as failed
     */
    failSync(id: string, error: string) {
        const job = this.jobs.get(id);
        if (job) {
            job.status = 'failed';
            job.completedAt = new Date();
            job.error = error;
            this.jobs.set(id, job);

            // Clean up after 5 minutes
            setTimeout(() => this.jobs.delete(id), 5 * 60 * 1000);
        }
    }

    /**
     * Get running syncs for a tenant
     */
    getRunningSyncs(tenantId: string): SyncJob[] {
        return Array.from(this.jobs.values()).filter(
            (job) => job.tenantId === tenantId && job.status === 'running',
        );
    }

    /**
     * Check if a sync is running for a tenant and type
     */
    isRunning(tenantId: string, type: SyncJob['type']): boolean {
        return Array.from(this.jobs.values()).some(
            (job) =>
                job.tenantId === tenantId &&
                job.type === type &&
                job.status === 'running',
        );
    }

    /**
     * Get all syncs for a tenant
     */
    getTenantSyncs(tenantId: string): SyncJob[] {
        return Array.from(this.jobs.values()).filter(
            (job) => job.tenantId === tenantId,
        );
    }

    /**
     * Get sync by ID
     */
    getSync(id: string): SyncJob | undefined {
        return this.jobs.get(id);
    }
}
