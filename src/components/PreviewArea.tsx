import React from 'react';
import { ClipItem, MediaItem } from '../types';
import { fmt } from '../utils/format';
import { isVideoFile, isAudioFile } from '../utils/media';

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
  const isSeekingRef = React.useRef(false);
  const activeMedia = activeClip ? library.find((m) => m.id === activeClip.mediaId) : null;
  const isVideo = isVideoFile(activeMedia?.name, activeMedia?.type);

  // Procura imagem companheira com o mesmo nome base (Regra #3: vídeo + imagem quando cena > 140% do vídeo)
  const companionImage = React.useMemo(() => {
    if (!isVideo || !activeMedia) return null;
    const base = activeMedia.name.toLowerCase().replace(/\.[^/.]+$/, '');
    return library.find(
      (m) =>
        m.id !== activeMedia.id &&
        !isVideoFile(m.name, m.type) &&
        !isAudioFile(m.name, m.type) &&
        m.name.toLowerCase().replace(/\.[^/.]+$/, '') === base &&
        Boolean(m.url)
    );
  }, [activeMedia, isVideo, library]);

  const clipOffset = activeClip ? Math.max(0, currentTime - activeClip.startTime) : 0;
  const videoDur =
    videoRef.current && Number.isFinite(videoRef.current.duration) && videoRef.current.duration > 0.05
      ? videoRef.current.duration
      : activeMedia?.duration && activeMedia.duration > 0
      ? activeMedia.duration
      : activeClip?.duration || 5;

  // Decide se exibe a imagem companheira (quando tempo atual ultrapassar a duração natural do vídeo)
  const isPastVideo = isVideo && clipOffset > videoDur;
  const showCompanion = Boolean(isPastVideo && companionImage?.url);

  // Regra #2: Slow-motion suave se a cena for maior que o vídeo até 40%
  const isSlowMo =
    isVideo &&
    activeClip &&
    activeClip.duration > videoDur &&
    activeClip.duration <= videoDur * 1.405;
  const slowRate = isSlowMo ? Math.max(0.25, Math.min(1.0, videoDur / activeClip.duration)) : 1.0;

  // Tempo de vídeo esperado no instante atual (se estiver em slow motion, avança proporcionalmente)
  const targetVideoTime = isSlowMo ? clipOffset * slowRate : clipOffset;

  const clipVol = typeof activeClip?.volume === 'number' ? Math.max(0, Math.min(1, activeClip.volume)) : 0;
  const isMuted = clipVol <= 0.001;

  // Sincronização contínua e estável do player de vídeo HTML5
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo || !activeClip || showCompanion) return;

    // Define playbackRate (suporte nativo do navegador a slow motion)
    try {
      if (Math.abs(video.playbackRate - slowRate) > 0.01) {
        video.playbackRate = slowRate;
      }
    } catch {}

    // Sincroniza volume individual do clipe
    try {
      video.muted = isMuted;
      video.volume = clipVol;
    } catch {}

    // Caso o vídeo tenha acabado e não haja imagem companheira: congela no último frame
    if (clipOffset >= (isSlowMo ? activeClip.duration : videoDur)) {
      if (!video.paused) video.pause();
      const lastFrame = Math.max(0, videoDur - 0.05);
      if (video.readyState >= 1 && Math.abs(video.currentTime - lastFrame) > 0.1 && !isSeekingRef.current) {
        try {
          video.currentTime = lastFrame;
        } catch {}
      }
      return;
    }

    if (isPlaying) {
      // Quando estiver em reprodução contínua: inicia reprodução se pausado
      if (video.paused && video.readyState >= 2) {
        video.play().catch(() => {});
      }

      // Só reposiciona (seek) se o drift for real (> 0.75s) considerando a velocidade de reprodução
      const drift = Math.abs(video.currentTime - targetVideoTime);
      if (drift > 0.75 && video.readyState >= 1 && !isSeekingRef.current) {
        try {
          video.currentTime = Math.min(targetVideoTime, Math.max(0, videoDur - 0.05));
        } catch {}
      }
    } else {
      // Quando estiver pausado / scrubbing: pausa e sincroniza o frame exato
      if (!video.paused) video.pause();
      if (video.readyState >= 1 && Math.abs(video.currentTime - targetVideoTime) > 0.05 && !isSeekingRef.current) {
        try {
          video.currentTime = Math.min(targetVideoTime, Math.max(0, videoDur - 0.05));
        } catch {}
      }
    }
  }, [currentTime, isPlaying, isVideo, activeClip, showCompanion, slowRate, videoDur, clipOffset, isSlowMo, targetVideoTime, clipVol, isMuted]);

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

  // URL final a exibir: imagem companheira se estiver na parte final da cena, senão previewSrc
  const finalSrc = showCompanion && companionImage?.url ? companionImage.url : previewSrc;
  const isCurrentlyRenderingVideo = isVideo && !showCompanion;

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
            boxShadow: fullscreen
              ? 'none'
              : theme === 'dark'
              ? '0 8px 32px rgba(0,0,0,0.5)'
              : '0 8px 32px rgba(0,0,0,0.15)',
            borderRadius: fullscreen ? '0px' : '4px',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <div
            className={
              activeClip?.filter === 'grain'
                ? 'wrapper-grain'
                : activeClip?.filter === 'vignette'
                ? 'wrapper-vignette'
                : ''
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
            {finalSrc ? (
              <div
                className={transClass}
                style={
                  {
                    width: '100%',
                    height: '100%',
                    '--trans-dur': `${transDur}s`,
                    overflow: 'hidden',
                    position: 'relative',
                  } as React.CSSProperties
                }
              >
                {isCurrentlyRenderingVideo ? (
                  <video
                    key={activeMedia?.id}
                    ref={videoRef}
                    src={finalSrc}
                    muted={isMuted}
                    playsInline
                    preload="auto"
                    disablePictureInPicture
                    className={effectClass}
                    onLoadedMetadata={() => {
                      if (videoRef.current) {
                        try {
                          videoRef.current.playbackRate = slowRate;
                          videoRef.current.currentTime = clipOffset;
                          if (isPlaying) videoRef.current.play().catch(() => {});
                        } catch {}
                      }
                    }}
                    onCanPlay={() => {
                      if (videoRef.current && isPlaying && videoRef.current.paused) {
                        videoRef.current.play().catch(() => {});
                      }
                    }}
                    onSeeking={() => {
                      isSeekingRef.current = true;
                    }}
                    onSeeked={() => {
                      isSeekingRef.current = false;
                    }}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: fitStyle,
                      filter: filterStyle,
                      display: 'block',
                    }}
                  />
                ) : (
                  <img
                    src={finalSrc}
                    alt="preview"
                    className={effectClass}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: fitStyle,
                      filter: filterStyle,
                      display: 'block',
                    }}
                  />
                )}

                {activeClip && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 12,
                      bottom: 12,
                      padding: '6px 10px',
                      background: 'rgba(0,0,0,0.65)',
                      backdropFilter: 'blur(4px)',
                      borderRadius: 4,
                      color: '#fff',
                      fontSize: 11,
                      zIndex: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>{isCurrentlyRenderingVideo ? '🎬' : '🖼️'}</span>
                    <div>
                      <div style={{ fontWeight: 700 }}>
                        {showCompanion ? companionImage?.name : activeMedia?.name || 'Clip ativo'}
                        {showCompanion && <span style={{ color: '#38bdf8', marginLeft: 4 }}>(imagem de fechamento)</span>}
                        {isSlowMo && !showCompanion && <span style={{ color: '#facc15', marginLeft: 4 }}>(slow-motion {slowRate.toFixed(2)}x)</span>}
                      </div>
                      <div style={{ color: '#cbd5e1' }}>{Math.max(0, activeClip.duration).toFixed(1)}s</div>
                    </div>
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
