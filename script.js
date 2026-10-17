const fileInput = document.querySelector('#fileInput');
const chooseButton = document.querySelector('#chooseButton');
const changePhotoButton = document.querySelector('#changePhotoButton');
const downloadButton = document.querySelector('#downloadButton');
const compareButton = document.querySelector('#compareButton');
const maskModeButton = document.querySelector('#maskModeButton');
const clearMosaicButton = document.querySelector('#clearMosaicButton');
const lineArtButton = document.querySelector('#lineArtButton');
const canvas = document.querySelector('#resultCanvas');
const context = canvas.getContext('2d', { willReadFrequently: true });
const dropZone = document.querySelector('#dropZone');
const emptyState = document.querySelector('#emptyState');
const fileName = document.querySelector('#fileName');
const dimensionsLabel = document.querySelector('#imageDimensions');
const strengthInput = document.querySelector('#strength');
const strengthValue = document.querySelector('#strengthValue');
const strengthLabel = document.querySelector('#strengthLabel');
const rangeLow = document.querySelector('#rangeLow');
const rangeHigh = document.querySelector('#rangeHigh');
const moodFieldset = document.querySelector('.mood-fieldset');
const brushSizeInput = document.querySelector('#brushSize');
const brushSizeValue = document.querySelector('#brushSizeValue');
const toast = document.querySelector('#toast');

const presets = {
  forest: { tint: [1.035, 1.035, 0.94], wash: [211, 195, 143] },
  dusk: { tint: [1.08, 0.96, 0.84], wash: [230, 165, 103] },
  rain: { tint: [0.91, 1.015, 1.07], wash: [145, 185, 191] }
};

let originalPixels = null;
let processedPixels = null;
let sourceWidth = 0;
let sourceHeight = 0;
let currentPreset = 'forest';
let isComparing = false;
let isMasking = false;
let isLineArt = false;
let mosaicStrokes = [];
let currentStroke = null;
let mosaicPixelsCanvas = null;
let mosaicMaskCanvas = null;
let mosaicOverlayCanvas = null;
let toastTimer;

chooseButton.addEventListener('click', () => fileInput.click());
changePhotoButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (file) loadPhoto(file);
  fileInput.value = '';
});

document.querySelectorAll('.mood-option').forEach((button) => {
  button.addEventListener('click', () => {
    currentPreset = button.dataset.preset;
    document.querySelectorAll('.mood-option').forEach((option) => {
      const selected = option === button;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    });
    renderImage();
  });
});

strengthInput.addEventListener('input', () => {
  strengthValue.value = `${strengthInput.value}%`;
  renderImage();
});

lineArtButton.addEventListener('click', () => {
  isLineArt = !isLineArt;
  lineArtButton.setAttribute('aria-pressed', String(isLineArt));
  lineArtButton.innerHTML = isLineArt
    ? '<span aria-hidden="true">◧</span> カラー加工に戻す'
    : '<span aria-hidden="true">◧</span> 白黒二値線画にする';
  moodFieldset.hidden = isLineArt;
  strengthLabel.textContent = isLineArt ? '線の細かさ' : '手描きの風合い';
  rangeLow.textContent = isLineArt ? '太く少なめ' : 'さりげなく';
  rangeHigh.textContent = isLineArt ? '細かく多め' : 'しっかり';
  renderImage();
});

maskModeButton.addEventListener('click', () => setMasking(!isMasking));
clearMosaicButton.addEventListener('click', () => {
  mosaicStrokes = [];
  currentStroke = null;
  updateMosaicOverlay();
  renderDisplay();
});

brushSizeInput.addEventListener('input', () => {
  brushSizeValue.value = `${brushSizeInput.value}px`;
});

compareButton.addEventListener('click', () => {
  isComparing = !isComparing;
  if (isComparing) setMasking(false);
  compareButton.setAttribute('aria-pressed', String(isComparing));
  compareButton.innerHTML = isComparing ? '<span aria-hidden="true">◐</span> 変換後を見る' : '<span aria-hidden="true">◐</span> 元の写真';
  renderDisplay();
});

downloadButton.addEventListener('click', () => {
  if (!processedPixels) return;
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = sourceWidth;
  exportCanvas.height = sourceHeight;
  const exportContext = exportCanvas.getContext('2d');
  exportContext.putImageData(processedPixels, 0, 0);
  if (mosaicStrokes.length) exportContext.drawImage(mosaicOverlayCanvas, 0, 0);
  const link = document.createElement('a');
  link.download = `${getSafeName(fileName.textContent)}-moribi.png`;
  link.href = exportCanvas.toDataURL('image/png');
  link.click();
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragging');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragging');
  });
});

dropZone.addEventListener('drop', (event) => {
  const [file] = event.dataTransfer.files;
  if (file) loadPhoto(file);
});

function loadPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    showToast('JPG・PNG・WebP形式の画像を選んでください。');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast('ファイルは20 MB以下のものを選んでください。');
    return;
  }

  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  image.onload = () => {
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    sourceWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    sourceHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    context.clearRect(0, 0, sourceWidth, sourceHeight);
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight);
    originalPixels = context.getImageData(0, 0, sourceWidth, sourceHeight);
    mosaicStrokes = [];
    currentStroke = null;
    isMasking = false;
    mosaicPixelsCanvas = document.createElement('canvas');
    mosaicMaskCanvas = document.createElement('canvas');
    mosaicOverlayCanvas = document.createElement('canvas');
    [mosaicPixelsCanvas, mosaicMaskCanvas, mosaicOverlayCanvas].forEach((layer) => {
      layer.width = sourceWidth;
      layer.height = sourceHeight;
    });
    fileName.textContent = file.name;
    dimensionsLabel.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;
    emptyState.hidden = true;
    canvas.hidden = false;
    changePhotoButton.hidden = false;
    compareButton.disabled = false;
    downloadButton.disabled = false;
    maskModeButton.disabled = false;
    lineArtButton.disabled = false;
    brushSizeInput.disabled = false;
    isComparing = false;
    compareButton.setAttribute('aria-pressed', 'false');
    compareButton.innerHTML = '<span aria-hidden="true">◐</span> 元の写真';
    setMasking(false);
    updateMosaicControls();
    URL.revokeObjectURL(objectUrl);
    renderImage();
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    showToast('この画像を読み込めませんでした。別の画像をお試しください。');
  };
  image.src = objectUrl;
}

function renderImage() {
  if (!originalPixels) return;

  const output = new ImageData(new Uint8ClampedArray(originalPixels.data), sourceWidth, sourceHeight);
  const pixels = output.data;
  const pixelCount = sourceWidth * sourceHeight;
  const luminance = new Float32Array(pixelCount);
  const strength = Number(strengthInput.value) / 100;
  const preset = presets[currentPreset];
  const levels = 7 - Math.round(strength * 5);
  const quantizeStep = 255 / Math.max(2, levels - 1);
  const colorLevels = 12 - Math.round(strength * 7);
  const colorStep = 255 / Math.max(2, colorLevels - 1);

  for (let pixel = 0, offset = 0; pixel < pixelCount; pixel++, offset += 4) {
    luminance[pixel] = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
  }

  if (isLineArt) {
    processedPixels = createBinaryLineArt(luminance, strength);
    finishRendering();
    return;
  }

  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const pixel = y * sourceWidth + x;
      const offset = pixel * 4;
      const light = luminance[pixel];
      const quantized = Math.round(light / quantizeStep) * quantizeStep;
      const targetLight = light + (quantized - light) * strength * 0.85;
      const colorScale = light > 1 ? targetLight / light : 1;
      const right = x + 1 < sourceWidth ? luminance[pixel + 1] : light;
      const below = y + 1 < sourceHeight ? luminance[pixel + sourceWidth] : light;
      const edgeStrength = Math.max(Math.abs(light - right), Math.abs(light - below));
      const ink = Math.max(0, edgeStrength - 25) / 150 * strength * 0.7;
      const grain = (noise(pixel) - 0.5) * strength * 4;

      for (let channel = 0; channel < 3; channel++) {
        const base = pixels[offset + channel] * colorScale;
        const warmed = base * (1 - strength * 0.075) + preset.wash[channel] * strength * 0.075;
        const tinted = (warmed + grain) * preset.tint[channel] * (1 - ink);
        const posterized = Math.round(tinted / colorStep) * colorStep;
        pixels[offset + channel] = Math.max(0, Math.min(255, tinted + (posterized - tinted) * strength));
      }
    }
  }

  processedPixels = output;
  finishRendering();
}

function createBinaryLineArt(luminance, strength) {
  const lineArt = new ImageData(sourceWidth, sourceHeight);
  const pixels = lineArt.data;
  const smoothed = new Float32Array(luminance.length);
  const magnitudes = new Float32Array(luminance.length);
  const edges = new Uint8Array(luminance.length);
  const highThreshold = 105 - strength * 0.5;
  const lowThreshold = highThreshold * 0.4;

  function sample(image, x, y) {
    const safeX = Math.max(0, Math.min(sourceWidth - 1, x));
    const safeY = Math.max(0, Math.min(sourceHeight - 1, y));
    return image[safeY * sourceWidth + safeX];
  }

  function gradient(x, y) {
    const topLeft = sample(smoothed, x - 1, y - 1);
    const top = sample(smoothed, x, y - 1);
    const topRight = sample(smoothed, x + 1, y - 1);
    const left = sample(smoothed, x - 1, y);
    const right = sample(smoothed, x + 1, y);
    const bottomLeft = sample(smoothed, x - 1, y + 1);
    const bottom = sample(smoothed, x, y + 1);
    const bottomRight = sample(smoothed, x + 1, y + 1);
    return {
      x: -topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight,
      y: -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight
    };
  }

  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const weighted =
        sample(luminance, x - 1, y - 1) + 2 * sample(luminance, x, y - 1) + sample(luminance, x + 1, y - 1) +
        2 * sample(luminance, x - 1, y) + 4 * sample(luminance, x, y) + 2 * sample(luminance, x + 1, y) +
        sample(luminance, x - 1, y + 1) + 2 * sample(luminance, x, y + 1) + sample(luminance, x + 1, y + 1);
      smoothed[y * sourceWidth + x] = weighted / 16;
    }
  }

  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const index = y * sourceWidth + x;
      const edge = gradient(x, y);
      magnitudes[index] = Math.hypot(edge.x, edge.y);
    }
  }

  const diagonalRatio = 2.414;
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const index = y * sourceWidth + x;
      const magnitude = magnitudes[index];
      const edge = gradient(x, y);
      const absoluteX = Math.abs(edge.x);
      const absoluteY = Math.abs(edge.y);
      let first;
      let second;

      if (absoluteY <= absoluteX / diagonalRatio) {
        first = sample(magnitudes, x - 1, y);
        second = sample(magnitudes, x + 1, y);
      } else if (absoluteY >= absoluteX * diagonalRatio) {
        first = sample(magnitudes, x, y - 1);
        second = sample(magnitudes, x, y + 1);
      } else if (edge.x * edge.y >= 0) {
        first = sample(magnitudes, x - 1, y - 1);
        second = sample(magnitudes, x + 1, y + 1);
      } else {
        first = sample(magnitudes, x + 1, y - 1);
        second = sample(magnitudes, x - 1, y + 1);
      }

      if (magnitude >= first && magnitude > second && magnitude >= lowThreshold) {
        edges[index] = magnitude >= highThreshold ? 2 : 1;
      }
    }
  }

  const edgeQueue = new Int32Array(luminance.length);
  let queueEnd = 0;
  for (let index = 0; index < edges.length; index++) {
    if (edges[index] === 2) edgeQueue[queueEnd++] = index;
  }

  for (let queueIndex = 0; queueIndex < queueEnd; queueIndex++) {
    const index = edgeQueue[queueIndex];
    const x = index % sourceWidth;
    const y = Math.floor(index / sourceWidth);
    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        if (offsetX === 0 && offsetY === 0) continue;
        const neighborX = x + offsetX;
        const neighborY = y + offsetY;
        if (neighborX < 0 || neighborX >= sourceWidth || neighborY < 0 || neighborY >= sourceHeight) continue;
        const neighborIndex = neighborY * sourceWidth + neighborX;
        if (edges[neighborIndex] !== 1) continue;
        edges[neighborIndex] = 2;
        edgeQueue[queueEnd++] = neighborIndex;
      }
    }
  }

  for (let index = 0; index < edges.length; index++) {
    const shade = edges[index] === 2 ? 0 : 255;
    const offset = index * 4;
    pixels[offset] = shade;
    pixels[offset + 1] = shade;
    pixels[offset + 2] = shade;
    pixels[offset + 3] = 255;
  }

  return lineArt;
}

function finishRendering() {
  context.putImageData(processedPixels, 0, 0);
  updateMosaicPixels();
  updateMosaicOverlay();
  renderDisplay();
}

canvas.addEventListener('pointerdown', (event) => {
  if (!isMasking || isComparing) return;
  event.preventDefault();
  currentStroke = [getCanvasPoint(event)];
  mosaicStrokes.push(currentStroke);
  canvas.setPointerCapture(event.pointerId);
  updateMosaicOverlay();
  renderDisplay();
});

canvas.addEventListener('pointermove', (event) => {
  if (!currentStroke) return;
  const point = getCanvasPoint(event);
  const previous = currentStroke[currentStroke.length - 1];
  if (Math.hypot(point.x - previous.x, point.y - previous.y) < 3) return;
  currentStroke.push(point);
  updateMosaicOverlay();
  renderDisplay();
});

['pointerup', 'pointercancel', 'lostpointercapture'].forEach((eventName) => {
  canvas.addEventListener(eventName, () => {
    currentStroke = null;
  });
});

function setMasking(enabled) {
  isMasking = Boolean(enabled && originalPixels && !isComparing);
  maskModeButton.setAttribute('aria-pressed', String(isMasking));
  maskModeButton.innerHTML = isMasking ? '<span aria-hidden="true">◉</span> 塗るモードを終了' : '<span aria-hidden="true">◉</span> モザイクを塗る';
  canvas.classList.toggle('is-masking', isMasking);
}

function getCanvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * sourceWidth / bounds.width,
    y: (event.clientY - bounds.top) * sourceHeight / bounds.height
  };
}

function updateMosaicPixels() {
  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = Math.max(1, Math.ceil(sourceWidth / 24));
  tileCanvas.height = Math.max(1, Math.ceil(sourceHeight / 24));
  const tileContext = tileCanvas.getContext('2d');
  tileContext.drawImage(canvas, 0, 0, tileCanvas.width, tileCanvas.height);

  const mosaicContext = mosaicPixelsCanvas.getContext('2d');
  mosaicContext.imageSmoothingEnabled = false;
  mosaicContext.clearRect(0, 0, sourceWidth, sourceHeight);
  mosaicContext.drawImage(tileCanvas, 0, 0, sourceWidth, sourceHeight);
}

function updateMosaicOverlay() {
  if (!mosaicMaskCanvas || !mosaicOverlayCanvas) return;
  const maskContext = mosaicMaskCanvas.getContext('2d');
  maskContext.clearRect(0, 0, sourceWidth, sourceHeight);
  maskContext.fillStyle = '#fff';
  maskContext.strokeStyle = '#fff';
  maskContext.lineCap = 'round';
  maskContext.lineJoin = 'round';
  const bounds = canvas.getBoundingClientRect();
  const radius = Number(brushSizeInput.value) * sourceWidth / bounds.width / 2;

  for (const stroke of mosaicStrokes) {
    if (!stroke.length) continue;
    if (stroke.length === 1) {
      maskContext.beginPath();
      maskContext.arc(stroke[0].x, stroke[0].y, radius, 0, Math.PI * 2);
      maskContext.fill();
      continue;
    }
    maskContext.lineWidth = radius * 2;
    maskContext.beginPath();
    maskContext.moveTo(stroke[0].x, stroke[0].y);
    for (let index = 1; index < stroke.length; index++) {
      maskContext.lineTo(stroke[index].x, stroke[index].y);
    }
    maskContext.stroke();
  }

  const overlayContext = mosaicOverlayCanvas.getContext('2d');
  overlayContext.clearRect(0, 0, sourceWidth, sourceHeight);
  overlayContext.drawImage(mosaicPixelsCanvas, 0, 0);
  overlayContext.globalCompositeOperation = 'destination-in';
  overlayContext.drawImage(mosaicMaskCanvas, 0, 0);
  overlayContext.globalCompositeOperation = 'source-over';
  updateMosaicControls();
}

function updateMosaicControls() {
  clearMosaicButton.disabled = mosaicStrokes.length === 0;
}

function renderDisplay() {
  if (!originalPixels) return;
  context.putImageData(isComparing ? originalPixels : processedPixels, 0, 0);
  if (!isComparing && mosaicStrokes.length) context.drawImage(mosaicOverlayCanvas, 0, 0);
}

function noise(value) {
  let seed = (value + 1) * 374761393;
  seed = (seed ^ (seed >>> 13)) * 1274126177;
  return ((seed ^ (seed >>> 16)) >>> 0) / 4294967295;
}

function getSafeName(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'photo';
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}