import { shaderAccumulate } from "../shaders/shaders.js";

export class AccumulatePass {
    constructor(device, settings, raysRenderTexture, frameCounterBuffer) {
        this.device = device;
        this.settings = settings;
        this.raysRenderTexture = raysRenderTexture;
        this.frameCounterBuffer = frameCounterBuffer
        this.setup();
    }

    setup() {
        const module = this.device.createShaderModule({
            label: 'Accumulate shader',
            code: shaderAccumulate,
        });
    
        this.pipeline = this.device.createRenderPipeline({
            label: 'Accumulate pipeline',
            layout: 'auto',
            vertex: {
                module: module,
                buffers: [{
                    arrayStride: 2 * 4, // 2 floats, 4 bytes each
                    attributes: [
                        {shaderLocation: 0, offset: 0, format: 'float32x2'},  // position
                    ],},
                ],
            },
            fragment: {
                module: module,
                targets: [{
                    format: this.settings.highPrecisionFormat,
                }],
            },
            primitive: {
                topology: 'triangle-strip',
            },
        });
    
        const quadData = new Float32Array([
            -1.0,  1.0,
             1.0,  1.0,
            -1.0, -1.0,
             1.0, -1.0
        ]);
    
        this.quadBuffer = this.device.createBuffer({
            label: 'Buffer for quad vertices',
            size: quadData.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.quadBuffer, 0, quadData);

        this.lastAccumulateTexture = this.device.createTexture({
            label: "Last average texture",
            size: this.settings.resolution,
            format: this.settings.highPrecisionFormat,
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        this.newAccumulateRenderTexture = this.device.createTexture({
            label: "New average render texture",
            size: this.settings.resolution,
            format: this.settings.highPrecisionFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
        });

        const sampler = this.device.createSampler({
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
            magFilter: 'nearest',
            minFilter: 'nearest',
        });

        this.bindGroup = this.device.createBindGroup({
            label: 'Accumulate pass binding',
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.frameCounterBuffer } },
                { binding: 1, resource: sampler },
                { binding: 2, resource: this.raysRenderTexture.createView() },
                { binding: 3, resource: this.lastAccumulateTexture.createView() },
            ],
        });

        this.renderPassDescriptor = {
            label: 'Accumulate renderpass',
            colorAttachments: [{
                view: this.newAccumulateRenderTexture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: 'clear',
                storeOp: 'store',
            },],
        };
    }
    
    run() {
        const encoder = this.device.createCommandEncoder({ label: 'Accumulate encoder' });
        const renderPass = encoder.beginRenderPass(this.renderPassDescriptor);
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.quadBuffer);
        renderPass.draw(4, 1);
        renderPass.end();
        const commandBuffer = encoder.finish();
    
        const copyEncoder = this.device.createCommandEncoder({ label: 'Copy to last accum texture' });
        copyEncoder.copyTextureToTexture(
            {texture: this.newAccumulateRenderTexture}, 
            {texture: this.lastAccumulateTexture}, 
            this.settings.resolution
        );
        const copyCommandBuffer = copyEncoder.finish();
        
        this.device.queue.submit([commandBuffer, copyCommandBuffer]);
    }

    reset() {
        // TODO This is clearing it the slow way
        const data = new Float32Array(this.settings.resolution[0] * this.settings.resolution[1] * 4);
        this.device.queue.writeTexture(
            { texture: this.lastAccumulateTexture }, 
            data, 
            { bytesPerRow: this.settings.resolution[0] * 4 * 4}, 
            { 
                width: this.settings.resolution[0], 
                height: this.settings.resolution[1] 
            }
        );
    }
}