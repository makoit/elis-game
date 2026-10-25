import * as THREE from 'three';

// Lädt Foto-Texturen (Poly Haven, CC0) asynchron und gibt sie gecacht zurück.
// Die Farbtextur wird auf Graustufen mit festem Mittelwert normiert, damit die Kartenfarben (Vertexfarben) erhalten bleiben
// und nur die Struktur der Oberfläche vom Foto kommt. Die Normalmap liefert das Relief.

const BASE = './assets/textures/';
const cache = new Map();

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function detailTexture(img, mean) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  let sum = 0;
  const n = px.length / 4;
  for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const k = (mean * 255) / (sum / n);
  for (let i = 0; i < px.length; i += 4) {
    const l = Math.min(255, (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) * k);
    px[i] = px[i + 1] = px[i + 2] = l;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// name: grass | forest | red | sand | dirt | asphalt → Promise<{ diff, nor }> (bei Fehler null)
export function loadSurface(name, mean = 0.8) {
  const key = name + mean;
  if (!cache.has(key)) {
    cache.set(key, Promise.all([loadImage(`${BASE}${name}_diff.jpg`), loadImage(`${BASE}${name}_nor.jpg`)])
      .then(([d, n]) => {
        const nor = new THREE.Texture(n);
        nor.wrapS = nor.wrapT = THREE.RepeatWrapping;
        nor.anisotropy = 4;
        nor.needsUpdate = true;
        return { diff: detailTexture(d, mean), nor };
      })
      .catch(() => null));
  }
  return cache.get(key);
}
