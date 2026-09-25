import QrScanner from './vendor/qr-scanner.min.js';
import {createWorker} from './vendor/qr-scanner-worker.min.js';

export function photoScanSizes(width, height) {
  const sizes = [];
  for (const maximum of [1024, 768, 512, 1600, 2048]) {
    const ratio = Math.min(1, maximum / Math.max(width, height));
    const size = [Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio))];
    if (!sizes.some(([w,h]) => w === size[0] && h === size[1])) sizes.push(size);
  }
  return sizes;
}

export async function scanPhoto(file, isCancelled = () => false) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  let worker;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Das Laden des Fotos dauert zu lange. Bitte ein kleineres Bild auswählen.')), 15000);
      function finish(error) {
        clearTimeout(timer);
        image.onload = image.onerror = null;
        error ? reject(error) : resolve();
      }
      image.onload = () => finish();
      image.onerror = () => finish(new Error('Das Foto konnte nicht geöffnet werden. Bitte ein JPEG, PNG oder einen Screenshot auswählen.'));
      image.src = url;
    });
    if (isCancelled()) return null;
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height) throw new Error('Das Foto enthält keine lesbaren Bilddaten.');
    worker = createWorker();
    worker.postMessage({type:'inversionMode',data:'both'});
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', {alpha:false});
    if (!context) throw new Error('Die Bildverarbeitung ist in diesem Browser nicht verfügbar. Bitte die Live-Kamera verwenden.');
    for (const [w,h] of photoScanSizes(width,height)) {
      if (isCancelled()) return null;
      canvas.width = w;
      canvas.height = h;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image,0,0,w,h);
      try {
        return await QrScanner.scanImage(canvas, {qrEngine:worker, returnDetailedScanResult:true});
      } catch (error) {
        // Retry at a different scale only when decoding found no QR code.
        if (String(error?.message || error) !== QrScanner.NO_QR_CODE_FOUND) {
          throw new Error('Die Foto-Erkennung konnte nicht abgeschlossen werden. Bitte erneut versuchen oder die Live-Kamera verwenden.');
        }
      }
    }
    throw new Error('Kein lesbarer QR-Code im Foto gefunden. Bitte den vollständigen QR-Code mit weißem Rand näher aufnehmen.');
  } finally {
    worker?.terminate();
    URL.revokeObjectURL(url);
  }
}
