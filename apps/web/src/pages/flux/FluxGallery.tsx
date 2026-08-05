import type { ReactNode } from 'react';
import type { FluxImage } from '@phybot/shared';
import { ImageOff } from 'lucide-react';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { FluxImageCard } from './FluxImageCard';

export function FluxGallery({
  images,
  isLoading,
  isError,
  errorDescription,
  onRetry,
  onDelete,
}: {
  images: FluxImage[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorDescription?: string;
  onRetry: () => void;
  onDelete: (image: FluxImage) => void;
}): ReactNode {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="aspect-square" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorState description={errorDescription} onRetry={onRetry} />;
  }

  if (!images || images.length === 0) {
    return (
      <EmptyState
        icon={<ImageOff className="size-8" />}
        title="No images yet"
        description="Generate your first image with the form above."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {images.map((image) => (
        <FluxImageCard key={image.id} image={image} onDelete={() => onDelete(image)} />
      ))}
    </div>
  );
}
