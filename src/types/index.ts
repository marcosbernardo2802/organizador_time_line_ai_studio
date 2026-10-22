export interface Track {
  id: string;
  name: string;
  color: string;
  type: 'video' | 'audio';
}

export interface MediaItem {
  id: string;
  name: string;
  type: string;
  url: string | null;
  duration: number;
  placeholder?: boolean;
}

export interface ClipItem {
  id: string;
  mediaId: string;
  trackId: string;
  startTime: number;
  duration: number;
  offset: number;
  fit: string;
  transition: string;
  transitionDuration: number;
  effect: string;
  filter: string;
  filterIntensity: number;
  fadeIn: number;
  fadeOut: number;
  volume: number;
  score?: number;
}


export interface EtapaJob {
  id: string;
  nome: string;
  estado: 'pendente' | 'em_andamento' | 'concluida' | 'erro';
}

export interface RenderState {
  isRendering: boolean;
  progress: number;
  status: string;
  // Campos opcionais para progresso real por etapa
  etapas?: EtapaJob[];
  detalhe?: string;
  etapaIndice?: number;
  etapaTotal?: number;
  etaSegundos?: number | null;
}

export interface AiStatus {
  step: string;
  msg: string;
  pct: number;
  running: boolean;
  error: string;
  // Campos opcionais para progresso real por etapa
  etapas?: EtapaJob[];
  detalhe?: string;
  etapaIndice?: number;
  etapaTotal?: number;
  etaSegundos?: number | null;
}

export interface AiFiles {
  audio: File | null;
  roteiro: File | null;
  images: File[];
  bgm: File | null;
}

export interface DragState {
  id: string;
  type: string;
  startX: number;
  origStart: number;
  origDur: number;
  origClips: ClipItem[];
}

