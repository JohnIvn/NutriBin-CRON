import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { DatabaseService } from './services/database.service';
import { ScheduledBackupService } from './services/backup/scheduled-backup.service';

import { BackupController } from './controllers/backup.controller';

@Module({
  imports: [],
  controllers: [AppController, BackupController],
  providers: [AppService, DatabaseService, ScheduledBackupService],
})
export class AppModule {}
