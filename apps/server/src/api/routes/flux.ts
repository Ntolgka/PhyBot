import { createReadStream, existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import {
  fluxConfigSchema,
  fluxEditSchema,
  fluxGenerateSchema,
  fluxUpscaleSchema,
} from '@phybot/shared';
import { AppError, NotFoundError } from '../../core/errors.js';
import {
  deleteImage,
  editImage,
  generateImages,
  getFluxConfig,
  getFluxStatus,
  getImage,
  imageFilePath,
  listImages,
  saveImage,
  updateFluxConfig,
  upscaleImage,
} from '../../flux/index.js';
import { parseBody } from '../validation.js';

/** Route params are always strings; every image id must be a positive integer. */
function parseImageId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('invalid_image_id', 'Invalid image id', 400);
  }
  return id;
}

export async function fluxRoutes(app: FastifyInstance): Promise<void> {
  app.get('/flux/status', async () => getFluxStatus());

  app.get('/flux/config', async () => getFluxConfig());

  app.patch('/flux/config', async (request) => {
    const body = parseBody(fluxConfigSchema, request.body);
    return updateFluxConfig(body);
  });

  app.post('/flux/generate', async (request) => {
    // A batch can take minutes to render; never let the socket time out mid job.
    request.raw.setTimeout(0);
    const body = parseBody(fluxGenerateSchema, request.body);
    return generateImages({ ...body, requestedBy: 'dashboard' });
  });

  app.get('/flux/images', async (request) => {
    const { limit, savedOnly } = request.query as { limit?: string; savedOnly?: string };
    const parsedLimit = limit !== undefined ? Number(limit) : undefined;
    return listImages({
      ...(parsedLimit !== undefined && Number.isFinite(parsedLimit) ? { limit: parsedLimit } : {}),
      ...(savedOnly !== undefined ? { savedOnly: savedOnly === 'true' } : {}),
    });
  });

  app.get('/flux/images/:id/file', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { variant } = request.query as { variant?: string };
    const image = getImage(parseImageId(id));
    const resolvedVariant = variant === 'upscaled' ? 'upscaled' : 'original';

    if (resolvedVariant === 'upscaled' && !image.upscaledFileName) {
      throw new NotFoundError('This image has not been upscaled yet');
    }

    // imageFilePath keeps the result inside the images directory regardless
    // of what the client asked for, so no path is ever built from the query.
    const filePath = imageFilePath(image, resolvedVariant);
    if (!existsSync(filePath)) throw new NotFoundError('Image file is missing on disk');

    // The reply has to be returned from an async handler, otherwise Fastify
    // treats the resolved undefined as the payload and sends an empty body.
    return reply
      .type('image/png')
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .send(createReadStream(filePath));
  });

  app.post('/flux/images/:id/upscale', async (request) => {
    const { id } = request.params as { id: string };
    request.raw.setTimeout(0);
    const body = parseBody(fluxUpscaleSchema, request.body ?? {});
    return upscaleImage(parseImageId(id), body);
  });

  app.post('/flux/edit', async (request) => {
    // Editing runs a full generation pass; the socket must not give up first.
    request.raw.setTimeout(0);
    const body = parseBody(fluxEditSchema, request.body);
    const { image, ...rest } = body;
    return editImage({
      ...rest,
      ...(image ? { imageData: Buffer.from(image.split(',', 2)[1] ?? '', 'base64') } : {}),
      requestedBy: 'dashboard',
    });
  });

  app.post('/flux/images/:id/save', async (request) => {
    const { id } = request.params as { id: string };
    return saveImage(parseImageId(id));
  });

  app.delete('/flux/images/:id', async (request) => {
    const { id } = request.params as { id: string };
    await deleteImage(parseImageId(id));
    return { ok: true };
  });
}
