import React from 'react';
import { EtapaJob } from '../types';

export interface EtapasProgressoProps {
  etapas?: EtapaJob[];
  etapaIndice?: number;
  etapaTotal?: number;
  detalhe?: string;
  etaSegundos?: number | null;
}

function formataEta(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  const mins = Math.floor(s / 60);
  const restos = s % 60;
  if (mins > 0) {
    return `~${mins} min ${restos} s`;
  }
  return `~${restos} s`;
}

export const EtapasProgresso: React.FC<EtapasProgressoProps> = ({
  etapas,
  detalhe,
  etaSegundos,
}) => {
  // Se não houver etapas detalhadas (motor legado), não renderiza nada
  if (!etapas || etapas.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: 10,
        marginBottom: 10,
        padding: '10px 12px',
        background: 'var(--surface-hover, rgba(255, 255, 255, 0.03))',
        border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
        borderRadius: 8,
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {etapas.map((etapa) => {
          const isAtiva = etapa.estado === 'em_andamento';
          const isConcluida = etapa.estado === 'concluida';
          const isErro = etapa.estado === 'erro';

          return (
            <div key={etapa.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                  }}
                >
                  {isConcluida && <span style={{ color: '#22c55e', fontWeight: 'bold' }}>✓</span>}
                  {isAtiva && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: '#00f0ff',
                        boxShadow: '0 0 8px #00f0ff',
                        display: 'inline-block',
                      }}
                    />
                  )}
                  {isErro && <span style={{ color: '#ef4444', fontWeight: 'bold' }}>✕</span>}
                  {!isConcluida && !isAtiva && !isErro && (
                    <span style={{ color: 'var(--muted, #64748b)' }}>○</span>
                  )}
                </span>

                <span
                  style={{
                    color: isAtiva
                      ? 'var(--accent, #00f0ff)'
                      : isConcluida
                      ? 'var(--text, #e2e8f0)'
                      : isErro
                      ? '#ef4444'
                      : 'var(--muted, #64748b)',
                    fontWeight: isAtiva ? 600 : 400,
                  }}
                >
                  {etapa.nome}
                </span>
              </div>

              {/* Detalhe da etapa em andamento (ex: Cena 12 de 40) */}
              {isAtiva && detalhe && (
                <div
                  style={{
                    marginLeft: 22,
                    marginTop: 2,
                    fontSize: 11,
                    color: 'var(--muted, #94a3b8)',
                    fontFamily: 'monospace',
                  }}
                >
                  {detalhe}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Estimativa de tempo restante */}
      {typeof etaSegundos === 'number' && etaSegundos > 0 && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 6,
            borderTop: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
            fontSize: 11,
            color: 'var(--muted, #94a3b8)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>⏱️</span>
          <span>
            Tempo restante estimado: <strong style={{ color: '#38bdf8' }}>{formataEta(etaSegundos)}</strong>
          </span>
        </div>
      )}
    </div>
  );
};
