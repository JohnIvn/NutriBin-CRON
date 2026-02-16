import { createClient } from '@supabase/supabase-js';

// Supabase storage helper service
// Usage: set SUPABASE_URL and SUPABASE_SERVICE_KEY in your environment (.env or process env)

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const record = err as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
    if (typeof record.msg === 'string') return record.msg;
  }
  return String(err);
};

type SupabaseFileBody =
  | Buffer
  | ArrayBuffer
  | ArrayBufferView
  | NodeJS.ReadableStream
  | string;

class SupabaseService {
  private client: ReturnType<typeof createClient>;

  constructor() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.warn(
        'SupabaseService: SUPABASE_URL or SUPABASE_SERVICE_KEY not set. Supabase storage will not work until configured.',
      );
    }

    this.client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      // adjust options as needed
      auth: { persistSession: false },
    });
  }

  // Uploads a file Buffer to specified bucket and path (e.g. 'avatars/userid.jpg')
  async uploadBuffer(
    bucket: string,
    path: string,
    file: Buffer,
    contentType = 'application/octet-stream',
  ) {
    if (!bucket || !path) throw new Error('bucket and path are required');
    try {
      const { data, error } = await this.client.storage
        .from(bucket)
        .upload(path, file, {
          contentType,
          // upsert true to overwrite existing
          upsert: true,
        });
      if (error) throw error;
      return data;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      if (
        /bucket not found/i.test(message) ||
        /Bucket not found/i.test(message)
      ) {
        await this.ensureBucketExists(bucket, true);
        const { data: retryData, error: retryError } = await this.client.storage
          .from(bucket)
          .upload(path, file, { contentType, upsert: true });
        if (retryError) throw retryError;
        return retryData;
      }

      throw err;
    }
  }

  // Ensure bucket exists; create if missing (requires service_role key)
  async ensureBucketExists(bucket: string, isPublic = true) {
    try {
      const { data, error } = await this.client.storage.createBucket(bucket, {
        public: isPublic,
      });
      if (
        error &&
        !(
          String(error.message).toLowerCase().includes('already exists') ||
          String(error.message).toLowerCase().includes('bucket already exists')
        )
      ) {
        throw error;
      }
      return data;
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      if (msg.toLowerCase().includes('already exists')) return null;
      throw err;
    }
  }

  // Upload using ReadableStream / Blob-like (works in Node when using File or Buffer with options)
  async uploadFile(
    bucket: string,
    path: string,
    file: SupabaseFileBody,
    opts?: { contentType?: string; upsert?: boolean },
  ) {
    if (!bucket || !path) throw new Error('bucket and path are required');
    const { data, error } = await this.client.storage
      .from(bucket)
      .upload(path, file, {
        contentType: opts?.contentType,
        upsert: opts?.upsert ?? true,
      });
    if (error) throw error;
    return data;
  }

  // Remove object at path
  async remove(bucket: string, paths: string | string[]) {
    const { data, error } = await this.client.storage
      .from(bucket)
      .remove(Array.isArray(paths) ? paths : [paths]);
    if (error) throw error;
    return data;
  }

  // Get public URL (if bucket is public) or signed URL
  getPublicUrl(bucket: string, path: string) {
    const response = this.client.storage.from(bucket).getPublicUrl(path);
    const data =
      (response?.data as { publicUrl?: string; publicURL?: string } | null) ??
      null;
    return data?.publicUrl ?? data?.publicURL ?? null;
  }

  // Get signed URL for private buckets (expires in seconds)
  async getSignedUrl(bucket: string, path: string, expires = 60) {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(path, expires);
    if (error) throw error;
    return data.signedUrl;
  }
}

const supabaseService = new SupabaseService();
export default supabaseService;

// Example usage in other services (do not uncomment here):
// import supabaseService from '../storage/supabase.service';
// await supabaseService.uploadBuffer('avatars', `users/${userId}.jpg`, fileBuffer, 'image/jpeg');
