import React from 'react';
import { ClipItem } from '../../types';
import { AdjustmentsTab } from './AdjustmentsTab';
import { EffectsTab } from './EffectsTab';
import { FiltersTab } from './FiltersTab';
import { TransitionsTab } from './TransitionsTab';
import { AudioTab } from './AudioTab';

interface InspectorPanelProps {
  selectedClip: ClipItem | undefined;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  clipVolume: number;
  duckingEnabled: boolean;
  onUpdateDuration: (newDur: number) => void;
  onUpdateClip: (updates: Partial<ClipItem>) => void;
  onApplyToAllVideos: (updates: Partial<ClipItem>) => void;
  onApplyTransitionCycle: () => void;
  onVolumeChange: (vol: number) => void;
  onToggleDucking: () => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  selectedClip,
  activeTab,
  onSelectTab,
  clipVolume,
  duckingEnabled,
  onUpdateDuration,
  onUpdateClip,
  onApplyToAllVideos,
  onApplyTransitionCycle,
  onVolumeChange,
  onToggleDucking,
}) => {
  const tabs = ['Ajustes', 'Efeitos', 'Filtros', 'Transições', 'Áudio'];

  return (
    <div
      className="hud-box"
      style={{
        width: 260,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 0,
        borderTop: 'none',
        borderRight: 'none',
        borderBottom: 'none',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            style={{
              flex: '1 1 30%',
              padding: '8px 0px',
              fontSize: 10,
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--text)' : 'var(--muted)',
              background: activeTab === tab ? 'var(--panel)' : 'transparent',
              cursor: 'pointer',
              fontFamily: 'Rajdhani',
              fontWeight: 600,
              transition: 'all 0.2s',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
            onClick={() => onSelectTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {!selectedClip ? (
          <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', marginTop: 20 }}>
            Selecione um clip na timeline para editar.
          </div>
        ) : (
          <>
            {activeTab === 'Ajustes' && (
              <AdjustmentsTab
                selectedClip={selectedClip}
                onUpdateDuration={onUpdateDuration}
                onUpdateClip={onUpdateClip}
                onApplyToAllVideos={onApplyToAllVideos}
              />
            )}
            {activeTab === 'Efeitos' && (
              <EffectsTab
                selectedClip={selectedClip}
                onUpdateClip={onUpdateClip}
                onApplyToAllVideos={onApplyToAllVideos}
              />
            )}
            {activeTab === 'Filtros' && (
              <FiltersTab
                selectedClip={selectedClip}
                onUpdateClip={onUpdateClip}
                onApplyToAllVideos={onApplyToAllVideos}
              />
            )}
            {activeTab === 'Transições' && (
              <TransitionsTab
                selectedClip={selectedClip}
                onUpdateClip={onUpdateClip}
                onApplyToAllVideos={onApplyToAllVideos}
                onApplyTransitionCycle={onApplyTransitionCycle}
              />
            )}
            {activeTab === 'Áudio' && (
              <AudioTab
                selectedClip={selectedClip}
                clipVolume={clipVolume}
                duckingEnabled={duckingEnabled}
                onVolumeChange={onVolumeChange}
                onToggleDucking={onToggleDucking}
                onUpdateClip={onUpdateClip}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};
