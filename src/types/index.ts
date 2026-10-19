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
}

export interface JobItem {
  id: string;
  name: string;
  status: 'fila' | 'processando' | 'concluido' | 'erro';
  [key: string]: any;
}

export interface RenderState {
  isRendering: boolean;
  progress: number;
  status: string;
}

export interface AiStatus {
  step: string;
  msg: string;
  pct: number;
  running: boolean;
  error: string;
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

export interface FolderIds {
  root?: string;
  motor?: string;
  fila?: string;
  concluido?: string;
  erro?: string;
  processando?: string;
}

export interface UserInfo {
  email?: string;
  name?: string;
  picture?: string;
}
