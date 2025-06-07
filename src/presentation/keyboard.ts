import type { PresentationEventDispatcher } from '../engine/index';

export function createKeyboardPresentation() {
  return (dispatch: PresentationEventDispatcher) => {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === 'ArrowRight') {
        dispatch({ kind: 'changeSpeed', speed: 10 });
      } else if (e.key === 'ArrowLeft') {
        dispatch({ kind: 'changeSpeed', speed: -10 });
      }
    });
  };
}
