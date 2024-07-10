class AccumulatePass {
    constructor(device, raysRenderTexture, frameCounterBuffer) {
        this.device = device;
        this.raysRenderTexture = raysRenderTexture;
        this.frameCounterBuffer = frameCounterBuffer
        this.setup();
    }

    setup() {
        const averageModule = this.device.createShaderModule({
            label: 'Average result shader',
            code: shaderAverage,
        });
    
        this.averagePipeline = this.device.createRenderPipeline({
            label: 'Average result pipeline',
            layout: 'auto',
            vertex: {
                module: averageModule,
                buffers: [{
                    arrayStride: 2 * 4, // 2 floats, 4 bytes each
                    attributes: [
                        {shaderLocation: 0, offset: 0, format: 'float32x2'},  // position
                    ],},
                ],
            },
            fragment: {
                module: averageModule,
                targets: [{
                    format: presentationFormat,
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

        this.lastAverageTexture = this.device.createTexture({
            label: "Last average texture",
            size: resolution,
            format: presentationFormat,
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        this.newAverageRenderTexture = this.device.createTexture({
            label: "New average render texture",
            size: resolution,
            format: presentationFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
    
        const sampler = this.device.createSampler({
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
            magFilter: 'linear',
            minFilter: 'linear',
        });
    
        this.averageBindGroup = this.device.createBindGroup({
            label: 'Average result render binding',
            layout: this.averagePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.frameCounterBuffer } },
                { binding: 1, resource: sampler },
                { binding: 2, resource: this.raysRenderTexture.createView() },
                { binding: 3, resource: sampler },
                { binding: 4, resource: this.lastAverageTexture.createView() },
            ],
        });
    
        this.averageRenderPassDescriptor = {
            label: 'Average result renderpass',
            colorAttachments: [{
                view: this.newAverageRenderTexture.createView(),
                clearValue: [1.0, 0.0, 0.0, 1.0],
                loadOp: 'clear',
                storeOp: 'store',
            },],
        };

    }
    
    run() {
        const averageEncoder = this.device.createCommandEncoder({ label: 'Average result encoder' });
        const averageRenderPass = averageEncoder.beginRenderPass(this.averageRenderPassDescriptor);
        averageRenderPass.setPipeline(this.averagePipeline);
        averageRenderPass.setBindGroup(0, this.averageBindGroup);
        averageRenderPass.setVertexBuffer(0, this.quadBuffer);
        averageRenderPass.draw(4, 1);
        averageRenderPass.end();
        this.averageCommandBuffer = averageEncoder.finish();
        this.device.queue.submit([this.averageCommandBuffer]);
    
        const averageBlitEncoder = this.device.createCommandEncoder({ label: 'Blit to average render texture' });
        averageBlitEncoder.copyTextureToTexture(
            {texture: this.newAverageRenderTexture}, 
            {texture: this.lastAverageTexture}, 
            resolution
        );
        this.averageBlitCommandBuffer = averageBlitEncoder.finish();
        this.device.queue.submit([this.averageBlitCommandBuffer]);
    }
}