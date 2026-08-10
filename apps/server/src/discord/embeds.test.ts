import { describe, expect, it } from 'vitest';
import type { PlayerSnapshot, Track } from '@phybot/shared';
import {
  musicControls,
  panelEmbed,
  queueBrowser,
  replayOneControls,
  MUSIC_BUTTONS,
  QUEUE_PAGE_SIZE,
  REPLAY_ONE_PREFIX,
  REPLAY_LIST_PREFIX,
} from './embeds.js';

const track: Track = {
  id: 't1',
  title: 'Song',
  author: 'Artist',
  url: 'https://example.com/song',
  duration: 200,
  isLive: false,
  thumbnail: null,
  source: 'youtube',
  requestedBy: '1',
  requestedByName: 'Tolga',
  addedAt: 0,
};

function snapshot(overrides: Partial<PlayerSnapshot>): PlayerSnapshot {
  return {
    guildId: '1',
    guildName: 'Server',
    status: 'idle',
    current: null,
    position: 0,
    queue: [],
    history: [],
    volume: 80,
    loop: 'off',
    shuffle: false,
    autoplay: false,
    voiceChannelId: null,
    voiceChannelName: null,
    textChannelId: null,
    queueDuration: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function customIds(state: Partial<PlayerSnapshot>): string[] {
  return musicControls(snapshot(state)).flatMap((row) =>
    row.toJSON().components.map((component) => component.custom_id),
  );
}

describe('musicControls', () => {
  it('puts every control on the message posted while a track is playing', () => {
    const ids = customIds({ status: 'playing', current: track, queue: [track, track] });
    for (const id of Object.values(MUSIC_BUTTONS)) {
      if (id === MUSIC_BUTTONS.queue) continue;
      expect(ids).toContain(id);
    }
  });

  it('leaves only Play again on the message posted once playback ends', () => {
    expect(customIds({ status: 'idle', current: null, history: [track] })).toEqual([
      MUSIC_BUTTONS.replay,
    ]);
  });

  it('enables Play again as long as something was played before', () => {
    const [row] = musicControls(snapshot({ current: null, history: [track] }));
    expect(row?.toJSON().components[0]?.disabled).toBe(false);
  });

  it('disables Play again when there is no history to replay', () => {
    const [row] = musicControls(snapshot({ current: null, history: [] }));
    expect(row?.toJSON().components[0]?.disabled).toBe(true);
  });

  it('binds Play again to the song the card is showing', () => {
    const [row] = musicControls(snapshot({ current: null, history: [track] }), { historyId: 7 });
    const button = row?.toJSON().components[0];
    expect(button?.custom_id).toBe(`${REPLAY_ONE_PREFIX}7`);
  });

  it('keeps Play again usable on an old card even with no history loaded', () => {
    // An older card is read straight from the channel, where the snapshot it
    // was built from is long gone. It must still replay its own song.
    const [row] = musicControls(snapshot({ current: null, history: [] }), { historyId: 7 });
    expect(row?.toJSON().components[0]?.disabled).toBe(false);
  });

  it('offers the queue browser with its size, and disables it when empty', () => {
    const withQueue = musicControls(
      snapshot({ status: 'playing', current: track, queue: [track] }),
    );
    const button = withQueue.at(-1)?.toJSON().components[0];
    expect(button?.custom_id).toBe(MUSIC_BUTTONS.queue);
    expect(button?.label).toContain('1');
    expect(button?.disabled).toBe(false);

    const empty = musicControls(snapshot({ status: 'playing', current: track, queue: [] }));
    expect(empty.at(-1)?.toJSON().components[0]?.disabled).toBe(true);
  });

  it('disables seeking on a live stream but keeps the rest', () => {
    const rows = musicControls(
      snapshot({ status: 'playing', current: { ...track, isLive: true } }),
    );
    const seek = rows[0]
      ?.toJSON()
      .components.filter((component) =>
        [MUSIC_BUTTONS.rewind, MUSIC_BUTTONS.forward].includes(component.custom_id),
      );
    expect(seek).toHaveLength(2);
    expect(seek?.every((component) => component.disabled)).toBe(true);
  });
});

describe('panelEmbed when nothing is playing', () => {
  it('names the track Play again would replay', () => {
    const embed = panelEmbed(snapshot({ current: null, history: [track] })).toJSON();
    expect(embed.title).toBe('Song');
    expect(embed.url).toBe(track.url);
    expect(embed.description).toContain('Artist');
    expect(embed.description).toContain('Play again');
  });

  it('falls back to the plain message before anything has played', () => {
    const embed = panelEmbed(snapshot({ current: null, history: [] })).toJSON();
    expect(embed.title).toBe('Nothing is playing');
    expect(embed.url).toBeUndefined();
  });
});

describe('queueBrowser', () => {
  const queue = Array.from({ length: 63 }, (_, index) => ({
    ...track,
    id: `t${index}`,
    title: `Song ${index + 1}`,
  }));

  function options(page: number): { label: string; value: string }[] {
    const [row] = queueBrowser(snapshot({ queue }), page);
    const menu = row?.toJSON().components[0];
    return menu && 'options' in menu ? (menu.options ?? []) : [];
  }

  it('numbers tracks by their position in the whole queue, not the page', () => {
    expect(options(0)[0]).toMatchObject({ label: '1. Song 1', value: '0' });
    expect(options(1)[0]).toMatchObject({ label: '26. Song 26', value: '25' });
    expect(options(2).at(-1)).toMatchObject({ label: '63. Song 63', value: '62' });
  });

  it('fills a page and leaves the remainder on the last one', () => {
    expect(options(0)).toHaveLength(QUEUE_PAGE_SIZE);
    expect(options(2)).toHaveLength(63 - 2 * QUEUE_PAGE_SIZE);
  });

  it('clamps a page number past the end instead of showing nothing', () => {
    expect(options(99).length).toBeGreaterThan(0);
  });

  it('lets several numbers be picked at once', () => {
    const [row] = queueBrowser(snapshot({ queue }), 0);
    const menu = row?.toJSON().components[0];
    expect(menu && 'max_values' in menu ? menu.max_values : 0).toBe(QUEUE_PAGE_SIZE);
  });

  it('drops the page buttons when everything fits on one page', () => {
    expect(queueBrowser(snapshot({ queue: [track] }), 0)).toHaveLength(1);
    expect(queueBrowser(snapshot({ queue }), 0)).toHaveLength(2);
  });

  it('shows no picker for an empty queue', () => {
    expect(queueBrowser(snapshot({ queue: [] }), 0)).toEqual([]);
  });
});

describe('the panel offers the lyrics', () => {
  it('adds a Lyrics button beside the queue while a track plays', () => {
    const rows = musicControls(snapshot({ status: 'playing', current: track, queue: [track] }));
    const ids = rows
      .at(-1)
      ?.toJSON()
      .components.map((component) => component.custom_id);
    expect(ids).toContain(MUSIC_BUTTONS.lyrics);
  });

  it('leaves the idle card with nothing but Play again', () => {
    const rows = musicControls(snapshot({ current: null, history: [track] }));
    const ids = rows.flatMap((row) => row.toJSON().components.map((c) => c.custom_id));
    expect(ids).toEqual([MUSIC_BUTTONS.replay]);
  });
});

describe('a playlist card replays the whole playlist', () => {
  it('binds the idle button to the collection, not its last song', () => {
    const [row] = musicControls(snapshot({ current: null, history: [track] }), {
      historyId: 7,
      collectionId: 3,
    });
    const button = row?.toJSON().components[0];
    expect(button?.custom_id).toBe(`${REPLAY_LIST_PREFIX}3`);
    expect(button?.disabled).toBe(false);
  });

  it('replays the playlist from a demoted card too', () => {
    const button = replayOneControls({ historyId: 7, collectionId: 3 })[0]?.toJSON()
      .components[0];
    expect(button?.custom_id).toBe(`${REPLAY_LIST_PREFIX}3`);
  });
});

describe('replayOneControls', () => {
  it('binds the button to one stored play', () => {
    const button = replayOneControls({ historyId: 42 })[0]?.toJSON().components[0];
    expect(button?.custom_id).toBe(`${REPLAY_ONE_PREFIX}42`);
    expect(button?.disabled).toBeFalsy();
  });

  it('stays inside the Discord custom id limit for any plausible id', () => {
    const button = replayOneControls(9_007_199_254_740_991)[0]?.toJSON().components[0];
    expect((button?.custom_id ?? '').length).toBeLessThanOrEqual(100);
  });

  it('is the only control left on a finished card', () => {
    expect(replayOneControls(1)).toHaveLength(1);
    expect(replayOneControls(1)[0]?.toJSON().components).toHaveLength(1);
  });
});
