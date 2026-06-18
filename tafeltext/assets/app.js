(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  // ----- DOM references -----
  const dropzone = $('#dropzone');
  const fileInput = $('#fileInput');
  const cameraBtn = $('#cameraBtn');
  const cameraStage = $('#cameraStage');
  const cameraVideo = $('#cameraVideo');
  const captureBtn = $('#captureBtn');
  const cameraCloseBtn = $('#cameraCloseBtn');
  const pageListEl = $('#pageList');

  const prepSection = $('#prepSection');
  const previewCanvas = $('#previewCanvas');
  const rotateLeftBtn = $('#rotateLeftBtn');
  const rotateRightBtn = $('#rotateRightBtn');
  const modeRadios = document.querySelectorAll('input[name="mode"]');
  const modeHint = $('#modeHint');
  const langSelect = $('#langSelect');
  const contrastRange = $('#contrastRange');
  const brightnessRange = $('#brightnessRange');
  const bwToggle = $('#bwToggle');
  const thresholdRow = $('#thresholdRow');
  const thresholdRange = $('#thresholdRange');
  const addToQueueBtn = $('#addToQueueBtn');
  const scanBtn = $('#scanBtn');

  const progressSection = $('#progressSection');
  const progressFill = $('#progressFill');
  const progressLabel = $('#progressLabel');
  const cancelBtn = $('#cancelBtn');

  const resultSection = $('#resultSection');
  const resultText = $('#resultText');
  const resultStats = $('#resultStats');
  const copyBtn = $('#copyBtn');
  const downloadTxtBtn = $('#downloadTxtBtn');
  const printBtn = $('#printBtn');
  const resetBtn = $('#resetBtn');
  const printArea = $('#printArea');

  // ----- State -----
  let pages = [];           // { id, bitmap, name, rotation, contrast, brightness, bw, threshold }
  let selectedPageId = null;
  let pageCounter = 0;
  let cameraStream = null;
  let cancelRequested = false;
  let worker = null;
  let totalPagesToScan = 1;
  let currentPageNum = 1;

  const MAX_DIM = 2200;

  // ===================================================================
  // Page management
  // ===================================================================
  function newPageFromBitmap(bitmap, name) {
    return {
      id: 'p' + (++pageCounter),
      bitmap,
      name,
      rotation: 0,
      contrast: Number(contrastRange.value),
      brightness: Number(brightnessRange.value),
      bw: bwToggle.checked,
      threshold: Number(thresholdRange.value),
    };
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    let lastId = null;
    for (const file of files) {
      try {
        const bitmap = await createImageBitmap(file);
        const page = newPageFromBitmap(bitmap, file.name || 'Bild');
        pages.push(page);
        lastId = page.id;
      } catch (err) {
        console.error('Bild konnte nicht gelesen werden:', err);
      }
    }
    if (lastId) {
      renderPageList();
      selectPage(lastId);
      prepSection.hidden = false;
      prepSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function addBitmapAsPage(bitmap, name) {
    const page = newPageFromBitmap(bitmap, name);
    pages.push(page);
    renderPageList();
    selectPage(page.id);
    prepSection.hidden = false;
    prepSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function getSelectedPage() {
    return pages.find((p) => p.id === selectedPageId) || null;
  }

  function selectPage(id) {
    selectedPageId = id;
    const page = getSelectedPage();
    if (!page) return;
    contrastRange.value = page.contrast;
    brightnessRange.value = page.brightness;
    bwToggle.checked = page.bw;
    thresholdRange.value = page.threshold;
    thresholdRow.style.display = page.bw ? '' : 'none';
    renderPageList();
    renderPreview();
  }

  function removePage(id) {
    pages = pages.filter((p) => p.id !== id);
    if (selectedPageId === id) selectedPageId = null;
    if (pages.length) {
      selectPage(pages[pages.length - 1].id);
    } else {
      prepSection.hidden = true;
      pageListEl.innerHTML = '';
    }
    renderPageList();
  }

  function renderPageList() {
    pageListEl.innerHTML = '';
    pages.forEach((page, idx) => {
      const li = document.createElement('li');
      if (page.id === selectedPageId) li.style.borderColor = 'var(--red-pen)';

      const thumb = document.createElement('canvas');
      thumb.width = 36;
      thumb.height = 36;
      const tctx = thumb.getContext('2d');
      const { bitmap } = page;
      const scale = Math.max(36 / bitmap.width, 36 / bitmap.height);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      tctx.drawImage(bitmap, (36 - w) / 2, (36 - h) / 2, w, h);

      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'page-thumb-btn';
      label.style.background = 'none';
      label.style.border = 'none';
      label.style.cursor = 'pointer';
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '0.4rem';
      label.style.color = 'inherit';
      label.style.font = 'inherit';
      label.setAttribute('aria-label', `Seite ${idx + 1} bearbeiten`);
      label.appendChild(thumb);
      const span = document.createElement('span');
      span.textContent = `Seite ${idx + 1}`;
      label.appendChild(span);
      label.addEventListener('click', () => selectPage(page.id));

      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '✕';
      del.title = 'Seite entfernen';
      del.setAttribute('aria-label', `Seite ${idx + 1} entfernen`);
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        removePage(page.id);
      });

      li.appendChild(label);
      li.appendChild(del);
      pageListEl.appendChild(li);
    });
  }

  // ===================================================================
  // Image processing (rotation, grayscale, contrast/brightness, threshold)
  // ===================================================================
  function buildProcessedCanvas(page) {
    const { bitmap, rotation, contrast, brightness, bw, threshold } = page;
    const srcW = bitmap.width;
    const srcH = bitmap.height;

    let scale = 1;
    const maxSide = Math.max(srcW, srcH);
    if (maxSide > MAX_DIM) scale = MAX_DIM / maxSide;
    else if (maxSide < 900) scale = 1400 / maxSide;
    const dW = Math.round(srcW * scale);
    const dH = Math.round(srcH * scale);

    const swap = rotation === 90 || rotation === 270;
    const canvas = document.createElement('canvas');
    canvas.width = swap ? dH : dW;
    canvas.height = swap ? dW : dH;
    const ctx = canvas.getContext('2d');

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(bitmap, -dW / 2, -dH / 2, dW, dH);
    ctx.restore();

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    const c = contrast / 100 + 1;
    const b = brightness;

    for (let i = 0; i < d.length; i += 4) {
      let gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      gray = (gray - 128) * c + 128 + b;
      if (bw) {
        gray = gray >= threshold ? 255 : 0;
      } else {
        gray = Math.max(0, Math.min(255, gray));
      }
      d[i] = d[i + 1] = d[i + 2] = gray;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  function renderPreview() {
    const page = getSelectedPage();
    if (!page) return;
    const canvas = buildProcessedCanvas(page);
    previewCanvas.width = canvas.width;
    previewCanvas.height = canvas.height;
    previewCanvas.getContext('2d').drawImage(canvas, 0, 0);
  }

  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderPreview();
    });
  }

  function updateSelectedPageFromControls() {
    const page = getSelectedPage();
    if (!page) return;
    page.contrast = Number(contrastRange.value);
    page.brightness = Number(brightnessRange.value);
    page.bw = bwToggle.checked;
    page.threshold = Number(thresholdRange.value);
    thresholdRow.style.display = page.bw ? '' : 'none';
    scheduleRender();
  }

  [contrastRange, brightnessRange, thresholdRange].forEach((el) =>
    el.addEventListener('input', updateSelectedPageFromControls)
  );
  bwToggle.addEventListener('change', updateSelectedPageFromControls);

  rotateLeftBtn.addEventListener('click', () => {
    const page = getSelectedPage();
    if (!page) return;
    page.rotation = (page.rotation + 270) % 360;
    scheduleRender();
  });
  rotateRightBtn.addEventListener('click', () => {
    const page = getSelectedPage();
    if (!page) return;
    page.rotation = (page.rotation + 90) % 360;
    scheduleRender();
  });

  modeRadios.forEach((r) =>
    r.addEventListener('change', () => {
      const mode = document.querySelector('input[name="mode"]:checked').value;
      modeHint.textContent =
        mode === 'handwriting'
          ? 'Handschrift wird unterstützt, ist aber deutlich fehleranfälliger als Druckschrift – am besten in deutlicher, nicht zu verschnörkelter Schrift mit gutem Licht fotografieren und das Ergebnis danach kurz prüfen.'
          : 'Am genauesten bei klarem, gut beleuchtetem Druck.';
    })
  );

  // ===================================================================
  // File input / drag&drop
  // ===================================================================
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) addFiles(e.target.files);
    fileInput.value = '';
  });
  ['dragover', 'dragenter'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    })
  );
  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  addToQueueBtn.addEventListener('click', () => fileInput.click());

  // ===================================================================
  // Camera capture
  // ===================================================================
  cameraBtn.addEventListener('click', async () => {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      cameraVideo.srcObject = cameraStream;
      cameraStage.classList.remove('hidden');
    } catch (err) {
      alert('Kamera konnte nicht geöffnet werden: ' + err.message);
    }
  });

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    cameraStage.classList.add('hidden');
  }
  cameraCloseBtn.addEventListener('click', stopCamera);

  captureBtn.addEventListener('click', async () => {
    const w = cameraVideo.videoWidth;
    const h = cameraVideo.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(cameraVideo, 0, 0, w, h);
    const bitmap = await createImageBitmap(canvas);
    await addBitmapAsPage(bitmap, 'Kamera-Aufnahme');
    stopCamera();
  });

  // ===================================================================
  // OCR
  // ===================================================================
  async function getOrCreateWorker(lang) {
    if (worker) {
      try {
        await worker.terminate();
      } catch (e) {
        /* ignore */
      }
      worker = null;
    }
    worker = await Tesseract.createWorker(lang, Tesseract.OEM.LSTM_ONLY, {
      workerPath: 'vendor/tesseract/worker.min.js',
      corePath: 'vendor/tesseract/',
      langPath: 'vendor/tessdata/',
      logger: (m) => handleProgress(m),
    });
    return worker;
  }

  function handleProgress(m) {
    if (!m || typeof m.progress !== 'number') return;
    const pagePortion = 1 / totalPagesToScan;
    const overall = (currentPageNum - 1) * pagePortion + m.progress * pagePortion;
    progressFill.style.width = Math.round(overall * 100) + '%';

    const statusMap = {
      'loading tesseract core': 'Erkennungs-Engine wird geladen …',
      'initializing tesseract': 'Initialisiere …',
      'loading language traineddata': 'Sprachdaten werden geladen …',
      'initializing api': 'Bereite Erkennung vor …',
      'recognizing text': `Seite ${currentPageNum} von ${totalPagesToScan} wird erkannt`,
    };
    const label = statusMap[m.status] || m.status;
    progressLabel.textContent =
      label + (m.status === 'recognizing text' ? ` (${Math.round(m.progress * 100)}%)` : ' …');
  }

  scanBtn.addEventListener('click', async () => {
    if (!pages.length) return;
    cancelRequested = false;
    prepSection.hidden = true;
    progressSection.hidden = false;
    resultSection.hidden = true;
    progressFill.style.width = '0%';
    scanBtn.disabled = true;

    const lang = langSelect.value;
    const mode = document.querySelector('input[name="mode"]:checked').value;

    try {
      totalPagesToScan = pages.length;
      const w = await getOrCreateWorker(lang);

      await w.setParameters({
        tessedit_pageseg_mode:
          mode === 'handwriting' ? Tesseract.PSM.SINGLE_BLOCK : Tesseract.PSM.AUTO,
        preserve_interword_spaces: '1',
      });

      const results = [];
      for (let i = 0; i < pages.length; i++) {
        if (cancelRequested) break;
        currentPageNum = i + 1;
        const canvas = buildProcessedCanvas(pages[i]);
        const { data } = await w.recognize(canvas);
        results.push((data.text || '').trim());
      }

      if (cancelRequested) {
        progressSection.hidden = true;
        prepSection.hidden = false;
        scanBtn.disabled = false;
        return;
      }

      const combined = results
        .map((t, i) => (results.length > 1 ? `--- Seite ${i + 1} ---\n${t}` : t))
        .join('\n\n');

      resultText.value = combined;
      updateStats();
      progressSection.hidden = true;
      resultSection.hidden = false;
      resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
      progressLabel.textContent = 'Fehler bei der Texterkennung: ' + err.message;
    } finally {
      scanBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener('click', () => {
    cancelRequested = true;
    progressLabel.textContent = 'Wird abgebrochen …';
  });

  // ===================================================================
  // Result actions
  // ===================================================================
  function updateStats() {
    const text = resultText.value;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    resultStats.textContent = `${text.length} Zeichen · ${words} Wörter`;
  }
  resultText.addEventListener('input', updateStats);

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(resultText.value);
      copyBtn.textContent = '✓ Kopiert';
      setTimeout(() => (copyBtn.textContent = '📋 Kopieren'), 1500);
    } catch {
      resultText.select();
      document.execCommand('copy');
    }
  });

  downloadTxtBtn.addEventListener('click', () => {
    const blob = new Blob([resultText.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'erkannter-text.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  printBtn.addEventListener('click', () => {
    printArea.textContent = resultText.value;
    window.print();
  });

  resetBtn.addEventListener('click', () => {
    pages = [];
    selectedPageId = null;
    pageListEl.innerHTML = '';
    prepSection.hidden = true;
    resultSection.hidden = true;
    resultText.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ===================================================================
  // Offline support
  // ===================================================================
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
