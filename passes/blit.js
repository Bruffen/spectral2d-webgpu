import { shaderBlit } from "../shaders/shaders.js";

export class BlitPass {
    constructor(device, settings, newAccumulateRenderTexture) {
        this.device = device;
        this.settings = settings;
        this.newAccumulateRenderTexture = newAccumulateRenderTexture;
        this.setup();
    }

    setup() {
        const module = this.device.createShaderModule({
            label: 'Blit shader',
            code: shaderBlit,
        });
    
        this.pipeline = this.device.createRenderPipeline({
            label: 'Blit pipeline',
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
                    format: this.settings.lowPrecisionFormat,
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

        const sampler = this.device.createSampler({
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
            magFilter: 'nearest',
            minFilter: 'nearest',
        });

        this.bindGroup = this.device.createBindGroup({
            label: 'Blit pass binding',
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: sampler },
                { binding: 1, resource: this.newAccumulateRenderTexture.createView() },
            ],
        });

        this.renderPassDescriptor = {
            label: 'Blit renderpass',
            colorAttachments: [{
                //view: ,
                clearValue: [1.0, 0.0, 0.0, 1.0],
                loadOp: 'clear',
                storeOp: 'store',
            },],
        };

    }
    
    run(texture) {
        this.renderPassDescriptor.colorAttachments[0].view =
        texture.createView();

        const encoder = this.device.createCommandEncoder({ label: 'Blit encoder' });
        const renderPass = encoder.beginRenderPass(this.renderPassDescriptor);
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.quadBuffer);
        renderPass.draw(4, 1);
        renderPass.end();
        const commandBuffer = encoder.finish();

        this.device.queue.submit([commandBuffer]);
    }

    reset() {
        
    }
}