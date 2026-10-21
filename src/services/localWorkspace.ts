// Serviço de gerenciamento do Workspace / Pasta Local do PC
// Utiliza a File System Access API nativa do navegador (Chromium/Edge/Chrome/Brave)
// com fallback para input de arquivos tradicional.

export interface WorkspaceFiles {
  folderName: string;
  allFiles: File[];
  audioFile?: File;
  scriptFile?: File;
  mediaFiles: File[];
  timelineFile?: File;
  hasDirectoryHandle: boolean;
}

let activeDirectoryHandle: any = null;

const EXT_AUDIO = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
const EXT_SCRIPT = ['.txt', '.md', '.text'];
const EXT_VISUAL = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.webm', '.avi', '.mkv'];

function getExt(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? ('.' + parts.pop()!.toLowerCase()) : '';
}

export const localWorkspace = {
  isFileSystemAccessSupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  },

  async pickDirectory(): Promise<WorkspaceFiles> {
    if (!this.isFileSystemAccessSupported()) {
      throw new Error('Seu navegador não suporta seleção direta de pastas (File System Access API).');
    }

    try {
      const handle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });
      activeDirectoryHandle = handle;
      const folderName = handle.name || 'Pasta de Trabalho';

      const files: File[] = [];
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          files.push(file);
        }
      }

      return this.organizeFiles(folderName, files, true);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Seleção de pasta cancelada pelo usuário.');
      }
      throw err;
    }
  },

  organizeFiles(folderName: string, files: File[], hasHandle: boolean = false): WorkspaceFiles {
    let audioFile: File | undefined;
    let scriptFile: File | undefined;
    let timelineFile: File | undefined;
    const mediaFiles: File[] = [];

    for (const f of files) {
      const ext = getExt(f.name);
      const lower = f.name.toLowerCase();

      if (lower === 'timeline.json') {
        timelineFile = f;
      } else if (EXT_AUDIO.includes(ext) && !lower.startsWith('bgm.')) {
        if (!audioFile) audioFile = f;
      } else if (EXT_SCRIPT.includes(ext) || lower.includes('roteiro')) {
        if (!scriptFile) scriptFile = f;
      } else if (EXT_VISUAL.includes(ext)) {
        mediaFiles.push(f);
      }
    }

    return {
      folderName,
      allFiles: files,
      audioFile,
      scriptFile,
      mediaFiles,
      timelineFile,
      hasDirectoryHandle: hasHandle,
    };
  },

  async saveFileToCurrentWorkspace(fileName: string, content: string | Blob): Promise<boolean> {
    if (!activeDirectoryHandle) {
      return false;
    }

    try {
      const fileHandle = await activeDirectoryHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (err) {
      console.warn('Não foi possível gravar diretamente no diretório do PC:', err);
      return false;
    }
  },

  getActiveFolderName(): string | null {
    return activeDirectoryHandle ? activeDirectoryHandle.name : null;
  },

  hasActiveHandle(): boolean {
    return activeDirectoryHandle !== null;
  },
};
