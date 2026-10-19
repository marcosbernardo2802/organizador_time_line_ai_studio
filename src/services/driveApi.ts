export const driveApi = {
  token: null as string | null,

  async getOrCreateFolder(parentId: string, name: string): Promise<string> {
    const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    const d = await r.json();
    if (d.files && d.files.length > 0) return d.files[0].id;
    const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
    });
    const cd = await cr.json();
    return cd.id;
  },

  async uploadFile(folderId: string, file: Blob | File, name?: string, onProgress?: (ratio: number) => void): Promise<any> {
    console.log('uploadFile start', { folderId, name, type: file?.type, size: file?.size });
    const fileName = name || (file as File).name || 'file';
    const meta = JSON.stringify({ name: fileName, parents: [folderId] });
    const form = new FormData();
    form.append('metadata', new Blob([meta], { type: 'application/json' }));
    form.append('file', file);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink');
      xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status < 300) {
          console.log('uploadFile success', { status: xhr.status, response: xhr.responseText });
          resolve(JSON.parse(xhr.responseText));
        } else {
          console.error('uploadFile failed', { status: xhr.status, statusText: xhr.statusText, response: xhr.responseText });
          reject(new Error(`Upload falhou: ${xhr.status} ${xhr.statusText} — ${xhr.responseText}`));
        }
      };
      xhr.onerror = () => {
        console.error('uploadFile network error', { folderId, name });
        reject(new Error('Erro de rede no upload'));
      };
      xhr.send(form);
    });
  },

  async uploadJson(folderId: string, name: string, data: any): Promise<any> {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    return this.uploadFile(folderId, file, name);
  },

  async listFolder(folderId: string): Promise<any[]> {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,mimeType,modifiedTime)&orderBy=createdTime desc`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    const d = await r.json();
    return d.files || [];
  },

  async readJson(fileId: string): Promise<any> {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    return r.json();
  },

  async getFileLink(fileId: string): Promise<{ webViewLink?: string; webContentLink?: string }> {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink,webContentLink`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    return r.json();
  },

  async getRootId(): Promise<string> {
    const r = await fetch('https://www.googleapis.com/drive/v3/files/root?fields=id', {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    const d = await r.json();
    return d.id;
  }
};
