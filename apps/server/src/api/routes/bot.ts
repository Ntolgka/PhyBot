import { OAuth2Scopes, PermissionsBitField } from 'discord.js';
import type { FastifyInstance } from 'fastify';
import {
  LOG_BUFFER_SIZE,
  MAX_IMAGE_UPLOAD_BYTES,
  botProfileUpdateSchema,
  presenceSchema,
  sendMessageSchema,
  type BotProfile,
  type DashboardOverview,
} from '@phybot/shared';
import { getAiStatus } from '../../ai/index.js';
import { AppError, toErrorMessage } from '../../core/errors.js';
import { bus } from '../../core/bus.js';
import { requestRestart } from '../../core/lifecycle.js';
import { logBuffer } from '../../core/logger.js';
import { getStatus, tryGetClient } from '../../discord/client.js';
import { deployCommands } from '../../discord/deploy.js';
import { listGuilds } from '../../discord/index.js';
import { getPresence, setPresence } from '../../discord/presence.js';
import { sendMessage } from '../../discord/send.js';
import { getFreeGamesStatus } from '../../features/index.js';
import { playerManager } from '../../music/manager.js';
import { parseBody } from '../validation.js';

const INVITE_PERMISSIONS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.EmbedLinks,
  PermissionsBitField.Flags.AttachFiles,
  PermissionsBitField.Flags.ReadMessageHistory,
  PermissionsBitField.Flags.Connect,
  PermissionsBitField.Flags.Speak,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageMessages,
  PermissionsBitField.Flags.MentionEveryone,
];

async function readProfile(): Promise<BotProfile | null> {
  const client = tryGetClient();
  if (!client?.isReady()) return null;

  const application = await client.application.fetch();
  return {
    id: client.user.id,
    username: client.user.username,
    discriminator: client.user.discriminator,
    avatarUrl: client.user.displayAvatarURL({ size: 256 }),
    bannerUrl: client.user.bannerURL({ size: 512 }) ?? null,
    description: application.description ?? '',
    tags: application.tags ?? [],
    inviteUrl: client.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: INVITE_PERMISSIONS,
    }),
  };
}

function assertImageSize(dataUrl: string | null | undefined, field: string): void {
  if (!dataUrl) return;
  const base64 = dataUrl.split(',')[1] ?? '';
  const bytes = Math.ceil((base64.length * 3) / 4);
  if (bytes > MAX_IMAGE_UPLOAD_BYTES) {
    throw new AppError('image_too_large', `The ${field} is larger than 8 MB`, 413, {
      [field]: 'Choose a smaller image',
    });
  }
}

export async function botRoutes(app: FastifyInstance): Promise<void> {
  app.get('/overview', async (): Promise<DashboardOverview> => {
    const client = tryGetClient();
    return {
      bot: getStatus(),
      profile: await readProfile(),
      presence: getPresence(),
      guilds: client?.isReady() ? listGuilds(client) : [],
      players: playerManager.snapshots(),
      ai: getAiStatus(),
      freeGames: getFreeGamesStatus(),
    };
  });

  app.get('/bot/status', async () => getStatus());

  app.post('/bot/message', async (request) => {
    const body = parseBody(sendMessageSchema, request.body);
    return sendMessage({ ...body, requestedBy: 'dashboard' });
  });

  app.get('/bot/profile', async () => {
    const profile = await readProfile();
    if (!profile) throw new AppError('bot_offline', 'The bot is not connected to Discord', 503);
    return profile;
  });

  app.patch('/bot/profile', async (request) => {
    const client = tryGetClient();
    if (!client?.isReady()) {
      throw new AppError('bot_offline', 'The bot is not connected to Discord', 503);
    }
    const body = parseBody(botProfileUpdateSchema, request.body);
    assertImageSize(body.avatar, 'avatar');
    assertImageSize(body.banner, 'banner');

    try {
      if (body.username && body.username !== client.user.username) {
        await client.user.setUsername(body.username);
      }
      if (body.avatar !== undefined) await client.user.setAvatar(body.avatar);
      if (body.banner !== undefined) await client.user.setBanner(body.banner);
      if (body.description !== undefined || body.tags !== undefined) {
        await client.application.edit({
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.tags !== undefined ? { tags: body.tags } : {}),
        });
      }
    } catch (error) {
      const message = toErrorMessage(error);
      throw new AppError(
        'discord_rejected',
        message.includes('rate limit') || message.includes('RATE_LIMITED')
          ? 'Discord rate limited the change. Usernames can only be changed twice per hour.'
          : `Discord rejected the change: ${message}`,
        400,
      );
    }

    const profile = await readProfile();
    if (profile) bus.emit('bot:profile', profile);
    return profile;
  });

  app.get('/bot/presence', async () => getPresence());

  app.patch('/bot/presence', async (request) => {
    const body = parseBody(presenceSchema, request.body);
    return setPresence(body);
  });

  app.get('/bot/logs', async (request) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(
      Number(query.limit ?? LOG_BUFFER_SIZE) || LOG_BUFFER_SIZE,
      LOG_BUFFER_SIZE,
    );
    return logBuffer.recent(limit);
  });

  app.post('/bot/redeploy-commands', async () => {
    const count = await deployCommands();
    return { ok: true, count };
  });

  app.post('/bot/restart', async () => {
    const result = requestRestart('dashboard');
    return {
      ok: true,
      mode: result.mode,
      alreadyRequested: result.alreadyRequested,
      message:
        result.mode === 'supervised'
          ? 'Restarting now, the launcher will bring the bot back in a few seconds.'
          : 'Restarting now, a fresh process is starting in the background.',
    };
  });
}
