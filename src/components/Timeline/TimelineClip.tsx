import React from 'react';
import { ClipItem, MediaItem } from '../../types';
import { PPS } from '../../constants';
import { isVideoFile } from '../../utils/media';

interface TimelineClipProps {
  clip: ClipItem;
  media: MediaItem | undefined;
  isSelected: boolean;
  isAudio: boolean;
  zoom: number;
  theme: string;
  onClipMouseDown: (e: React.MouseEvent, clipId: string, type: string) => void;
}

export const TimelineClip: React.FC<TimelineClipProps> = ({
  clip,
  media,
  isSelected,
  isAudio,
  zoom,
  theme,
  onClipMouseDown,
}) => {
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

  return (
    <div
      onMouseDown={(e) => onClipMouseDown(e, clip.id, 'move')}
      onClick={(e) => e.stopPropagation()}
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
        {isAudio && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              padding: '2px 4px',
              opacity: 0.4,
            }}
          >
            {Array.from({ length: Math.min(80, Math.floor((clip.duration * PPS * zoom) / 4)) }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 2,
                  flexShrink: 0,
                  height: `${20 + Math.sin(i * 0.8) * 15 + Math.sin(i * 2.1) * 10 + Math.random() * 5}%`,
                  background: isSelected ? '#00c875' : 'rgba(0,200,117,0.8)',
                  borderRadius: 1,
                }}
              />
            ))}
          </div>
        )}

        {!isAudio && media?.url && isVideoFile(media.name, media.type) && (
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

        {!isAudio && media?.url && !isVideoFile(media.name, media.type) && (
          <img
            src={media.url}
            alt=""
            style={{ height: '100%', width: 'auto', maxWidth: 40, objectFit: 'cover', opacity: 0.8, flexShrink: 0 }}
          />
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
