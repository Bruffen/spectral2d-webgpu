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
    
        this.pipeline = this.device.createComputePipeline({
            label: 'Blit pipeline',
            layout: 'auto',
            compute: {
                module: module,
            },
        });
    }
    
    run(texture) {
        // TODO avoid creating bind group every frame
        this.bindGroup = this.device.createBindGroup({
            label: 'Blit pass binding',
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.newAccumulateRenderTexture.createView() },
                { binding: 1, resource: texture.createView() },
            ],
        });

        const encoder = this.device.createCommandEncoder({ label: 'Blit encoder' });
        const pass = encoder.beginComputePass({label: 'Blit compute pass'});
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(Math.ceil(this.settings.resolution[0] / 8.0), Math.ceil(this.settings.resolution[1] / 8.0));
        pass.end();
        const commandBuffer = encoder.finish();

        this.device.queue.submit([commandBuffer]);
    }

    reset() {
        
    }
}