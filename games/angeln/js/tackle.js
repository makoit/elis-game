import * as THREE from '../../../vendor/three.module.js';

// Angelzubehör in echten Proportionen: Pose (Balsa mit Antenne), Kunstköder, Boot.
// Maße in Metern; Ursprung von Pose/Köder = Schnuröse.

const std = (color, rough = 0.5, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const phys = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, ...extra });

// Lathe-Körper aus Profilpunkten [radius, y]
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// Pose: tropfenförmiger Körper, schwarze/weiße Ringe, leuchtorange Antenne. Schwimmt mit dem Körper knapp unter Wasser.
export function createFloat(night = false) {
  const g = new THREE.Group();
  const body = lathe([[0.001, -0.07], [0.008, -0.06], [0.013, -0.035], [0.012, 0], [0.007, 0.03], [0.003, 0.045], [0.002, 0.05]]);
  g.add(new THREE.Mesh(body, phys(0x1a1a1a)));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0115, 0.022, 20, 1, true), phys(0xf4f4f0));
  band.position.y = 0.012; g.add(band);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.05, 6), std(0x222222));
  stem.position.y = -0.09; g.add(stem);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0026, 0.075, 10), new THREE.MeshStandardMaterial({
    color: 0xff4a10, emissive: 0xff3a00, emissiveIntensity: night ? 2.5 : 0.35, roughness: 0.4,
  }));
  ant.position.y = 0.085; g.add(ant);
  const tipBand = new THREE.Mesh(new THREE.CylinderGeometry(0.0023, 0.0023, 0.012, 10), std(0xffe23a, 0.4, 0, { emissive: 0xffd000, emissiveIntensity: night ? 2 : 0.3 }));
  tipBand.position.y = 0.11; g.add(tipBand);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // Im Spiel wird die Pose 3× vergrößert, damit man sie auf 20 m noch sieht (Bildschirmgröße ~ echte Wahrnehmung)
  return g;
}

function spinner(color) {
  const g = new THREE.Group();
  const wire = std(0xc8ccd2, 0.2, 1);
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 0.06, 4), wire);
  w.rotation.x = Math.PI / 2; g.add(w);
  const blade = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.35), std(color, 0.15, 1, { side: THREE.DoubleSide }));
  blade.scale.set(0.7, 0.25, 1.4); blade.position.z = 0.012; blade.rotation.x = Math.PI / 2; g.add(blade);
  const body = new THREE.Mesh(lathe([[0.0, 0], [0.004, 0.004], [0.0045, 0.014], [0.003, 0.02], [0, 0.022]], 12), std(0xd0a020, 0.3, 0.8));
  body.rotation.x = -Math.PI / 2; body.position.z = -0.005; g.add(body);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.0007, 4, 10, Math.PI * 1.4), wire);
  hook.position.z = -0.03; g.add(hook);
  g.userData.spin = blade;
  return g;
}

function wobbler(color) {
  const g = new THREE.Group();
  const prof = [[0, 0], [0.006, 0.006], [0.009, 0.02], [0.008, 0.045], [0.005, 0.06], [0.002, 0.07], [0, 0.072]];
  const body = new THREE.Mesh(lathe(prof, 16), phys(color));
  body.rotation.x = Math.PI / 2; body.position.z = -0.035; body.scale.set(0.7, 1, 1);
  g.add(body);
  const back = new THREE.Mesh(lathe(prof, 16), phys(0x1a3a2a));
  back.rotation.x = Math.PI / 2; back.position.set(0, 0.0015, -0.035); back.scale.set(0.55, 0.9, 0.75);
  g.add(back);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0008, 0.014), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.8, roughness: 0.1, transparent: true, opacity: 0.6 }));
  lip.position.set(0, -0.004, 0.04); lip.rotation.x = 0.6; g.add(lip);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), std(0xffd23a, 0.2)); e.position.set(s * 0.0055, 0.002, 0.028); g.add(e); }
  return g;
}

function softbait(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(lathe([[0, 0], [0.005, 0.005], [0.007, 0.02], [0.006, 0.05], [0.003, 0.07], [0.0025, 0.08]], 12), std(color, 0.55, 0, { transparent: true, opacity: 0.92 }));
  body.rotation.x = -Math.PI / 2; body.position.z = 0.03; g.add(body);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.003, 14), std(color, 0.55));
  tail.position.z = -0.053; g.add(tail);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 10), std(0x8a8a90, 0.3, 0.9));
  head.position.z = 0.034; g.add(head);
  return g;
}

function spoon(color) {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.3), std(color, 0.15, 1, { side: THREE.DoubleSide }));
  s.scale.set(0.45, 0.25, 1.3); s.rotation.x = Math.PI / 2; g.add(s);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 0.05), std(0xd8262a, 0.4, 0, { side: THREE.DoubleSide }));
  stripe.position.y = -0.002; stripe.rotation.x = Math.PI / 2; g.add(stripe);
  return g;
}

function fly(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0012, 0.012, 6), std(color, 0.8));
  body.rotation.x = Math.PI / 2; g.add(body);
  const hackle = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.0015, 4, 10), std(0x8a6a4a, 1));
  hackle.position.z = 0.005; g.add(hackle);
  const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 0.01), std(0xd8d8d0, 0.9, 0, { side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
  wing.position.set(0, 0.005, 0.002); g.add(wing);
  return g;
}

// Popper: kurzer Körper mit hohlem Maul, das an der Oberfläche spritzt
function popper(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(lathe([[0, 0], [0.006, 0.004], [0.009, 0.02], [0.011, 0.05], [0.009, 0.055], [0.006, 0.052]], 16), phys(color));
  body.rotation.x = Math.PI / 2; body.position.z = -0.03; g.add(body);
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 12, 8), phys(0x1a5aa8));
  back.scale.set(0.9, 0.5, 3.2); back.position.set(0, 0.004, 0.0); g.add(back);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 8, 6), std(0xffd23a, 0.2)); e.position.set(s * 0.008, 0.002, 0.016); g.add(e); }
  return g;
}

// Pilker: schwerer, länglicher Metallköder mit Drilling
function pilker(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 6), std(color, 0.15, 1));
  body.rotation.x = Math.PI / 2; body.scale.set(1.4, 0.6, 1); g.add(body);
  const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.025, 6), std(0xff3a6a, 0.3, 0.4));
  tape.rotation.x = Math.PI / 2; tape.scale.set(1.45, 0.62, 1); tape.position.z = -0.02; g.add(tape);
  const wire = std(0xc8ccd2, 0.2, 1);
  for (let i = 0; i < 3; i++) {
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.005, 0.0008, 4, 10, Math.PI * 1.4), wire);
    hook.position.z = -0.05; hook.rotation.z = (i * Math.PI * 2) / 3; hook.rotation.y = Math.PI / 2; g.add(hook);
  }
  return g;
}

// Köder am Haken: Kunstköder als Modell, Naturköder als kleiner Körper (Wurm/Made/Mais …)
export function createLure(bait) {
  let g;
  switch (bait.id) {
    case 'spinner': g = spinner(0xe0e4ea); break;
    case 'blinker': g = spoon(0xe8c23a); break;
    case 'wobbler': g = wobbler(0x7ab84a); break;
    case 'gummi': g = softbait(0xd8ff3a); break;
    case 'fliege': case 'nymphe': case 'kaefer': g = fly(bait.color); break;
    case 'popper': g = popper(0xf4f4f0); break;
    case 'pilker': g = pilker(0xc8d0d8); break;
    default: {
      g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.03, 4, 8), std(bait.color, 0.6));
      m.rotation.z = 0.8; g.add(m);
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- Angelboot (GFK, Rumpf aus Spanten gelofted) ----------
export function createBoat(color = 0xf2f2ee) {
  const g = new THREE.Group();
  const L = 4.6;
  const stations = 14;
  const ring = 9;
  const pos = [];
  const idx = [];
  const halfW = (t) => 0.95 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.55) * (t > 0.85 ? 1 - (t - 0.85) * 2.2 : 1);
  const sheer = (t) => 0.62 + Math.pow(t, 3) * 0.28;
  const keel = (t) => -0.18 + Math.pow(Math.max(0, t - 0.6), 2) * 0.8;
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const z = -L / 2 + t * L;
    const w = Math.max(0.02, halfW(t));
    for (let k = 0; k <= ring; k++) {
      const u = k / ring; // 0 = linke Bordwand oben … 1 = rechte Bordwand oben
      const a = (u - 0.5) * Math.PI;
      const x = Math.sin(a) * w;
      const yy = keel(t) + (sheer(t) - keel(t)) * Math.pow(Math.abs(Math.sin(a)), 1.6);
      pos.push(x, yy, z);
    }
  }
  for (let i = 0; i < stations; i++) {
    for (let k = 0; k < ring; k++) {
      const a = i * (ring + 1) + k;
      const b = a + ring + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const hullGeo = new THREE.BufferGeometry();
  hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hullGeo.setIndex(idx);
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8, side: THREE.DoubleSide }));
  hull.castShadow = true; hull.receiveShadow = true;
  g.add(hull);
  // Zierstreifen unter dem Dollbord
  const band = [];
  for (let i = 0; i <= stations; i++) { const t = i / stations; band.push(new THREE.Vector3(Math.max(0.02, halfW(t)) + 0.004, sheer(t) - 0.08, -L / 2 + t * L)); }
  for (const sgn of [1, -1]) {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(band.map((p) => new THREE.Vector3(p.x * sgn, p.y, p.z))), 40, 0.03, 4), new THREE.MeshStandardMaterial({ color: 0x1a4a8a, roughness: 0.4 }));
    g.add(tube);
  }
  // Dollbord, Bänke, Boden
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7048, roughness: 0.75 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, L * 0.78), wood);
  floor.position.set(0, -0.08, -0.1); floor.receiveShadow = true; g.add(floor);
  for (const [z, w] of [[-1.3, 1.6], [0.1, 1.75], [1.2, 1.35]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.3), wood);
    b.position.set(0, 0.3, z); b.castShadow = true; g.add(b);
  }
  const rail = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    rail.push(new THREE.Vector3(-Math.max(0.02, halfW(t)), sheer(t) + 0.02, -L / 2 + t * L));
  }
  const railR = rail.map((p) => new THREE.Vector3(-p.x, p.y, p.z));
  for (const r of [rail, railR]) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(r), 40, 0.025, 6), new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.5 })));
  // Heckspiegel + Außenborder
  const transom = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.62, 0.05), hull.material);
  transom.position.set(0, 0.25, -L / 2); g.add(transom);
  const motor = new THREE.Group();
  const cowl = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.22, 6, 14), new THREE.MeshPhysicalMaterial({ color: 0x1a1a1c, roughness: 0.3, clearcoat: 1 }));
  cowl.rotation.x = Math.PI / 2; cowl.scale.set(1, 1.3, 0.9); cowl.position.y = 0.75; motor.add(cowl);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.18), std(0x2a2a2e, 0.4, 0.5));
  leg.position.y = 0.2; motor.add(leg);
  const tiller = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.6, 8), std(0x111111, 0.5));
  tiller.rotation.x = Math.PI / 2.4; tiller.position.set(0, 0.7, 0.35); motor.add(tiller);
  motor.position.set(0, 0, -L / 2 - 0.15); g.add(motor);
  // Echolot am Heck-Sitz
  const sonar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.15, 0.05), std(0x111111, 0.4));
  sonar.position.set(0.5, 0.45, 1.25); sonar.rotation.x = -0.4; g.add(sonar);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.11), new THREE.MeshBasicMaterial({ color: 0x2a7ac8 }));
  screen.position.set(0.5, 0.46, 1.276); screen.rotation.x = -0.4; g.add(screen);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // Unsichtbarer Deckel auf der Bordkante: markiert im Stencil-Puffer, wo man in den Rumpf schaut –
  // dort zeichnet das Wasser nicht (sonst stünde der Boden unter Wasser).
  const cap = [];
  const capIdx = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const w = Math.max(0.02, halfW(t));
    cap.push(-w, sheer(t), -L / 2 + t * L, w, sheer(t), -L / 2 + t * L);
    if (i < stations) capIdx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const capGeo = new THREE.BufferGeometry();
  capGeo.setAttribute('position', new THREE.Float32BufferAttribute(cap, 3));
  capGeo.setIndex(capIdx);
  const mask = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: false, side: THREE.DoubleSide,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
  }));
  mask.renderOrder = -1; // vor dem Wasser
  g.add(mask);
  g.userData.deckY = -0.06;
  return g;
}

// Kescher: Alu-Stiel, Bügel und Netzsack. Ursprung = Bügelmitte, Stiel zeigt nach +z (zum Angler).
export function createNet() {
  const g = new THREE.Group();
  const alu = std(0xb8bcc4, 0.3, 0.9);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 8, 40), alu);
  hoop.rotation.x = Math.PI / 2; g.add(hoop);
  const bag = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.45, 20, 4, true), new THREE.MeshStandardMaterial({
    color: 0x1a2a1a, roughness: 0.9, wireframe: true, transparent: true, opacity: 0.7,
  }));
  bag.rotation.x = Math.PI; bag.position.y = -0.22; g.add(bag);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 1.8, 8), alu);
  pole.rotation.x = Math.PI / 2; pole.position.z = 0.3 + 0.9; g.add(pole);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), std(0x111111, 0.8));
  grip.rotation.x = Math.PI / 2; grip.position.z = 1.95; g.add(grip);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Wassertropfen-Sprite für Spritzer
export function dropTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(240,248,255,0.7)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

