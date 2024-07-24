class AccumulatePass {
    constructor(device, raysRenderTexture, frameCounterBuffer) {
        this.device = device;
        this.raysRenderTexture = raysRenderTexture;
        this.frameCounterBuffer = frameCounterBuffer
        this.setup();
    }

    setup() {
        const accumulateModule = this.device.createShaderModule({
            label: 'Accumulate shader',
            code: shaderAccumulate,
        });
    
        this.accumulatePipeline = this.device.createRenderPipeline({
            label: 'Accumulate pipeline',
            layout: 'auto',
            vertex: {
                module: accumulateModule,
                buffers: [{
                    arrayStride: 2 * 4, // 2 floats, 4 bytes each
                    attributes: [
                        {shaderLocation: 0, offset: 0, format: 'float32x2'},  // position
                    ],},
                ],
            },
            fragment: {
                module: accumulateModule,
                targets: [{
                    format: highResFormat,
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
            size: resolution,
            format: highResFormat,
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        this.newAccumulateRenderTexture = this.device.createTexture({
            label: "New average render texture",
            size: resolution,
            format: highResFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
        });

        const sampler = this.device.createSampler({
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
            magFilter: 'nearest',
            minFilter: 'nearest',
        });

        this.accumulateBindGroup = this.device.createBindGroup({
            label: 'Accumulate pass binding',
            layout: this.accumulatePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.frameCounterBuffer } },
                { binding: 1, resource: sampler },
                { binding: 2, resource: this.raysRenderTexture.createView() },
                { binding: 3, resource: this.lastAccumulateTexture.createView() },
            ],
        });

        this.accumulateRenderPassDescriptor = {
            label: 'Accumulate renderpass',
            colorAttachments: [{
                view: this.newAccumulateRenderTexture.createView(),
                clearValue: [1.0, 0.0, 0.0, 1.0],
                loadOp: 'clear',
                storeOp: 'store',
            },],
        };

    }
    
    run() {
        const accumulateEncoder = this.device.createCommandEncoder({ label: 'Accumulate encoder' });
        const accumulateRenderPass = accumulateEncoder.beginRenderPass(this.accumulateRenderPassDescriptor);
        accumulateRenderPass.setPipeline(this.accumulatePipeline);
        accumulateRenderPass.setBindGroup(0, this.accumulateBindGroup);
        accumulateRenderPass.setVertexBuffer(0, this.quadBuffer);
        accumulateRenderPass.draw(4, 1);
        accumulateRenderPass.end();
        const accumulateCommandBuffer = accumulateEncoder.finish();
    
        const blitEncoder = this.device.createCommandEncoder({ label: 'Blit to last accum texture' });
        blitEncoder.copyTextureToTexture(
            {texture: this.newAccumulateRenderTexture}, 
            {texture: this.lastAccumulateTexture}, 
            resolution
        );
        const blitCommandBuffer = blitEncoder.finish();
        
        this.device.queue.submit([accumulateCommandBuffer, blitCommandBuffer]);
    }
}