/* ====================================
   VDTOR — Asset Manager Module
   ==================================== */
'use strict';

const AssetManager = (() => {
  const assets = [];
  let onAssetAdded = null;

  function setOnAssetAdded(cb) { onAssetAdded = cb; }

  function getAll() { return assets; }

  function getById(id) { return assets.find(a => a.id === id); }

  function formatDuration(secs) {
    if (!secs || isNaN(secs)) return '??';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2,'0')}`;
  }

  function getFileType(file) {
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    if (file.type.startsWith('image/')) return 'image';
    return 'unknown';
  }

  function generateId() {
    return 'asset_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  }

  async function addFiles(files) {
    for (const file of files) {
      const type = getFileType(file);
      if (type === 'unknown') continue;

      const url = URL.createObjectURL(file);
      const asset = {
        id: generateId(),
        name: file.name,
        type,
        url,
        file,
        size: file.size,
        duration: 0,
        width: null,
        height: null,
        thumbnail: null,
        addedAt: Date.now()
      };

      // Get metadata
      if (type === 'video' || type === 'audio') {
        await getMediaMetadata(asset, url, type);
      } else if (type === 'image') {
        await getImageMetadata(asset, url);
      }

      assets.push(asset);
      if (onAssetAdded) onAssetAdded(asset);
    }
  }

  function getMediaMetadata(asset, url, type) {
    return new Promise((resolve) => {
      const media = document.createElement(type === 'video' ? 'video' : 'audio');
      media.src = url;
      media.preload = 'metadata';
      media.onloadedmetadata = () => {
        asset.duration = media.duration;
        if (type === 'video') {
          asset.width = media.videoWidth;
          asset.height = media.videoHeight;
          generateVideoThumbnail(asset, media).then(resolve);
        } else {
          resolve();
        }
      };
      media.onerror = resolve;
      setTimeout(resolve, 3000);
    });
  }

  function generateVideoThumbnail(asset, videoEl) {
    return new Promise((resolve) => {
      videoEl.currentTime = Math.min(0.5, asset.duration * 0.1);
      videoEl.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 160; canvas.height = 90;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, 160, 90);
        asset.thumbnail = canvas.toDataURL('image/jpeg', 0.7);
        resolve();
      };
      setTimeout(resolve, 2000);
    });
  }

  function getImageMetadata(asset, url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        asset.width = img.naturalWidth;
        asset.height = img.naturalHeight;
        // Use image itself as thumbnail
        const canvas = document.createElement('canvas');
        canvas.width = 160; canvas.height = 90;
        const ctx = canvas.getContext('2d');
        // Crop center
        const ratio = img.naturalWidth / img.naturalHeight;
        const targetRatio = 16/9;
        let sx=0,sy=0,sw=img.naturalWidth,sh=img.naturalHeight;
        if (ratio > targetRatio) {
          sw = img.naturalHeight * targetRatio; sx = (img.naturalWidth - sw)/2;
        } else {
          sh = img.naturalWidth / targetRatio; sy = (img.naturalHeight - sh)/2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 160, 90);
        asset.thumbnail = canvas.toDataURL('image/jpeg', 0.7);
        resolve();
      };
      img.onerror = resolve;
      img.src = url;
    });
  }

  function init() {
    const dropZone = document.getElementById('media-drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('btn-browse-media');

    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const files = [...e.dataTransfer.files];
      if (files.length > 0) {
        Toast.show(`Importing ${files.length} file${files.length > 1 ? 's' : ''}…`);
        await addFiles(files);
        Toast.show(`${files.length} file${files.length > 1 ? 's' : ''} imported`, 'success');
      }
    });

    // File input
    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      if (fileInput.files.length > 0) {
        Toast.show(`Importing ${fileInput.files.length} file(s)…`);
        await addFiles([...fileInput.files]);
        Toast.show(`${fileInput.files.length} file(s) imported`, 'success');
        fileInput.value = '';
      }
    });

    // Also allow dropping onto entire app
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', async (e) => {
      e.preventDefault();
      const files = [...e.dataTransfer.files].filter(f =>
        f.type.startsWith('video/') || f.type.startsWith('audio/') || f.type.startsWith('image/')
      );
      if (files.length > 0) {
        await addFiles(files);
        Toast.show(`${files.length} file(s) imported`, 'success');
      }
    });
  }

  return { init, addFiles, getAll, getById, setOnAssetAdded, formatDuration };
})();
