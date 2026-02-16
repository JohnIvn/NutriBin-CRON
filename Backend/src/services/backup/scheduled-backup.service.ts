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
    const timezone = process.env.BACKUP_TIMEZONE || 'UTC';
    const enabled = process.env.BACKUP_ENABLED !== 'false'; // Enabled by default

    if (!enabled) {
      console.log(chalk.yellow('[BACKUP] Scheduled backups are disabled'));
      return;
    }

    console.log(
      chalk.cyan(
        `[BACKUP] Scheduling automatic backups: ${cronExpression} (${timezone})`,
      ),
    );

    const job = new CronJob(
      cronExpression,
      async () => {
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
      },
      null, // onComplete
      false, // start (we'll start manually)
      timezone, // timeZone
    );

    const nextRun = job.nextDate();
    const nextRunDate =
      nextRun instanceof Date ? nextRun : (nextRun as any).toJSDate();

    console.log(chalk.green(`[BACKUP] Automatic backup schedule initialized.`));
    console.log(
      chalk.cyan(
        `[BACKUP] Current Server Time: ${new Date().toISOString()} | local(GMT+8): ${this.formatGMT8(new Date())}`,
      ),
    );
    console.log(
      chalk.yellow(
        `[BACKUP] Next run scheduled for: ${nextRunDate.toISOString()} | local(GMT+8): ${this.formatGMT8(nextRunDate)}`,
      ),
    );
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
   * Helper to format a date to GMT+8 (Asia/Manila)
   */
  private formatGMT8(date: Date): string {
    return date.toLocaleString('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
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
        timezone: process.env.BACKUP_TIMEZONE || 'UTC',
        nextRun: nextRunStr,
        nextRunLocal: nextDate
          ? this.formatGMT8(
              nextDate instanceof Date
                ? nextDate
                : (nextDate as any).toJSDate(),
            )
          : 'N/A',
        lastRun: lastRunStr,
        lastRunLocal: lastDate
          ? this.formatGMT8(
              lastDate instanceof Date
                ? lastDate
                : (lastDate as any).toJSDate(),
            )
          : 'N/A',
        serverTime: new Date().toISOString(),
        serverTimeLocal: this.formatGMT8(new Date()),
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
