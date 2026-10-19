import React from 'react';
import { ClipItem, MediaItem } from '../types';
import { fmt } from '../utils/format';
import { isVideoFile } from '../utils/media';

interface PreviewAreaProps {
  previewRef: React.RefObject<HTMLDivElement | null>;
  fullscreen: boolean;
  theme: string;
  previewSrc: string | null;
  currentTime: number;
  activeClip: ClipItem | undefined;
  library: MediaItem[];
  isPlaying?: boolean;
}

export const PreviewArea: React.FC<PreviewAreaProps> = ({
  previewRef,
  fullscreen,
  theme,
  previewSrc,
  currentTime,
  activeClip,
  library,
  isPlaying = false,
}) => {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const activeMedia = activeClip ? library.find((m) => m.id === activeClip.mediaId) : null;
  const isVideo = isVideoFile(activeMedia?.name, activeMedia?.type);

  React.useEffect(() => {
    if (!videoRef.current || !isVideo || !activeClip) return;
    const clipOffset = Math.max(0, currentTime - activeClip.startTime);
    const videoDur = videoRef.current.duration || activeClip.duration;
    const targetTime = videoDur > 0 ? clipOffset % videoDur : clipOffset;
    if (Math.abs(videoRef.current.currentTime - targetTime) > 0.25) {
      videoRef.current.currentTime = targetTime;
    }
    if (isPlaying && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else if (!isPlaying && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, [currentTime, isPlaying, isVideo, activeClip]);
  const effect = activeClip?.effect || 'none';
  const transition = activeClip?.transition || 'none';
  const filter = activeClip?.filter || 'none';
  const intensity = activeClip?.filterIntensity ?? 100;
  const fitStyle = (activeClip?.fit || 'contain') as any;

  let effectClass = '';
  if (effect === 'kenburns') {
    effectClass = Math.floor(activeClip?.startTime ?? 0) % 2 === 0 ? 'effect-kenburns' : 'effect-kenburns2';
  } else if (effect !== 'none') {
    effectClass = `effect-${effect}`;
  }

  let transClass = '';
  if (transition && transition !== 'none') {
    transClass = `transition-${transition}`;
  }

  let filterStyle = 'none';
  if (filter === 'grayscale') filterStyle = `grayscale(${intensity}%)`;
  if (filter === 'sepia') filterStyle = `sepia(${intensity}%)`;
  if (filter === 'blur') filterStyle = `blur(${intensity / 10}px)`;
  if (filter === 'contrast') filterStyle = `contrast(${100 + intensity}%)`;
  if (filter === 'saturate') filterStyle = `saturate(${100 + intensity * 2}%)`;
  if (filter === 'invert') filterStyle = `invert(${intensity}%)`;
  if (filter === 'huerotate') filterStyle = `hue-rotate(${intensity * 3.6}deg)`;

  const transDur = activeClip?.transitionDuration ?? 0.8;

  return (
    <div
      ref={previewRef}
      style={{
        flex: 1,
        background: fullscreen ? '#000' : 'var(--panel)',
        padding: fullscreen ? '0px' : '6px',
        display: 'flex',
      }}
    >
      <div
        style={{
          flex: 1,
          containerType: 'size' as any,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <div
          style={{
            position: 'relative',
            aspectRatio: '16 / 9',
            width: '100cqw',
            maxWidth: 'calc(100cqh * 16 / 9)',
            maxHeight: '100cqh',
            background: '#000',
            border: fullscreen ? 'none' : '1px solid var(--border)',
            boxShadow: fullscreen ? 'none' : theme === 'dark' ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.15)',
            borderRadius: fullscreen ? '0px' : '4px',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <div
            className={
              activeClip?.filter === 'grain' ? 'wrapper-grain' : activeClip?.filter === 'vignette' ? 'wrapper-vignette' : ''
            }
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              '--grain-opacity': (activeClip?.filterIntensity ?? 100) / 100,
              '--filter-intensity': activeClip?.filterIntensity ?? 100,
            } as React.CSSProperties}
          >
            {previewSrc ? (
              <div
                key={activeClip?.id}
                className={transClass}
                style={{ width: '100%', height: '100%', '--trans-dur': `${transDur}s`, overflow: 'hidden' } as React.CSSProperties}
              >
                {isVideo ? (
                  <video
                    ref={videoRef}
                    src={previewSrc}
                    muted
                    playsInline
                    className={effectClass}
                    style={{ width: '100%', height: '100%', objectFit: fitStyle, filter: filterStyle }}
                  />
                ) : (
                  <img
                    src={previewSrc}
                    alt="preview"
                    className={effectClass}
                    style={{ width: '100%', height: '100%', objectFit: fitStyle, filter: filterStyle }}
                  />
                )}
                {activeClip && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 12,
                      bottom: 12,
                      padding: '6px 10px',
                      background: 'rgba(0,0,0,0.55)',
                      borderRadius: 4,
                      color: '#fff',
                      fontSize: 11,
                      zIndex: 12,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{activeMedia?.name || 'Clip ativo'}</div>
                    <div>{Math.max(0, activeClip.duration).toFixed(1)}s</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--muted)', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📺</div>
                <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11 }}>SEM SINAL</div>
              </div>
            )}
          </div>

          <div
            className="mono"
            style={{
              position: 'absolute',
              top: 10,
              right: 12,
              background: 'rgba(0,0,0,0.7)',
              padding: '3px 8px',
              fontSize: 12,
              color: 'var(--accent2)',
              borderRadius: 2,
              zIndex: 10,
            }}
          >
            {fmt(currentTime)}
          </div>
        </div>
      </div>
    </div>
  );
};
