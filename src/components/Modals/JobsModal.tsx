import React from 'react';
import { JobItem } from '../../types';

interface JobsModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobs: JobItem[];
  onImportTimeline: (jobId: string, jobName: string) => void;
}

export const JobsModal: React.FC<JobsModalProps> = ({
  isOpen,
  onClose,
  jobs,
  onImportTimeline,
}) => {
  if (!isOpen) return null;

  const colors: Record<string, string> = {
    fila: 'var(--muted)',
    processando: 'var(--gold)',
    concluido: 'var(--success)',
    erro: 'var(--danger)',
  };

  const icons: Record<string, string> = {
    fila: '⏳',
    processando: '⚙️',
    concluido: '✅',
    erro: '❌',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-fade" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <span className="modal-title">📡 Jobs no Drive</span>
          <button className="btn btn-ghost" style={{ padding: '2px 6px' }} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {jobs.length === 0 && (
            <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 24, fontSize: 13 }}>
              Nenhum job encontrado.
              <br />
              <span style={{ fontSize: 11 }}>Envie arquivos ao Motor para começar.</span>
            </div>
          )}
          {jobs.map((job) => (
            <div
              key={job.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 3,
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 18 }}>{icons[job.status]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Share Tech Mono', fontSize: 12, color: 'var(--text)' }}>{job.name}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: colors[job.status],
                    marginTop: 2,
                    fontFamily: 'Rajdhani',
                    letterSpacing: 0.5,
                  }}
                >
                  {job.status.toUpperCase()}
                </div>
              </div>
              {job.status === 'concluido' && (
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => onImportTimeline(job.id, job.name)}
                >
                  ⬇ Importar Timeline
                </button>
              )}
            </div>
          ))}
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
            Atualiza automaticamente a cada 12 segundos. Pastas no Drive:{' '}
            <span className="mono">MotorDobra/fila · processando · concluido · erro</span>
          </p>
        </div>
      </div>
    </div>
  );
};
