import { Result } from "../Result";

async function loadImageBitmap(url: string): Promise<ImageBitmap> {
    const response = await fetch(url);
    const blob = await response.blob();
    return await createImageBitmap(blob);
}

async function initWebGPU(canvas: HTMLCanvasElement): Promise<
    Result<{ device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat }, string>
> {
    if (!navigator.gpu) {
        return {
            tag: "Err",
            error: 'WebGPU is not supported.',
        };
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        return {
            tag: "Err",
            error: 'No GPU adapter found.',
        };
    }
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (!context) {
        return {
            tag: "Err",
            error: 'WebGPU is not supported.',
        };
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: format,
        alphaMode: "opaque",
    });

    return {
        tag: "Ok",
        value: { device, context, format },
    };
}

async function createTexture(device: GPUDevice, imageBitmap: ImageBitmap): Promise<GPUTexture> {
    const texture = device.createTexture({
        size: [imageBitmap.width, imageBitmap.height, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture: texture },
        [imageBitmap.width, imageBitmap.height]
    );

    return texture;
}

function createUniformBuffer(device: GPUDevice): GPUBuffer {
    return device.createBuffer({
        size: 4 * 16 * 3, // 4x4 行列が 3つ
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
}

// 4x4 の回転行列 (Y軸回転)
function getRotationMatrixY(angle: number): Float32Array {
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    return new Float32Array([
        c,  0, s, 0,
        0,  1, 0, 0,
       -s,  0, c, 0,
        0,  0, 0, 1
    ]);
}

// 4x4 の回転行列 (Z軸回転)
function getRotationMatrixZ(angle: number): Float32Array<ArrayBuffer> {
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    return new Float32Array([
        c, -s, 0, 0,
        s,  c, 0, 0,
        0,  0, 1, 0,
        0,  0, 0, 1
    ]);
}

// 透視投影行列
function getPerspectiveMatrix(fov: number, aspect: number, near: number, far: number): Float32Array<ArrayBuffer> {
    const f = 1.0 / Math.tan(fov / 2);
    return new Float32Array([
        f / aspect, 0,  0,  0,
        0, f,  0,  0,
        0, 0, (far + near) / (near - far), -1,
        0, 0, (2 * far * near) / (near - far), 0
    ]);
}


function createPipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
    const shaderModule = device.createShaderModule({
        code: `
            struct Uniforms {
                modelMatrix: mat4x4<f32>,
                viewMatrix: mat4x4<f32>,
                projectionMatrix: mat4x4<f32>,
            };

            @group(0) @binding(0)
            var<uniform> uniforms: Uniforms;

            @group(0) @binding(1)
            var myTexture: texture_2d<f32>;

            @group(0) @binding(2)
            var mySampler: sampler;

            struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) uv: vec2<f32>,
            };

            @vertex
            fn vertex_main(@location(0) position: vec3<f32>, @location(1) uv: vec2<f32>) -> VertexOutput {
                var out: VertexOutput;
                let worldPos = uniforms.modelMatrix * vec4<f32>(position, 1.0);
                let viewPos = uniforms.viewMatrix * worldPos;
                let clipPos = uniforms.projectionMatrix * viewPos;
                out.position = clipPos;
                out.uv = uv;
                return out;
            }

            @fragment
            fn fragment_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
                return textureSample(myTexture, mySampler, uv);
            }
        `
    });

    return device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: shaderModule,
            entryPoint: "vertex_main",
            buffers: [{
                arrayStride: 4 * 5,
                attributes: [
                    { shaderLocation: 0, offset: 0, format: "float32x3" },
                    { shaderLocation: 1, offset: 3 * 4, format: "float32x2" }
                ]
            }]
        },
        fragment: {
            module: shaderModule,
            entryPoint: "fragment_main",
            targets: [{ format: format }]
        },
        primitive: { topology: "triangle-list" }
    });
}

function createVertexBuffer(device: GPUDevice): GPUBuffer {
    const vertices = new Float32Array([
        // x, y, z, u, v
        -1, -1,  -2.3, 0, 1,  // 左下
        1, -1,  -2.3, 1, 1,  // 右下
        -1,  1,  -2.3, 0, 0,  // 左上
        -1,  1,  -2.3, 0, 0,  // 左上
        1, -1,  -2.3, 1, 1,  // 右下
        1,  1,  -2.3, 1, 0,  // 右上
    ]);

    const buffer = device.createBuffer({
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(buffer, 0, vertices);
    return buffer;
}

function createTextureBindGroup(device: GPUDevice, texture: GPUTexture, sampler: GPUSampler, pipeline: GPURenderPipeline, uniformBuffer: GPUBuffer): GPUBindGroup {
    return device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: texture.createView() },
            { binding: 2, resource: sampler },
        ],
    });
}

// GPU レンダリング設定
export interface GPURendererConfig {
    canvas: HTMLCanvasElement;
    imagePath: string;
    speed?: number; // 初期スピード値（省略時は1.0）
}

// GPU レンダリングコントローラー
export interface GPURendererController {
    updateImage: (imagePath: string) => Promise<void>;
    updateCanvas: (canvas: HTMLCanvasElement) => Promise<void>;
    setSpeed: (speed: number) => void;
    stop: () => void;
    isRunning: () => boolean;
    getFps: () => number;
}

// GPU レンダリング状態
interface GPURendererState {
    device: GPUDevice;
    context: GPUCanvasContext;
    format: GPUTextureFormat;
    texture: GPUTexture;
    sampler: GPUSampler;
    pipeline: GPURenderPipeline;
    vertexBuffer: GPUBuffer;
    uniformBuffer: GPUBuffer;
    canvas: HTMLCanvasElement;
    speed: number;
    angle: number;
    isRunning: boolean;
    animationId: number | null;
    lastFrameTime: number;
    fps: number;
}

export async function createGPURenderer(config: GPURendererConfig): Promise<GPURendererController> {
    const gpuResult = await initWebGPU(config.canvas);
    if (gpuResult.tag === "Err") {
        throw new Error(gpuResult.error);
    }
    const { device, context, format } = gpuResult.value;

    const imageBitmap = await loadImageBitmap(config.imagePath);
    const texture = await createTexture(device, imageBitmap);
    const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

    const pipeline = createPipeline(device, format);
    const vertexBuffer = createVertexBuffer(device);
    const uniformBuffer = createUniformBuffer(device);

    const state: GPURendererState = {
        device,
        context,
        format,
        texture,
        sampler,
        pipeline,
        vertexBuffer,
        uniformBuffer,
        canvas: config.canvas,
        speed: config.speed ?? 1.0,
        angle: 0,
        isRunning: false,
        animationId: null,
        lastFrameTime: performance.now(),
        fps: 0
    };

    function frame(): void {
        if (!state.isRunning) return;
        const now = performance.now();
        const delta = now - state.lastFrameTime;
        state.fps = 1000 / delta;
        state.lastFrameTime = now;
        // speed: degree/seconds, delta: ms → 秒に変換
        state.angle += (state.speed * (delta / 1000)); // angleはdegreeで保持
        // degree→radian変換
        const rad = state.angle * Math.PI / 180;
        const modelMatrix = getRotationMatrixZ(rad);
        const viewMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
        const projectionMatrix = getPerspectiveMatrix(
            Math.PI / 4, 
            state.canvas.width / state.canvas.height, 
            0.1, 
            10
        );

        state.device.queue.writeBuffer(state.uniformBuffer, 0, modelMatrix);
        state.device.queue.writeBuffer(state.uniformBuffer, 64, viewMatrix);
        state.device.queue.writeBuffer(state.uniformBuffer, 128, projectionMatrix);

        const commandEncoder = state.device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: state.context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
                clearValue: { r: 1, g: 1, b: 1, a: 1 },
            }]
        });

        renderPass.setPipeline(state.pipeline);
        renderPass.setVertexBuffer(0, state.vertexBuffer);
        renderPass.setBindGroup(0, createTextureBindGroup(
            state.device,
            state.texture,
            state.sampler,
            state.pipeline,
            state.uniformBuffer
        ));
        renderPass.draw(6, 1);
        renderPass.end();

        state.device.queue.submit([commandEncoder.finish()]);
        state.animationId = requestAnimationFrame(frame);
    }

    // コントローラーを返す
    const controller: GPURendererController = {
        async updateImage(imagePath: string): Promise<void> {
            const imageBitmap = await loadImageBitmap(imagePath);
            state.texture = await createTexture(state.device, imageBitmap);
            state.angle = 0; // リセット
        },

        async updateCanvas(canvas: HTMLCanvasElement): Promise<void> {
            const wasRunning = state.isRunning;
            if (wasRunning) {
                controller.stop();
            }

            // 新しいcanvasでWebGPUを再初期化
            const gpuResult = await initWebGPU(canvas);
            if (gpuResult.tag === "Err") {
                throw new Error(gpuResult.error);
            }
            
            state.context = gpuResult.value.context;
            state.canvas = canvas;
            state.angle = 0; // リセット

            if (wasRunning) {
                state.isRunning = true;
                state.animationId = requestAnimationFrame(frame);
            }
        },

        setSpeed(speed: number): void {
            state.speed = speed;
        },

        stop(): void {
            state.isRunning = false;
            if (state.animationId !== null) {
                cancelAnimationFrame(state.animationId);
                state.animationId = null;
            }
        },

        isRunning(): boolean {
            return state.isRunning;
        },

        getFps(): number {
            return state.fps;
        }
    };

    // 初期実行
    state.isRunning = true;
    state.animationId = requestAnimationFrame(frame);

    return controller;
}

// 後方互換性のためのレガシー関数
export async function run(canvas: HTMLCanvasElement) {
    const controller = await createGPURenderer({
        canvas,
        imagePath: "sample.webp",
        speed: 1.0
    });
    return controller;
}
