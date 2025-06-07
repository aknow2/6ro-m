import { createGPURenderer } from './gpu/index.js';
import './styles.css.ts';

console.log('Hello, 6ro music!');

async function createCanvas() {
  const canvas = document.createElement('canvas');
  const size = Math.min(window.innerWidth, window.innerHeight);
  canvas.width = size;
  canvas.height = size;
  canvas.style.display = 'block';
  canvas.style.margin = 'auto';
  document.body.appendChild(canvas);
  
  // 新しいAPIを使用
  let speed = 1.0;
  const controller = await createGPURenderer({
    canvas,
    imagePath: "sample.webp",
    speedCallback: () => speed // 基本スピード
  });

  // デモ用：5秒後にスピードを変更
  setTimeout(() => {
    speed = 3;
  }, 5000);
}

window.addEventListener('load', createCanvas);
