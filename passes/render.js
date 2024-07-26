class RenderPass {
    constructor(device, verticesPerRay, rayAmount, rayDepth, vertexStorageBuffer, colorStorageBuffer) {
        this.device = device;
        this.verticesPerRay = verticesPerRay;
        this.rayAmount = rayAmount;
        this.rayDepth = rayDepth;
        this.vertexStorageBuffer = vertexStorageBuffer;
        this.colorStorageBuffer = colorStorageBuffer;
        this.setup();
    }

    setup() {
        this.raysRenderTexture = this.device.createTexture({
            label: "Rays render texture",
            size: resolution,
            format: lowPrecisionFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });

        const module = this.device.createShaderModule({
            label: 'Rays render shader',
            code: shaderRays,
        });

        const blend = {
            operation: 'add',
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha'
        };

        this.pipeline = this.device.createRenderPipeline({
            label: 'Render rays pipeline',
            layout: 'auto',
            vertex: {
                module: module,
            },
            fragment: {
                module: module,
                targets: [{
                    format: lowPrecisionFormat,
                    blend: {
                        color: blend,
                        alpha: blend,
                    },
                }],
            },
            primitive: {
                topology: 'line-list',
            },
        });
    
        this.bindGroup = this.device.createBindGroup({
            label: 'Rays render binding',
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.vertexStorageBuffer } },
                { binding: 1, resource: { buffer: this.colorStorageBuffer } },
            ],
        });

        this.renderPassDescriptor = {
            label: 'Rays render renderpass',
            colorAttachments: [{
                view: this.raysRenderTexture.createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: 'clear',
                storeOp: 'store',
            },],
        };
    }
    
    run() {
        const encoder = this.device.createCommandEncoder({ label: 'Ray render encoder' });
        const renderPass = encoder.beginRenderPass(this.renderPassDescriptor);
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.draw(this.verticesPerRay, this.rayAmount * this.rayDepth);
        renderPass.end();
        const commandBuffer = encoder.finish();

        this.device.queue.submit([commandBuffer]);
    }
}