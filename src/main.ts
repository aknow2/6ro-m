import { run } from './gpu.js';
import './styles.css.ts';

console.log('Hello, 6ro music!');

function createCanvas() {
  const canvas = document.createElement('canvas');
  const size = Math.min(window.innerWidth, window.innerHeight);
  canvas.width = size;
  canvas.height = size;
  canvas.style.display = 'block';
  canvas.style.margin = 'auto';
  document.body.appendChild(canvas);
  run(canvas);
}

window.addEventListener('load', createCanvas);
