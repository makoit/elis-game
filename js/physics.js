// Fahrphysik (ohne Three.js). Das Rad bewegt sich entlang der Strecke (s), seitlich (lat)
// und hat eine Höhe (y) mit Sprung-Physik. v ist die Geschwindigkeit entlang der Strecke.

export const G = 26;
export const LAT_SPEED = 6; // max. Seitengeschwindigkeit bei vollem Lenkeinschlag (m/s)

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

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
    this.air = false;
    this.airTime = 0;
    this.boost = 0;
    this.offroad = false;
    this.finished = false;
    this.events = [];
    this.slope = 0;
    this.drift = 0;
    this.kappa = 0;
    this.speedFactor = 1;
    this.rockHit = new Set(); // pro Fahrer, damit mehrere Räder dieselbe Strecke nutzen können
    this.padUsed = new Set();
    this.patchIn = new Set(); // Pfützen/Matsch, in denen das Rad gerade steht
    this.lap = 0;
    this.assist = 0; // Lenkhilfe 0..1 (weniger Fliehkraft, sanftes Zurückhalten auf der Strecke)
  }

  step(dt, c) {
    const { t, b } = this;
    const ev = this.events;
    ev.length = 0;
    const ws = t.wrap(this.s); // Position innerhalb der Runde (Hindernisse gelten pro Runde)
    const grip = b.surface[t.map.surface];
    const vmax = b.vmax * grip * (this.speedFactor || 1);
    this.offroad = Math.abs(this.lat) > t.halfW;
    this.slope = t.slopeAt(this.s);

    // --- Längsbewegung ---
    let a = 0;
    if (!this.air) {
      if (c.gas) a += Math.max(0, b.accel * grip * (this.speedFactor || 1) * (1 - this.v / vmax));
      if (c.brake) a -= b.brake;
      const sl = clamp(this.slope, -0.35, 0.22);
      a -= ((G * sl) / Math.sqrt(1 + sl * sl)) * (sl < 0 ? b.slopeK : 1);
      a -= 0.3 + 0.0012 * this.v * this.v;
      if (this.v > vmax) a -= (this.v - vmax) * 0.5; // Überschuss (Boost, Gefälle) baut sich ab
      if (this.offroad) a -= 2 + (1 - b.terrain) * 9 + 0.15 * this.v * (1 - b.terrain);
    } else {
      a -= 0.001 * this.v * this.v;
    }
    if (this.boost > 0) { a += 9; this.boost -= dt; }
    let latGrip = 1;
    if (!this.air) {
      for (const pt of t.patches) {
        if (Math.abs(pt.s - ws) > pt.len / 2 + 1) continue;
        if (Math.abs(ws - pt.s) < pt.len / 2 && Math.abs(this.lat - pt.lat) < pt.r) {
          a -= pt.drag * Math.min(1, 0.4 + this.v / 12);
          latGrip = Math.min(latGrip, pt.grip);
          if (!this.patchIn.has(pt)) { this.patchIn.add(pt); ev.push({ type: 'patch', patch: pt }); }
        } else this.patchIn.delete(pt);
      }
    }
    this.v = Math.max(0, this.v + a * dt);

    // --- Seitliche Bewegung ---
    // Fliehkraft: in Kurven wird man nach außen getragen (Querneigung der Strecke hilft etwas)
    const kappa = t.curvAt(this.s);
    let drift = kappa * this.v * this.v * 0.13 * (this.air ? 0.4 : 1);
    if (t.map.berm) drift *= 1 - 0.55 * Math.min(1, Math.abs(t.bankAt(this.s)) / t.bankMax); // Steilkurven (Anlieger) tragen
    drift *= 1 - 0.4 * this.assist;
    this.drift = clamp(drift, -6.5, 6.5);
    this.kappa = kappa;
    let steerIn = c.steer;
    if (this.assist > 0 && !this.air) { // sanft zur Strecke zurück, wenn man neben der Piste fährt
      const over = Math.abs(this.lat) - (t.halfW - 0.6);
      if (over > 0) steerIn -= Math.sign(this.lat) * Math.min(0.6, over * 0.25) * this.assist;
    }
    const steer = clamp(steerIn, -1, 1) * b.steer * (0.35 + 0.65 * Math.min(1, this.v / 10)) * (this.air ? 0.5 : 1);
    this.latV += (steer * LAT_SPEED * latGrip - this.drift - this.latV) * Math.min(1, dt * (this.air ? 2 : 7) * (0.5 + 0.5 * latGrip));
    this.lat += this.latV * dt;
    const lim = t.halfW + 3.5;
    if (Math.abs(this.lat) > lim) {
      this.lat = Math.sign(this.lat) * lim;
      this.latV = 0;
      this.v *= 1 - 1.5 * dt;
    }

    // --- Vorwärts + Höhe ---
    const vyGround = this.v * this.slope;
    this.s = Math.min(this.s + this.v * dt, t.end - 1);
    const ground = t.heightAt(this.s);
    const wsn = t.wrap(this.s);

    if (!this.air) {
      const ballistic = this.y + vyGround * dt - 0.5 * G * dt * dt;
      if (ground < ballistic - 0.03 && this.v > 4) {
        this.air = true;
        this.airTime = 0;
        this.vy = vyGround - G * dt;
        this.y = ballistic;
        ev.push({ type: 'jump' });
      } else {
        this.y = ground;
      }
    } else {
      this.vy -= G * dt;
      this.y += this.vy * dt;
      this.airTime += dt;
      if (this.y <= ground) {
        const rel = -(this.vy - this.v * t.slopeAt(this.s));
        this.air = false;
        this.y = ground;
        if (rel > 6) this.v *= 1 - clamp((rel - 6) * 0.018 * (1 - b.susp * 0.8), 0, 0.35);
        if (this.airTime > 0.15) ev.push({ type: 'land', impact: rel, airTime: this.airTime });
      }
    }

    // --- Hindernisse ---
    for (const r of t.rocks) {
      if (this.rockHit.has(r) || Math.abs(r.s - wsn) > 1.2 + (r.len || 0)) continue;
      if (Math.abs(r.lat - this.lat) < r.hw + 0.05 && this.y - ground < r.h) {
        this.rockHit.add(r);
        this.v *= 1 - r.slow * (1 - b.sturdy * 0.6);
        ev.push({ type: 'rock', rock: r });
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
