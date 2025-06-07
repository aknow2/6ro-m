import { Result } from "./Result";

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

export async function run(canvas: HTMLCanvasElement) {
    const gpuResult = await initWebGPU(canvas);
    if (gpuResult.tag === "Err") {
        throw new Error(gpuResult.error);
    }
    const { device, context, format } = gpuResult.value;

    const imageBitmap = await loadImageBitmap("sample.webp");
    const texture = await createTexture(device, imageBitmap);
    const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

    const pipeline = createPipeline(device, format);
    const vertexBuffer = createVertexBuffer(device);
    const uniformBuffer = createUniformBuffer(device);

    let angle = 0;
    function frame(): void {
        angle += 0.01;
        const modelMatrix = getRotationMatrixZ(angle);
        const viewMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
        const projectionMatrix = getPerspectiveMatrix(Math.PI / 4, canvas.width / canvas.height, 0.1, 10);

        device.queue.writeBuffer(uniformBuffer, 0, modelMatrix);
        device.queue.writeBuffer(uniformBuffer, 64, viewMatrix);
        device.queue.writeBuffer(uniformBuffer, 128, projectionMatrix);

        const commandEncoder = device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
                clearValue: { r: 1, g: 1, b: 1, a: 1 },
            }]
        });

        renderPass.setPipeline(pipeline);
        renderPass.setVertexBuffer(0, vertexBuffer);
        renderPass.setBindGroup(0, createTextureBindGroup(device, texture, sampler, pipeline, uniformBuffer));
        renderPass.draw(6, 1);
        renderPass.end();

        device.queue.submit([commandEncoder.finish()]);
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}
