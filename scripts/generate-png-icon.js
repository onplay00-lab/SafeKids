const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const W = 512;
const canvas = createCanvas(W, W);
const ctx = canvas.getContext('2d');

// Background gradient
const bg = ctx.createLinearGradient(0, 0, W, W);
bg.addColorStop(0, '#4A90D9');
bg.addColorStop(1, '#2E6BB5');

// Rounded rect background
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Background
ctx.fillStyle = bg;
roundRect(ctx, 0, 0, W, W, 100);
ctx.fill();

// Shield outer
ctx.save();
ctx.translate(W / 2, W / 2 + 10);
ctx.beginPath();
ctx.moveTo(0, -180);
ctx.bezierCurveTo(90, -180, 150, -155, 165, -120);
ctx.lineTo(165, 25);
ctx.bezierCurveTo(165, 110, 90, 165, 0, 195);
ctx.bezierCurveTo(-90, 165, -165, 110, -165, 25);
ctx.lineTo(-165, -120);
ctx.bezierCurveTo(-150, -155, -90, -180, 0, -180);
ctx.closePath();
ctx.fillStyle = 'rgba(255,255,255,0.95)';
ctx.fill();

// Shield inner
ctx.beginPath();
ctx.moveTo(0, -148);
ctx.bezierCurveTo(72, -148, 122, -130, 132, -100);
ctx.lineTo(132, 15);
ctx.bezierCurveTo(132, 88, 72, 133, 0, 158);
ctx.bezierCurveTo(-72, 133, -132, 88, -132, 15);
ctx.lineTo(-132, -100);
ctx.bezierCurveTo(-122, -130, -72, -148, 0, -148);
ctx.closePath();
const innerGrad = ctx.createLinearGradient(0, -148, 0, 158);
innerGrad.addColorStop(0, '#EBF5FB');
innerGrad.addColorStop(1, '#D4E9F7');
ctx.fillStyle = innerGrad;
ctx.fill();

// Parent figure (blue, left)
ctx.fillStyle = '#4A90D9';
ctx.beginPath();
ctx.arc(-32, -68, 28, 0, Math.PI * 2);
ctx.fill();
ctx.beginPath();
ctx.ellipse(-32, -2, 32, 44, 0, 0, Math.PI * 2);
ctx.fill();

// Child figure (orange, right)
ctx.fillStyle = '#F5A623';
ctx.beginPath();
ctx.arc(38, -32, 22, 0, Math.PI * 2);
ctx.fill();
ctx.beginPath();
ctx.ellipse(38, 22, 24, 35, 0, 0, Math.PI * 2);
ctx.fill();

// Protective arm arc
ctx.strokeStyle = '#4A90D9';
ctx.lineWidth = 10;
ctx.lineCap = 'round';
ctx.beginPath();
ctx.arc(5, -22, 68, -0.4, 1.1);
ctx.stroke();

// Heart at bottom
ctx.fillStyle = '#E74C3C';
const hx = 0, hy = 100;
ctx.beginPath();
ctx.moveTo(hx, hy + 12);
ctx.bezierCurveTo(hx - 22, hy - 2, hx - 22, hy - 20, hx, hy - 12);
ctx.bezierCurveTo(hx + 22, hy - 20, hx + 22, hy - 2, hx, hy + 12);
ctx.fill();

ctx.restore();

// Save
const outPath = path.join(__dirname, '..', 'assets', 'icon.png');
const buf = canvas.toBuffer('image/png');
fs.writeFileSync(outPath, buf);
console.log('Icon saved to:', outPath, `(${buf.length} bytes)`);

// Also save adaptive icon foreground
const fgPath = path.join(__dirname, '..', 'assets', 'android-icon-foreground.png');
fs.writeFileSync(fgPath, buf);
console.log('Foreground saved to:', fgPath);
