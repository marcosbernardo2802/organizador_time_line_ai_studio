import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ClipItem,
  MediaItem,
  JobItem,
  UserInfo,
  FolderIds,
  AiFiles,
  AiStatus,
  RenderState,
  DragState,
} from './types';
import {
  CLIENT_ID,
  SCOPE,
  MOTOR_ROOT,
  PPS,
  TRACKS,
  TRANSITION_CYCLE_POOL,
} from './constants';
import { normalizeMediaName } from './utils/format';
import {
  getFileExtension,
  isAudioFile,
  isVideoFile,
  detectMediaType,
} from './utils/media';
import { isInsideIframe, openInFloatingWindow } from './utils/window';
import { driveApi } from './services/driveApi';
import { Header } from './components/Header';
import { MediaLibrary } from './components/MediaLibrary';
import { PreviewArea } from './components/PreviewArea';
import { InspectorPanel } from './components/Inspector/InspectorPanel';
import { Timeline } from './components/Timeline/Timeline';
import { SendToMotorModal } from './components/Modals/SendToMotorModal';
import { JobsModal } from './components/Modals/JobsModal';
import { ExportModal } from './components/Modals/ExportModal';
import { GoogleOAuthModal } from './components/Modals/GoogleOAuthModal';

export default function App() {
  // Auth
  const [authState, setAuthState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [clientId, setClientId] = useState<string>(() => {
    try {
      return localStorage.getItem('cronicas_custom_client_id') || CLIENT_ID;
    } catch {
      return CLIENT_ID;
    }
  });
  const tokenClientRef = useRef<any>(null);
  const isInIframe = useRef(isInsideIframe()).current;
  const [iframeOAuthWarning, setIframeOAuthWarning] = useState(false);

  // Drive
  const [driveReady, setDriveReady] = useState(false);
  const [folderIds, setFolderIds] = useState<FolderIds>({});

  // UI modais
  const [modal, setModal] = useState<null | 'ai' | 'export' | 'jobs' | 'oauth'>(null);

  // IA / upload
  const [aiFiles, setAiFiles] = useState<AiFiles>({
    audio: null,
    roteiro: null,
    images: [],
    bgm: null,
  });
  const [aiStatus, setAiStatus] = useState<AiStatus>({ step: '', msg: '', pct: 0, running: false, error: '' });

  // Jobs no Drive
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const pollRef = useRef<any>(null);

  // Timeline (editor)
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [duration, setDuration] = useState(60);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragMediaId, setDragMediaId] = useState<string | null>(null);

  // Histórico Undo/Redo
  const [past, setPast] = useState<ClipItem[][]>([]);
  const [future, setFuture] = useState<ClipItem[][]>([]);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const newPast = [...p];
      const prevClips = newPast.pop()!;
      setClips((currentClips) => {
        setFuture((f) => [currentClips, ...f]);
        return prevClips;
      });
      return newPast;
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const newFuture = [...f];
      const nextClips = newFuture.shift()!;
      setClips((currentClips) => {
        setPast((p) => [...p, currentClips]);
        return nextClips;
      });
      return newFuture;
    });
  }, []);

  const timelineRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<number | null>(null);
  const lastRef = useRef(Date.now());
  const narrationRef = useRef<HTMLAudioElement | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const fileCache = useRef<Record<string, File>>({}); // cache dos arquivos originais para re-upload

  // ── ESTADOS EXTRAS ──────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [snapOn, setSnapOn] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const previewRef = useRef<HTMLDivElement | null>(null);

  const [renderState, setRenderState] = useState<RenderState>({ isRendering: false, progress: 0, status: '' });

  // Tema Claro / Escuro
  const [theme, setTheme] = useState(() => localStorage.getItem('cronicas_theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cronicas_theme', theme);
  }, [theme]);

  // Guias do Painel Direito
  const [rightPanelTab, setRightPanelTab] = useState('Ajustes');
  const [duckingEnabled, setDuckingEnabled] = useState(true);

  // Preview
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const reconnectMissingMedia = () => {
    const lookup = Object.fromEntries(
      library.filter((m) => m.url && !m.placeholder).map((m) => [normalizeMediaName(m.name), m.id])
    );

    setClips((prevClips) =>
      prevClips.map((clip) => {
        const media = library.find((m) => m.id === clip.mediaId);
        const key = normalizeMediaName(media?.name || '');
        const matchId = lookup[key];
        return matchId ? { ...clip, mediaId: matchId } : clip;
      })
    );

    setLibrary((prevLib) =>
      prevLib
        .map((m) => {
          if (!m.placeholder) return m;
          const matchId = lookup[normalizeMediaName(m.name)];
          return matchId ? null : m;
        })
        .filter((x): x is MediaItem => Boolean(x))
    );

    if (Object.keys(lookup).length > 0) {
      alert('✅ Reconexão concluída. Clips vinculados à mídia encontrada na biblioteca.');
    } else {
      alert('🔎 Não foi possível reconectar mídias automaticamente. Carregue a mídia correspondente na biblioteca.');
    }
  };

  // ── GOOGLE LOGIN ────────────────────────────────────────────────────────────
  // ── GOOGLE LOGIN & SYNC COM JANELA FLUTUANTE ─────────────────────────────
  const onTokenAcquired = useCallback(async (accessToken: string) => {
    driveApi.token = accessToken;
    setAuthState('ok');
    setIframeOAuthWarning(false);
    try {
      localStorage.setItem('cronicas_drive_token', accessToken);
      if (window.opener && window.opener !== window) {
        window.opener.postMessage({ type: 'CRONICAS_DRIVE_AUTH', token: accessToken }, '*');
      }
    } catch {}

    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.ok) {
        setUserInfo(await r.json());
      }
    } catch {}

    await setupDriveFolders();
  }, []);

  const initGoogleAuth = useCallback(() => {
    const gWindow = window as any;
    if (!gWindow.google) {
      setTimeout(initGoogleAuth, 500);
      return;
    }
    tokenClientRef.current = gWindow.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: async (resp: any) => {
        if (resp.error) {
          setAuthState('error');
          if (isInIframe) {
            setIframeOAuthWarning(true);
          }
          return;
        }
        await onTokenAcquired(resp.access_token);
      },
    });
  }, [clientId, isInIframe, onTokenAcquired]);

  useEffect(() => {
    initGoogleAuth();
  }, [initGoogleAuth]);

  // Listener para sincronização automática quando o usuário faz login na janela flutuante
  useEffect(() => {
    const handleMsg = (e: MessageEvent) => {
      if (e.data?.type === 'CRONICAS_DRIVE_AUTH' && e.data?.token) {
        onTokenAcquired(e.data.token);
      }
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'cronicas_drive_token' && e.newValue) {
        onTokenAcquired(e.newValue);
      }
    };

    window.addEventListener('message', handleMsg);
    window.addEventListener('storage', handleStorage);

    // Se já houver token salvo recentemente no localStorage, tenta restaurar a sessão
    const savedToken = localStorage.getItem('cronicas_drive_token');
    if (savedToken && !driveApi.token) {
      onTokenAcquired(savedToken).catch(() => {
        localStorage.removeItem('cronicas_drive_token');
      });
    }

    return () => {
      window.removeEventListener('message', handleMsg);
      window.removeEventListener('storage', handleStorage);
    };
  }, [onTokenAcquired]);

  // ── DRIVE: ESTRUTURA DE PASTAS ──────────────────────────────────────────────
  const setupDriveFolders = async () => {
    try {
      const rootId = await driveApi.getRootId();
      const motorId = await driveApi.getOrCreateFolder(rootId, MOTOR_ROOT);
      const filaId = await driveApi.getOrCreateFolder(motorId, 'fila');
      const concId = await driveApi.getOrCreateFolder(motorId, 'concluido');
      const erroId = await driveApi.getOrCreateFolder(motorId, 'erro');
      const procId = await driveApi.getOrCreateFolder(motorId, 'processando');
      setFolderIds({ root: rootId, motor: motorId, fila: filaId, concluido: concId, erro: erroId, processando: procId });
      setDriveReady(true);
      startPolling(concId, erroId, procId, filaId);
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (e) {
      console.error('Erro ao configurar pastas Drive:', e);
    }
  };

  // ── POLLING: verifica jobs concluídos ───────────────────────────────────────
  const startPolling = (concId: string, erroId: string, procId: string, filaId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const [conc, erro, proc, fila] = await Promise.all([
          driveApi.listFolder(concId),
          driveApi.listFolder(erroId),
          driveApi.listFolder(procId),
          driveApi.listFolder(filaId),
        ]);
        const novosJobs: JobItem[] = [
          ...fila.map((j: any) => ({ ...j, status: 'fila' as const })),
          ...proc.map((j: any) => ({ ...j, status: 'processando' as const })),
          ...conc.map((j: any) => ({ ...j, status: 'concluido' as const })),
          ...erro.map((j: any) => ({ ...j, status: 'erro' as const })),
        ];

        setJobs((prevJobs) => {
          const prevConcluidos = new Set(prevJobs.filter((j) => j.status === 'concluido').map((j) => j.id));
          const novosConcluidos = novosJobs.filter((j) => j.status === 'concluido' && !prevConcluidos.has(j.id));
          if (novosConcluidos.length > 0) {
            try {
              const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
              const ctx = new AudioCtx();
              [0, 150, 300].forEach((delay, i) => {
                setTimeout(() => {
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  osc.connect(gain);
                  gain.connect(ctx.destination);
                  osc.frequency.value = [880, 1100, 1320][i];
                  gain.gain.setValueAtTime(0.3, ctx.currentTime);
                  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                  osc.start();
                  osc.stop(ctx.currentTime + 0.3);
                }, delay);
              });
            } catch {}
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('✅ Motor de Dobra', { body: `Job concluído: ${novosConcluidos[0].name}` });
            }
          }
          return novosJobs;
        });
      } catch {}
    }, 12000);
  };

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  // ── ENVIAR JOB PARA O MOTOR ─────────────────────────────────────────────────
  const autenticaSeNecessario = () =>
    new Promise<void>((resolve, reject) => {
      if (authState === 'ok' && driveApi.token) {
        resolve();
        return;
      }
      setAuthState('loading');
      tokenClientRef.current?.requestAccessToken({
        prompt: driveApi.token ? '' : 'consent',
        callback: async (resp: any) => {
          if (resp.error) {
            setAuthState('error');
            if (isInIframe) {
              setIframeOAuthWarning(true);
            }
            reject(new Error('Falha no login'));
            return;
          }
          await onTokenAcquired(resp.access_token);
          resolve();
        },
      });
    });

  const enviaJob = async () => {
    if (!aiFiles.audio || !aiFiles.roteiro || aiFiles.images.length === 0) return;
    try {
      await autenticaSeNecessario();
    } catch {
      return;
    }
    if (!driveReady || !folderIds.fila) return;

    setAiStatus({ step: 'upload', msg: 'Criando pasta do job...', pct: 5, running: true, error: '' });

    try {
      const jobName = `job_${Date.now()}`;
      const jobId = await driveApi.getOrCreateFolder(folderIds.fila, jobName);
      setAiStatus((p) => ({ ...p, msg: `Pasta do job criada: ${jobName}`, pct: 10 }));

      // Upload áudio
      const audioExt = getFileExtension(aiFiles.audio.name) || 'mp3';
      const audioFileName = `audio.${audioExt}`;
      setAiStatus((p) => ({ ...p, msg: 'Enviando áudio...', pct: 15 }));
      await driveApi.uploadFile(jobId, aiFiles.audio, audioFileName, (p) =>
        setAiStatus((prev) => ({ ...prev, pct: 15 + p * 20 }))
      );

      // Upload roteiro
      const rotExt = getFileExtension(aiFiles.roteiro.name) || 'txt';
      const roteiroFileName = `roteiro.${rotExt}`;
      setAiStatus((p) => ({ ...p, msg: 'Enviando roteiro...', pct: 36 }));
      await driveApi.uploadFile(jobId, aiFiles.roteiro, roteiroFileName);

      // Upload imagens e vídeos
      for (let i = 0; i < aiFiles.images.length; i++) {
        const visual = aiFiles.images[i];
        const ext = getFileExtension(visual.name) || 'jpg';
        const num = String(i + 1).padStart(4, '0');
        setAiStatus((p) => ({
          ...p,
          msg: `Enviando mídia ${i + 1}/${aiFiles.images.length}...`,
          pct: 38 + (i / aiFiles.images.length) * 40,
        }));
        await driveApi.uploadFile(jobId, visual, `${num}.${ext}`);
      }

      // Upload BGM se existir
      let bgmFileName: string | null = null;
      if (aiFiles.bgm) {
        const bgmExt = getFileExtension(aiFiles.bgm.name) || 'mp3';
        bgmFileName = `bgm.${bgmExt}`;
        setAiStatus((p) => ({ ...p, msg: 'Enviando música de fundo...', pct: 80 }));
        await driveApi.uploadFile(jobId, aiFiles.bgm, bgmFileName);
      }

      // Cria job.json
      setAiStatus((p) => ({ ...p, msg: 'Criando instrução do job...', pct: 90 }));
      const jobJson = {
        tipo: 'timeline',
        nome_projeto: jobName,
        audio: audioFileName,
        roteiro: roteiroFileName,
        bgm: bgmFileName,
        total_imagens: aiFiles.images.length,
        total_midias: aiFiles.images.length,
        criado_em: new Date().toISOString(),
      };
      await driveApi.uploadJson(jobId, 'job.json', jobJson);

      const novasMedias: MediaItem[] = [];

      for (let i = 0; i < aiFiles.images.length; i++) {
        const f = aiFiles.images[i];
        const url = URL.createObjectURL(f);
        const id = `ai-media-${i}-${Date.now()}`;
        fileCache.current[f.name] = f;
        const isVid = isVideoFile(f.name, f.type);
        let dur = 5;
        if (isVid) {
          dur = await new Promise<number>((res) => {
            const v = document.createElement('video');
            v.onloadedmetadata = () => res(v.duration || 5);
            v.onerror = () => res(5);
            v.src = url;
          });
        }
        novasMedias.push({
          id,
          name: f.name,
          type: f.type || (isVid ? 'video/mp4' : 'image/jpeg'),
          url,
          duration: dur,
        });
      }

      if (aiFiles.audio) {
        const f = aiFiles.audio;
        const url = URL.createObjectURL(f);
        const id = `ai-audio-${Date.now()}`;
        fileCache.current[f.name] = f;
        const dur = await new Promise<number>((res) => {
          const a = document.createElement('audio');
          a.onloadedmetadata = () => res(a.duration);
          a.src = url;
        });
        novasMedias.push({ id, name: f.name, type: f.type, url, duration: dur });
      }

      if (aiFiles.bgm) {
        const f = aiFiles.bgm;
        const url = URL.createObjectURL(f);
        const id = `ai-bgm-${Date.now()}`;
        fileCache.current[f.name] = f;
        novasMedias.push({ id, name: f.name, type: f.type, url, duration: 5 });
      }

      if (novasMedias.length > 0) {
        setLibrary((prev) => {
          const existentes = new Set(prev.map((m) => m.name.toLowerCase()));
          const novas = novasMedias.filter((m) => !existentes.has(m.name.toLowerCase()));
          return [...prev, ...novas];
        });
      }

      setAiStatus({
        step: 'aguardando',
        msg: '✅ Job enviado! Arquivos adicionados à biblioteca. Aguardando o Motor processar...',
        pct: 100,
        running: false,
        error: '',
      });
      setModal(null);
      setAiFiles({ audio: null, roteiro: null, images: [], bgm: null });
    } catch (e: any) {
      console.error('Erro ao enviar job:', e);
      alert(`Erro ao enviar job. Veja console para detalhes.\n${e.message}`);
      setAiStatus({ step: 'erro', msg: '', pct: 0, running: false, error: `Erro: ${e.message}` });
    }
  };

  // ── IMPORTAR TIMELINE.JSON DO DRIVE ────────────────────────────────────────
  const importaTimeline = async (jobFolderId: string, _jobName: string) => {
    try {
      const files = await driveApi.listFolder(jobFolderId);
      const tlFile = files.find((f: any) => f.name === 'timeline.json');
      if (!tlFile) {
        alert('timeline.json não encontrado nesse job.');
        return;
      }
      const tl = await driveApi.readJson(tlFile.id);

      const newClips: ClipItem[] = [];
      const extraLibrary: MediaItem[] = [];

      setLibrary((prevLib) => {
        const byName: Record<string, string> = {};
        prevLib.forEach((m) => {
          byName[m.name.toLowerCase()] = m.id;
        });

        tl.cenas.forEach((cena: any, i: number) => {
          const nomeNorm = cena.arquivo.toLowerCase();
          let mediaId = byName[nomeNorm];

          if (!mediaId) {
            mediaId = `placeholder-${i}-${Date.now()}`;
            const isVid = cena.tipo === 'video' || isVideoFile(cena.arquivo);
            extraLibrary.push({
              id: mediaId,
              name: cena.arquivo,
              type: isVid ? 'video/mp4' : 'image/jpeg',
              url: null,
              duration: cena.duration,
              placeholder: true,
            });
            byName[nomeNorm] = mediaId;
          }

          newClips.push({
            id: `clip-${i}-${Date.now()}`,
            mediaId,
            trackId: 'video-1',
            startTime: cena.start,
            duration: cena.duration_real || cena.duration,
            offset: 0,
            fit: 'contain',
            transition: 'none',
            transitionDuration: 0.8,
            effect: 'none',
            filter: 'none',
            filterIntensity: 100,
            fadeIn: 0,
            fadeOut: 0,
            volume: 1.0,
          });
        });

        const audioMedia = prevLib.find((m) => isAudioFile(m.name, m.type));
        if (audioMedia) {
          newClips.push({
            id: `clip-audio-${Date.now()}`,
            mediaId: audioMedia.id,
            trackId: 'audio-1',
            startTime: 0,
            duration: tl.duracao_total,
            offset: 0,
            fit: 'contain',
            transition: 'none',
            transitionDuration: 0.8,
            effect: 'none',
            filter: 'none',
            filterIntensity: 100,
            fadeIn: 0,
            fadeOut: 0,
            volume: 1.0,
          });
        }

        return extraLibrary.length > 0 ? [...prevLib, ...extraLibrary] : prevLib;
      });

      setPast([]);
      setFuture([]);
      setClips(newClips);
      setDuration(tl.duracao_total + 10);
      setCurrentTime(0);

      const faltando = extraLibrary.length;
      const msg =
        faltando > 0
          ? `✅ Timeline importada! ${tl.total_cenas} cenas | score: ${tl.score_medio}\n\n⚠️ ${faltando} imagens não encontradas na biblioteca.\nFaça upload pelo "+" para aparecerem no preview.`
          : `✅ Timeline importada! ${tl.total_cenas} cenas | score: ${tl.score_medio}`;
      alert(msg);
    } catch (e: any) {
      alert('Erro ao importar timeline: ' + e.message);
    }
  };

  // ── DRAG & DROP TIMELINE ────────────────────────────────────────────────────
  const onClipMouseDown = (e: React.MouseEvent, clipId: string, type: string) => {
    e.stopPropagation();
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) return;
    setDragState({ id: clipId, type, startX: e.clientX, origStart: clip.startTime, origDur: clip.duration, origClips: clips });
    setSelectedId(clipId);
  };

  const getSnapTarget = (time: number, excludeId: string) => {
    let target = time;
    let minD = 1.5 / zoom;

    if (Math.abs(time) < minD) {
      minD = Math.abs(time);
      target = 0;
    }

    clips.forEach((c) => {
      if (c.id === excludeId) return;
      [c.startTime, c.startTime + c.duration].forEach((t) => {
        const d = Math.abs(time - t);
        if (d < minD) {
          minD = d;
          target = t;
        }
      });
    });

    if (Math.abs(time - currentTime) < minD) {
      minD = Math.abs(time - currentTime);
      target = currentTime;
    }

    return { target, minD };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;
    const pps = PPS * zoom;
    const delta = (e.clientX - dragState.startX) / pps;

    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== dragState.id) return c;

        if (dragState.type === 'move') {
          const rawStart = Math.max(0, dragState.origStart + delta);
          if (!snapOn) return { ...c, startTime: rawStart };

          const rawEnd = rawStart + dragState.origDur;
          const snapStart = getSnapTarget(rawStart, c.id);
          const snapEnd = getSnapTarget(rawEnd, c.id);

          if (snapStart.minD <= snapEnd.minD && snapStart.minD < 1.5 / zoom) {
            return { ...c, startTime: snapStart.target };
          } else if (snapEnd.minD < 1.5 / zoom) {
            return { ...c, startTime: Math.max(0, snapEnd.target - dragState.origDur) };
          }
          return { ...c, startTime: rawStart };
        }

        if (dragState.type === 'resize-right') {
          const rawEnd = dragState.origStart + dragState.origDur + delta;
          const finalEnd = snapOn ? getSnapTarget(rawEnd, c.id).target : rawEnd;
          const nd = Math.max(0.1, finalEnd - dragState.origStart);
          return { ...c, duration: nd };
        }

        if (dragState.type === 'resize-left') {
          const rawStart = Math.max(0, dragState.origStart + delta);
          const finalStart = snapOn ? getSnapTarget(rawStart, c.id).target : rawStart;
          const nd = Math.max(0.1, dragState.origStart + dragState.origDur - finalStart);
          if (finalStart >= dragState.origStart + dragState.origDur - 0.1) return c;
          return { ...c, startTime: finalStart, duration: nd };
        }

        return c;
      })
    );
  };

  const onMouseUp = () => {
    if (dragState) {
      const clip = clips.find((c) => c.id === dragState.id);
      if (clip && (clip.startTime !== dragState.origStart || clip.duration !== dragState.origDur)) {
        setPast((p) => [...p, dragState.origClips]);
        setFuture([]);
      }
    }
    setDragState(null);
  };

  const addClipToTimelineAt = (mediaId: string, trackId: string, startTime: number) => {
    const media = library.find((m) => m.id === mediaId);
    if (!media) return;
    setPast((p) => [...p, clips]);
    setFuture([]);
    const durationValue = media.duration || 5;
    const clip: ClipItem = {
      id: Math.random().toString(36).slice(2),
      mediaId,
      trackId,
      startTime: Math.max(0, startTime),
      duration: durationValue,
      offset: 0,
      fit: 'contain',
      transition: 'none',
      transitionDuration: 0.8,
      effect: 'none',
      filter: 'none',
      filterIntensity: 100,
      fadeIn: 0,
      fadeOut: 0,
      volume: trackId === 'audio-2' ? 0.2 : 1.0,
    };
    setClips((prev) => {
      const next = [...prev, clip];
      if (clip.startTime + durationValue > duration) setDuration(clip.startTime + durationValue + 10);
      return next;
    });
  };

  const onTimelineDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const mediaId = dragMediaId || e.dataTransfer.getData('text/plain');
    if (!mediaId || !timelineRef.current) return;
    const media = library.find((m) => m.id === mediaId);
    if (!media) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left + timelineRef.current.scrollLeft);
    const startTime = x / (PPS * zoom);
    const trackId = isAudioFile(media.name, media.type) ? 'audio-1' : 'video-1';
    addClipToTimelineAt(mediaId, trackId, startTime);
    setDragMediaId(null);
  };

  // ── PLAYBACK E ATUALIZAÇÃO ──────────────────────────────────────────────────
  const updateSelectedClip = (updates: Partial<ClipItem>) => {
    setPast((p) => [...p, clips]);
    setFuture([]);
    setClips((p) => p.map((c) => (c.id === selectedId ? { ...c, ...updates } : c)));
  };

  const updateDurationAndRipple = (id: string, newDuration: number) => {
    setPast((p) => [...p, clips]);
    setFuture([]);
    setClips((prev) => {
      const target = prev.find((c) => c.id === id);
      if (!target) return prev;
      const delta = newDuration - target.duration;
      return prev.map((c) => {
        if (c.id === id) return { ...c, duration: newDuration };
        if (snapOn && c.trackId === target.trackId && c.startTime > target.startTime + 0.01) {
          return { ...c, startTime: Math.max(0, c.startTime + delta) };
        }
        return c;
      });
    });
  };

  const applyToAllVideos = (updates: Partial<ClipItem>) => {
    setPast((p) => [...p, clips]);
    setFuture([]);
    setClips((p) => p.map((c) => (c.trackId === 'video-1' ? { ...c, ...updates } : c)));
  };

  const applyTransitionCycle = () => {
    setPast((p) => [...p, clips]);
    setFuture([]);
    setClips((prev) => {
      let idx = 0;
      return prev.map((c) => {
        if (c.trackId !== 'video-1') return c;
        const transition = idx === 0 ? 'none' : TRANSITION_CYCLE_POOL[(idx - 1) % TRANSITION_CYCLE_POOL.length];
        idx += 1;
        return {
          ...c,
          transition,
          transitionDuration: c.transitionDuration ?? 0.8,
        };
      });
    });
  };

  const getClipVolume = (clip?: ClipItem, fallback = 1.0) => {
    if (!clip) return fallback;
    return clip.volume ?? volumes[clip.id] ?? fallback;
  };

  useEffect(() => {
    const narClip = clips.find((c) => c.trackId === 'audio-1');
    const bgmClip = clips.find((c) => c.trackId === 'audio-2');
    const narMedia = narClip ? library.find((m) => m.id === narClip.mediaId) : null;
    const bgmMedia = bgmClip ? library.find((m) => m.id === bgmClip.mediaId) : null;

    if (narrationRef.current) {
      if (narMedia?.url) {
        if (narrationRef.current.src !== narMedia.url) {
          narrationRef.current.src = narMedia.url;
          narrationRef.current.volume = getClipVolume(narClip, 1.0);
          narrationRef.current.onended = () => {
            setIsPlaying(false);
            setCurrentTime(0);
            if (bgmRef.current) {
              bgmRef.current.pause();
              bgmRef.current.currentTime = 0;
            }
          };
        } else {
          narrationRef.current.volume = getClipVolume(narClip, 1.0);
        }
        const expTime = currentTime - (narClip?.startTime || 0);
        if (Math.abs(narrationRef.current.currentTime - expTime) > 0.3) {
          narrationRef.current.currentTime = Math.max(0, expTime);
        }
        if (isPlaying && narrationRef.current.paused) narrationRef.current.play().catch(() => {});
        if (!isPlaying && !narrationRef.current.paused) narrationRef.current.pause();
      } else {
        narrationRef.current.pause();
      }
    }

    if (bgmRef.current) {
      if (bgmMedia?.url) {
        if (bgmRef.current.src !== bgmMedia.url) {
          bgmRef.current.src = bgmMedia.url;
          bgmRef.current.volume = getClipVolume(bgmClip, 0.2);
        }
        const expTime = currentTime - (bgmClip?.startTime || 0);
        if (Math.abs(bgmRef.current.currentTime - expTime) > 0.3) {
          bgmRef.current.currentTime = Math.max(0, expTime);
        }
        const narActive = clips.find(
          (c) => c.trackId === 'audio-1' && currentTime >= c.startTime && currentTime < c.startTime + c.duration
        );
        const bgmVol = getClipVolume(bgmClip, 0.2);
        bgmRef.current.volume = bgmVol * (duckingEnabled && narActive ? 0.3 : 1.0);

        if (isPlaying && bgmRef.current.paused) bgmRef.current.play().catch(() => {});
        if (!isPlaying && !bgmRef.current.paused) bgmRef.current.pause();
      } else {
        bgmRef.current.pause();
      }
    }
  }, [isPlaying, currentTime, clips, library, volumes, duckingEnabled]);

  useEffect(() => {
    if (isPlaying) {
      const tick = () => {
        const now = Date.now();
        const delta = (now - lastRef.current) / 1000;
        lastRef.current = now;

        const maxTime = clips.length > 0 ? Math.max(...clips.map((c) => c.startTime + c.duration)) : duration;

        setCurrentTime((t) => {
          if (t + delta >= maxTime) {
            setIsPlaying(false);
            if (narrationRef.current) narrationRef.current.pause();
            if (bgmRef.current) bgmRef.current.pause();
            return maxTime;
          }
          return t + delta;
        });
        animRef.current = requestAnimationFrame(tick);
      };
      lastRef.current = Date.now();
      animRef.current = requestAnimationFrame(tick);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, duration, clips]);

  // Preview da imagem ativa
  useEffect(() => {
    const active = clips.find(
      (c) => c.trackId === 'video-1' && currentTime >= c.startTime && currentTime < c.startTime + c.duration
    );
    if (active) {
      const media = library.find((m) => m.id === active.mediaId);
      setPreviewSrc(media?.url || null);
    } else setPreviewSrc(null);
  }, [currentTime, clips, library]);

  // ── SALVAR / CARREGAR PROJETO LOCAL ────────────────────────────────────────
  const salvaProjetoLocal = () => {
    try {
      const projeto = {
        versao: '3.0',
        salvo_em: new Date().toISOString(),
        duration,
        clips,
        library: library.map((m) => ({
          id: m.id,
          name: m.name,
          type: m.type,
          duration: m.duration,
          placeholder: true,
        })),
      };
      localStorage.setItem('cronicas_projeto', JSON.stringify(projeto));
      localStorage.setItem('cronicas_salvo_em', new Date().toLocaleString('pt-BR'));
      alert('✅ Projeto salvo localmente!\nDa próxima vez clique em "Carregar Projeto" para restaurar a timeline.');
    } catch (e: any) {
      alert('Erro ao salvar: ' + e.message);
    }
  };

  const carregaProjetoLocal = () => {
    try {
      const raw = localStorage.getItem('cronicas_projeto');
      if (!raw) {
        alert('Nenhum projeto salvo encontrado.');
        return;
      }
      const projeto = JSON.parse(raw);
      const salvoEm = localStorage.getItem('cronicas_salvo_em') || '?';

      if (
        !confirm(
          `Carregar projeto salvo em ${salvoEm}?\n\n⚠️ Isso vai substituir a timeline atual.\nAs imagens precisarão ser recarregadas pelo "+".`
        )
      )
        return;

      setPast([]);
      setFuture([]);
      setClips(projeto.clips || []);
      setLibrary(projeto.library || []);
      setDuration(projeto.duration || 60);
      setCurrentTime(0);

      const semUrl = (projeto.library || []).filter((m: any) => m.placeholder).length;
      if (semUrl > 0) {
        alert(
          `✅ Timeline restaurada! ${projeto.clips?.length || 0} clips carregados.\n\n⚠️ ${semUrl} mídias precisam ser recarregadas.\nClique em "+" na biblioteca e selecione as imagens/áudio novamente — a timeline vai reconectá-los automaticamente pelo nome.`
        );
      } else {
        alert(`✅ Projeto restaurado com sucesso!`);
      }
    } catch (e: any) {
      alert('Erro ao carregar: ' + e.message);
    }
  };

  const [temProjetoSalvo, setTemProjetoSalvo] = useState(false);

  const createNewProject = () => {
    if (!confirm('Criar novo projeto? A timeline atual será perdida e o estado atual será redefinido.')) return;
    setPast([]);
    setFuture([]);
    setClips([]);
    setLibrary([]);
    setDuration(60);
    setCurrentTime(0);
    setSelectedId(null);
    setAiFiles({ audio: null, roteiro: null, images: [], bgm: null });
    localStorage.removeItem('cronicas_projeto');
    localStorage.removeItem('cronicas_salvo_em');
    setTemProjetoSalvo(false);
  };

  const handleLogout = () => {
    setAuthState('idle');
    setUserInfo(null);
    driveApi.token = null;
    try {
      localStorage.removeItem('cronicas_drive_token');
    } catch {}
    setDriveReady(false);
    setFolderIds({});
    setJobs([]);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleOpenFloatingWindow = () => {
    try {
      if (clips.length > 0) {
        const projeto = {
          versao: '3.0',
          salvo_em: new Date().toISOString(),
          duration,
          clips,
          library: library.map((m) => ({ id: m.id, name: m.name, type: m.type, duration: m.duration, placeholder: true })),
        };
        localStorage.setItem('cronicas_projeto', JSON.stringify(projeto));
        localStorage.setItem('cronicas_salvo_em', new Date().toLocaleString('pt-BR'));
        setTemProjetoSalvo(true);
      }
    } catch (e) {
      console.warn('Erro ao salvar projeto antes de abrir janela:', e);
    }
    openInFloatingWindow();
  };

  const handleSaveClientId = (newId: string) => {
    const trimmed = newId.trim();
    setClientId(trimmed || CLIENT_ID);
    try {
      if (trimmed && trimmed !== CLIENT_ID) {
        localStorage.setItem('cronicas_custom_client_id', trimmed);
      } else {
        localStorage.removeItem('cronicas_custom_client_id');
      }
    } catch {}
  };

  const handleManualToken = async (manualToken: string) => {
    await onTokenAcquired(manualToken);
  };

  useEffect(() => {
    const raw = localStorage.getItem('cronicas_projeto');
    setTemProjetoSalvo(!!raw);
  }, []);

  useEffect(() => {
    if (clips.length === 0) return;
    const interval = setInterval(() => {
      try {
        const projeto = {
          versao: '3.0',
          salvo_em: new Date().toISOString(),
          duration,
          clips,
          library: library.map((m) => ({ id: m.id, name: m.name, type: m.type, duration: m.duration, placeholder: true })),
        };
        localStorage.setItem('cronicas_projeto', JSON.stringify(projeto));
        localStorage.setItem('cronicas_salvo_em', new Date().toLocaleString('pt-BR'));
        setTemProjetoSalvo(true);
      } catch (e) {}
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [clips, library, duration]);

  // ── ATALHOS DE TECLADO ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

      switch (e.code) {
        case 'KeyZ':
          if (e.ctrlKey) {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
          }
          break;
        case 'KeyY':
          if (e.ctrlKey) {
            e.preventDefault();
            redo();
          }
          break;
        case 'Space':
          e.preventDefault();
          setIsPlaying((p) => !p);
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedId) {
            setPast((p) => [...p, clips]);
            setFuture([]);
            setClips((prev) => {
              const clipToDelete = prev.find((c) => c.id === selectedId);
              let nextClips = prev.filter((c) => c.id !== selectedId);
              if (clipToDelete && snapOn) {
                const delta = -clipToDelete.duration;
                nextClips = nextClips.map((c) => {
                  if (c.trackId === clipToDelete.trackId && c.startTime > clipToDelete.startTime) {
                    return { ...c, startTime: Math.max(0, c.startTime + delta) };
                  }
                  return c;
                });
              }
              return nextClips;
            });
            setSelectedId(null);
          }
          break;
        case 'Escape':
          setSelectedId(null);
          setFullscreen(false);
          break;
        case 'KeyF':
          setFullscreen((p) => !p);
          break;
        case 'Home':
          e.preventDefault();
          setIsPlaying(false);
          setCurrentTime(0);
          break;
        case 'Equal':
          if (e.ctrlKey) {
            e.preventDefault();
            setZoom((z) => Math.min(z + 0.25, 4));
          }
          break;
        case 'Minus':
          if (e.ctrlKey) {
            e.preventDefault();
            setZoom((z) => Math.max(z - 0.25, 0.25));
          }
          break;
        case 'Digit0':
          if (e.ctrlKey) {
            e.preventDefault();
            setZoom(1);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setCurrentTime((t) => Math.max(0, t - (e.shiftKey ? 5 : 1)));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setCurrentTime((t) => Math.min(duration, t + (e.shiftKey ? 5 : 1)));
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, duration, clips, undo, redo, snapOn]);

  // ── TELA CHEIA ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleFsChange = () => {
      setFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    if (!previewRef.current) return;
    if (fullscreen && !document.fullscreenElement) {
      previewRef.current.requestFullscreen?.().catch(() => {
        console.warn('A tela cheia foi bloqueada ou não é suportada neste ambiente.');
        setFullscreen(false);
      });
    } else if (!fullscreen && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [fullscreen]);

  // ── RECONECTA MÍDIAS DA BIBLIOTECA PELO NOME ────────────────────────────────
  useEffect(() => {
    if (library.length === 0) return;
    setClips((prevClips) =>
      prevClips.map((clip) => {
        const currentMedia = library.find((m) => m.id === clip.mediaId);
        if (currentMedia?.url) return clip;
        const byName = library.find(
          (m) => m.url && !m.placeholder && m.name.toLowerCase() === (currentMedia?.name || '').toLowerCase()
        );
        if (byName) return { ...clip, mediaId: byName.id };
        return clip;
      })
    );
  }, [library]);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'roteiro' | 'images' | 'bgm') => {
    const input = e.target;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    if (type === 'images') {
      const sorted = files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      setAiFiles((p) => ({ ...p, images: sorted }));
    } else {
      setAiFiles((p) => ({ ...p, [type]: files[0] }));
      if (files[0]) fileCache.current[files[0].name] = files[0];
    }
    if (type === 'images') {
      const imgs = files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const newLib: MediaItem[] = [];
      for (let i = 0; i < imgs.length; i++) {
        const f = imgs[i];
        const url = URL.createObjectURL(f);
        const isVid = isVideoFile(f.name, f.type);
        let dur = 5;
        if (isVid) {
          dur = await new Promise<number>((res) => {
            const v = document.createElement('video');
            v.onloadedmetadata = () => res(v.duration || 5);
            v.onerror = () => res(5);
            v.src = url;
          });
        }
        newLib.push({
          id: `local-media-${i}-${Date.now()}`,
          name: f.name,
          type: f.type || (isVid ? 'video/mp4' : 'image/jpeg'),
          url,
          duration: dur,
        });
        fileCache.current[f.name] = f;
      }
      setLibrary((prev) => [...prev, ...newLib]);
    }
    input.value = '';
  };

  const motorStatus = () => {
    const proc = jobs.filter((j) => j.status === 'processando').length;
    const fila = jobs.filter((j) => j.status === 'fila').length;
    if (proc > 0) return { dot: 'working', label: `Processando ${proc} job(s)` };
    if (fila > 0) return { dot: 'online', label: `${fila} job(s) na fila` };
    if (driveReady) return { dot: 'online', label: 'Motor conectado' };
    return { dot: 'offline', label: 'Desconectado' };
  };

  const mStatus = motorStatus();
  const selectedClip = clips.find((c) => c.id === selectedId);
  const activeVideoClip = clips.find(
    (c) => c.trackId === 'video-1' && currentTime >= c.startTime && currentTime < c.startTime + c.duration
  );
  const missingPlaceholders = library.filter((m) => m.placeholder).length;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* ── HEADER ── */}
      <Header
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        userInfo={userInfo}
        authState={authState}
        onAuth={() => autenticaSeNecessario().catch(() => {})}
        onLogout={handleLogout}
        onNewProject={createNewProject}
        onLoadProject={carregaProjetoLocal}
        onSaveProject={salvaProjetoLocal}
        hasSavedProject={temProjetoSalvo}
        jobsCount={jobs.length}
        onOpenJobs={async () => {
          if (authState !== 'ok') {
            try {
              await autenticaSeNecessario();
            } catch {
              return;
            }
          }
          setModal('jobs');
        }}
        onOpenAi={() => setModal('ai')}
        onOpenExport={() => setModal('export')}
        motorStatus={mStatus}
        isInIframe={isInIframe}
        onOpenFloatingWindow={handleOpenFloatingWindow}
        onOpenOAuthHelp={() => setModal('oauth')}
      />

      {/* ── BANNER DE ERRO DE AUTORIZAÇÃO / ORIGIN MISMATCH (ERRO 400) ── */}
      {authState === 'error' && (
        <div
          style={{
            background: 'linear-gradient(90deg, #3d1414, #2b0b0b)',
            borderBottom: '1px solid #ef4444',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: 12,
            color: '#fca5a5',
            zIndex: 100,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span>
              <strong>Acesso Bloqueado pelo Google (Erro 400: origin_mismatch):</strong> A URL deste domínio precisa ser adicionada em <em>"Origens JavaScript autorizadas"</em> no Google Cloud Console.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              className="btn btn-primary"
              style={{
                fontSize: 11,
                padding: '4px 12px',
                background: '#ef4444',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
              }}
              onClick={() => setModal('oauth')}
            >
              <span>🛠️</span> Resolver Erro 400 / Configurar Origem
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 13, padding: '2px 6px', color: '#fca5a5' }}
              onClick={() => setAuthState('idle')}
              title="Fechar aviso"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── BANNER DE AVISO QUANDO O GOOGLE BLOQUEIA OAUTH NO IFRAME ── */}
      {iframeOAuthWarning && authState !== 'error' && (
        <div
          style={{
            background: 'linear-gradient(90deg, #2b1d03, #3d2402)',
            borderBottom: '1px solid var(--accent2)',
            padding: '7px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: 12,
            color: '#ffdd80',
            zIndex: 100,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span>
              <strong>Restrição de Iframe do Google OAuth 2.0:</strong> O Google bloqueia o login dentro de iframes (ambiente de teste AI Studio ou portais incorporados). Abra o aplicativo em Janela Flutuante para conectar o Drive sem restrições.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              className="btn btn-gold"
              style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={handleOpenFloatingWindow}
            >
              <span>⧉</span> Abrir Janela Flutuante
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '4px 8px', color: '#ffdd80', textDecoration: 'underline' }}
              onClick={() => setModal('oauth')}
            >
              🛠️ Ajuda OAuth
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 13, padding: '2px 6px', color: '#ffdd80' }}
              onClick={() => setIframeOAuthWarning(false)}
              title="Fechar aviso"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── CORPO PRINCIPAL ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ── BIBLIOTECA ── */}
        <MediaLibrary
          library={library}
          missingPlaceholders={missingPlaceholders}
          onImportFiles={async (files) => {
            const newMedias: MediaItem[] = [];
            for (const f of files) {
              const url = URL.createObjectURL(f);
              const kind = detectMediaType(f.name, f.type);
              const dur = await new Promise<number>((res) => {
                if (kind === 'image') return res(5);
                const m = document.createElement(kind === 'video' ? 'video' : 'audio');
                m.onloadedmetadata = () => res(m.duration || 5);
                m.onerror = () => res(5);
                m.src = url;
              });
              newMedias.push({
                id: Math.random().toString(36).slice(2),
                name: f.name,
                type: f.type || (kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mp3' : 'image/jpeg'),
                url,
                duration: dur,
              });
            }
            files.forEach((f) => {
              fileCache.current[f.name] = f;
            });

            setLibrary((prev) => {
              const semPlaceholder = prev.filter((m) => {
                if (!m.placeholder) return true;
                return !newMedias.find(
                  (n) =>
                    n.name.toLowerCase() === m.name.toLowerCase() ||
                    normalizeMediaName(n.name) === normalizeMediaName(m.name)
                );
              });
              setClips((prevClips) =>
                prevClips.map((clip) => {
                  const placeholder = prev.find((m) => m.placeholder && m.id === clip.mediaId);
                  if (!placeholder) return clip;
                  const nova = newMedias.find(
                    (n) =>
                      n.name.toLowerCase() === placeholder.name.toLowerCase() ||
                      normalizeMediaName(n.name) === normalizeMediaName(placeholder.name)
                  );
                  if (nova) return { ...clip, mediaId: nova.id };
                  return clip;
                })
              );
              return [...semPlaceholder, ...newMedias];
            });
          }}
          onReconnectMissing={reconnectMissingMedia}
          onAddMediaToTimeline={(mediaId) => {
            const m = library.find((item) => item.id === mediaId);
            if (!m) return;
            setPast((p) => [...p, clips]);
            setFuture([]);
            const trackId = isAudioFile(m.name, m.type) ? 'audio-1' : 'video-1';
            const lastEnd = clips
              .filter((c) => c.trackId === trackId)
              .reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
            setClips((prev) => [
              ...prev,
              {
                id: Math.random().toString(36).slice(2),
                mediaId: m.id,
                trackId,
                startTime: lastEnd,
                duration: m.duration,
                offset: 0,
                fit: 'contain',
                transition: 'none',
                transitionDuration: 0.8,
                effect: 'none',
                filter: 'none',
                filterIntensity: 100,
                fadeIn: 0,
                fadeOut: 0,
                volume: (trackId as string) === 'audio-2' ? 0.2 : 1.0,
              },
            ]);
            if (lastEnd + m.duration > duration) setDuration(lastEnd + m.duration + 10);
          }}
          onDragMediaStart={(mediaId, e) => {
            e.dataTransfer.setData('text/plain', mediaId);
            setDragMediaId(mediaId);
          }}
          onDragMediaEnd={() => setDragMediaId(null)}
        />

        {/* ── AUDIO ELEMENTS ── */}
        <audio ref={narrationRef} style={{ display: 'none' }} />
        <audio ref={bgmRef} style={{ display: 'none' }} />

        {/* ── PREVIEW ── */}
        <PreviewArea
          previewRef={previewRef}
          fullscreen={fullscreen}
          theme={theme}
          previewSrc={previewSrc}
          currentTime={currentTime}
          activeClip={activeVideoClip}
          library={library}
          isPlaying={isPlaying}
        />

        {/* ── PAINEL DIREITO (AJUSTES, EFEITOS, FILTROS, TRANSIÇÕES, ÁUDIO) ── */}
        <InspectorPanel
          selectedClip={selectedClip}
          activeTab={rightPanelTab}
          onSelectTab={setRightPanelTab}
          clipVolume={getClipVolume(selectedClip, selectedClip?.trackId === 'audio-2' ? 0.2 : 1.0)}
          duckingEnabled={duckingEnabled}
          onUpdateDuration={(newDur) => selectedId && updateDurationAndRipple(selectedId, newDur)}
          onUpdateClip={updateSelectedClip}
          onApplyToAllVideos={applyToAllVideos}
          onApplyTransitionCycle={applyTransitionCycle}
          onVolumeChange={(v) => {
            updateSelectedClip({ volume: v });
            if (selectedId) setVolumes((p) => ({ ...p, [selectedId]: v }));
            if (selectedClip?.trackId === 'audio-1' && narrationRef.current) narrationRef.current.volume = v;
            if (selectedClip?.trackId === 'audio-2' && bgmRef.current) bgmRef.current.volume = v;
          }}
          onToggleDucking={() => setDuckingEnabled((p) => !p)}
        />
      </div>

      {/* ── TIMELINE ── */}
      <Timeline
        timelineRef={timelineRef}
        tracks={TRACKS}
        clips={clips}
        library={library}
        selectedId={selectedId}
        duration={duration}
        currentTime={currentTime}
        zoom={zoom}
        theme={theme}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        isPlaying={isPlaying}
        snapOn={snapOn}
        onUndo={undo}
        onRedo={redo}
        onStop={() => {
          setIsPlaying(false);
          setCurrentTime(0);
          if (narrationRef.current) {
            narrationRef.current.pause();
            narrationRef.current.currentTime = 0;
          }
          if (bgmRef.current) {
            bgmRef.current.pause();
            bgmRef.current.currentTime = 0;
          }
        }}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onJoinClips={() => {
          setPast((p) => [...p, clips]);
          setFuture([]);
          setClips((prev) => {
            let t = 0;
            return [...prev]
              .sort((a, b) => a.startTime - b.startTime)
              .map((c) => {
                if (c.trackId === 'video-1') {
                  const start = t;
                  t += c.duration;
                  return { ...c, startTime: start };
                }
                return c;
              });
          });
        }}
        onToggleSnap={() => setSnapOn((p) => !p)}
        onZoomIn={() => setZoom((z) => Math.min(z + 0.25, 4))}
        onZoomOut={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
        onZoomReset={() => setZoom(1)}
        onToggleFullscreen={() => setFullscreen((p) => !p)}
        onDeleteSelected={() => {
          if (!selectedId) return;
          setPast((p) => [...p, clips]);
          setFuture([]);
          setClips((prev) => {
            const clipToDelete = prev.find((c) => c.id === selectedId);
            let nextClips = prev.filter((c) => c.id !== selectedId);
            if (clipToDelete && snapOn) {
              const delta = -clipToDelete.duration;
              nextClips = nextClips.map((c) => {
                if (c.trackId === clipToDelete.trackId && c.startTime > clipToDelete.startTime) {
                  return { ...c, startTime: Math.max(0, c.startTime + delta) };
                }
                return c;
              });
            }
            return nextClips;
          });
          setSelectedId(null);
        }}
        onTimelineClick={(e) => {
          if (dragState || !timelineRef.current) return;
          const rect = timelineRef.current.getBoundingClientRect();
          setCurrentTime(Math.max(0, (e.clientX - rect.left + timelineRef.current.scrollLeft) / (PPS * zoom)));
          setSelectedId(null);
        }}
        onTimelineDrop={onTimelineDrop}
        onClipMouseDown={onClipMouseDown}
      />

      {/* ── MODAIS ── */}
      <SendToMotorModal
        isOpen={modal === 'ai'}
        onClose={() => setModal(null)}
        driveReady={driveReady}
        aiFiles={aiFiles}
        aiStatus={aiStatus}
        onFileChange={handleFiles}
        onSubmitJob={enviaJob}
        isInIframe={isInIframe}
        onOpenFloatingWindow={handleOpenFloatingWindow}
        onOpenOAuthHelp={() => setModal('oauth')}
      />

      <JobsModal
        isOpen={modal === 'jobs'}
        onClose={() => setModal(null)}
        jobs={jobs}
        onImportTimeline={(jobId, jobName) => {
          importaTimeline(jobId, jobName);
          setModal(null);
        }}
      />

      <ExportModal
        isOpen={modal === 'export'}
        onClose={() => setModal(null)}
        renderState={renderState}
        onExportJson={() => {
          const data = { clips, library: library.map((m) => ({ ...m, url: undefined })), duration };
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'projeto_cronicas.json';
          a.click();
        }}
        onRenderColab={async () => {
          try {
            await autenticaSeNecessario();
          } catch {
            return;
          }
          if (!driveReady || !folderIds.fila) {
            alert('Drive não conectado.');
            return;
          }
          const videoClips = clips.filter((c) => c.trackId === 'video-1');
          const narClip = clips.find((c) => c.trackId === 'audio-1');
          const bgmClip = clips.find((c) => c.trackId === 'audio-2');
          if (videoClips.length === 0) {
            alert('Nenhuma imagem na timeline.');
            return;
          }

          const narMedia = narClip ? library.find((m) => m.id === narClip.mediaId) : null;
          if (!narMedia?.url) {
            alert('⚠️ Nenhum áudio de narração na timeline.\nAdicione o áudio na faixa Narração antes de renderizar.');
            return;
          }

          setRenderState({ isRendering: true, progress: 0, status: 'Criando job no Drive...' });
          setModal(null);

          try {
            const jobName = `render_${Date.now()}`;
            const jobId = await driveApi.getOrCreateFolder(folderIds.fila, jobName);

            const getFile = async (media: MediaItem, nomeSaida?: string) => {
              const cached = fileCache.current[media.name];
              if (cached) return new File([cached], nomeSaida || media.name, { type: cached.type });
              if (media.url) {
                const resp = await fetch(media.url);
                const blob = await resp.blob();
                return new File([blob], nomeSaida || media.name, { type: media.type });
              }
              return null;
            };

            for (let i = 0; i < videoClips.length; i++) {
              const clip = videoClips[i];
              const media = library.find((m) => m.id === clip.mediaId);
              if (!media) continue;
              setRenderState((p) => ({ ...p, status: `Enviando imagem ${i + 1}/${videoClips.length}...` }));
              const file = await getFile(media, media.name);
              if (file) await driveApi.uploadFile(jobId, file, media.name);
            }

            if (narClip) {
              const nMedia = library.find((m) => m.id === narClip.mediaId);
              if (nMedia) {
                setRenderState((p) => ({ ...p, status: 'Enviando áudio...' }));
                const ext = getFileExtension(nMedia.name) || 'mp3';
                const file = await getFile(nMedia, `audio.${ext}`);
                if (file) await driveApi.uploadFile(jobId, file, `audio.${ext}`);
              }
            }

            if (bgmClip) {
              const bMedia = library.find((m) => m.id === bgmClip.mediaId);
              if (bMedia) {
                setRenderState((p) => ({ ...p, status: 'Enviando música de fundo...' }));
                const ext = getFileExtension(bMedia.name) || 'mp3';
                const file = await getFile(bMedia, `bgm.${ext}`);
                if (file) await driveApi.uploadFile(jobId, file, `bgm.${ext}`);
              }
            }

            const tlData = {
              tipo: 'render',
              duracao_total: duration,
              cenas: videoClips.map((clip, i) => {
                const media = library.find((m) => m.id === clip.mediaId);
                return {
                  id_cena: String(i + 1).padStart(4, '0'),
                  arquivo: media?.name || `${String(i + 1).padStart(4, '0')}.jpg`,
                  start: clip.startTime,
                  end: clip.startTime + clip.duration,
                  duration: clip.duration,
                  fit: clip.fit || 'contain',
                  transition: clip.transition || 'none',
                  transition_duration: clip.transitionDuration ?? 0.8,
                  effect: clip.effect || 'none',
                  filter: clip.filter || 'none',
                  filter_intensity: clip.filterIntensity ?? 100,
                };
              }),
              audio: narClip
                ? 'audio.' + (getFileExtension(library.find((m) => m.id === narClip.mediaId)?.name) || 'mp3')
                : null,
              audio_volume: narClip ? getClipVolume(narClip, 1.0) : 1.0,
              audio_fade_in: narClip ? narClip.fadeIn || 0 : 0,
              audio_fade_out: narClip ? narClip.fadeOut || 0 : 0,
              bgm: bgmClip
                ? 'bgm.' + (getFileExtension(library.find((m) => m.id === bgmClip.mediaId)?.name) || 'mp3')
                : null,
              bgm_volume: bgmClip ? getClipVolume(bgmClip, 0.2) : 0.2,
              bgm_fade_in: bgmClip ? bgmClip.fadeIn || 0 : 0,
              bgm_fade_out: bgmClip ? bgmClip.fadeOut || 0 : 0,
              bgm_ducking: true,
            };
            await driveApi.uploadJson(jobId, 'timeline_render.json', tlData);

            await driveApi.uploadJson(jobId, 'job.json', {
              tipo: 'render',
              audio: tlData.audio,
              roteiro: null,
              timeline_pronta: 'timeline_render.json',
              criado_em: new Date().toISOString(),
            });

            setModal(null);
            alert('✅ Job de render enviado ao Motor de Dobra!\nAcompanhe em "📡 Jobs".');
          } catch (e: any) {
            alert('Erro ao enviar job: ' + e.message);
          }
        }}
        onRenderBrowser={async () => {
          const videoClips = clips.filter((c) => c.trackId === 'video-1').sort((a, b) => a.startTime - b.startTime);
          const narClip = clips.find((c) => c.trackId === 'audio-1');
          const bgmClip = clips.find((c) => c.trackId === 'audio-2');
          if (videoClips.length === 0) {
            alert('Nenhuma imagem na timeline.');
            return;
          }

          setRenderState({ isRendering: true, progress: 0, status: 'Carregando FFmpeg...' });
          let ffmpeg: any = null;
          try {
            // @ts-ignore
            const ffmpegModule = await import(/* @vite-ignore */ 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10');
            const { createFFmpeg } = ffmpegModule;
            const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
            const fb = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm';

            setRenderState((p) => ({ ...p, status: 'Baixando motor FFmpeg...' }));
            const [coreURL, wasmURL] = await Promise.all([
              fetch(`${base}/ffmpeg-core.js`)
                .then((r) => r.blob())
                .then((b) => URL.createObjectURL(b)),
              fetch(`${base}/ffmpeg-core.wasm`)
                .then((r) => r.blob())
                .then((b) => URL.createObjectURL(b)),
            ]);
            const workerText = await fetch(`${fb}/worker.js`).then((r) => r.text());
            const workerURL = URL.createObjectURL(new Blob([workerText], { type: 'text/javascript' }));

            ffmpeg = createFFmpeg({ log: false, coreURL, wasmURL, workerURL });
            await ffmpeg.load();

            ffmpeg.on('log', ({ message }: { message: string }) => {
              const m = message.match(/time=(\d{2}):(\d{2}):(\d{2})/);
              if (m) {
                const t = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
                setRenderState((p) => ({
                  ...p,
                  progress: Math.min(99, Math.round((t / duration) * 100)),
                  status: `Renderizando: ${Math.min(99, Math.round((t / duration) * 100))}%`,
                }));
              }
            });

            let listTxt = '';
            for (let i = 0; i < videoClips.length; i++) {
              const clip = videoClips[i];
              const media = library.find((m) => m.id === clip.mediaId);
              if (!media?.url) continue;
              setRenderState((p) => ({ ...p, status: `Preparando imagem ${i + 1}/${videoClips.length}...` }));
              const ext = getFileExtension(media.name) || 'jpg';
              const fname = `img${i}.${ext}`;
              const cached = fileCache.current[media.name];
              const buf = cached ? await cached.arrayBuffer() : await fetch(media.url).then((r) => r.arrayBuffer());
              await ffmpeg.writeFile(fname, new Uint8Array(buf));
              const next = videoClips[i + 1];
              const dur = next ? next.startTime - clip.startTime : duration - clip.startTime;
              listTxt += `file '${fname}'\nduration ${Math.max(0.1, dur).toFixed(3)}\n`;
            }
            const lastClip = videoClips[videoClips.length - 1];
            const lastMedia = library.find((m) => m.id === lastClip.mediaId);
            if (lastMedia?.url) {
              const ext = getFileExtension(lastMedia.name) || 'jpg';
              listTxt += `file 'img${videoClips.length - 1}.${ext}'\n`;
            }
            await ffmpeg.writeFile('list.txt', new TextEncoder().encode(listTxt));

            let cmd = ['-f', 'concat', '-safe', '0', '-i', 'list.txt'];
            let filterParts: string[] = [];

            if (narClip) {
              const narMedia = library.find((m) => m.id === narClip.mediaId);
              if (narMedia) {
                const cached = fileCache.current[narMedia.name];
                const buf = cached ? await cached.arrayBuffer() : await fetch(narMedia.url!).then((r) => r.arrayBuffer());
                await ffmpeg.writeFile('narration.mp3', new Uint8Array(buf));
                cmd.push('-i', 'narration.mp3');
                filterParts.push(`[1:a]volume=${getClipVolume(narClip, 1.0).toFixed(3)}[a1]`);
              }
            }

            if (bgmClip) {
              const bgmMedia = library.find((m) => m.id === bgmClip.mediaId);
              if (bgmMedia) {
                const cached = fileCache.current[bgmMedia.name];
                const buf = cached ? await cached.arrayBuffer() : await fetch(bgmMedia.url!).then((r) => r.arrayBuffer());
                await ffmpeg.writeFile('bgm.mp3', new Uint8Array(buf));
                cmd.push('-i', 'bgm.mp3');
                const bgmInputIndex = narClip ? 2 : 1;
                filterParts.push(`[${bgmInputIndex}:a]volume=${getClipVolume(bgmClip, 0.2).toFixed(3)}[bgm]`);
              }
            }

            cmd.push('-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p');
            cmd.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', '24');
            cmd.push('-movflags', '+faststart');

            if (filterParts.length > 0) {
              if (narClip && bgmClip) {
                filterParts.push(`[a1][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]`);
              }
              cmd.push('-filter_complex', filterParts.join(';'));
              cmd.push(
                '-map',
                '0:v',
                '-map',
                narClip && bgmClip ? '[aout]' : narClip ? '[a1]' : '[bgm]',
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                '-shortest'
              );
            }
            cmd.push('saida.mp4');

            setRenderState((p) => ({ ...p, status: 'Renderizando vídeo...' }));
            await ffmpeg.exec(cmd);

            const data = await ffmpeg.readFile('saida.mp4');
            const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'cronicas_estelares.mp4';
            a.click();

            setRenderState({ isRendering: false, progress: 100, status: '✅ Download iniciado!' });
            setTimeout(() => setModal(null), 2000);
          } catch (e: any) {
            setRenderState({ isRendering: false, progress: 0, status: `Erro: ${e.message}` });
          } finally {
            try {
              ffmpeg?.terminate();
            } catch {}
          }
        }}
      />

      <GoogleOAuthModal
        isOpen={modal === 'oauth'}
        onClose={() => setModal(null)}
        currentClientId={clientId}
        onSaveClientId={handleSaveClientId}
        onManualToken={handleManualToken}
        onRetryAuth={() => autenticaSeNecessario().catch(() => {})}
      />
    </div>
  );
}
