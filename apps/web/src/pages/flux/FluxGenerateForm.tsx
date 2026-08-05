import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { FluxConfig, FluxStatus, FluxStyle } from '@phybot/shared';
import { FLUX_STYLE_LABEL, FLUX_STYLES, MAX_FLUX_BATCH, MIN_FLUX_BATCH } from '@phybot/shared';
import { ChevronDown, ChevronUp, Wand2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { cn } from '../../lib/cn';
import { errorMessage } from '../../lib/api';
import {
  useClearFluxProgress,
  useFluxProgressQuery,
  useGenerateFluxMutation,
  type FluxGenerateParams,
} from '../../features/flux/api';
import { useUiStore } from '../../store/uiStore';
import { FluxProgressPanel } from './FluxProgressPanel';

const BATCH_SIZES = Array.from(
  { length: MAX_FLUX_BATCH - MIN_FLUX_BATCH + 1 },
  (_, index) => MIN_FLUX_BATCH + index,
);

interface AdvancedState {
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  seed: number;
}

function advancedFromConfig(config: FluxConfig): AdvancedState {
  return {
    width: config.width,
    height: config.height,
    steps: config.steps,
    cfgScale: config.cfgScale,
    seed: -1,
  };
}

export function FluxGenerateForm({
  config,
  status,
}: {
  config: FluxConfig;
  status: FluxStatus;
}): ReactNode {
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [style, setStyle] = useState<FluxStyle>('none');
  const [count, setCount] = useState(1);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advanced, setAdvanced] = useState<AdvancedState>(() => advancedFromConfig(config));

  const generateMutation = useGenerateFluxMutation();
  const progress = useFluxProgressQuery();
  const clearProgress = useClearFluxProgress();
  const pushToast = useUiStore((state) => state.pushToast);

  const ready = status.installed && status.modelsReady;
  const busy = status.busy || generateMutation.isPending;
  const canSubmit = ready && !busy && prompt.trim().length > 0;

  function setAdvancedField<K extends keyof AdvancedState>(key: K, value: AdvancedState[K]): void {
    setAdvanced((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (!canSubmit) return;

    const params: FluxGenerateParams = {
      prompt: prompt.trim(),
      count,
      width: advanced.width,
      height: advanced.height,
      steps: advanced.steps,
      cfgScale: advanced.cfgScale,
      ...(negativePrompt.trim() ? { negativePrompt: negativePrompt.trim() } : {}),
      ...(style !== 'none' ? { style } : {}),
      ...(advanced.seed >= 0 ? { seed: advanced.seed } : {}),
    };

    generateMutation.mutate(params, {
      onError: (error) => pushToast({ level: 'error', message: errorMessage(error) }),
      onSettled: () => clearProgress(),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
    >
      <Textarea
        label="Prompt"
        placeholder="A lighthouse on a cliff at sunset, cinematic lighting"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        maxLength={1500}
        rows={3}
        disabled={busy}
        required
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-dim">Style</span>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border-strong bg-surface-2 p-1">
          {FLUX_STYLES.map((value) => (
            <button
              key={value}
              type="button"
              disabled={busy}
              onClick={() => setStyle(value)}
              aria-pressed={style === value}
              className={cn(
                'focus-ring rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
                style === value ? 'accent-gradient text-white' : 'text-ink-dim hover:text-ink',
              )}
            >
              {FLUX_STYLE_LABEL[value]}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-faint">
          Without a style the model picks one per seed, so the same prompt can come back as a
          photograph or as artwork.
        </p>
      </div>

      <Textarea
        label="Negative prompt"
        // The distilled FLUX models are guidance free: at a guidance scale of 1
        // the unconditional branch is never computed, so this text is ignored.
        hint={
          advanced.cfgScale > 1
            ? 'What should not appear in the image.'
            : 'Ignored at guidance 1. The distilled FLUX models are trained without guidance; raise it above 1 in the advanced options for this to have any effect.'
        }
        placeholder="blurry, extra fingers, watermark"
        value={negativePrompt}
        onChange={(e) => setNegativePrompt(e.target.value)}
        maxLength={1000}
        rows={2}
        disabled={busy}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-dim">Images</span>
        <div className="inline-flex w-fit gap-1 rounded-lg border border-border-strong bg-surface-2 p-1">
          {BATCH_SIZES.map((value) => (
            <button
              key={value}
              type="button"
              disabled={busy}
              onClick={() => setCount(value)}
              aria-pressed={count === value}
              className={cn(
                'focus-ring size-8 rounded-md text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
                count === value ? 'accent-gradient text-white' : 'text-ink-dim hover:text-ink',
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          className="focus-ring flex items-center gap-1.5 text-sm font-medium text-ink-dim hover:text-ink"
          aria-expanded={advancedOpen}
        >
          {advancedOpen ? (
            <ChevronUp className="size-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4" aria-hidden="true" />
          )}
          Advanced options
        </button>

        {advancedOpen && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Input
              type="number"
              label="Width"
              min={256}
              max={1536}
              step={64}
              disabled={busy}
              value={advanced.width}
              onChange={(e) => setAdvancedField('width', Number(e.target.value))}
            />
            <Input
              type="number"
              label="Height"
              min={256}
              max={1536}
              step={64}
              disabled={busy}
              value={advanced.height}
              onChange={(e) => setAdvancedField('height', Number(e.target.value))}
            />
            <Input
              type="number"
              label="Steps"
              min={1}
              max={50}
              disabled={busy}
              value={advanced.steps}
              onChange={(e) => setAdvancedField('steps', Number(e.target.value))}
            />
            <Input
              type="number"
              label="CFG scale"
              min={0}
              max={20}
              step={0.5}
              disabled={busy}
              value={advanced.cfgScale}
              onChange={(e) => setAdvancedField('cfgScale', Number(e.target.value))}
            />
            <Input
              type="number"
              label="Seed"
              hint="-1 picks a random seed"
              min={-1}
              max={2_147_483_647}
              disabled={busy}
              value={advanced.seed}
              onChange={(e) => setAdvancedField('seed', Number(e.target.value))}
            />
          </div>
        )}
      </div>

      {progress.data && <FluxProgressPanel progress={progress.data} />}

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-ink-faint">
          {!ready
            ? 'Set up the FLUX engine before generating images.'
            : busy
              ? 'The engine is busy rendering another request. Wait for it to finish.'
              : 'Generation runs locally and can take a while depending on your hardware.'}
        </p>
        <Button
          type="submit"
          variant="primary"
          leadingIcon={<Wand2 className="size-4" aria-hidden="true" />}
          pending={generateMutation.isPending}
          disabled={!canSubmit}
        >
          Generate
        </Button>
      </div>
    </form>
  );
}
