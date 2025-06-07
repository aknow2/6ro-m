# アーキテクチャ設計
## gpu module
- web gpuに関するコードがまとめられたコード。特にドメインに関する事はここには入れない
## audio module
- WebAudioAPIに関する機能群

## 6rom core module
- 以下のIFと機能を提供する
  - 画像取り込み
  - スピード変更
  - FPS変更
  - 音楽の変更
  - 現在のアプリの状態取得

## presentation modules
- 様々な入力に対するハンドリングを行い 6rom coreを呼び出す
  例えばキー入力、gamepad, serial通信等
  presentation moduleは下記のIFを持ち、後述するengineにインストールされる事で実行出来る

``` typescript
type NextImg = {
  kind: 'nextImg'
}
type PrevImg = {
  kind: 'prevImg'
}
type ChangeSpeed = {
  kind: 'changeSpeed'
  speed: number
}
type ChangeFPS = {
  kind: 'changeFPS',
  fps: number
}
type PresentationEvent = NextImg | PrevImg | ChangeSpeed | ChangeFPS
type PresentationEventDispatcher = (ev: PresentationEvent) => void
type PresentationModuleFactory = <T>(param: T) => (dispatcher: PresentationEventDispatcher) => void

```
## 6ro engine
- UI module以外を統括するfacadeクラス
  main 関数で以下のように実行したい

``` typescript
const engine = create6roEngine(canvas)

const keyboard = createKeyboardPresentation()
engine.installPresentation(keyboard)

const serial = createSerialPresentation()
engine.installPresentation(serial)

engine.run()
```

## UI module
- ユーザーに表示するUI群、基本的に6rom core module の状態を反映させる
