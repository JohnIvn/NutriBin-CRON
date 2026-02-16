import { Controller, Post, Get, Res, Param } from '@nestjs/common';
import type { Response } from 'express';
import { BackupService } from 'src/services/backup/backup.service';
import { DatabaseService } from 'src/services/database.service';
import { ScheduledBackupService } from 'src/services/backup/scheduled-backup.service';
import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs';

@Controller('backup')
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly databaseService: DatabaseService,
    private readonly scheduledBackupService: ScheduledBackupService,
  ) {}

  /**
   * Creates a full database backup
   * POST /backup/create
   */
  @Post('create')
  async createBackup() {
    try {
      const client = this.databaseService.getClient();
      const backupPath = await this.backupService.createFullBackup(client);

      return {
        success: true,
        message: 'Database backup created successfully',
        backupPath,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(chalk.red('[BACKUP] Error creating backup:'), error);
      return {
        success: false,
        message: 'Failed to create database backup',
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Lists all available backups
   * GET /backup/list
   */
  @Get('list')
  listBackups() {
    try {
      const backups = this.backupService.listBackups();
      const backupDir = this.backupService.getBackupDirectory();

      const backupDetails = backups.map((filename) => {
        const filePath = path.join(backupDir, filename);
        const stats = fs.statSync(filePath);

        return {
          filename,
          size: stats.size,
          sizeFormatted: this.formatBytes(stats.size),
          created: stats.birthtime,
          modified: stats.mtime,
        };
      });

      return {
        success: true,
        count: backups.length,
        backupDirectory: backupDir,
        backups: backupDetails,
      };
    } catch (error) {
      console.error(chalk.red('[BACKUP] Error listing backups:'), error);
      return {
        success: false,
        message: 'Failed to list backups',
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Downloads a specific backup file
   * GET /backup/download/:filename
   */
  @Get('download/:filename')
  downloadBackup(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const backupDir = this.backupService.getBackupDirectory();
      const filePath = path.join(backupDir, filename);

      // Security check: ensure the file is in the backup directory
      if (!filePath.startsWith(backupDir)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'Backup file not found',
        });
      }

      res.download(filePath, filename);
    } catch (error) {
      console.error(chalk.red('[BACKUP] Error downloading backup:'), error);
      return res.status(500).json({
        success: false,
        message: 'Failed to download backup',
        error: this.getErrorMessage(error),
      });
    }
  }

  /**
   * Cleans old backups, keeping only the most recent ones
   * POST /backup/clean
   */
  @Post('clean')
  async cleanBackups() {
    try {
      const beforeCount = this.backupService.listBackups().length;
      await this.backupService.cleanOldBackups(10); // Keep last 10 backups
      const afterCount = this.backupService.listBackups().length;

      return {
        success: true,
        message: 'Old backups cleaned successfully',
        deleted: beforeCount - afterCount,
        remaining: afterCount,
      };
    } catch (error) {
      console.error(chalk.red('[BACKUP] Error cleaning backups:'), error);
      return {
        success: false,
        message: 'Failed to clean old backups',
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Gets the backup schedule status
   * GET /backup/schedule
   */
  @Get('schedule')
  getScheduleStatus() {
    try {
      const status = this.scheduledBackupService.getScheduleStatus();
      return {
        success: true,
        ...status,
      };
    } catch (error) {
      console.error(
        chalk.red('[BACKUP] Error getting schedule status:'),
        error,
      );
      return {
        success: false,
        message: 'Failed to get schedule status',
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Helper method to format bytes to human-readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error';
  }
}
