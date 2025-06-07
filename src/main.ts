import { createGPURenderer } from './gpu/index.js';
import { create6roEngine } from './engine/index.js';
import { createKeyboardPresentation } from './presentation/keyboard.js';
import './styles.css.ts';

console.log('Hello, 6ro music!');

async function main() {
  const canvas = document.createElement('canvas');
  const size = Math.min(window.innerWidth, window.innerHeight);
  canvas.width = size;
  canvas.height = size;
  canvas.style.display = 'block';
  canvas.style.margin = 'auto';
  document.body.appendChild(canvas);

  // engine生成
  const engine = create6roEngine({
    canvas,
    imagePath: 'sample.webp',
  });
  const keyboard = createKeyboardPresentation();
  engine.installPresentation(keyboard);

  engine.run();
}

window.addEventListener('load', main);
