// Fahrphysik (ohne Three.js). Das Rad bewegt sich entlang der Strecke (s), seitlich (lat)
// und hat eine Höhe (y) mit Sprung-Physik. v ist die Geschwindigkeit entlang der Strecke (m/s).
//
// Längs: Tretleistung (P/v, begrenzt durch die Traktion), Luftwiderstand ½·ρ·cdA·v², Rollwiderstand,
// Hangabtrieb m·g·sin(α), Bremse. Kurven: benötigte Querbeschleunigung κ·v² gegen die Haftgrenze µ·g –
// wer zu schnell ist, wird nach außen getragen. Sprünge: ballistisch. Dazu Wheelie, Rempler und Hindernisse.

export const G = 9.81; // Erdbeschleunigung (Längsrichtung)
export const G_AIR = 11.5; // Flugphase etwas "schwerer" – knackigere, kürzere Sprünge
export const LAT_SPEED = 5; // max. Seitengeschwindigkeit bei vollem Lenkeinschlag (m/s)
const MASS = 85; // Fahrer + Rad (kg); Motorräder bringen ihre Masse in bikedata mit
const RHO = 1.2; // Luftdichte
const CDA = { trail: 0.45, downhill: 0.5, road: 0.3, gravel: 0.36 }; // Stirnfläche × cW (Motorräder: bike.cdA)
const JUMP_VY = { bike: 25, moto: 9.5 }; // max. Absprung-Steiggeschwindigkeit (Motorräder sind so schnell, dass sie sonst in den Himmel fliegen)
const CRR = { asphalt: 0.005, dirt: 0.011 };
const MU = { asphalt: 0.85, dirt: 0.7 }; // Haftreibung Reifen/Boden
export const SPEED_SCALE = 0.5; // Werte in bikedata (vmax) → reale Spitzengeschwindigkeit in der Ebene

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Höchste Querbeschleunigung (m/s²), die der Reifen in der Kurve an Stelle s hält (Anlieger tragen mehr)
export function cornerGrip(sim, latGrip = 1) {
  const { t, b } = sim;
  const surf = t.map.surface;
  let a = (MU[surf] ?? 0.7) * G * clamp(b.surface[surf], 0.6, 1.1) * (b.corner ?? 1) * latGrip;
  if (t.map.berm) a *= 1 + 1.4 * Math.min(1, Math.abs(t.bankAt(sim.s)) / t.bankMax);
  else a *= 1 + 0.25 * Math.min(1, Math.abs(t.bankAt(sim.s)) / t.bankMax);
  return a * (1 + 0.3 * sim.assist);
}

// Rempler zwischen zwei Fahrern. Gibt die Stärke zurück (0 = kein Kontakt).
export function collideRiders(a, b) {
  const L = a.t.lapLength;
  let ds = a.s - b.s;
  if (a.t.loop) ds -= L * Math.round(ds / L);
  const dl = a.lat - b.lat;
  if (Math.abs(ds) > 1.7 || Math.abs(dl) > 0.8 || Math.abs(a.y - b.y) > 0.9) return 0;
  const sign = dl !== 0 ? Math.sign(dl) : (ds >= 0 ? 1 : -1);
  const pen = 0.8 - Math.abs(dl);
  a.lat += sign * pen * 0.5;
  b.lat -= sign * pen * 0.5;
  const latRel = Math.abs(a.latV - b.latV);
  const push = 1.5 + Math.min(3, latRel * 0.6);
  a.latV = a.latV * 0.3 + sign * push;
  b.latV = b.latV * 0.3 - sign * push;
  let dv = 0;
  if (Math.abs(dl) < 0.55) { // von hinten aufgefahren: der Hintere verliert Tempo, der Vordere wird geschoben
    const rear = ds < 0 ? a : b, front = rear === a ? b : a;
    if (rear.v > front.v) { dv = rear.v - front.v; rear.v -= dv * 0.6; front.v += dv * 0.25; }
  }
  const impact = latRel + dv + 1;
  for (const s of [a, b]) s.stumble = Math.max(s.stumble, Math.min(0.5, 0.15 + impact * 0.04));
  // nur ein neuer Kontakt zählt als Rempler (für Ton, Wackeln, Anzeige)
  const fresh = a.bumpCool <= 0 && b.bumpCool <= 0;
  if (fresh) a.bumpCool = b.bumpCool = 0.6;
  else { a.bumpCool = Math.max(a.bumpCool, 0.2); b.bumpCool = Math.max(b.bumpCool, 0.2); }
  return fresh ? impact : 0;
}

export class BikeSim {
  constructor(track, bike) {
    this.t = track;
    this.b = bike;
    this.s = 10;
    this.lat = 0;
    this.latV = 0;
    this.v = 0;
    this.y = track.heightAt(this.s);
    this.vy = 0;
    this.vyG = 0; // senkrechte Geschwindigkeit am Boden
    this.air = false;
    this.airTime = 0;
    this.boost = 0;
    this.offroad = false;
    this.finished = false;
    this.events = [];
    this.slope = 0;
    this.drift = 0;
    this.kappa = 0;
    this.slide = 0; // wie stark das Rad in der Kurve rutscht (0..1)
    this.speedFactor = 1;
    this.rockHit = new Set(); // pro Fahrer, damit mehrere Räder dieselbe Strecke nutzen können
    this.padUsed = new Set();
    this.patchIn = new Set(); // Pfützen/Matsch, in denen das Rad gerade steht
    this.lap = 0;
    this.assist = 0; // Lenkhilfe 0..1 (mehr Kurvenhalt, sanftes Zurückhalten auf der Strecke)
    this.wheelie = 0; // Winkel des Vorderrads (rad)
    this.wheelieTime = 0;
    this.stumble = 0; // Kontrollverlust nach Rempler / Aufprall (s)
    this.bumpCool = 0;
    this.power = 0; // aktuelle Tretleistung 0..1 (für die Trittfrequenz)
    this.vLimit = Infinity; // Tempolimit (m/s), z. B. Kinder-Einstellung für Motorräder

    // abgeleitete Kennwerte
    this.m = bike.mass ?? MASS;
    this.cdA = bike.cdA ?? CDA[bike.cat] ?? 0.42;
    this.vTop = bike.vmax * SPEED_SCALE; // Spitze in der Ebene auf gutem Belag
    this.P = (CRR.asphalt * this.m * G + 0.5 * RHO * this.cdA * this.vTop * this.vTop) * this.vTop; // Watt
    this.Fmax = this.m * bike.accel * 0.55; // Traktions-/Kraftgrenze beim Antritt (kleiner Gang)
    this.brakeA = bike.brake * 0.34; // Verzögerung (m/s²)
    this.jumpVy = JUMP_VY[bike.moto ? 'moto' : 'bike'];
  }

  step(dt, c) {
    const { t, b } = this;
    const MASS = this.m;
    const ev = this.events;
    ev.length = 0;
    const ws = t.wrap(this.s); // Position innerhalb der Runde (Hindernisse gelten pro Runde)
    const surf = t.map.surface;
    const grip = b.surface[surf];
    const sf = this.speedFactor || 1;
    this.offroad = Math.abs(this.lat) > t.halfW;
    this.slope = t.slopeAt(this.s);
    this.bumpCool -= dt;
    const ctl = this.stumble > 0 ? 0.25 : 1; // nach einem Aufprall kurz wackelig
    this.stumble = Math.max(0, this.stumble - dt);

    // --- Wheelie (Vorderrad hoch) ---
    const wantW = c.wheelie && this.v > 1.5 && !c.brake && this.stumble <= 0;
    const prevW = this.wheelie;
    if (!this.air) {
      const target = wantW ? 0.48 + (c.gas ? 0.06 : -0.06) : 0;
      this.wheelie += clamp(target - this.wheelie, -3.5 * dt, 2.4 * dt);
    }
    if (this.wheelie > 0.3 && !this.air) this.wheelieTime += dt;
    if (prevW >= 0.3 && this.wheelie < 0.3) {
      if (this.wheelieTime > 0.4) {
        ev.push({ type: 'wheelie', time: this.wheelieTime });
        if (this.wheelieTime >= 1.5) this.boost = Math.max(this.boost, Math.min(0.8, this.wheelieTime * 0.18)); // Belohnung
      }
      this.wheelieTime = 0;
    }
    if (prevW < 0.3 && this.wheelie >= 0.3) ev.push({ type: 'wheelieStart' });

    // --- Längsbewegung (Kräfte in N) ---
    let F = -0.5 * RHO * this.cdA * this.v * this.v;
    this.power = 0;
    if (!this.air) {
      if (c.gas && this.v < this.vLimit) {
        const p = this.P * sf * clamp(grip, 0.7, 1.1) * ctl * clamp((this.vLimit - this.v) / 2, 0, 1);
        const f = Math.min(this.Fmax * sf, p / Math.max(this.v, 1.5));
        F += f;
        this.power = clamp(f * Math.max(this.v, 1.5) / this.P, 0, 1.2);
      }
      const sl = clamp(this.slope, -0.45, 0.3); // steile Rampenflächen bergauf nur bis ~17° wirksam (sonst bleibt man stehen)
      const sinA = sl / Math.sqrt(1 + sl * sl);
      F -= MASS * G * sinA * (sl < 0 ? b.slopeK : 1);
      F -= (CRR[surf] ?? 0.01) / Math.max(0.6, grip) * MASS * G;
      if (c.brake) F -= MASS * this.brakeA * Math.min(1, this.v / 1.5) * (this.offroad ? 0.7 : 1);
      if (this.offroad) F -= MASS * (0.6 + (1 - b.terrain) * 2.6 + (b.moto ? 0.1 : 0.047) * this.v * (1 - b.terrain));
    }
    if (this.boost > 0) { F += MASS * 4.2; this.boost -= dt; }
    let latGrip = 1;
    if (!this.air) {
      for (const pt of t.patches) {
        if (Math.abs(pt.s - ws) > pt.len / 2 + 1) continue;
        if (Math.abs(ws - pt.s) < pt.len / 2 && Math.abs(this.lat - pt.lat) < pt.r) {
          F -= MASS * pt.drag * 0.45 * Math.min(1, 0.4 + this.v / 6);
          latGrip = Math.min(latGrip, pt.grip);
          if (!this.patchIn.has(pt)) { this.patchIn.add(pt); ev.push({ type: 'patch', patch: pt }); }
        } else this.patchIn.delete(pt);
      }
    }
    this.v = Math.max(0, this.v + (F / MASS) * dt);

    // --- Seitliche Bewegung ---
    // Kurve: benötigte Querbeschleunigung κ·v². Bis zur Haftgrenze hält der Reifen, darüber rutscht man nach außen.
    const kappa = t.curvAt(this.s);
    const aLat = kappa * this.v * this.v;
    let drift;
    if (this.air) drift = aLat * 0.1; // in der Luft fliegt man geradeaus weiter, die Strecke biegt ab
    else {
      const aMax = cornerGrip(this, latGrip);
      const over = Math.max(0, Math.abs(aLat) - aMax);
      drift = Math.sign(aLat) * (over * 0.6 + Math.abs(aLat) * 0.04);
      this.slide = clamp(over / 3, 0, 1);
    }
    this.drift = clamp(drift, -7, 7);
    this.kappa = kappa;
    let steerIn = c.steer * ctl;
    if (this.assist > 0 && !this.air) { // sanft zur Strecke zurück, wenn man neben der Piste fährt
      const over = Math.abs(this.lat) - (t.halfW - 0.6);
      if (over > 0) steerIn -= Math.sign(this.lat) * Math.min(0.6, over * 0.25) * this.assist;
    }
    const steer = clamp(steerIn, -1, 1) * b.steer * (0.35 + 0.65 * Math.min(1, this.v / 6)) * (this.air ? 0.5 : 1) * (this.wheelie > 0.3 ? 0.6 : 1);
    const k = this.stumble > 0 ? 3 : 7;
    this.latV += (steer * LAT_SPEED * latGrip - this.drift - this.latV) * Math.min(1, dt * (this.air ? 2 : k) * (0.5 + 0.5 * latGrip));
    this.lat += this.latV * dt;
    const lim = t.halfW + 3.5;
    if (Math.abs(this.lat) > lim) {
      this.lat = Math.sign(this.lat) * lim;
      this.latV = 0;
      this.v *= 1 - 1.5 * dt;
    }

    // --- Vorwärts + Höhe ---
    this.s = Math.min(this.s + this.v * dt, t.end - 1);
    const ground = t.heightAt(this.s);
    const wsn = t.wrap(this.s);

    if (!this.air) {
      // Senkrechte Geschwindigkeit aus der tatsächlich gefahrenen Bahn (nicht aus der Steigung um s –
      // die wäre an einer Abbruchkante, z. B. vor der Lücke eines Doubles, stark negativ)
      const vyG = this.vyG;
      const ballistic = this.y + vyG * dt - 0.5 * G_AIR * dt * dt;
      if (ground < ballistic - 0.03 && this.v > 3) {
        this.air = true;
        this.airTime = 0;
        this.vy = Math.min(vyG, this.jumpVy) - G_AIR * dt;
        if (this.wheelie > 0.25) this.vy += 1.3; // am Absprung gezogen → mehr Höhe
        this.y = ballistic;
        ev.push({ type: 'jump' });
      } else {
        this.vyG = clamp((ground - this.y) / dt, -25, 25);
        this.y = ground;
      }
    } else {
      this.vy -= G_AIR * dt;
      this.y += this.vy * dt;
      this.airTime += dt;
      if (this.y <= ground) {
        const sl = clamp((ground - t.heightAt(this.s - 0.5)) / 0.5, -1.5, 1.5); // Steigung der Landefläche
        const rel = -(this.vy - this.v * sl); // Aufprall senkrecht zum Boden
        this.vyG = this.v * sl;
        this.air = false;
        this.y = ground;
        if (rel > 4) this.v *= 1 - clamp((rel - 4) * 0.035 * (1 - b.susp * 0.8), 0, 0.4);
        if (rel > 9 && b.susp < 0.5) this.stumble = Math.max(this.stumble, 0.4); // harte Landung ohne Federung
        if (this.wheelie > 0.2) this.wheelie = 0.2; // auf dem Hinterrad gelandet → Manual
        if (this.airTime > 0.15) ev.push({ type: 'land', impact: rel, airTime: this.airTime });
      }
    }

    // --- Hindernisse ---
    for (const r of t.rocks) {
      if (this.rockHit.has(r) || Math.abs(r.s - wsn) > 1.2 + (r.len || 0)) continue;
      if (Math.abs(r.lat - this.lat) < r.hw + 0.05 && this.y - ground < r.h) {
        this.rockHit.add(r);
        const lift = this.wheelie > 0.3; // Vorderrad oben: kleine Hindernisse überrollen
        let slow = r.slow * (1 - b.sturdy * 0.6);
        if (r.kind === 'cone') {
          // Kegel fliegt weg
        } else if (r.kind === 'log') {
          if (lift) slow *= 0.3;
          if (!this.air) { this.air = true; this.airTime = 0; this.vy = lift ? 2.2 : 1.4; } // drüber holpern
          if (!lift) this.stumble = Math.max(this.stumble, 0.35);
        } else {
          // Fels / Strohballen: Aufprall, abgelenkt, kurz wackelig
          slow = Math.max(slow, 0.55 - b.sturdy * 0.2);
          const side = Math.sign(this.lat - r.lat) || (Math.random() < 0.5 ? -1 : 1);
          this.latV = side * 6;
          this.stumble = Math.max(this.stumble, 0.6);
          this.s -= Math.max(0, wsn - (r.s - 0.7)); // nicht durchfahren
          this.wheelie = 0;
        }
        this.v *= 1 - slow;
        ev.push({ type: 'rock', rock: r, lift, side: Math.sign(this.lat - r.lat) || 1 });
      }
    }
    if (!this.air) {
      for (const p of t.pads) {
        if (this.padUsed.has(p) || Math.abs(p.s - wsn) > 2) continue;
        if (Math.abs(p.lat - this.lat) < 1.3) {
          this.padUsed.add(p);
          this.boost = 0.9;
          ev.push({ type: 'pad', pad: p });
        }
      }
    }

    const lap = Math.floor(this.s / t.lapLength);
    if (lap > this.lap && lap < t.laps && !this.finished) {
      this.lap = lap;
      this.rockHit.clear(); this.padUsed.clear(); this.patchIn.clear();
      ev.push({ type: 'lap', lap });
    }
    if (!this.finished && this.s >= t.length) {
      this.finished = true;
      ev.push({ type: 'finish' });
    }
    return ev;
  }
}
