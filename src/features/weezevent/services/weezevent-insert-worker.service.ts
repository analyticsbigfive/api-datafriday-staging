import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventIncrementalSyncService } from './weezevent-incremental-sync.service';

const POLL_INTERVAL_MS = 500;
const PARALLEL_CHUNKS = 5;

@Injectable()
export class WeezeventInsertWorkerService {
    private readonly logger = new Logger(WeezeventInsertWorkerService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly incrementalSync: WeezeventIncrementalSyncService,
    ) {}

    /**
     * Boucle watch — démarre dès que le job est créé, en parallèle du CollectWorkerService.
     * Consomme les chunks PENDING au fur et à mesure qu'ils apparaissent, sans attendre
     * que la bissection soit terminée.
     */
    async watch(jobId: string): Promise<void> {
        this.logger.log(`[InsertWorker] Démarrage watch pour job ${jobId}`);
        try {
            while (true) {
                // Prendre les prochains chunks disponibles
                const chunks = await this.prisma.weezeventSyncChunk.findMany({
                    where: { jobId, status: 'PENDING' },
                    take: PARALLEL_CHUNKS,
                    orderBy: { createdAt: 'asc' },
                });

                if (chunks.length > 0) {
                    await Promise.all(chunks.map(chunk => this.processChunk(chunk, jobId)));
                    continue;
                }

                // Aucun chunk disponible — vérifier l'état du job
                const job = await this.prisma.weezeventSyncJob.findUnique({
                    where: { id: jobId },
                    select: { collectDone: true, totalChunks: true, processedChunks: true, status: true },
                });

                if (!job || job.status === 'FAILED') break;

                if (job.collectDone && job.processedChunks >= job.totalChunks) {
                    await this.prisma.weezeventSyncJob.update({
                        where: { id: jobId },
                        data: { status: 'COMPLETED', completedAt: new Date() },
                    });
                    this.logger.log(`[InsertWorker] Job ${jobId} COMPLETED — ${job.totalChunks} chunks traités`);
                    break;
                }

                // Collecte encore en cours, pause courte avant de reprendre
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
            }
        } catch (err: any) {
            this.logger.error(`[InsertWorker] Job ${jobId} — erreur fatale: ${err.message}`, err.stack);
            await this.prisma.weezeventSyncJob.update({
                where: { id: jobId },
                data: { status: 'FAILED', errorMessage: err.message, completedAt: new Date() },
            }).catch(() => undefined);
        }
    }

    private async processChunk(chunk: any, jobId: string): Promise<void> {
        try {
            // Marquer en cours avant de traiter (évite double-pick par un autre appel parallèle)
            const updated = await this.prisma.weezeventSyncChunk.updateMany({
                where: { id: chunk.id, status: 'PENDING' },
                data: { status: 'PROCESSING' },
            });

            if (updated.count === 0) return; // déjà pris par un autre worker

            const job = await this.prisma.weezeventSyncJob.findUnique({
                where: { id: jobId },
                select: { tenantId: true, integrationId: true },
            });

            if (!job) throw new Error(`Job ${jobId} introuvable`);

            const transactions: any[] = Array.isArray(chunk.rawData) ? chunk.rawData : [];

            await this.incrementalSync.insertTransactionBatch(job.tenantId, job.integrationId, transactions);

            await this.prisma.weezeventSyncChunk.update({
                where: { id: chunk.id },
                data: { status: 'DONE' },
            });

            await this.prisma.weezeventSyncJob.update({
                where: { id: jobId },
                data: {
                    totalInserted: { increment: transactions.length },
                    processedChunks: { increment: 1 },
                },
            });

            this.logger.debug(`[InsertWorker] Chunk ${chunk.id} traité — ${transactions.length} transactions`);
        } catch (err: any) {
            this.logger.error(`[InsertWorker] Chunk ${chunk.id} failed: ${err.message}`);
            await this.prisma.weezeventSyncChunk.update({
                where: { id: chunk.id },
                data: { status: 'FAILED' },
            }).catch(() => undefined);
            // On ne throw pas pour ne pas bloquer les autres chunks en parallèle
        }
    }
}
