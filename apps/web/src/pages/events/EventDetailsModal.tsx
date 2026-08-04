import { useState } from 'react';
import type { ReactNode } from 'react';
import type { GuildEvent } from '@phybot/shared';
import { Ban, MapPin, Pencil, Radio, Trash2, Users } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AttendeeList } from './AttendeeList';
import {
  useCancelEventMutation,
  useDeleteEventMutation,
  usePublishEventMutation,
} from '../../features/events/api';
import { formatDateTime } from '../../lib/format';
import { useUiStore } from '../../store/uiStore';

export function EventDetailsModal({
  event,
  onClose,
  onEdit,
}: {
  event: GuildEvent;
  onClose: () => void;
  onEdit: () => void;
}): ReactNode {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const publishMutation = usePublishEventMutation();
  const cancelMutation = useCancelEventMutation();
  const deleteMutation = useDeleteEventMutation();
  const pushToast = useUiStore((state) => state.pushToast);

  const goingCount = event.rsvps.filter((rsvp) => rsvp.status === 'going').length;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={event.title}
        size="md"
        description={
          <span className="flex flex-wrap items-center gap-2">
            {formatDateTime(event.startsAt)}
            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                {event.location}
              </span>
            )}
            {event.cancelled && <Badge variant="danger">Cancelled</Badge>}
            {!event.cancelled && event.messageId && <Badge variant="success">Published</Badge>}
          </span>
        }
        footer={
          <>
            <Button
              variant="outline"
              leadingIcon={<Trash2 className="size-4" aria-hidden="true" />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
            {!event.cancelled && (
              <Button
                variant="outline"
                leadingIcon={<Ban className="size-4" aria-hidden="true" />}
                onClick={() => setConfirmCancel(true)}
              >
                Cancel event
              </Button>
            )}
            <Button
              variant="secondary"
              leadingIcon={<Pencil className="size-4" aria-hidden="true" />}
              onClick={onEdit}
            >
              Edit
            </Button>
            <Button
              variant="primary"
              leadingIcon={<Radio className="size-4" aria-hidden="true" />}
              pending={publishMutation.isPending}
              onClick={() =>
                publishMutation.mutate(event.id, {
                  onSuccess: () => pushToast({ level: 'success', message: 'Event published.' }),
                  onError: (error) =>
                    pushToast({
                      level: 'error',
                      message: error instanceof Error ? error.message : 'Could not publish event.',
                    }),
                })
              }
            >
              {event.messageId ? 'Republish' : 'Publish'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          {event.description && (
            <p className="whitespace-pre-wrap text-sm text-ink-dim">{event.description}</p>
          )}

          <div className="flex flex-wrap gap-4 text-xs text-ink-faint">
            <span>Created by {event.createdByName}</span>
            {event.capacity > 0 && (
              <span className="flex items-center gap-1">
                <Users className="size-3.5" aria-hidden="true" />
                {goingCount} / {event.capacity} going
              </span>
            )}
            {event.reminderMinutes > 0 && (
              <span>Reminder {event.reminderMinutes}m before start</span>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Attendees</h3>
            <AttendeeList rsvps={event.rsvps} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this event?"
        description="This permanently removes the event and its RSVP message."
        confirmLabel="Delete"
        danger
        pending={deleteMutation.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          deleteMutation.mutate(event.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              onClose();
            },
          })
        }
      />

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this event?"
        description="Attendees will see the event marked as cancelled."
        confirmLabel="Cancel event"
        danger
        pending={cancelMutation.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() =>
          cancelMutation.mutate(event.id, {
            onSuccess: () => setConfirmCancel(false),
          })
        }
      />
    </>
  );
}
