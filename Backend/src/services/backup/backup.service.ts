import { Injectable } from '@nestjs/common';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import chalk from 'chalk';

type TableInfo = { table_name: string };
type ColumnInfo = {
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  column_default: string | null;
  is_nullable: 'YES' | 'NO';
  udt_name: string;
};
type PrimaryKeyInfo = { column_name: string };
type ForeignKeyInfo = {
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
  delete_rule: string;
  update_rule: string;
};

@Injectable()
export class BackupService {
  private backupDir = path.join(__dirname, '..', '..', '..', 'backups');

  constructor() {
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Generates a full SQL backup of all tables and data as a stream (generator)
   * @param client - PostgreSQL client instance
   */
  async *generateFullBackupSqlStream(client: Client): AsyncGenerator<string> {
    yield `-- NutriBin Server Database Backup\n`;
    yield `-- Created: ${new Date().toISOString()}\n`;
    yield `-- Database: Supabase PostgreSQL\n\n`;

    try {
      // Get all tables in the public schema
      const tablesResult = await client.query<TableInfo>(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `);

      const tables = tablesResult.rows.map((row) => row.table_name);
      console.log(chalk.cyan(`[BACKUP] Found ${tables.length} tables to dump`));

      // Backup each table
      for (const tableName of tables) {
        // Get table schema (CREATE TABLE statement)
        const schemaSQL = await this.getTableSchema(client, tableName);
        yield `\n-- Table: ${tableName}\n`;
        yield `${schemaSQL}\n\n`;

        // Get table data (INSERT statements)
        for await (const dataChunk of this.getTableDataStream(
          client,
          tableName,
        )) {
          yield dataChunk;
        }
        yield `\n\n`;
      }
    } catch (error) {
      console.error(chalk.red('[BACKUP] Error generating SQL stream:'), error);
      throw error;
    }
  }

  /**
   * Generates a full SQL backup of all tables and data as a string
   * @deprecated Use generateFullBackupSqlStream for large databases
   */
  async generateFullBackupSql(client: Client): Promise<string> {
    let sql = '';
    for await (const chunk of this.generateFullBackupSqlStream(client)) {
      sql += chunk;
    }
    return sql;
  }

  /**
   * Creates a full SQL backup of all tables and data from Supabase
   * @param client - PostgreSQL client instance
   * @returns Path to the created backup file
   */
  async createFullBackup(client: Client): Promise<string> {
    console.log(chalk.yellow('[BACKUP] Starting full database backup...'));

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilePath = path.join(this.backupDir, `backup_${timestamp}.sql`);

    try {
      const writeStream = fs.createWriteStream(backupFilePath);

      for await (const chunk of this.generateFullBackupSqlStream(client)) {
        writeStream.write(chunk);
      }

      writeStream.end();

      console.log(chalk.green(`[BACKUP] Backup completed successfully!`));
      console.log(chalk.green(`[BACKUP] File saved to: ${backupFilePath}`));

      return backupFilePath;
    } catch (error) {
      console.error(chalk.red('[BACKUP] Error creating backup file:'), error);
      throw error;
    }
  }

  /**
   * Gets the CREATE TABLE statement for a specific table
   */
  private async getTableSchema(
    client: Client,
    tableName: string,
  ): Promise<string> {
    // Get column information
    const columnsResult = await client.query<ColumnInfo>(
      `
      SELECT 
        column_name,
        data_type,
        character_maximum_length,
        column_default,
        is_nullable,
        udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `,
      [tableName],
    );

    // Get primary key information
    const pkResult = await client.query<PrimaryKeyInfo>(
      `
      SELECT a.attname AS column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary;
    `,
      [tableName],
    );

    const primaryKeys = pkResult.rows.map((row) => row.column_name);

    // Get foreign key information
    const fkResult = await client.query<ForeignKeyInfo>(
      `
      SELECT
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule,
        rc.update_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND tc.table_schema = 'public'
      AND tc.table_name = $1;
    `,
      [tableName],
    );

    // Build CREATE TABLE statement
    let createTableSQL = `DROP TABLE IF EXISTS "${tableName}" CASCADE;\n`;
    createTableSQL += `CREATE TABLE "${tableName}" (\n`;

    const columnDefs = columnsResult.rows.map((col) => {
      let colDef = `  "${col.column_name}" `;

      // Handle data type
      if (col.data_type === 'USER-DEFINED') {
        colDef += col.udt_name;
      } else if (col.data_type === 'character varying') {
        colDef += col.character_maximum_length
          ? `VARCHAR(${col.character_maximum_length})`
          : 'VARCHAR';
      } else if (col.data_type === 'character') {
        colDef += col.character_maximum_length
          ? `CHAR(${col.character_maximum_length})`
          : 'CHAR';
      } else {
        colDef += col.data_type.toUpperCase();
      }

      // Handle NOT NULL
      if (col.is_nullable === 'NO') {
        colDef += ' NOT NULL';
      }

      // Handle DEFAULT
      if (col.column_default) {
        colDef += ` DEFAULT ${col.column_default}`;
      }

      return colDef;
    });

    createTableSQL += columnDefs.join(',\n');

    // Add primary key constraint
    if (primaryKeys.length > 0) {
      const pkColumns = primaryKeys.map((pk) => `"${pk}"`).join(', ');
      createTableSQL += `,\n  PRIMARY KEY (${pkColumns})`;
    }

    createTableSQL += `\n);`;

    // Add foreign key constraints
    if (fkResult.rows.length > 0) {
      createTableSQL += `\n`;
      for (const fk of fkResult.rows) {
        createTableSQL += `\nALTER TABLE "${tableName}" ADD CONSTRAINT fk_${tableName}_${fk.column_name} `;
        createTableSQL += `FOREIGN KEY ("${fk.column_name}") `;
        createTableSQL += `REFERENCES "${fk.foreign_table_name}" ("${fk.foreign_column_name}")`;
        if (fk.delete_rule !== 'NO ACTION') {
          createTableSQL += ` ON DELETE ${fk.delete_rule}`;
        }
        if (fk.update_rule !== 'NO ACTION') {
          createTableSQL += ` ON UPDATE ${fk.update_rule}`;
        }
        createTableSQL += `;`;
      }
    }

    return createTableSQL;
  }

  /**
   * Gets INSERT statements for all data in a table as a stream
   */
  private async *getTableDataStream(
    client: Client,
    tableName: string,
  ): AsyncGenerator<string> {
    try {
      // Get all data from the table
      const dataResult = await client.query<Record<string, unknown>>(
        `SELECT * FROM "${tableName}";`,
      );

      if (dataResult.rows.length === 0) {
        yield `-- No data in table ${tableName}\n`;
        return;
      }

      const columns = Object.keys(dataResult.rows[0]);
      const columnList = columns.map((col) => `"${col}"`).join(', ');

      yield `-- Data for table ${tableName}\n`;

      // Generate INSERT statements in batches
      const batchSize = 100;
      for (let i = 0; i < dataResult.rows.length; i += batchSize) {
        const batch = dataResult.rows.slice(i, i + batchSize);

        let insertSQL = `INSERT INTO "${tableName}" (${columnList}) VALUES\n`;

        const values = batch.map((row) => {
          const rowValues = columns
            .map((col) => this.formatRowValue(row[col]))
            .join(', ');

          return `  (${rowValues})`;
        });

        insertSQL += values.join(',\n');
        insertSQL += `;\n\n`;
        yield insertSQL;
      }

      console.log(
        chalk.gray(
          `  └─ Backed up ${dataResult.rows.length} rows from ${tableName}`,
        ),
      );
    } catch (error) {
      console.error(
        chalk.red(`[BACKUP] Error getting data for table ${tableName}:`),
        error,
      );
      yield `-- Error backing up data for table ${tableName}\n`;
    }
  }

  private formatRowValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }

    const escapeString = (raw: string | undefined): string =>
      `'${(raw ?? '').replace(/'/g, "''")}'`;

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return "'{}'";
      }
      const values = value.map((v) => {
        if (v === null) return 'NULL';
        if (typeof v === 'number') return String(v);
        if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
        if (typeof v === 'string') return escapeString(v);
        if (v instanceof Date) return escapeString(v.toISOString());
        return escapeString(JSON.stringify(v));
      });
      return `ARRAY[${values.join(', ')}]`;
    }

    if (typeof value === 'string') {
      return escapeString(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'symbol' || typeof value === 'function') {
      return escapeString(value.toString());
    }
    if (value instanceof Date) {
      return escapeString(value.toISOString());
    }
    if (value instanceof Buffer) {
      return `'\\x${value.toString('hex')}'`;
    }
    if (typeof value === 'object') {
      return escapeString(JSON.stringify(value));
    }

    return escapeString(JSON.stringify(value));
  }

  /**
   * Lists all available backup files
   */
  listBackups(): string[] {
    try {
      const files = fs.readdirSync(this.backupDir);
      return files
        .filter((file) => file.endsWith('.sql'))
        .sort()
        .reverse(); // Most recent first
    } catch (error) {
      console.error(chalk.red('[BACKUP] Error listing backups:'), error);
      return [];
    }
  }

  /**
   * Deletes old backup files, keeping only the specified number of most recent backups
   */
  async cleanOldBackups(keepCount: number = 10): Promise<void> {
    try {
      const backups = this.listBackups();

      if (backups.length > keepCount) {
        const toDelete = backups.slice(keepCount);
        console.log(
          chalk.yellow(`[BACKUP] Deleting ${toDelete.length} old backup(s)...`),
        );

        for (const backup of toDelete) {
          const filePath = path.join(this.backupDir, backup);
          await fsPromises.unlink(filePath);
          console.log(chalk.gray(`  └─ Deleted: ${backup}`));
        }
      }
    } catch (error) {
      console.error(chalk.red('[BACKUP] Error cleaning old backups:'), error);
    }
  }

  /**
   * Gets the backup directory path
   */
  getBackupDirectory(): string {
    return this.backupDir;
  }
}
