import { Track } from '../types';

export const CLIENT_ID = '825962387496-lccer4g2sijjktrp9k3q3uh9mkd30du4.apps.googleusercontent.com';
export const SCOPE = 'https://www.googleapis.com/auth/drive';
export const MOTOR_ROOT = 'MotorDobra';
export const PPS = 40; // pixels por segundo na timeline base

export const TRACKS: Track[] = [
  { id: 'video-1', name: 'Vídeo / Imagens', color: 'var(--track-vid)', type: 'video' },
  { id: 'audio-1', name: 'Narração',         color: 'var(--track-nar)', type: 'audio' },
  { id: 'audio-2', name: 'Música de Fundo',  color: 'var(--track-bgm)', type: 'audio' },
];

export const TRANSITION_OPTIONS = [
  { value: 'none', label: 'Corte Seco' },
  { value: 'dissolve', label: 'Dissolver (Misturar)' },
  { value: 'fadeblack', label: 'Mergulho no Preto (Fade Black)' },
  { value: 'fadewhite', label: 'Clarão Branco (Fade White)' },
  { value: 'crossfade', label: 'Crossfade Suave' },
  { value: 'pixelize', label: 'Pixelizar' },
  { value: 'radial', label: 'Radial' },
  { value: 'slideleft', label: 'Deslizar Esquerda' },
  { value: 'slideright', label: 'Deslizar Direita' },
  { value: 'slideup', label: 'Deslizar Cima' },
  { value: 'slidedown', label: 'Deslizar Baixo' },
  { value: 'smoothleft', label: 'Smooth Esquerda' },
  { value: 'smoothright', label: 'Smooth Direita' },
  { value: 'smoothup', label: 'Smooth Cima' },
  { value: 'smoothdown', label: 'Smooth Baixo' },
  { value: 'wipeleft', label: 'Wipe Esquerda' },
  { value: 'wiperight', label: 'Wipe Direita' },
  { value: 'wipeup', label: 'Wipe Cima' },
  { value: 'wipedown', label: 'Wipe Baixo' },
  { value: 'diagtl', label: 'Diagonal Topo Esq.' },
  { value: 'diagtr', label: 'Diagonal Topo Dir.' },
  { value: 'diagbl', label: 'Diagonal Baixo Esq.' },
  { value: 'diagbr', label: 'Diagonal Baixo Dir.' },
  { value: 'circleopen', label: 'Íris Abrir' },
  { value: 'circleclose', label: 'Íris Fechar' },
  { value: 'horzopen', label: 'Abrir Horizontal' },
  { value: 'horzclose', label: 'Fechar Horizontal' },
  { value: 'vertopen', label: 'Abrir Vertical' },
  { value: 'vertclose', label: 'Fechar Vertical' },
  { value: 'hlslice', label: 'Fatias Horiz. Esq.' },
  { value: 'hrslice', label: 'Fatias Horiz. Dir.' },
  { value: 'vuslice', label: 'Fatias Vert. Cima' },
  { value: 'vdslice', label: 'Fatias Vert. Baixo' },
];

export const FILTER_OPTIONS = [
  { value: 'none', label: 'Original' },
  { value: 'grayscale', label: 'Preto e Branco' },
  { value: 'sepia', label: 'Sépia (Vintage)' },
  { value: 'blur', label: 'Desfoque (Blur)' },
  { value: 'contrast', label: 'Alto Contraste' },
  { value: 'saturate', label: 'Saturação (Cores Vibrantes)' },
  { value: 'vignette', label: 'Vinheta Dramática' },
  { value: 'invert', label: 'Negativo (Visão Raio-X)' },
  { value: 'huerotate', label: 'Matiz Alienígena' },
  { value: 'grain', label: 'Granulado (Film Grain)' },
];

export const EFFECT_OPTIONS = [
  { value: 'none', label: 'Nenhum (Estático)' },
  { value: 'kenburns', label: 'Ken Burns (Zoom/Pan Suave)' },
  { value: 'zoom_in', label: 'Zoom In Rápido' },
  { value: 'pan_right', label: 'Pan para a Direita' },
  { value: 'pan_left', label: 'Pan para a Esquerda' },
];

export const TRANSITION_CYCLE_POOL = [
  'crossfade', 'dissolve', 'smoothleft', 'smoothright',
  'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'radial', 'circleopen', 'pixelize', 'diagtl', 'diagbr'
];
