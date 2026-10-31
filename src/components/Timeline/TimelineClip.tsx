import React, { useRef, useState, useEffect } from 'react';
import { ClipItem, MediaItem } from '../../types';
import { PPS } from '../../constants';
import { isVideoFile } from '../../utils/media';
import { useThumbnail } from '../../utils/thumbnails';
import { Waveform } from './Waveform';
import { useWaveform, geraWaveformManual } from '../../utils/waveform';

interface TimelineClipProps {
  clip: ClipItem;
  media: MediaItem | undefined;
  isSelected: boolean;
  isAudio: boolean;
  zoom: number;
  theme: string;
  showWaveform?: boolean;
  onClipMouseDown: (e: React.MouseEvent, clipId: string, type: string) => void;
}

const TimelineClipComponent: React.FC<TimelineClipProps> = ({
  clip,
  media,
  isSelected,
  isAudio,
  zoom,
  theme,
  showWaveform = false,
  onClipMouseDown,
}) => {
  // Observação de visibilidade no viewport/scroll com rootMargin de 200px
  const clipRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = clipRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsVisible(entry.isIntersecting);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  const clipWidthPx = clip.duration * PPS * zoom;
  const isVideo = !isAudio && Boolean(media?.url) && isVideoFile(media!.name, media!.type);
  const tipoMidia: 'video' | 'imagem' = isVideo ? 'video' : 'imagem';
  const temMidiaElegivel = !isAudio && Boolean(media?.url) && !media?.placeholder;
  const isAtivo = temMidiaElegivel && isVisible && clipWidthPx >= 48;

  // Hook de miniatura chamado incondicionalmente no topo
  const { estado: thumbEstado, thumbUrl } = useThumbnail(
    temMidiaElegivel ? media?.url : null,
    tipoMidia,
    isAtivo
  );

  const isAudioEligivel = isAudio && Boolean(media?.url) && !media?.placeholder;

  // Hook da forma de onda real para clips de áudio elegíveis (apenas quando ativado pelo usuário)
  const {
    estado: waveEstado,
    picos: wavePicos,
    picosPorSegundo: wavePps,
    bytes: waveBytes,
  } = useWaveform(
    isAudioEligivel && showWaveform ? media?.url : null,
    media?.duration,
    Boolean(showWaveform)
  );

  const bgColor = isSelected
    ? isAudio
      ? 'rgba(0,200,117,0.4)'
      : 'rgba(45,107,228,0.5)'
    : isAudio
    ? 'rgba(0,200,117,0.15)'
    : 'rgba(45,107,228,0.2)';

  const borderColor = isSelected
    ? isAudio
      ? '#00c875'
      : 'var(--accent2)'
    : isAudio
    ? 'rgba(0,200,117,0.5)'
    : 'var(--accent)';

  const hasScore = !isAudio && typeof clip.score === 'number' && !isNaN(clip.score);
  const scoreVal = hasScore ? (clip.score! > 1 ? clip.score! / 100 : clip.score!) : 0;
  const scorePct = Math.round(scoreVal * 100);
  const scoreColor = scoreVal >= 0.8 ? '#10b981' : scoreVal >= 0.6 ? '#f59e0b' : '#ef4444';
  const scoreTooltip = `Confiança do alinhamento: ${scorePct}%`;

  return (
    <div
      ref={clipRef}
      onMouseDown={(e) => onClipMouseDown(e, clip.id, 'move')}
      onClick={(e) => e.stopPropagation()}
      title={hasScore ? scoreTooltip : undefined}
      style={{
        position: 'absolute',
        top: 3,
        bottom: 3,
        left: clip.startTime * PPS * zoom,
        width: Math.max(clip.duration * PPS * zoom, 10),
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 2,
        cursor: 'grab',
        overflow: 'hidden',
        boxShadow: isSelected
          ? `0 0 10px ${isAudio ? 'rgba(0,200,117,0.3)' : 'rgba(0,212,255,0.3)'}`
          : 'none',
      }}
    >
      {/* Resize left handle */}
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          onClipMouseDown(e, clip.id, 'resize-left');
        }}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 12,
          cursor: 'ew-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingLeft: 2,
          zIndex: 5,
        }}
      >
        <div
          style={{
            width: 3,
            height: 16,
            borderLeft: isSelected ? '1px solid var(--accent2)' : '1px solid rgba(255,255,255,0.4)',
            borderRight: isSelected ? '1px solid var(--accent2)' : '1px solid rgba(255,255,255,0.4)',
          }}
        />
      </div>

      {/* Clip content: waveform or thumbnail + title */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          overflow: 'hidden',
          position: 'relative',
          padding: '0 14px',
        }}
      >
        {/* Forma de onda real do áudio via Canvas virtualizado (quando ativada) */}
        {isAudio && showWaveform && (
          <Waveform
            picos={wavePicos}
            picosPorSegundo={wavePps}
            estado={waveEstado}
            bytes={waveBytes}
            clipLeftPx={clip.startTime * PPS * zoom}
            clipWidthPx={clip.duration * PPS * zoom}
            offsetSeg={clip.offset || 0}
            pxPorSeg={PPS * zoom}
            selecionado={isSelected}
            onGerarManual={() => {
              if (media?.url) {
                geraWaveformManual(media.url, media.duration);
              }
            }}
          />
        )}

        {/* Forma de onda leve / fallback (barras decorativas sem decodificação de áudio) */}
        {isAudio && !showWaveform && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: '0 8px',
              opacity: 0.4,
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
          >
            {Array.from({ length: 80 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 2,
                  height: `${Math.max(15, Math.abs(Math.sin((i + 1) * 0.45)) * 75 + 10)}%`,
                  background: '#00c875',
                  borderRadius: 1,
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        )}

        {/* Miniatura renderizada com Blob JPEG redimensionado */}
        {!isAudio && temMidiaElegivel && thumbEstado === 'pronta' && thumbUrl && (
          <img
            src={thumbUrl}
            alt=""
            draggable={false}
            style={{
              height: '100%',
              width: 'auto',
              maxWidth: 64,
              objectFit: 'cover',
              opacity: 0.9,
              flexShrink: 0,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Ícone reserva de vídeo enquanto miniatura carrega ou se falhar */}
        {!isAudio && isVideo && (!thumbUrl || thumbEstado !== 'pronta') && (
          <div
            style={{
              height: '100%',
              width: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.35)',
              borderRadius: 2,
              flexShrink: 0,
              fontSize: 12,
            }}
          >
            🎬
          </div>
        )}

        <span
          style={{
            padding: '2px 6px',
            fontSize: 10,
            color: 'var(--text)',
            fontFamily: 'Rajdhani',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            position: 'relative',
            zIndex: 1,
            textShadow: theme === 'dark' ? '0 1px 3px rgba(0,0,0,0.8)' : '0 1px 3px rgba(255,255,255,0.8)',
          }}
        >
          {media?.name || '—'}
        </span>
      </div>

      {/* Indicador de Transição */}
      {!isAudio && clip.transition && clip.transition !== 'none' && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 12,
            background: 'rgba(0,212,255,0.3)',
            borderLeft: '1px dashed var(--accent2)',
            zIndex: 2,
          }}
          title={`Transição: ${clip.transition}`}
        />
      )}

      {/* Indicador de Confiança do Alinhamento (Score) */}
      {hasScore && (
        <div
          title={scoreTooltip}
          style={{
            position: 'absolute',
            top: 3,
            right: clip.transition && clip.transition !== 'none' ? 16 : 14,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '1px 5px',
            borderRadius: 3,
            background: 'rgba(0, 0, 0, 0.7)',
            border: `1px solid ${scoreColor}`,
            fontSize: 9,
            fontWeight: 700,
            fontFamily: 'Rajdhani, sans-serif',
            color: scoreColor,
            lineHeight: 1,
            pointerEvents: 'none',
            zIndex: 4,
            boxShadow: `0 0 4px ${scoreColor}40`,
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: scoreColor,
              display: 'inline-block',
            }}
          />
          <span>{scorePct}%</span>
        </div>
      )}

      {/* Resize right handle */}
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          onClipMouseDown(e, clip.id, 'resize-right');
        }}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 12,
          cursor: 'ew-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 2,
          zIndex: 5,
        }}
      >
        <div
          style={{
            width: 3,
            height: 16,
            borderLeft: isSelected ? '1px solid var(--accent2)' : '1px solid rgba(255,255,255,0.4)',
            borderRight: isSelected ? '1px solid var(--accent2)' : '1px solid rgba(255,255,255,0.4)',
          }}
        />
      </div>
    </div>
  );
};

// Memoização para evitar re-renderizar centenas de clips a cada frame durante playback
export const TimelineClip = React.memo(TimelineClipComponent);

