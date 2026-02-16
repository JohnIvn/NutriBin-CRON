import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { DatabaseService } from './services/database.service';
import { BackupService } from './services/backup/backup.service';
import { ScheduledBackupService } from './services/backup/scheduled-backup.service';
import { SupabaseService } from './services/storage/supabase.service';

import { BackupController } from './controllers/backup.controller';

@Module({
  imports: [],
  controllers: [AppController, BackupController],
  providers: [
    AppService,
    DatabaseService,
    BackupService,
    ScheduledBackupService,
    SupabaseService,
  ],
})
export class AppModule {}
