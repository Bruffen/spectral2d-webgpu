class RenderPass {
    constructor(device, verticesPerRay, rayAmount, vertexStorageBuffer, colorStorageBuffer) {
        this.device = device;
        this.verticesPerRay = verticesPerRay;
        this.rayAmount = rayAmount;
        this.vertexStorageBuffer = vertexStorageBuffer;
        this.colorStorageBuffer = colorStorageBuffer;
        this.setup();
    }

    setup() {
        this.raysRenderTexture = this.device.createTexture({
            label: "Rays render texture",
            size: resolution,
            format: presentationFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });

        const raysModule = this.device.createShaderModule({
            label: 'Rays render shader',
            code: shaderRays,
        });

        const blend = {
            operation: 'add',
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha'
        };

        this.raysPipeline = this.device.createRenderPipeline({
            label: 'Render rays pipeline',
            layout: 'auto',
            vertex: {
                module: raysModule,
            },
            fragment: {
                module: raysModule,
                targets: [{
                    format: presentationFormat,
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
    
        this.raysBindGroup = this.device.createBindGroup({
            label: 'Rays render binding',
            layout: this.raysPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.vertexStorageBuffer } },
                { binding: 1, resource: { buffer: this.colorStorageBuffer } },
            ],
        });

        this.raysRenderPassDescriptor = {
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
        const raysEncoder = this.device.createCommandEncoder({ label: 'Ray render encoder' });
        const raysRenderPass = raysEncoder.beginRenderPass(this.raysRenderPassDescriptor);
        raysRenderPass.setPipeline(this.raysPipeline);
        raysRenderPass.setBindGroup(0, this.raysBindGroup);
        raysRenderPass.draw(this.verticesPerRay, this.rayAmount);
        raysRenderPass.end();
        const raysCommandBuffer = raysEncoder.finish();

        this.device.queue.submit([raysCommandBuffer]);
    }
}