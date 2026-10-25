// Fahrphysik (ohne Three.js). Das Rad bewegt sich entlang der Strecke (s), seitlich (lat)
// und hat eine Höhe (y) mit Sprung-Physik. v ist die Geschwindigkeit entlang der Strecke.

export const G = 20;

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
  }

  step(dt, c) {
    const { t, b } = this;
    const ev = this.events;
    ev.length = 0;
    const grip = b.surface[t.map.surface];
    const vmax = b.vmax * grip;
    this.offroad = Math.abs(this.lat) > t.halfW;
    this.slope = t.slopeAt(this.s);

    // --- Längsbewegung ---
    let a = 0;
    if (!this.air) {
      if (c.gas) a += Math.max(0, b.accel * grip * (1 - this.v / vmax));
      if (c.brake) a -= b.brake;
      const sl = clamp(this.slope, -0.35, 0.22);
      a -= ((G * sl) / Math.sqrt(1 + sl * sl)) * (sl < 0 ? b.slopeK : 1);
      a -= 0.25 + 0.0035 * this.v * this.v;
      if (this.v > vmax) a -= (this.v - vmax) * 0.5; // Tempolimit-Gefühl: Überschuss (Boost, Gefälle) baut sich ab
      if (this.offroad) a -= 1.0 + (1 - b.terrain) * 6 + 0.1 * this.v * (1 - b.terrain);
    } else {
      a -= 0.003 * this.v * this.v;
    }
    if (this.boost > 0) { a += 8; this.boost -= dt; }
    this.v = Math.max(0, this.v + a * dt);

    // --- Seitliche Bewegung ---
    const steer = c.steer * b.steer * (0.35 + 0.65 * Math.min(1, this.v / 7)) * (this.air ? 0.5 : 1);
    this.latV += (steer * 7 - this.latV) * Math.min(1, dt * (this.air ? 2 : 7));
    this.lat += this.latV * dt;
    const lim = t.halfW + 3.5;
    if (Math.abs(this.lat) > lim) {
      this.lat = Math.sign(this.lat) * lim;
      this.latV = 0;
      this.v *= 1 - 0.8 * dt;
    }

    // --- Vorwärts + Höhe ---
    const vyGround = this.v * this.slope;
    this.s = Math.min(this.s + this.v * dt, t.end - 1);
    const ground = t.heightAt(this.s);

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
        if (rel > 5) this.v *= 1 - clamp((rel - 5) * 0.03 * (1 - b.susp * 0.8), 0, 0.35);
        if (this.airTime > 0.15) ev.push({ type: 'land', impact: rel, airTime: this.airTime });
      }
    }

    // --- Hindernisse ---
    for (const r of t.rocks) {
      if (r.hit || Math.abs(r.s - this.s) > 1.2) continue;
      if (Math.abs(r.lat - this.lat) < 0.95 && this.y - ground < 0.9) {
        r.hit = true;
        this.v *= 1 - 0.45 * (1 - b.sturdy * 0.6);
        ev.push({ type: 'rock', rock: r });
      }
    }
    if (!this.air) {
      for (const p of t.pads) {
        if (p.used || Math.abs(p.s - this.s) > 2) continue;
        if (Math.abs(p.lat - this.lat) < 1.7) {
          p.used = true;
          this.boost = 0.9;
          ev.push({ type: 'pad', pad: p });
        }
      }
    }

    if (!this.finished && this.s >= t.length) {
      this.finished = true;
      ev.push({ type: 'finish' });
    }
    return ev;
  }
}
