import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { BackupService } from './backup.service';
import { DatabaseService } from '../database.service';
import chalk from 'chalk';

type CronDateLike = Date | { toJSDate(): Date };

@Injectable()
export class ScheduledBackupService implements OnModuleInit {
  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly backupService: BackupService,
    private readonly databaseService: DatabaseService,
  ) {}

  onModuleInit() {
    this.scheduleBackups();
  }

  /**
   * Schedules automatic database backups
   * Default: Every day at 2:00 AM
   */
  scheduleBackups() {
    const cronExpression = process.env.BACKUP_CRON || '0 2 * * *'; // 2 AM daily
    const enabled = process.env.BACKUP_ENABLED !== 'false'; // Enabled by default

    if (!enabled) {
      console.log(chalk.yellow('[BACKUP] Scheduled backups are disabled'));
      return;
    }

    console.log(
      chalk.cyan(`[BACKUP] Scheduling automatic backups: ${cronExpression}`),
    );

    const job = new CronJob(cronExpression, async () => {
      console.log(chalk.yellow('[BACKUP] Running scheduled backup...'));

      try {
        const client = this.databaseService.getClient();
        const backupPath = await this.backupService.createFullBackup(client);

        console.log(
          chalk.green(
            `[BACKUP] Scheduled backup completed locally: ${backupPath}`,
          ),
        );

        // Upload to Supabase
        await this.backupService.uploadToSupabase(backupPath);

        // Clean old backups (keep last 30 for daily backups)
        await this.backupService.cleanOldBackups(30);
      } catch (error) {
        console.error(chalk.red('[BACKUP] Scheduled backup failed:'), error);
      }
    });

    this.schedulerRegistry.addCronJob('database-backup', job);
    job.start();

    console.log(chalk.green('[BACKUP] Automatic backup schedule initialized'));
  }

  /**
   * Manually trigger a backup
   */
  async triggerManualBackup(): Promise<string> {
    console.log(chalk.yellow('[BACKUP] Manual backup triggered...'));

    try {
      const client = this.databaseService.getClient();
      const backupPath = await this.backupService.createFullBackup(client);

      console.log(
        chalk.green(`[BACKUP] Manual backup completed locally: ${backupPath}`),
      );

      // Upload to Supabase
      await this.backupService.uploadToSupabase(backupPath);

      return backupPath;
    } catch (error) {
      console.error(chalk.red('[BACKUP] Manual backup failed:'), error);
      throw error;
    }
  }

  /**
   * Stop scheduled backups
   */
  async stopScheduledBackups(): Promise<void> {
    try {
      const job = this.schedulerRegistry.getCronJob('database-backup');
      const stopResult = job.stop();
      if (stopResult) {
        await stopResult;
      }
      console.log(chalk.yellow('[BACKUP] Scheduled backups stopped'));
    } catch (error) {
      console.error('[BACKUP] Error stopping scheduled backups:', error);
    }
  }

  /**
   * Get backup schedule status
   */
  getScheduleStatus() {
    try {
      const job = this.schedulerRegistry.getCronJob('database-backup');
      const nextDate = job.nextDate() as CronDateLike | null;
      const lastDate = job.lastDate() as CronDateLike | null;

      let nextRunStr = 'N/A';
      let lastRunStr = 'N/A';

      if (nextDate) {
        const normalizedNext =
          nextDate instanceof Date ? nextDate : nextDate.toJSDate();
        nextRunStr = normalizedNext.toISOString();
      }

      if (lastDate) {
        const normalizedLast =
          lastDate instanceof Date ? lastDate : lastDate.toJSDate();
        lastRunStr = normalizedLast.toISOString();
      }

      return {
        enabled: true,
        cronExpression: process.env.BACKUP_CRON || '0 2 * * *',
        nextRun: nextRunStr,
        lastRun: lastRunStr,
      };
    } catch (error) {
      console.error('[BACKUP] Status check failed:', error);
      return {
        enabled: false,
        cronExpression: process.env.BACKUP_CRON || '0 2 * * *',
        error: 'Scheduler not initialized',
      };
    }
  }
}
