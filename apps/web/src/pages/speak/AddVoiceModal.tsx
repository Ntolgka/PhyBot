import { useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Tabs } from '../../components/ui/Tabs';
import { CatalogVoiceBrowser } from './CatalogVoiceBrowser';
import { CustomVoiceForm } from './CustomVoiceForm';

type AddVoiceTab = 'catalog' | 'custom';

export function AddVoiceModal({ onClose }: { onClose: () => void }): ReactNode {
  const [tab, setTab] = useState<AddVoiceTab>('catalog');

  return (
    <Modal
      open
      onClose={onClose}
      title="Add voice"
      description="Install a voice from a provider's catalogue, or point at a program that generates speech."
      size="lg"
    >
      <Tabs
        value={tab}
        onChange={(value) => setTab(value as AddVoiceTab)}
        items={[
          { value: 'catalog', label: 'From catalogue' },
          { value: 'custom', label: 'Custom engine' },
        ]}
        className="mb-4"
      />
      {tab === 'catalog' ? (
        <CatalogVoiceBrowser />
      ) : (
        <CustomVoiceForm onCreated={onClose} onCancel={onClose} />
      )}
    </Modal>
  );
}
