// The hero character: a drawn, rigged figure in a black suit.
//
// He is painted with canvas paths every frame from a handful of joint
// positions, so his walk is real motion rather than a sequence of stills:
// each leg has a planted phase and a lifted swing phase, the arms swing
// against the legs, and the body rises, falls and shifts over the planted foot.
// He is seen from the front, walking toward the camera, so "forward" shows up
// as a limb getting larger and lower in the frame.

export const CHAR_W = 1024;
export const CHAR_H = 1536;

const TAU = Math.PI * 2;
const CX = 512;
const GROUND = 1484;
const HIP_Y = 812;
const SHOULDER_Y = 338;
const SHOULDER_X = 150;

const SUIT = '#15151a';
const SUIT_LIGHT = '#2b2b33';
const SUIT_DARK = '#0b0b0e';
const SHIRT = '#f1f0ec';
const SKIN = '#c9906c';
const SKIN_SHADE = '#a56d4e';
const HAIR = '#18100d';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (v) => { const x = clamp01(v); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;

/** One leg through the cycle: planted for the first half, swinging the second. */
function legState(u, amp) {
  if (u < 0.5) return { z: (1 - 4 * u) * amp, lift: 0 };
  const w = (u - 0.5) * 2;
  return { z: (-1 + 2 * w) * amp, lift: Math.sin(Math.PI * w) * amp };
}

/** Two-bone elbow position; `dir` picks which side the elbow bends to. */
function elbowFor(S, H, l1, l2, dir) {
  const dx = H.x - S.x;
  const dy = H.y - S.y;
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.5);
  const a = Math.atan2(dy, dx);
  const A = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  return { x: S.x + Math.cos(a + dir * A) * l1, y: S.y + Math.sin(a + dir * A) * l1 };
}

/**
 * @param {CanvasRenderingContext2D} ctx  a CHAR_W x CHAR_H canvas
 * @param {object} s
 *   phase    walk cycle in radians (one full cycle is two steps)
 *   walk     0..1 how much he is walking (0 = standing still)
 *   glasses  0..1 the take-the-glasses-off gesture (0 = worn, 1 = held at his side)
 *   t        seconds, drives breathing and blinking while he stands
 */
export function drawCharacter(ctx, s) {
  const phase = s.phase || 0;
  const walk = clamp01(s.walk || 0);
  const g = clamp01(s.glasses || 0);
  const t = s.t || 0;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, CHAR_W, CHAR_H);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const u = (((phase / TAU) % 1) + 1) % 1;
  const legA = legState(u, walk);                 // the leg on the right of the picture
  const legB = legState((u + 0.5) % 1, walk);     // the leg on the left of the picture

  const still = 1 - walk;
  const breath = Math.sin(t * 1.5) * 2.4 * still;
  const bob = walk * 11 * Math.cos(2 * phase);    // lowest as each foot lands
  const sway = walk * 10 * Math.sin(phase);       // over the planted foot
  const lean = walk * 0.013 * Math.sin(phase);

  // ---- contact shadow ------------------------------------------------------
  const sh = ctx.createRadialGradient(CX, GROUND + 8, 10, CX, GROUND + 8, 190);
  sh.addColorStop(0, 'rgba(0,0,0,.5)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(0, (GROUND + 8) * (1 - 0.13));
  ctx.scale(1, 0.13);
  ctx.fillStyle = sh;
  ctx.fillRect(CX - 200, GROUND - 190, 400, 400);
  ctx.restore();

  // ---- legs, far one first -------------------------------------------------
  const hipY = HIP_Y + bob;
  const legs = [
    { side: 1, st: legA },
    { side: -1, st: legB },
  ].sort((a, b) => a.st.z - b.st.z);
  for (const l of legs) drawLeg(ctx, l.side, l.st, CX + sway + l.side * 55, hipY);

  // ---- upper body ----------------------------------------------------------
  ctx.save();
  ctx.translate(CX + sway, bob);
  ctx.translate(0, HIP_Y);
  ctx.rotate(lean);
  ctx.translate(0, -HIP_Y);

  // arms swing against the legs
  const zA = -walk * Math.cos(phase);             // arm on the right of the picture
  const zB = walk * Math.cos(phase);              // arm on the left: the one that takes the glasses
  const armA = walkArm(1, zA, breath);
  const armB = walkArm(-1, zB, breath);

  // the glasses gesture: up to the face, a beat, then back down holding them
  const raise = g < 0.35 ? ease(g / 0.35) : g < 0.5 ? 1 : 1 - ease((g - 0.5) / 0.5);
  if (raise > 0) {
    const arc = Math.sin(Math.PI * raise) * 46;
    armB.E = { x: lerp(armB.E.x, -214, raise) - arc * 0.4, y: lerp(armB.E.y, 446, raise) };
    armB.H = { x: lerp(armB.H.x, -78, raise) - arc, y: lerp(armB.H.y, 168, raise) };
    armB.hs = lerp(armB.hs, 1.08, raise);
  }
  const worn = g < 0.42;

  if (zA < 0) drawArm(ctx, armA, 0.78);
  if (zB < 0 && raise <= 0) drawArm(ctx, armB, 0.78);

  drawTorso(ctx, breath, walk, phase);
  drawHead(ctx, -bob * 0.3, -lean * 0.7, worn, t, still);

  if (zA >= 0) drawArm(ctx, armA, 1);
  if (zB >= 0 || raise > 0) drawArm(ctx, armB, 1);

  if (!worn) {
    // carried in the hand, hanging from the fingers
    const a = Math.atan2(armB.H.y - armB.E.y, armB.H.x - armB.E.x);
    ctx.save();
    ctx.translate(armB.H.x + Math.cos(a) * 30, armB.H.y + Math.sin(a) * 30);
    ctx.rotate(a - 0.25);
    ctx.scale(0.66 * armB.hs, 0.66 * armB.hs);
    drawGlasses(ctx, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// ----------------------------------------------------------------------------

function drawLeg(ctx, side, st, hipX, hipY) {
  const f = 1 + 0.11 * st.z;                       // nearer the camera = larger
  const fx = CX + side * (56 - 6 * st.z);
  const fy = GROUND + 24 * st.z - 150 * st.lift;    // forward foot sits lower in frame
  const ankleY = fy - 54 * f;
  const kx = (hipX + fx) / 2 + side * (5 + 30 * st.lift);   // a lifted knee swings outward
  const ky = (hipY + ankleY) / 2 + 34 * st.lift;
  const wh = 57 * f;
  const wk = 45 * f;
  const wa = 32 * f;
  const top = hipY - 36;

  ctx.beginPath();
  ctx.moveTo(hipX - wh, top);
  ctx.lineTo(hipX + wh, top);
  ctx.quadraticCurveTo(hipX + wh, (top + ky) / 2, kx + wk, ky);
  ctx.quadraticCurveTo(kx + wk * 0.92, (ky + ankleY) / 2, fx + wa, ankleY);
  ctx.lineTo(fx - wa, ankleY);
  ctx.quadraticCurveTo(kx - wk * 0.92, (ky + ankleY) / 2, kx - wk, ky);
  ctx.quadraticCurveTo(hipX - wh, (top + ky) / 2, hipX - wh, top);
  ctx.closePath();
  const grad = ctx.createLinearGradient(kx - wk, 0, kx + wk, 0);
  grad.addColorStop(0, SUIT_DARK);
  grad.addColorStop(0.5, '#202026');
  grad.addColorStop(1, SUIT_DARK);
  ctx.fillStyle = grad;
  ctx.fill();
  // the far leg falls into shadow
  ctx.fillStyle = `rgba(0,0,0,${(0.34 * (1 - st.z) / 2).toFixed(3)})`;
  ctx.fill();

  // trouser crease
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hipX, top + 40);
  ctx.quadraticCurveTo(kx, ky, fx, ankleY);
  ctx.stroke();

  // shoe: toe toward the camera; it dips as the foot lifts off
  const toe = fy + 22 * st.lift;
  const sw = 42 * f;
  ctx.beginPath();
  ctx.moveTo(fx - wa - 2, ankleY - 4);
  ctx.lineTo(fx + wa + 2, ankleY - 4);
  ctx.bezierCurveTo(fx + sw + 8 * f, ankleY + 14 * f, fx + sw, toe, fx, toe);
  ctx.bezierCurveTo(fx - sw, toe, fx - sw - 8 * f, ankleY + 14 * f, fx - wa - 2, ankleY - 4);
  ctx.closePath();
  ctx.fillStyle = '#08080a';
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.17)';
  ctx.beginPath();
  ctx.ellipse(fx - side * 6 * f, toe - 22 * f, 17 * f, 8 * f, 0, 0, TAU);
  ctx.fill();
}

function walkArm(side, z, breath) {
  const S = { x: side * SHOULDER_X, y: SHOULDER_Y - breath };
  const H = {
    x: side * (178 - 40 * z),                       // a forward hand crosses inward
    y: SHOULDER_Y + 452 - 30 * Math.abs(z) - (z > 0 ? 24 * z : 0),
  };
  // seen from the front a swinging arm foreshortens, so the bones are scaled
  // to the reach: the elbow keeps a slight, constant bend instead of jutting out
  const k = Math.hypot(H.x - S.x, H.y - S.y) * 1.035 / 462;
  return { side, S, H, E: elbowFor(S, H, 236 * k, 226 * k, side > 0 ? -1 : 1), hs: 1 + 0.15 * z };
}

function drawArm(ctx, arm, light) {
  const { S, E, H, hs, side } = arm;
  const wrist = { x: lerp(E.x, H.x, 0.86), y: lerp(E.y, H.y, 0.86) };
  const cuff = { x: lerp(E.x, H.x, 0.93), y: lerp(E.y, H.y, 0.93) };

  // hand, under the cuff
  const a = Math.atan2(H.y - E.y, H.x - E.x);
  ctx.save();
  ctx.translate(H.x, H.y);
  ctx.rotate(a - Math.PI / 2);
  ctx.fillStyle = light < 1 ? SKIN_SHADE : SKIN;
  ctx.beginPath();
  ctx.ellipse(0, 6 * hs, 25 * hs, 35 * hs, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();                                   // thumb
  ctx.ellipse(-side * 21 * hs, -6 * hs, 9 * hs, 19 * hs, -side * 0.35, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,50,30,.35)';
  ctx.lineWidth = 2;
  for (const k of [-9, 0, 9]) {                      // fingers
    ctx.beginPath();
    ctx.moveTo(k * hs, 16 * hs);
    ctx.lineTo(k * hs, 36 * hs);
    ctx.stroke();
  }
  ctx.restore();

  // shirt cuff
  ctx.strokeStyle = SHIRT;
  ctx.lineWidth = 50 * hs;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(wrist.x, wrist.y);
  ctx.lineTo(cuff.x, cuff.y);
  ctx.stroke();

  // sleeve
  ctx.lineCap = 'round';
  ctx.strokeStyle = light < 1 ? SUIT_DARK : SUIT;
  ctx.lineWidth = 74;
  ctx.beginPath();
  ctx.moveTo(S.x, S.y + 22);
  ctx.lineTo(E.x, E.y);
  ctx.stroke();
  ctx.lineWidth = 64 * hs;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(E.x, E.y);
  ctx.lineTo(wrist.x, wrist.y);
  ctx.stroke();
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(E.x, E.y, 33, 0, TAU);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();

  // a soft highlight down the outside of the sleeve
  if (light >= 1) {
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(S.x + side * 22, S.y + 20);
    ctx.lineTo(E.x + side * 16, E.y);
    ctx.lineTo(wrist.x + side * 12, wrist.y);
    ctx.stroke();
  }
}

function drawTorso(ctx, breath, walk, phase) {
  const y = -breath;

  // neck
  const ng = ctx.createLinearGradient(0, 214, 0, 292);
  ng.addColorStop(0, SKIN_SHADE);
  ng.addColorStop(1, SKIN);
  ctx.fillStyle = ng;
  ctx.fillRect(-34, 212, 68, 84);

  // jacket
  const half = (m) => {
    ctx.bezierCurveTo(m * 112, 284 + y, m * 172, 294 + y, m * 190, 344 + y);
    ctx.bezierCurveTo(m * 198, 430, m * 168, 530, m * 150, 642);
    ctx.bezierCurveTo(m * 146, 724, m * 160, 800, m * 164, 846);
    ctx.quadraticCurveTo(m * 84, 870, m * 7, 860);
  };
  ctx.beginPath();
  ctx.moveTo(-56, 270 + y);
  half(-1);
  ctx.lineTo(0, 690);
  ctx.lineTo(7, 860);
  ctx.quadraticCurveTo(84, 870, 164, 846);
  ctx.bezierCurveTo(160, 800, 146, 724, 150, 642);
  ctx.bezierCurveTo(168, 530, 198, 430, 190, 344 + y);
  ctx.bezierCurveTo(172, 294 + y, 112, 284 + y, 56, 270 + y);
  ctx.closePath();
  const jg = ctx.createLinearGradient(-190, 0, 190, 0);
  jg.addColorStop(0, SUIT_DARK);
  jg.addColorStop(0.3, '#1d1d23');
  jg.addColorStop(0.5, SUIT);
  jg.addColorStop(0.72, '#1d1d23');
  jg.addColorStop(1, SUIT_DARK);
  ctx.fillStyle = jg;
  ctx.fill();

  // shirt front
  ctx.beginPath();
  ctx.moveTo(-46, 266 + y);
  ctx.lineTo(46, 266 + y);
  ctx.lineTo(0, 506);
  ctx.closePath();
  ctx.fillStyle = SHIRT;
  ctx.fill();

  // tie, with a little swing as he walks
  ctx.save();
  ctx.translate(0, 296 + y);
  ctx.rotate(walk * 0.035 * Math.sin(phase * 2 + 0.8));
  ctx.fillStyle = '#0d0d10';
  ctx.beginPath();
  ctx.moveTo(-15, -6);
  ctx.lineTo(15, -6);
  ctx.lineTo(10, 24);
  ctx.lineTo(-10, 24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#131317';
  ctx.beginPath();
  ctx.moveTo(-10, 24);
  ctx.lineTo(10, 24);
  ctx.lineTo(21, 176);
  ctx.lineTo(0, 204);
  ctx.lineTo(-21, 176);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-3, 30);
  ctx.lineTo(-7, 170);
  ctx.stroke();
  ctx.restore();

  // shirt collar
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,.18)';
  ctx.lineWidth = 2;
  for (const m of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(m * 47, 256 + y);
    ctx.lineTo(m * 6, 296 + y);
    ctx.lineTo(m * 40, 322 + y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // lapels
  for (const m of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(m * 54, 266 + y);
    ctx.lineTo(m * 112, 356 + y);
    ctx.lineTo(m * 86, 378 + y);
    ctx.lineTo(m * 4, 524);
    ctx.lineTo(m * 44, 300 + y);
    ctx.closePath();
    ctx.fillStyle = '#212128';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.09)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // buttons and pockets
  ctx.fillStyle = SUIT_LIGHT;
  for (const by of [574, 652]) {
    ctx.beginPath();
    ctx.arc(0, by, 7.5, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,.10)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-130, 704); ctx.lineTo(-62, 696);
  ctx.moveTo(130, 704); ctx.lineTo(62, 696);
  ctx.moveTo(60, 452); ctx.lineTo(114, 446);
  ctx.stroke();
}

function drawHead(ctx, dy, tilt, worn, t, still) {
  ctx.save();
  ctx.translate(0, 250 + dy);
  ctx.rotate(tilt);
  ctx.translate(0, -250);

  // ears
  ctx.fillStyle = SKIN_SHADE;
  for (const m of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(m * 76, 170, 11, 21, 0, 0, TAU);
    ctx.fill();
  }

  // face
  const face = () => {
    ctx.beginPath();
    ctx.moveTo(-73, 152);
    ctx.bezierCurveTo(-76, 62, 76, 62, 73, 152);
    ctx.bezierCurveTo(73, 216, 42, 260, 0, 262);
    ctx.bezierCurveTo(-42, 260, -73, 216, -73, 152);
    ctx.closePath();
  };
  face();
  const fg = ctx.createLinearGradient(-73, 0, 73, 0);
  fg.addColorStop(0, SKIN_SHADE);
  fg.addColorStop(0.35, SKIN);
  fg.addColorStop(0.7, SKIN);
  fg.addColorStop(1, SKIN_SHADE);
  ctx.fillStyle = fg;
  ctx.fill();

  // beard: along the jaw, joined to a moustache
  ctx.save();
  face();
  ctx.clip();
  ctx.fillStyle = 'rgba(26,17,13,.92)';
  ctx.beginPath();
  ctx.moveTo(-80, 166);
  ctx.lineTo(-80, 270);
  ctx.lineTo(80, 270);
  ctx.lineTo(80, 166);
  ctx.bezierCurveTo(60, 176, 52, 222, 26, 226);
  ctx.quadraticCurveTo(0, 232, -26, 226);
  ctx.bezierCurveTo(-52, 222, -60, 176, -80, 166);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();                                   // moustache
  ctx.moveTo(-30, 204);
  ctx.quadraticCurveTo(0, 190, 30, 204);
  ctx.lineTo(34, 226);
  ctx.lineTo(24, 226);
  ctx.quadraticCurveTo(0, 204, -24, 226);
  ctx.lineTo(-34, 226);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // mouth and nose
  ctx.strokeStyle = '#7d4a3a';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-15, 215);
  ctx.quadraticCurveTo(0, 219, 15, 215);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120,70,48,.7)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(5, 160);
  ctx.lineTo(11, 187);
  ctx.quadraticCurveTo(2, 194, -6, 190);
  ctx.stroke();

  // eyes and brows (hidden behind the lenses while he wears them)
  if (!worn) {
    const cyc = t % 4.2;
    const blink = still > 0.5 && cyc < 0.14 ? Math.abs(cyc - 0.07) / 0.07 : 1;
    for (const m of [-1, 1]) {
      ctx.fillStyle = '#f4efe9';
      ctx.beginPath();
      ctx.ellipse(m * 31, 157, 13.5, 7.5 * blink + 0.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1a100c';
      ctx.beginPath();
      ctx.ellipse(m * 31, 157, 6.8, Math.min(6.8, 7.5 * blink + 0.4), 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#2a1a14';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(m * 16, 153);
      ctx.quadraticCurveTo(m * 31, 145, m * 46, 153);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = HAIR;
  ctx.lineWidth = 8;
  for (const m of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(m * 13, 135);
    ctx.quadraticCurveTo(m * 32, 126, m * 51, 136);
    ctx.stroke();
  }

  // hair: short at the sides, swept across the top
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.moveTo(-79, 160);
  ctx.bezierCurveTo(-100, 60, -46, 26, 8, 30);
  ctx.bezierCurveTo(74, 28, 100, 90, 79, 160);
  ctx.bezierCurveTo(70, 134, 58, 112, 44, 98);
  ctx.quadraticCurveTo(10, 118, -40, 100);
  ctx.quadraticCurveTo(-62, 118, -79, 160);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-50, 74); ctx.quadraticCurveTo(-6, 52, 44, 66);
  ctx.moveTo(-58, 92); ctx.quadraticCurveTo(-8, 70, 56, 84);
  ctx.stroke();

  if (worn) drawGlasses(ctx, 0, 157);
  ctx.restore();
}

function drawGlasses(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  const lens = ctx.createLinearGradient(0, -22, 0, 22);
  lens.addColorStop(0, '#2b3542');
  lens.addColorStop(0.5, '#0c0f14');
  lens.addColorStop(1, '#05070a');
  ctx.strokeStyle = '#050608';
  ctx.lineWidth = 5;
  for (const m of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(m > 0 ? 7 : -65, -20, 58, 40, [10, 10, 16, 16]);
    ctx.fillStyle = lens;
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(m > 0 ? 18 : -54, -10);
    ctx.lineTo(m > 0 ? 34 : -38, -12);
    ctx.stroke();
    ctx.strokeStyle = '#050608';
    ctx.lineWidth = 5;
    ctx.beginPath();                                 // temple arm
    ctx.moveTo(m * 65, -10);
    ctx.lineTo(m * 78, -6);
    ctx.stroke();
  }
  ctx.beginPath();                                   // bridge
  ctx.moveTo(-7, -9);
  ctx.quadraticCurveTo(0, -15, 7, -9);
  ctx.stroke();
  ctx.restore();
}
