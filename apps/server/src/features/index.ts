import { handleMemberJoin, handleMemberLeave } from './membership.js';
import {
  cancelEvent,
  createEvent,
  deleteEvent,
  getEvent,
  handleEventInteraction,
  listEvents,
  publishEvent,
  setRsvp,
  startEventScheduler,
  stopEventScheduler,
  updateEvent,
} from './events/service.js';
import {
  createPanel,
  deletePanel,
  handleRolePanelInteraction,
  listPanels,
  publishPanel,
  updatePanel,
} from './rolePanels/service.js';
import { handleVoiceStateUpdate, resetVoiceAnnouncements } from './voiceAnnounce/service.js';
import {
  announceOffer,
  getFreeGamesStatus,
  refreshFreeGames,
  startFreeGamesScheduler,
  stopFreeGamesScheduler,
} from './freeGames/service.js';

export {
  handleMemberJoin,
  handleMemberLeave,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  cancelEvent,
  deleteEvent,
  publishEvent,
  setRsvp,
  handleEventInteraction,
  listPanels,
  createPanel,
  updatePanel,
  deletePanel,
  publishPanel,
  handleRolePanelInteraction,
  getFreeGamesStatus,
  refreshFreeGames,
  announceOffer,
  handleVoiceStateUpdate,
  resetVoiceAnnouncements,
};

/** Starts every background scheduler owned by the community features. Safe to call once at startup. */
export function startFeatureSchedulers(): void {
  startEventScheduler();
  startFreeGamesScheduler();
}

export function stopFeatureSchedulers(): void {
  stopEventScheduler();
  stopFreeGamesScheduler();
}
