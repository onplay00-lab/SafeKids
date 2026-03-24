const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const W = 1024;
const H = 500;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// Background gradient (blue)
const bg = ctx.createLinearGradient(0, 0, W, H);
bg.addColorStop(0, '#2E6BB5');
bg.addColorStop(0.5, '#4A90D9');
bg.addColorStop(1, '#2E6BB5');
ctx.fillStyle = bg;
ctx.fillRect(0, 0, W, H);

// Subtle pattern - circles
ctx.globalAlpha = 0.06;
for (let i = 0; i < 12; i++) {
  ctx.beginPath();
  ctx.arc(80 + i * 85, 60 + (i % 3) * 160, 40 + (i % 4) * 15, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
}
ctx.globalAlpha = 1;

// Left side: Shield icon (similar to app icon)
const shieldX = 260;
const shieldY = H / 2 + 10;
const scale = 0.7;

ctx.save();
ctx.translate(shieldX, shieldY);
ctx.scale(scale, scale);

// Shield outer
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

// Parent figure
ctx.fillStyle = '#4A90D9';
ctx.beginPath();
ctx.arc(-32, -68, 28, 0, Math.PI * 2);
ctx.fill();
ctx.beginPath();
ctx.ellipse(-32, -2, 32, 44, 0, 0, Math.PI * 2);
ctx.fill();

// Child figure
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

// Heart
ctx.fillStyle = '#E74C3C';
const hx = 0, hy = 100;
ctx.beginPath();
ctx.moveTo(hx, hy + 12);
ctx.bezierCurveTo(hx - 22, hy - 2, hx - 22, hy - 20, hx, hy - 12);
ctx.bezierCurveTo(hx + 22, hy - 20, hx + 22, hy - 2, hx, hy + 12);
ctx.fill();

ctx.restore();

// Right side: Text
ctx.fillStyle = '#FFFFFF';
ctx.textAlign = 'left';

// App name
ctx.font = 'bold 52px sans-serif';
ctx.fillText('SafeKids', 480, 170);

// Korean subtitle
ctx.font = 'bold 36px sans-serif';
ctx.fillStyle = '#FFD700';
ctx.fillText('자녀 안심 보호', 480, 225);

// Features
ctx.font = '24px sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.9)';
const features = [
  '📍 실시간 위치 확인',
  '⏰ 스크린타임 관리',
  '🚨 SOS 긴급 알림',
  '✅ 가족 약속 관리',
];
features.forEach((text, i) => {
  ctx.fillText(text, 490, 290 + i * 40);
});

// Save
const outPath = path.join(__dirname, '..', 'assets', 'feature-graphic.png');
const buf = canvas.toBuffer('image/png');
fs.writeFileSync(outPath, buf);
console.log('Feature graphic saved to:', outPath, `(${buf.length} bytes)`);
