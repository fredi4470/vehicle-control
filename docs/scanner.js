import QrScanner from './vendor/qr-scanner.min.js';
import {scanPhoto} from './photo-scanner.js?v=20260925-photo1';

// All decoding runs locally, including the bundled worker fallback on iPhone.
export function setupScanner({dialog, video, start, stop, photo, message, error, onResult}) {
  let scanner = null;
  let generation = 0;
  const instruction = 'Kamera starten und den QR-Code am Fahrzeug scannen.';

  function stopCamera() {
    generation++;
    if (scanner) {
      // Immediate release avoids the library's delayed stop touching a new stream.
      scanner.pause(true);
      scanner.destroy();
      scanner = null;
    }
    video.srcObject?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    video.hidden = true;
    start.disabled = false;
    start.textContent = 'Kamera starten';
    stop.hidden = true;
    photo.disabled = false;
    message.textContent = instruction;
  }

  function cameraError(reason) {
    const text = String(reason?.name || '') + ' ' + String(reason?.message || reason);
    if (/NotAllowed|Permission|denied|SecurityError/i.test(text)) {
      return 'Kamerazugriff nicht erlaubt. Öffne die App direkt in Safari oder Chrome und erlaube den Kamerazugriff in den Website-Einstellungen. Unter „QR-Scan funktioniert nicht?“ kannst du ein Foto auswählen.';
    }
    if (/NotFound|DevicesNotFound|Camera not found/i.test(text)) {
      return 'Keine Kamera gefunden. Unter „QR-Scan funktioniert nicht?“ kannst du ein Foto auswählen oder die QR-ID eingeben.';
    }
    if (/NotReadable|TrackStart|Could not start/i.test(text)) {
      return 'Die Kamera konnte nicht gestartet werden. Schließe andere Kamera-Apps und versuche es erneut.';
    }
    return 'Die Kamera konnte nicht gestartet werden. Öffne die App direkt in Safari oder Chrome. Alternativ kannst du ein QR-Foto auswählen oder die QR-ID eingeben.';
  }

  start.onclick = async () => {
    stopCamera();
    const current = generation;
    error.textContent = '';
    if (!window.isSecureContext) {
      error.textContent = 'Die Kamera benötigt eine HTTPS-Adresse. Bitte die veröffentlichte App öffnen.';
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      error.textContent = 'Dieser Browser stellt keinen Kamerazugriff bereit. Öffne die App direkt in Safari oder Chrome oder wähle ein QR-Foto aus.';
      return;
    }
    start.disabled = true;
    start.textContent = 'Kamera wird gestartet …';
    stop.hidden = false;
    video.hidden = false;
    video.muted = true;
    video.setAttribute('playsinline', '');
    message.textContent = 'Bitte den Kamerazugriff erlauben.';
    try {
      // Request once ourselves to preserve browser permission errors.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: {ideal: 'environment'}}, audio: false,
      });
      if (current !== generation || !dialog.open || document.hidden) {
        stream.getTracks().forEach(track => track.stop());
        if (current === generation) stopCamera();
        return;
      }
      video.srcObject = stream;
      const instance = new QrScanner(video, result => {
        if (current !== generation || !dialog.open || document.hidden) return;
        if (onResult(result.data)) stopCamera();
      }, {
        preferredCamera: 'environment',
        maxScansPerSecond: 8,
        returnDetailedScanResult: true,
        onDecodeError: reason => {
          if (current !== generation || reason === QrScanner.NO_QR_CODE_FOUND) return;
          error.textContent = 'Der QR-Code konnte nicht gelesen werden. Unter „QR-Scan funktioniert nicht?“ kannst du ein scharfes Foto auswählen oder die QR-ID eingeben.';
        },
      });
      scanner = instance;
      await instance.start();
      if (current !== generation) return;
      if (!dialog.open || document.hidden) { stopCamera(); return; }
      start.textContent = 'Kamera aktiv';
      message.textContent = 'QR-Code mittig und ruhig vor die Kamera halten.';
    } catch (reason) {
      if (current !== generation) return;
      stopCamera();
      error.textContent = cameraError(reason);
    }
  };

  photo.onchange = async () => {
    const file = photo.files?.[0];
    photo.value = '';
    if (!file) return;
    stopCamera();
    const current = generation;
    error.textContent = '';
    message.textContent = 'QR-Code im Foto wird gelesen …';
    photo.disabled = true;
    try {
      const result = await scanPhoto(file, () => current !== generation || !dialog.open);
      if (result && current === generation && dialog.open) onResult(result.data);
    } catch (reason) {
      if (current === generation && dialog.open) {
        error.textContent = reason.message || 'Das Foto konnte nicht verarbeitet werden. Bitte erneut versuchen.';
      }
    } finally {
      if (current === generation) {
        photo.disabled = false;
        message.textContent = instruction;
      }
    }
  };
  stop.onclick = stopCamera;
  dialog.addEventListener('close', stopCamera);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && scanner) stopCamera();
  });
  window.addEventListener('pagehide', stopCamera);
  return {reset() { stopCamera(); error.textContent = ''; }};
}
