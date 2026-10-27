import * as THREE from 'three';
import { FISH, TECHNIQUES, biteTable, pickFish, rollWeight, lengthCm, baitById } from './data.js';
import { createFish, animateFish } from './fishmodel.js';
import { poseCast, bendRod } from './angler.js';
import { sfx } from './sfx.js';

// Der Angel-Ablauf als Zustandsmaschine:
// ready (zielen, Taste halten = Wurfkraft) -> flying -> waiting (Bisse/Anknabbern) -> bite (Anschlag-Fenster)
// -> fight (Drill: Spannung, Ausdauer, Fluchten) -> landing (Kescher) -> caught
// Eingaben (input): action (gedrückt), actionPressed (gerade gedrückt), left/right (zielen bzw. Rute zur Seite), reelIn (einholen).

const DRAGS = { soft: 0.62, mid: 0.78, hard: 0.92 };

export class Fishing {
  constructor(scene, opts) {
    this.s = scene;
    this.o = opts; // { water, spot, rod, bait, depth, time, drag, onEvent, easy }
    this.state = 'ready';
    this.aimYaw = 0;
    this.power = 0;
    this.lurePos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.hint = TECHNIQUES[opts.rod.tech].hint;
    this.fishMesh = null;
    this.setTarget(0.5);
  }

  emit(type, data) { this.o.onEvent?.(type, data); }

  // Köder relativ zum Standplatz (nur waagerecht)
  rel() { return new THREE.Vector3(this.lurePos.x - this.s.base.x, 0, this.lurePos.z - this.s.base.z); }

  get tech() { return this.o.rod.tech; }

  setGear(rod, bait, depth) {
    this.o.rod = rod; this.o.bait = bait; this.o.depth = depth;
    this.hint = TECHNIQUES[rod.tech].hint;
  }

  setTarget(power) {
    const range = this.o.rod.range * (this.s.riverWidth ? Math.min(1, (this.s.riverWidth * 0.85) / this.o.rod.range) : 1);
    const d = 6 + (range - 6) * power;
    const b = this.s.base;
    this.target.set(b.x + Math.sin(this.aimYaw) * d, 0, b.z + Math.cos(this.aimYaw) * d);
    this.castDist = d;
    return d;
  }

  // ---- Biss-Planung ----
  table() {
    const t = biteTable(this.o.spot, this.o.rod, this.o.bait.id, this.depthIdx(), this.o.time);
    // Nur Fische, deren Gewicht die Rute überhaupt halbwegs schafft, beißen „gerne“ (Wels an der Posenrute ist selten)
    return t;
  }

  depthIdx() {
    if (this.tech === 'grund') return 2;
    if (this.tech === 'spinn' || this.tech === 'fliege') return this.o.bait.depth ?? 1;
    return this.o.depth;
  }

  planBite() {
    const tab = this.table();
    const rate = tab.reduce((a, t) => a + t.rate, 0) * (this.tech === 'spinn' ? 1.4 : 1) * (this.o.easy ? 1.6 : 1) * this.distFactor;
    this.biteTab = tab;
    if (rate <= 0.001) { this.nextBite = Infinity; this.nothingTimer = 0; return; }
    const mean = 60 / rate;
    const t = -Math.log(1 - Math.random()) * mean;
    this.nextBite = Math.min(35, Math.max(this.tech === 'spinn' ? 2 : 4, t));
    this.nibbles = this.tech === 'spinn' || this.tech === 'fliege' ? 0 : Math.floor(Math.random() * 3);
    this.nibbleT = this.nextBite - this.nibbles * (0.9 + Math.random() * 0.8);
  }

  // ---- Hauptschleife ----
  update(dt, input) {
    const s = this.s;
    const ud = s.angler.userData;
    const st = this.state;
    ud.rig.reeling = false;
    ud.rig.lookAt = st === 'ready' ? this.target : st === 'fight' ? s.shadowFish.position : this.lurePos;

    if (st === 'ready') {
      const turn = (input.right ? -1 : 0) + (input.left ? 1 : 0);
      this.aimYaw = Math.max(-0.8, Math.min(0.8, this.aimYaw + turn * dt * 0.9 + input.aimDelta));
      input.aimDelta = 0;
      // Auswerfen: halten = Rute nach hinten, je länger desto weiter (Zielring wandert mit); loslassen = Wurf
      if (input.action) {
        if (!this.charging) this.power = 0.08;
        this.power = Math.min(1, this.power + dt / 1.3);
        poseCast(s.angler, -Math.min(1, 0.4 + this.power));
        this.charging = true;
      } else if (this.charging) {
        this.charging = false;
        this.cast();
      } else {
        poseCast(s.angler, 0);
      }
      const d = this.setTarget(this.charging ? this.power : this.lastPower ?? 0.5);
      s.aim.visible = true;
      s.aim.position.set(this.target.x, 0.06, this.target.z);
      const sc = 0.6 + d * 0.03;
      s.aim.scale.set(sc, sc, sc);
      s.aim.material.opacity = this.charging ? 1 : 0.7;
      s.camTarget.lerp(this.target, 1 - Math.exp(-dt * 4));
      s.angler.rotation.y = this.aimYaw * 0.8;
      s.setLine(s.tipWorld().add(new THREE.Vector3(0, -0.6, 0)), 0, true);
      this.emit('power', { power: this.charging ? this.power : -1 });
      return;
    }

    s.aim.visible = false;

    if (st === 'flying') {
      this.flyT += dt / this.flyDur;
      const u = Math.min(1, this.flyT);
      poseCast(s.angler, Math.min(1, u * 4) * (1 - u));
      const a = this.flyFrom;
      const b = this.target;
      this.lurePos.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + Math.sin(u * Math.PI) * (4 + this.castDist * 0.15), a.z + (b.z - a.z) * u);
      this.showLure(true);
      s.setLine(this.lurePos, 0.05);
      if (u >= 1) {
        s.splashAt(b.x, b.z, 18, 0.6);
        sfx.plop();
        this.state = 'waiting';
        this.waitT = 0;
        this.nothingTimer = 0;
        this.distFactor = s.boat ? 1 : 0.7 + 0.5 * Math.min(1, this.castDist / (this.o.rod.range * 0.8));
        this.planBite();
        this.emit('state', { state: 'waiting' });
      }
      return;
    }

    // Driften mit der Strömung (Fluss / Fliege)
    const drift = (s.flow || 0) * (this.tech === 'grund' ? 0 : this.tech === 'fliege' ? 1.4 : 0.5);

    if (st === 'waiting' || st === 'bite') {
      this.waitT += dt;
      // Spinnfischen: Köder aktiv einholen
      let moving = true;
      if (this.tech === 'spinn') {
        moving = input.action;
        if (moving) {
          const toShore = this.rel().normalize();
          const sp = 3.2 * dt;
          this.lurePos.x -= toShore.x * sp; this.lurePos.z -= toShore.z * sp;
          ud.rig.reeling = true;
          sfx.reelTick(dt);
        }
        this.lurePos.y = -0.3 - this.depthIdx() * 0.6;
        if (this.rel().length() < 3.5) { this.reelIn(); return; }
      } else if (this.tech === 'fliege') {
        this.lurePos.x -= drift * dt * 0.8;
        this.lurePos.y = this.depthIdx() === 0 ? 0.02 : -0.3;
        if (input.action && st === 'waiting') { const d = this.rel().normalize(); this.lurePos.x -= d.x * 2.5 * dt; this.lurePos.z -= d.z * 2.5 * dt; }
        if (this.rel().length() < 3.5 || Math.abs(this.lurePos.x - this.s.base.x) > 30) { this.reelIn(); return; }
      } else {
        this.lurePos.x -= drift * dt * 0.15;
        this.lurePos.y = this.tech === 'pose' ? 0 : -1;
        if (input.action && st === 'waiting' && this.tech === 'pose' && this.waitT > 0.5) {
          // Bei der Pose bedeutet Taste drücken ohne Biss: einholen
          this.holdIn = (this.holdIn || 0) + dt;
          if (this.holdIn > 0.5) { const d = this.rel().normalize(); this.lurePos.x -= d.x * 4 * dt; this.lurePos.z -= d.z * 4 * dt; }
          if (this.rel().length() < 3.5) { this.reelIn(); return; }
        } else this.holdIn = 0;
      }

      this.showLure(this.tech === 'pose' || this.tech === 'fliege');
      const bob = Math.sin(s.t * 2.1) * 0.02;
      s.float.position.set(this.lurePos.x, (this.tech === 'fliege' ? 0.0 : 0.05) + bob, this.lurePos.z);
      s.float.rotation.set(0, 0, 0);
      s.camTarget.lerp(this.lurePos.clone().setY(0), 1 - Math.exp(-dt * 2));
      const rodBend = this.tech === 'grund' ? 0.12 : 0.04;
      bendRod(ud.rod, rodBend);
      s.setLine(this.tech === 'pose' || this.tech === 'fliege' ? s.float.position : this.lurePos, this.tech === 'grund' ? 0.05 : 0.25);

      if (this.nextBite === Infinity) {
        this.nothingTimer += dt;
        if (this.nothingTimer > 14 && !this.saidNothing) {
          this.saidNothing = true;
          this.emit('msg', { text: 'Hier beißt auf diesen Köder nichts … Probier einen anderen Köder, eine andere Tiefe oder Tageszeit!', kind: 'warn', long: true });
        }
        return;
      }

      if (st === 'waiting') {
        if (!moving && this.tech === 'spinn') { this.nextBite += dt * 0.6; this.nibbleT += dt * 0.6; }
        // Anknabbern
        if (this.nibbles > 0 && this.waitT >= this.nibbleT) {
          this.nibbles--;
          this.nibbleT += 0.9 + Math.random() * 0.8;
          this.twitch = 0.35;
          s.ripple(this.lurePos.x, this.lurePos.z, 0.3);
          sfx.nibble(this.tech === 'grund');
          this.emit('nibble', {});
        }
        if (this.twitch > 0) {
          this.twitch -= dt;
          s.float.position.y -= Math.sin(this.twitch * 40) * 0.05;
          bendRod(ud.rod, rodBend + Math.abs(Math.sin(this.twitch * 40)) * 0.15);
        }
        if (input.actionPressed && this.tech !== 'spinn' && this.tech !== 'fliege' && this.twitch > 0) {
          this.emit('msg', { text: 'Zu früh! Der Fisch hat nur geknabbert und ist weg.', kind: 'warn' });
          sfx.miss();
          this.planBite();
          this.waitT = 0;
          return;
        }
        if (this.waitT >= this.nextBite) {
          this.state = 'bite';
          this.biteT = 0;
          this.biteWindow = (this.tech === 'spinn' ? 0.85 : this.tech === 'fliege' ? 0.75 : 1.3) * (this.o.easy ? 1.6 : 1);
          this.pending = pickFish(this.biteTab);
          sfx.bite(this.tech === 'grund');
          this.emit('bite', { tech: this.tech });
          s.ripple(this.lurePos.x, this.lurePos.z, 0.8);
          if (this.tech === 'fliege') s.splashAt(this.lurePos.x, this.lurePos.z, 10, 0.4);
        }
        return;
      }

      // st === 'bite': Pose taucht ab / Rute ruckt – jetzt anschlagen!
      this.biteT += dt;
      s.float.position.y = -Math.min(0.5, this.biteT * 2);
      bendRod(ud.rod, 0.3 + Math.sin(this.biteT * 30) * 0.08);
      if (input.actionPressed) { this.hook(); return; }
      if (this.biteT > this.biteWindow) {
        this.state = 'waiting';
        this.waitT = 0;
        this.planBite();
        sfx.miss();
        this.emit('msg', { text: this.tech === 'spinn' ? 'Zu spät angeschlagen – der Fisch hat losgelassen.' : 'Zu spät! Der Fisch hat den Köder geklaut.', kind: 'warn' });
        this.emit('state', { state: 'waiting' });
      }
      return;
    }

    if (st === 'fight') { this.updateFight(dt, input); return; }

    if (st === 'landing') {
      this.landT += dt;
      const f = this.fishMesh;
      const u = Math.min(1, this.landT / 1.1);
      const near = s.anglerWorld().add(new THREE.Vector3(Math.sin(s.angler.rotation.y) * 1.2, 0.6, Math.cos(s.angler.rotation.y) * 1.2));
      f.position.lerpVectors(this.landFrom, near, u);
      f.rotation.z = Math.sin(s.t * 12) * 0.3 * (1 - u) + 0.4;
      animateFish(f, s.t, 2);
      s.setLine(f.position, 0);
      bendRod(ud.rod, 0.3 * (1 - u));
      if (u >= 1) {
        this.state = 'caught';
        s.camMode = 'catch';
        // Fangfoto: Angler hält den Fisch mit beiden Händen
        f.rotation.set(0, 0, 0);
        ud.rig.fishHold = { fish: f, length: this.hooked.cm / 100 };
        sfx.catchJingle();
        this.emit('caught', { ...this.hooked });
      }
      return;
    }

    if (st === 'caught') {
      if (this.fishMesh) animateFish(this.fishMesh, s.t, 0.5);
      s.line.visible = false;
    }
  }

  showLure(floatVisible) {
    this.s.float.visible = floatVisible && this.tech === 'pose';
    this.s.lure.visible = !this.s.float.visible || this.state === 'flying';
    this.s.lure.position.copy(this.lurePos);
  }

  cast() {
    const s = this.s;
    this.lastPower = this.power;
    this.setTarget(Math.min(1, this.power));
    this.flyFrom = s.tipWorld();
    s.setLure(this.o.bait);
    this.flyT = 0;
    this.flyDur = 0.6 + this.castDist * 0.012;
    this.state = 'flying';
    this.saidNothing = false;
    sfx.cast();
    this.emit('state', { state: 'flying' });
  }

  reelIn() {
    this.state = 'ready';
    this.s.float.visible = false;
    this.s.lure.visible = false;
    bendRod(this.s.angler.userData.rod, 0);
    this.emit('state', { state: 'ready' });
  }

  // ---- Anschlag & Drill ----
  hook() {
    const s = this.s;
    const id = this.pending;
    const f = FISH[id];
    const kg = rollWeight(id, Math.random, this.o.luck || 0);
    const rod = this.o.rod;
    this.hooked = { id, kg, cm: lengthCm(id, kg), spot: this.o.spot.id, water: this.o.water.id, bait: this.o.bait.id, rod: rod.id };
    // Kraft (in kg Zug) – große Fische ziehen kräftig, aber nicht linear
    this.fishForce = (0.35 * Math.pow(kg, 0.85) + 0.25) * f.power;
    this.stamina = 1;
    const rel = this.rel();
    this.dist = rel.length();
    this.fishAng = Math.atan2(rel.x, rel.z);
    this.tension = 0.3;
    this.redT = 0;
    this.slackT = 0;
    this.run = 0;
    this.runCd = 1 + Math.random() * 2;
    this.side = 0;
    this.sideCd = 2;
    this.jumpCd = 3 + Math.random() * 4;
    this.state = 'fight';
    s.camMode = 'fight';
    s.float.visible = false;
    s.lure.visible = false;
    s.splashAt(this.lurePos.x, this.lurePos.z, 25, 0.8);
    if (this.fishMesh) { s.scene.remove(this.fishMesh); }
    this.fishMesh = createFish(id);
    this.fishMesh.scale.setScalar(this.hooked.cm / 100);
    this.fishMesh.visible = false;
    s.scene.add(this.fishMesh);
    s.shadowFish.visible = true;
    s.shadowFish.scale.set(0.15 + this.hooked.cm / 400, this.hooked.cm / 160, 1);
    sfx.hook();
    this.emit('hooked', { id, heavy: this.fishForce > rod.line * 0.8 });
    this.emit('state', { state: 'fight' });
  }

  updateFight(dt, input) {
    const s = this.s;
    const ud = s.angler.userData;
    const rod = this.o.rod;
    const L = rod.line;
    const drag = DRAGS[this.o.drag] || DRAGS.mid;
    const f = FISH[this.hooked.id];

    // Fisch: Fluchten, Seitenwechsel, Sprünge
    this.runCd -= dt;
    if (this.run > 0) this.run -= dt;
    else if (this.runCd <= 0 && this.stamina > 0.15) {
      this.run = 1.2 + Math.random() * 2.5 * this.stamina;
      this.runCd = 2.5 + Math.random() * 4;
      this.emit('run', {});
      sfx.drag();
    }
    this.sideCd -= dt;
    if (this.sideCd <= 0) { this.side = [-1, 0, 1][Math.floor(Math.random() * 3)]; this.sideCd = 2 + Math.random() * 3; }
    const playerSide = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const countering = this.side !== 0 && playerSide === -this.side;

    const tired = 0.35 + 0.65 * this.stamina;
    let pull = this.fishForce * tired * (this.run > 0 ? 1.9 : 0.55) * (countering ? 0.75 : 1);
    const reeling = input.action;
    if (reeling) pull += L * 0.22 + this.fishForce * 0.25;
    else pull *= 0.55; // Rute federt ab, wenn man nicht kurbelt

    let raw = pull / L;
    let slip = 0;
    if (raw > drag) {
      // Bremse gibt Schnur frei – Spannung steigt nur noch gedämpft
      slip = (raw - drag) * 6;
      raw = drag + (raw - drag) * (reeling ? 0.5 : 0.25);
    }
    this.tension += (raw - this.tension) * (1 - Math.exp(-dt * 8));

    // Distanz: Kurbeln holt ein, Fisch-Flucht und Bremse geben Schnur
    let dd = 0;
    if (reeling) dd -= (2.2 + rod.range * 0.03 + (this.o.easy ? 0.8 : 0)) * Math.max(0, 1 - slip * 0.3); // lange Ruten = große Rollen
    if (this.run > 0) dd += 1.6 * tired + slip * 1.2;
    else dd += 0.25 * tired;
    this.dist = Math.max(0, this.dist + dd * dt);
    this.fishAng += (this.side * 0.25 * tired - this.fishAng * 0.05) * dt;
    this.fishAng = Math.max(-0.9, Math.min(0.9, this.fishAng));

    // Ausdauer sinkt durch Spannung, schneller wenn man gegenhält
    const weightK = 1 + Math.sqrt(this.hooked.kg) * 0.35 * f.power;
    this.stamina = Math.max(0, this.stamina - dt * (0.04 + this.tension * 0.16) * (countering ? 1.8 : 1) * (this.o.easy ? 1.5 : 1) / weightK);

    // Sprung
    this.jumpCd -= dt;
    if (f.jumps && this.jumpCd <= 0 && this.dist > 6) {
      this.jumpCd = 4 + Math.random() * 6;
      this.jumpT = 0.9;
      sfx.splash();
      this.emit('jump', {});
    }

    // Position des Fisches
    const base = s.anglerWorld();
    const fx = base.x + Math.sin(this.fishAng) * this.dist;
    const fz = base.z + Math.cos(this.fishAng) * this.dist;
    s.shadowFish.position.set(fx, 0.04, fz);
    s.shadowFish.rotation.z = this.fishAng + Math.sin(s.t * 3) * 0.3;
    if (Math.random() < dt * (this.run > 0 ? 6 : 1.5)) s.ripple(fx, fz, this.run > 0 ? 0.6 : 0.25);
    const fm = this.fishMesh;
    if (this.jumpT > 0) {
      this.jumpT -= dt;
      const u = 1 - this.jumpT / 0.9;
      fm.visible = true;
      fm.position.set(fx, Math.sin(u * Math.PI) * (0.8 + this.hooked.cm / 120), fz);
      fm.rotation.set(0, -Math.PI / 2 + this.fishAng, Math.sin(s.t * 20) * 0.6 + (u - 0.5) * 1.5);
      animateFish(fm, s.t, 3);
      if (this.jumpT <= 0) { fm.visible = false; s.splashAt(fx, fz, 30, 1); if (this.tension > 0.72 && Math.random() < 0.45) return this.lose('jump'); }
    } else fm.visible = this.dist < 4;
    if (fm.visible && !(this.jumpT > 0)) {
      fm.position.set(fx, -0.15, fz);
      fm.rotation.set(0, -Math.PI / 2 + this.fishAng + Math.sin(s.t * 4) * 0.4, 0);
      animateFish(fm, s.t, 2);
    }
    const fishPos = new THREE.Vector3(fx, fm.visible ? fm.position.y : -0.2, fz);
    s.setLine(fishPos, 0.02);
    s.camTarget.lerp(fishPos.clone().setY(0), 1 - Math.exp(-dt * 3));
    bendRod(ud.rod, 0.25 + this.tension * 0.9, Math.sin(this.fishAng));
    ud.rig.reeling = reeling;
    if (reeling) sfx.reelTick(dt);
    s.angler.rotation.y = this.fishAng * 0.6 + playerSide * 0.25;

    // Verloren?
    if (this.tension > 0.98) { this.redT += dt; } else this.redT = Math.max(0, this.redT - dt * 2);
    if (this.redT > (this.o.easy ? 1.1 : 0.6)) return this.lose('snap');
    if (!reeling && this.tension < 0.08 && this.run <= 0) this.slackT += dt; else this.slackT = Math.max(0, this.slackT - dt);
    if (this.slackT > (this.o.easy ? 6 : 3.5)) return this.lose('slack');
    if (this.dist > rod.spool) return this.lose('spool');

    this.emit('fight', {
      tension: this.tension, stamina: this.stamina, dist: this.dist, run: this.run > 0, side: this.side, countering,
      slack: this.slackT > 1.5, red: this.tension > 0.88,
    });

    if (this.dist < 2.2) {
      this.state = 'landing';
      this.landT = 0;
      this.landFrom = fishPos;
      fm.visible = true;
      s.shadowFish.visible = false;
      sfx.splash();
      this.emit('state', { state: 'landing' });
    }
  }

  lose(why) {
    const msg = {
      snap: '💥 Schnur gerissen! Die Spannung war zu hoch – lass los, wenn der Fisch flüchtet.',
      slack: '😮 Der Fisch hat sich losgeschüttelt! Halte die Schnur immer etwas straff.',
      jump: '🐟 Beim Sprung ausgeschlitzt! Bei Sprüngen nicht so fest ziehen.',
      spool: '🧵 Die Rolle ist leer – der Fisch war zu stark für diese Rute.',
    }[why];
    this.emit('lost', { why, text: msg, id: this.hooked.id, kg: this.hooked.kg });
    if (why === 'snap' || why === 'spool') sfx.snap(); else sfx.miss();
    this.cleanupFish();
    this.reelIn();
    this.s.camMode = 'aim';
  }

  cleanupFish() {
    if (this.fishMesh) { this.s.scene.remove(this.fishMesh); this.fishMesh = null; }
    this.s.shadowFish.visible = false;
  }

  // Nach dem Fang: Fisch weg (behalten oder zurücksetzen)
  finishCatch(release) {
    const s = this.s;
    s.angler.userData.rig.fishHold = null;
    if (release && this.fishMesh) {
      const p = s.anglerWorld();
      const yaw = s.angler.rotation.y;
      s.splashAt(p.x + Math.sin(yaw) * 2.5, p.z + Math.cos(yaw) * 2.5, 20, 0.6);
      sfx.splash();
    }
    this.cleanupFish();
    s.camMode = 'aim';
    this.reelIn();
  }

  baitName() { return baitById(this.o.bait.id).name; }
}
