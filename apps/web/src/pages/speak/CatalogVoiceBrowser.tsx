import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { TtsCatalogVoice, TtsVoice } from '@phybot/shared';
import { Check, Search } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { SkeletonText } from '../../components/ui/Skeleton';
import { useCreateTtsVoiceMutation, useTtsCatalogQuery } from '../../features/tts/api';
import { errorMessage } from '../../lib/api';
import { useUiStore } from '../../store/uiStore';

const PROVIDER_LABEL: Record<TtsVoice['provider'], string> = {
  edge: 'Microsoft Edge',
  gemini: 'Gemini',
  command: 'Custom program',
};

/** Hard cap on rendered rows: the catalogue can carry 300+ voices. */
const MAX_VISIBLE = 60;

function catalogKey(voice: TtsCatalogVoice): string {
  return `${voice.provider}:${voice.voiceId}`;
}

export function CatalogVoiceBrowser(): ReactNode {
  const catalog = useTtsCatalogQuery();
  const createMutation = useCreateTtsVoiceMutation();
  const pushToast = useUiStore((state) => state.pushToast);

  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState('');
  const [addingKey, setAddingKey] = useState<string | null>(null);

  const languages = useMemo(() => {
    if (!catalog.data) return [];
    const set = new Set(catalog.data.map((voice) => voice.language).filter((value) => value));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalog.data]);

  const filtered = useMemo(() => {
    if (!catalog.data) return [];
    const query = search.trim().toLowerCase();
    return catalog.data.filter((voice) => {
      if (language && voice.language !== language) return false;
      if (!query) return true;
      return (
        voice.name.toLowerCase().includes(query) || voice.voiceId.toLowerCase().includes(query)
      );
    });
  }, [catalog.data, search, language]);

  const visible = filtered.slice(0, MAX_VISIBLE);

  function handleAdd(voice: TtsCatalogVoice): void {
    const key = catalogKey(voice);
    setAddingKey(key);
    createMutation.mutate(
      {
        name: voice.name,
        provider: voice.provider,
        voiceId: voice.voiceId,
        language: voice.language,
        gender: voice.gender,
      },
      {
        onSuccess: () => {
          pushToast({ level: 'success', message: `Added "${voice.name}".` });
          setAddingKey(null);
        },
        onError: (error) => {
          pushToast({ level: 'error', message: errorMessage(error) });
          setAddingKey(null);
        },
      },
    );
  }

  if (catalog.isLoading) {
    return <SkeletonText lines={6} />;
  }

  if (catalog.isError) {
    return (
      <ErrorState description={errorMessage(catalog.error)} onRetry={() => catalog.refetch()} />
    );
  }

  if (!catalog.data || catalog.data.length === 0) {
    return (
      <EmptyState
        title="Catalogue unavailable"
        description="The provider did not return any installable voices."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or identifier..."
          leadingIcon={<Search className="size-4" aria-hidden="true" />}
          containerClassName="flex-1"
          aria-label="Search the voice catalogue"
        />
        <Select
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          options={languages.map((lang) => ({ value: lang, label: lang }))}
          placeholder="All languages"
          containerClassName="sm:w-48"
          aria-label="Filter by language"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No matches" description="Try a different search or language filter." />
      ) : (
        <>
          <div className="max-h-96 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {visible.map((voice) => {
              const key = catalogKey(voice);
              return (
                <div key={key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{voice.name}</p>
                    <p className="truncate text-xs text-ink-dim">
                      {voice.language || 'Unspecified language'} • {voice.gender || 'unspecified'} •{' '}
                      {PROVIDER_LABEL[voice.provider]}
                    </p>
                  </div>
                  {voice.added ? (
                    <Badge variant="success" icon={<Check className="size-3" aria-hidden="true" />}>
                      Added
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      pending={createMutation.isPending && addingKey === key}
                      disabled={createMutation.isPending && addingKey !== key}
                      onClick={() => handleAdd(voice)}
                    >
                      Add
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-ink-faint">
            {filtered.length > MAX_VISIBLE
              ? `Showing ${MAX_VISIBLE} of ${filtered.length} matches — narrow your search to see more.`
              : `${filtered.length} voice${filtered.length === 1 ? '' : 's'} found.`}
          </p>
        </>
      )}
    </div>
  );
}
