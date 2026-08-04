import { useState } from 'react';
import type { ReactNode } from 'react';
import type { AiProvider, AiSettings, SttProvider } from '@phybot/shared';
import { AI_PROVIDERS, STT_PROVIDERS } from '@phybot/shared';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { Switch } from '../../components/ui/Switch';
import { SaveBar } from '../../components/common/SaveBar';
import { useAiVoicesQuery, useUpdateAiSettingsMutation } from '../../features/ai/api';
import { useUiStore } from '../../store/uiStore';

const PROVIDER_LABEL: Record<AiProvider, string> = {
  none: 'Disabled',
  gemini: 'Google Gemini',
  groq: 'Groq',
  ollama: 'Ollama (local)',
};

const STT_PROVIDER_LABEL: Record<SttProvider, string> = {
  none: 'Disabled',
  gemini: 'Google Gemini',
  groq: 'Groq',
};

export function AiSettingsForm({ initial }: { initial: AiSettings }): ReactNode {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const voices = useAiVoicesQuery();
  const updateMutation = useUpdateAiSettingsMutation();
  const pushToast = useUiStore((state) => state.pushToast);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  function set<K extends keyof AiSettings>(key: K, value: AiSettings[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave(): void {
    updateMutation.mutate(form, {
      onSuccess: (data) => {
        setSaved(data);
        setForm(data);
        pushToast({ level: 'success', message: 'AI settings saved.' });
      },
      onError: (error) => {
        pushToast({
          level: 'error',
          message: error instanceof Error ? error.message : 'Could not save AI settings.',
        });
      },
    });
  }

  return (
    <Card
      title="Assistant configuration"
      description="Providers, voice and behaviour for the AI assistant."
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Text provider"
            value={form.provider}
            onChange={(e) => set('provider', e.target.value as AiProvider)}
            options={AI_PROVIDERS.map((value) => ({ value, label: PROVIDER_LABEL[value] }))}
          />
          <Select
            label="Speech-to-text provider"
            value={form.sttProvider}
            onChange={(e) => set('sttProvider', e.target.value as SttProvider)}
            options={STT_PROVIDERS.map((value) => ({ value, label: STT_PROVIDER_LABEL[value] }))}
          />
          <Input
            label="Model"
            value={form.model}
            onChange={(e) => set('model', e.target.value)}
            maxLength={120}
          />
          <Select
            label="Language"
            value={form.language}
            onChange={(e) => set('language', e.target.value as AiSettings['language'])}
            options={[
              { value: 'tr', label: 'Türkçe' },
              { value: 'en', label: 'English' },
            ]}
          />
          <Select
            label="TTS voice"
            value={form.ttsVoice}
            onChange={(e) => set('ttsVoice', e.target.value)}
            options={(voices.data ?? []).map((voice) => ({ value: voice.id, label: voice.label }))}
            placeholder={voices.isLoading ? 'Loading voices…' : 'Select a voice'}
          />
          <Input
            label="Wake word"
            value={form.wakeWord}
            onChange={(e) => set('wakeWord', e.target.value)}
            minLength={2}
            maxLength={32}
          />
        </div>

        <Textarea
          label="Persona"
          hint="Extra instructions appended to the assistant's system prompt."
          value={form.persona}
          onChange={(e) => set('persona', e.target.value)}
          rows={4}
          maxLength={2000}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Switch
            checked={form.speakReplies}
            onChange={(value) => set('speakReplies', value)}
            label="Speak replies aloud"
            description="Reply out loud after a voice command."
          />
          <Input
            type="number"
            label="Memory turns"
            hint="Previous turns kept per channel for context."
            min={0}
            max={30}
            value={form.memoryTurns}
            onChange={(e) => set('memoryTurns', Number(e.target.value))}
          />
        </div>
      </div>

      <SaveBar
        visible={dirty}
        pending={updateMutation.isPending}
        onSave={handleSave}
        onReset={() => setForm(saved)}
      />
    </Card>
  );
}
