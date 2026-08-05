import type { FluxImage } from '@phybot/shared';
import { execute, queryAll, queryOne } from '../db/database.js';

interface ImageRow {
  id: number;
  batch_id: string;
  index_in_batch: number;
  prompt: string;
  negative_prompt: string;
  seed: number;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  file_name: string;
  upscaled_file_name: string | null;
  upscaled_model: string;
  upscale_refined: number;
  source_image_id: number | null;
  saved: number;
  duration_ms: number;
  requested_by: string;
  created_at: number;
}

function toImage(row: ImageRow): FluxImage {
  return {
    id: row.id,
    batchId: row.batch_id,
    indexInBatch: row.index_in_batch,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt,
    seed: row.seed,
    width: row.width,
    height: row.height,
    steps: row.steps,
    cfgScale: row.cfg_scale,
    fileName: row.file_name,
    upscaledFileName: row.upscaled_file_name,
    upscaledModel: row.upscaled_model,
    upscaleRefined: row.upscale_refined === 1,
    sourceImageId: row.source_image_id,
    saved: row.saved === 1,
    durationMs: row.duration_ms,
    requestedBy: row.requested_by,
    createdAt: row.created_at,
  };
}

export interface NewImage {
  batchId: string;
  indexInBatch: number;
  prompt: string;
  negativePrompt: string;
  seed: number;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  fileName: string;
  durationMs: number;
  requestedBy: string;
  /** Set when this image was produced by editing another one. */
  sourceImageId?: number | null;
}

export const fluxRepository = {
  create(input: NewImage): FluxImage {
    const { lastInsertRowid } = execute(
      `INSERT INTO flux_images
         (batch_id, index_in_batch, prompt, negative_prompt, seed, width, height, steps,
          cfg_scale, file_name, duration_ms, requested_by, source_image_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.batchId,
      input.indexInBatch,
      input.prompt,
      input.negativePrompt,
      input.seed,
      input.width,
      input.height,
      input.steps,
      input.cfgScale,
      input.fileName,
      input.durationMs,
      input.requestedBy,
      input.sourceImageId ?? null,
      Date.now(),
    );
    const created = this.getById(lastInsertRowid);
    if (!created) throw new Error('Generated image was not stored');
    return created;
  },

  getById(id: number): FluxImage | null {
    const row = queryOne<ImageRow>('SELECT * FROM flux_images WHERE id = ?', id);
    return row ? toImage(row) : null;
  },

  listByBatch(batchId: string): FluxImage[] {
    return queryAll<ImageRow>(
      'SELECT * FROM flux_images WHERE batch_id = ? ORDER BY index_in_batch',
      batchId,
    ).map(toImage);
  },

  list(options: { limit?: number; savedOnly?: boolean } = {}): FluxImage[] {
    const limit = Math.min(Math.max(options.limit ?? 60, 1), 500);
    const rows = options.savedOnly
      ? queryAll<ImageRow>(
          'SELECT * FROM flux_images WHERE saved = 1 ORDER BY created_at DESC LIMIT ?',
          limit,
        )
      : queryAll<ImageRow>('SELECT * FROM flux_images ORDER BY created_at DESC LIMIT ?', limit);
    return rows.map(toImage);
  },

  setSaved(id: number, saved: boolean): void {
    execute('UPDATE flux_images SET saved = ? WHERE id = ?', saved ? 1 : 0, id);
  },

  setUpscaled(id: number, fileName: string | null, model = '', refined = false): void {
    execute(
      'UPDATE flux_images SET upscaled_file_name = ?, upscaled_model = ?, upscale_refined = ? WHERE id = ?',
      fileName,
      model,
      refined ? 1 : 0,
      id,
    );
  },

  delete(id: number): void {
    execute('DELETE FROM flux_images WHERE id = ?', id);
  },

  /** Unsaved images older than the cut-off, used by the cleanup job. */
  staleUnsaved(olderThan: number): FluxImage[] {
    return queryAll<ImageRow>(
      'SELECT * FROM flux_images WHERE saved = 0 AND created_at < ?',
      olderThan,
    ).map(toImage);
  },
};
