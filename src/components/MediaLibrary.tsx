import React from 'react';
import { MediaItem } from '../types';
import { ACCEPT_ALL_MEDIA, detectMediaType, getFileExtension } from '../utils/media';

interface MediaLibraryProps {
  library: MediaItem[];
  missingPlaceholders: number;
  onImportFiles: (files: File[]) => void;
  onReconnectMissing: () => void;
  onAddMediaToTimeline: (mediaId: string) => void;
  onDragMediaStart: (mediaId: string, e: React.DragEvent) => void;
  onDragMediaEnd: () => void;
}

export const MediaLibrary: React.FC<MediaLibraryProps> = ({
  library,
  missingPlaceholders,
  onImportFiles,
  onReconnectMissing,
  onAddMediaToTimeline,
  onDragMediaStart,
  onDragMediaEnd,
}) => {
  return (
    <div
      className="hud-box"
      style={{
        width: 220,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 0,
        borderTop: 'none',
        borderLeft: 'none',
        borderBottom: 'none',
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontFamily: 'Rajdhani', fontSize: 11, letterSpacing: 1, color: 'var(--muted)' }}>
          BIBLIOTECA ({library.length})
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {missingPlaceholders > 0 && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: 10, padding: '2px 6px', color: 'var(--accent2)' }}
              onClick={onReconnectMissing}
              title="Reconectar mídias ausentes"
            >
              🔄 Reconectar ({missingPlaceholders})
            </button>
          )}
          <label
            style={{
              cursor: 'pointer',
              color: 'var(--accent)',
              fontSize: 14,
              fontWeight: 'bold',
              lineHeight: 1,
              padding: '2px 4px',
            }}
            title="Importar áudio, vídeo ou imagem (+)"
          >
            +
            <input
              type="file"
              multiple
              accept={ACCEPT_ALL_MEDIA}
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) onImportFiles(files);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
        {library.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'center', padding: '24px 8px' }}>
            Nenhuma mídia carregada.
            <div style={{ fontSize: 10, marginTop: 6, opacity: 0.7 }}>
              Clique em <strong>+</strong> para adicionar áudio, vídeo ou imagem (.mp3, .mp4, .png, etc.).
            </div>
          </div>
        )}
        {library.map((m) => {
          const kind = detectMediaType(m.name, m.type);
          const ext = getFileExtension(m.name).toUpperCase();
          const isAudio = kind === 'audio';
          const isVideo = kind === 'video';

          return (
            <div
              key={m.id}
              draggable
              onDragStart={(e) => onDragMediaStart(m.id, e)}
              onDragEnd={onDragMediaEnd}
              onClick={() => onAddMediaToTimeline(m.id)}
              title={`${m.name} (${kind.toUpperCase()}) — Clique para adicionar à timeline`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 6px',
                background: m.placeholder ? 'rgba(224,64,64,0.08)' : 'var(--bg)',
                border: m.placeholder ? '1px dashed rgba(224,64,64,0.4)' : '1px solid var(--border)',
                borderRadius: 2,
                marginBottom: 4,
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              <span style={{ fontSize: 12 }}>{isVideo ? '🎬' : isAudio ? '🎵' : '🖼️'}</span>
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: m.placeholder ? 'var(--danger)' : 'var(--text)',
                }}
              >
                {m.name}
              </span>
              {ext && (
                <span
                  className="mono"
                  style={{
                    fontSize: 9,
                    padding: '1px 3px',
                    borderRadius: 2,
                    background: isVideo ? 'rgba(45,107,228,0.2)' : isAudio ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.08)',
                    color: isVideo ? 'var(--accent)' : isAudio ? '#c084fc' : 'var(--muted)',
                  }}
                >
                  .{ext}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
