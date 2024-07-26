class TracePass {
    constructor(device, light, rayAmount, rayDepth) {
        this.verticesPerRay = 2;

        this.device = device;
        this.light = light;
        this.rayAmount = rayAmount;
        this.rayDepth = rayDepth;

        this.setup();
    }

    setup() {
        const module = this.device.createShaderModule({
            label: 'Trace rays shader',
            code: shaderTrace,
        });

        this.pipeline = this.device.createComputePipeline({
            label: 'Trace rays pipeline',
            layout: 'auto',
            compute: {
                module: module,
            },
        });

        this.vertexUnitSize = 2 * 4; // position is 2 32bit floats (4bytes each)
        this.colorUnitSize  = 4 * 4; // color is 4 32bit floats (4bytes each)
        this.randomUnitSize = 1 * 4;
        const vertexStorageBufferSize = this.vertexUnitSize * this.verticesPerRay * this.rayAmount * this.rayDepth;
        const colorStorageBufferSize  = this.colorUnitSize  * this.rayAmount * this.rayDepth;
        const randomStorageBufferSize = this.randomUnitSize * this.rayAmount * this.rayDepth;
        this.verticesArray = new Float32Array(vertexStorageBufferSize / 4);
        this.colorsArray   = new Float32Array(colorStorageBufferSize  / 4);
        this.randomsArray  = new Float32Array(randomStorageBufferSize / 4);
    
        this.vertexStorageBuffer = this.device.createBuffer({
            label: 'storage buffer vertices',
            size: vertexStorageBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });

        this.colorStorageBuffer = this.device.createBuffer({
            label: 'storage buffer for object data',
            size: colorStorageBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });
    
        this.randomStorageBuffer = this.device.createBuffer({
            label: 'storage buffer vertices',
            size: randomStorageBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        
        const rayAmountUniform = this.device.createBuffer({
            label: 'Ray amount uniform',
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const rayDepthUniform = this.device.createBuffer({
            label: 'Ray amount uniform',
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        
        const lightUniformSize = 
            1 * 4 + // type u32
            1 * 4 + // padding
            2 * 4 + // position vec2f
            1 * 4 + // power f32
            1 * 4;  // padding

        const lightUniform = this.device.createBuffer({
            label: 'Light uniform',
            size: lightUniformSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 
        });
        
        const lightUniformValues = new ArrayBuffer(lightUniformSize);
        const timeUniform     = new Uint32Array(lightUniformValues, 0, 1);
        const positionUniform = new Float32Array(lightUniformValues, 8, 2);
        const powerUniform    = new Float32Array(lightUniformValues, 16, 1);
        
        timeUniform[0]        = this.light.type;
        positionUniform[0]    = this.light.position.x;
        positionUniform[1]    = this.light.position.y;
        powerUniform[0]       = this.light.power;

        this.bindGroup = this.device.createBindGroup({
            label: 'Trace binding',
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.vertexStorageBuffer } },
                { binding: 1, resource: { buffer: this.colorStorageBuffer } },
                { binding: 2, resource: { buffer: this.randomStorageBuffer } },
                { binding: 3, resource: { buffer: rayAmountUniform } },
                { binding: 4, resource: { buffer: rayDepthUniform } },
                { binding: 5, resource: { buffer: lightUniform } },
            ],
        });

        this.device.queue.writeBuffer(rayAmountUniform, 0, new Int32Array([this.rayAmount]));
        this.device.queue.writeBuffer(rayDepthUniform, 0, new Int32Array([this.rayDepth]));
        this.device.queue.writeBuffer(lightUniform, 0, lightUniformValues);
    }

    run() {
        /**
         * GPU ray tracing
         */

        // Generate random numbers on the CPU for simplicity
        this.generateRandoms();

        const encoder = this.device.createCommandEncoder({
            label: 'Trace encoder',
        });
        const pass = encoder.beginComputePass({
            label: 'Trace compute pass',
        });
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(Math.ceil(this.rayAmount / 64.0));
        pass.end();
        const commandBuffer = encoder.finish();
        this.device.queue.submit([commandBuffer]);
    }

    generateRandoms() {
        for (let i = 0; i < this.rayAmount * this.rayDepth; ++i) {
            const offset = i * (this.randomUnitSize / 4);
            this.randomsArray.set([Math.random()], offset);
        }
        this.device.queue.writeBuffer(this.randomStorageBuffer, 0, this.randomsArray);
    }
}