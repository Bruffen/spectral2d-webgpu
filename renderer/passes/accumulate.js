import { shaderAccumulate, shaderClear } from "../shaders/shaders.js";

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
    
        this.pipeline = this.device.createComputePipeline({
            label: 'Accumulate pipeline',
            layout: 'auto',
            compute: {
                module: module,
            },
        });
    
        this.lastAccumulateTexture = this.device.createTexture({
            label: "Last average texture",
            size: this.settings.resolution,
            format: this.settings.highPrecisionFormat,
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST,
        });

        this.newAccumulateRenderTexture = this.device.createTexture({
            label: "New average render texture",
            size: this.settings.resolution,
            format: this.settings.highPrecisionFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
        });

        this.bindGroup = this.device.createBindGroup({
            label: 'Accumulate pass binding',
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.frameCounterBuffer } },
                { binding: 1, resource: this.raysRenderTexture.createView() },
                { binding: 2, resource: this.lastAccumulateTexture.createView() },
                { binding: 3, resource: this.newAccumulateRenderTexture.createView() },
            ],
        });
    }
    
    run() {
        const encoder = this.device.createCommandEncoder({ label: 'Accumulate encoder' });
        const pass = encoder.beginComputePass({label: 'Accumulate compute pass'});
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(Math.ceil(this.settings.resolution[0] / 8.0), Math.ceil(this.settings.resolution[1] / 8.0));
        pass.end();
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
        /**
         * Setting the frame counter to 1 will already ensure
         * the previous data is cleared from the texture,
         * therefore, there is no need to do it here.
         */
    }
}