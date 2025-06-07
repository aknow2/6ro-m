import { createGPURenderer, type GPURendererController, type GPURendererSettings } from '../gpu/index';

// EngineState型を定義
export type EngineState = GPURendererSettings;
export type GetEngineState = () => EngineState;

// PresentationEvent型（設計書より）
type NextImg = { kind: 'nextImg' };
type PrevImg = { kind: 'prevImg' };
type ChangeSpeed = { kind: 'changeSpeed'; speed: number };
type ChangeFPS = { kind: 'changeFPS'; fps: number };
type PresentationEvent = NextImg | PrevImg | ChangeSpeed | ChangeFPS;
export type PresentationEventDispatcher = (ev: PresentationEvent) => void;
export type PresentationModule = (dispatcher: PresentationEventDispatcher) => void;

export function create6roEngine({
  canvas,
  imagePath = 'sample.webp',
}: {
  canvas: HTMLCanvasElement;
  imagePath?: string;
}) {

  let engineState: EngineState = { speed: 300 };
  function getEngineState() {
    return { ...engineState };
  }

  // engineStateをここで管理
  const gpu = createGPURenderer({
    canvas,
    imagePath,
    getSettings : getEngineState,
  });
  const presentationModules: PresentationModule[] = [];


  function dispatchEvent(ev: PresentationEvent) {
    switch (ev.kind) {
      case 'changeSpeed':
        engineState.speed += ev.speed;
        break;
      // 他のイベントは今後core module等で拡張
      default:
        // TODO: core moduleや他機能と連携
        break;
    }
  }

  function installPresentation(module: PresentationModule) {
    presentationModules.push(module);
    module(dispatchEvent);
  }

  function run() {
    // 必要ならここでアプリ全体の初期化やループ処理
    // 現状はgpuControllerが自動で描画開始するので何もしない
  }

  return {
    installPresentation,
    run,
    getEngineState,
    engineState, // 参照用
  };
}
