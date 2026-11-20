import { useEffect, useState } from 'react';
import { markActivity } from '../offline/timeTracker';

/** Видео из Blob через objectURL (не через кэш SW — надёжнее на iOS Safari). Воспроизведение считается активностью. */
export function VideoPlayer({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url) return null;
  return (
    <video
      src={url}
      controls
      playsInline
      preload="metadata"
      className="w-full rounded-xl bg-black max-h-[70vh]"
      onTimeUpdate={(e) => {
        if (!(e.target as HTMLVideoElement).paused) markActivity();
      }}
    />
  );
}
