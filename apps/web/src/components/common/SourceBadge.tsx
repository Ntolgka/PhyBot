import type { ReactNode } from 'react';
import type { TrackSource } from '@phybot/shared';
import { Badge } from '../ui/Badge';
import type { BadgeVariant } from '../ui/Badge';

const SOURCE_LABEL: Record<TrackSource, string> = {
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  spotify: 'Spotify',
  radio: 'Radio',
  file: 'File',
};

const SOURCE_VARIANT: Record<TrackSource, BadgeVariant> = {
  youtube: 'danger',
  soundcloud: 'warning',
  spotify: 'success',
  radio: 'info',
  file: 'neutral',
};

export function SourceBadge({ source }: { source: TrackSource }): ReactNode {
  return <Badge variant={SOURCE_VARIANT[source]}>{SOURCE_LABEL[source]}</Badge>;
}
