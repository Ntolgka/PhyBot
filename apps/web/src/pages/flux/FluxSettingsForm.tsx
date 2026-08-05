import { useState } from 'react';
import type { ReactNode } from 'react';
import type { FluxBackend, FluxConfig } from '@phybot/shared';
import { FLUX_BACKENDS } from '@phybot/shared';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Switch } from '../../components/ui/Switch';
import { SaveBar } from '../../components/common/SaveBar';
import { useUpdateFluxConfigMutation } from '../../features/flux/api';
import { errorMessage } from '../../lib/api';
import { useUiStore } from '../../store/uiStore';

const BACKEND_LABEL: Record<FluxBackend, string> = {
  cuda: 'NVIDIA CUDA',
  vulkan: 'Vulkan',
  cpu: 'CPU (slowest)',
};

export function FluxSettingsForm({ initial }: { initial: FluxConfig }): ReactNode {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const updateMutation = useUpdateFluxConfigMutation();
  const pushToast = useUiStore((state) => state.pushToast);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  function set<K extends keyof FluxConfig>(key: K, value: FluxConfig[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave(): void {
    updateMutation.mutate(form, {
      onSuccess: (data) => {
        setSaved(data);
        setForm(data);
        pushToast({ level: 'success', message: 'FLUX settings saved.' });
      },
      onError: (error) => {
        pushToast({ level: 'error', message: errorMessage(error) });
      },
    });
  }

  return (
    <Card title="Engine settings" description="Backend, model files and generation defaults.">
      <div className="flex flex-col gap-4">
        <Select
          label="Backend"
          value={form.backend}
          onChange={(e) => set('backend', e.target.value as FluxBackend)}
          options={FLUX_BACKENDS.map((value) => ({ value, label: BACKEND_LABEL[value] }))}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Diffusion model"
            hint="File name inside Flux/models"
            value={form.model}
            onChange={(e) => set('model', e.target.value)}
            maxLength={200}
          />
          <Input
            label="Upscale model"
            hint="Optional; needed for the Upscale button"
            value={form.upscaleModel}
            onChange={(e) => set('upscaleModel', e.target.value)}
            maxLength={200}
          />
          <Input
            label="Text encoder (FLUX.2)"
            hint="Qwen3 file for FLUX.2 models. Clear it to use a FLUX.1 model instead."
            value={form.llm}
            onChange={(e) => set('llm', e.target.value)}
            maxLength={200}
          />
          {!form.llm && (
            <>
              <Input
                label="CLIP-L encoder"
                hint="FLUX.1 only"
                value={form.clipL}
                onChange={(e) => set('clipL', e.target.value)}
                maxLength={200}
              />
              <Input
                label="T5 encoder"
                hint="FLUX.1 only"
                value={form.t5}
                onChange={(e) => set('t5', e.target.value)}
                maxLength={200}
              />
            </>
          )}
          <Input
            label="VAE"
            value={form.vae}
            onChange={(e) => set('vae', e.target.value)}
            maxLength={200}
          />
          <Input
            label="Sampler"
            value={form.sampler}
            onChange={(e) => set('sampler', e.target.value)}
            maxLength={40}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            type="number"
            label="Default width"
            min={256}
            max={1536}
            step={64}
            value={form.width}
            onChange={(e) => set('width', Number(e.target.value))}
          />
          <Input
            type="number"
            label="Default height"
            min={256}
            max={1536}
            step={64}
            value={form.height}
            onChange={(e) => set('height', Number(e.target.value))}
          />
          <Input
            type="number"
            label="Steps"
            min={1}
            max={50}
            value={form.steps}
            onChange={(e) => set('steps', Number(e.target.value))}
          />
          <Input
            type="number"
            label="CFG scale"
            min={0}
            max={20}
            step={0.5}
            value={form.cfgScale}
            onChange={(e) => set('cfgScale', Number(e.target.value))}
          />
          <Input
            type="number"
            label="CPU threads"
            hint="-1 lets the runtime decide"
            min={-1}
            max={64}
            value={form.threads}
            onChange={(e) => set('threads', Number(e.target.value))}
          />
          <Input
            type="number"
            label="Keep unsaved images (days)"
            hint="0 keeps everything"
            min={0}
            max={365}
            value={form.keepUnsavedDays}
            onChange={(e) => set('keepUnsavedDays', Number(e.target.value))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Switch
            checked={form.diffusionFlashAttention}
            onChange={(value) => set('diffusionFlashAttention', value)}
            label="Flash attention"
            description="Saves memory during diffusion."
          />
          <Switch
            checked={form.vaeTiling}
            onChange={(value) => set('vaeTiling', value)}
            label="VAE tiling"
            description="Decodes in tiles; needed on smaller cards."
          />
          <Switch
            checked={form.offloadToCpu}
            onChange={(value) => set('offloadToCpu', value)}
            label="Offload to CPU"
            description="Moves weights to RAM between steps when VRAM is tight."
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
