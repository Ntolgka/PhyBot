import { describe, expect, it, vi } from 'vitest';
import { AttachmentBuilder } from 'discord.js';
import { respond } from './reply.js';

/** Minimal stand-in for the parts of an interaction `respond` touches. */
function fakeInteraction(state: { deferred?: boolean; replied?: boolean } = {}) {
  const editReply = vi.fn().mockResolvedValue(undefined);
  const reply = vi.fn().mockResolvedValue(undefined);
  return {
    interaction: {
      deferred: state.deferred ?? false,
      replied: state.replied ?? false,
      editReply,
      reply,
    } as never,
    editReply,
    reply,
  };
}

describe('respond', () => {
  it('keeps attachments when editing a deferred reply', async () => {
    // Dropping files here made /turksigara and assistant-generated pictures
    // arrive as an embed with an attachment:// image that pointed at nothing.
    const file = new AttachmentBuilder(Buffer.from('x'), { name: 'picture.png' });
    const { interaction, editReply } = fakeInteraction({ deferred: true });

    await respond(interaction, { embeds: [], files: [file] });

    expect(editReply).toHaveBeenCalledTimes(1);
    expect(editReply.mock.calls[0]?.[0]?.files).toEqual([file]);
  });

  it('clears leftover fields when none are given', async () => {
    const { interaction, editReply } = fakeInteraction({ deferred: true });
    await respond(interaction, {});
    expect(editReply.mock.calls[0]?.[0]).toMatchObject({
      content: null,
      embeds: [],
      components: [],
      files: [],
    });
  });

  it('passes the options straight through when nothing was deferred', async () => {
    const file = new AttachmentBuilder(Buffer.from('x'), { name: 'picture.png' });
    const { interaction, reply, editReply } = fakeInteraction();
    await respond(interaction, { content: 'hi', files: [file] });
    expect(editReply).not.toHaveBeenCalled();
    expect(reply.mock.calls[0]?.[0]).toMatchObject({ content: 'hi', files: [file] });
  });

  it('swallows a delivery failure rather than crashing the command', async () => {
    const { interaction, editReply } = fakeInteraction({ deferred: true });
    editReply.mockRejectedValueOnce(new Error('Unknown interaction'));
    await expect(respond(interaction, { content: 'x' })).resolves.toBeUndefined();
  });
});
