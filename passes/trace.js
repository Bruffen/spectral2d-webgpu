class TracePass {
    constructor(device, rayAmount, rayDepth) {
        this.verticesPerRay = 2;
        this.device = device;
        this.rayAmount = rayAmount;
        this.rayDepth = rayDepth;

        this.setup();
    }

    setup() {
        const traceModule = this.device.createShaderModule({
            label: 'Trace rays shader',
            code: shaderTrace,
        });

        this.tracePipeline = this.device.createComputePipeline({
            label: 'Trace rays pipeline',
            layout: 'auto',
            compute: {
                module: traceModule,
            },
        });

        this.vertexUnitSize = 2 * 4; // position is 2 32bit floats (4bytes each)
        this.colorUnitSize  = 4 * 4; // color is 4 32bit floats (4bytes each)
        this.randomUnitSize = 1 * 4;
        const vertexStorageBufferSize = this.vertexUnitSize * this.verticesPerRay * this.rayAmount;
        const colorStorageBufferSize  = this.colorUnitSize  * this.rayAmount;
        const randomStorageBufferSize = this.randomUnitSize * this.rayAmount;
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
        
        const lightUniformSize = 
            1 * 4 + // type u32
            1 * 4 + // padding
            2 * 4 + // position vec2f
            1 * 4 + // power f32
            1 * 4;  // padding

        /*const lightUniform = this.device.createBuffer({
            label: 'Light uniform',
            size: lightUniformSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 
        });*/
        const lightUniformValues =  new Float32Array(lightUniformSize / 4);
        lightUniformValues.set([light.type], 0);
        lightUniformValues.set([light.position], 2);
        lightUniformValues.set([light.power], 4);           
        
        this.traceBindGroup = this.device.createBindGroup({
            label: 'Trace binding',
            layout: this.tracePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.vertexStorageBuffer } },
                { binding: 1, resource: { buffer: this.colorStorageBuffer } },
                { binding: 2, resource: { buffer: this.randomStorageBuffer } },
                { binding: 3, resource: { buffer: rayAmountUniform } },
                //{ binding: 4, resource: { buffer: lightUniform } },
            ],
        });

        this.device.queue.writeBuffer(rayAmountUniform, 0, new Uint32Array([this.rayAmount]));
        //this.device.queue.writeBuffer(lightUniform, 0, lightUniformValues);
    }

    run() {
        //CPU ray tracing
        /*
        for (let i = 0; i < this.rayAmount; ++i) {
            const vertexOffset = i * ((this.vertexUnitSize * this.verticesPerRay) / 4);
            const colorOffset  = i * (this.colorUnitSize / 4);
            
            const {vertices, aliasing} = this.createLine();
            this.verticesArray.set(vertices, vertexOffset);
            
            const brightness = light.power * aliasing * (1.0 / this.rayAmount);
            //const color = [rand(), rand(), rand(), brightness];
            const color = [1, 1, 1, brightness];
            this.colorsArray.set(color, colorOffset);
        }
        this.device.queue.writeBuffer(this.vertexStorageBuffer, 0, this.verticesArray);
        this.device.queue.writeBuffer(this.colorStorageBuffer,  0, this.colorsArray);
        */

        //GPU ray tracing
        this.generateRandoms();

        const encoder = this.device.createCommandEncoder({
            label: 'Trace encoder',
        });
        const pass = encoder.beginComputePass({
            label: 'Trace compute pass',
        });
        pass.setPipeline(this.tracePipeline);
        pass.setBindGroup(0, this.traceBindGroup);
        pass.dispatchWorkgroups(Math.ceil(this.rayAmount / 64.0));
        pass.end();
        const commandBuffer = encoder.finish();
        this.device.queue.submit([commandBuffer]);
    }

    generateRandoms() {
        for (let i = 0; i < this.rayAmount; ++i) {
            const offset = i * (this.randomUnitSize / 4);
            this.randomsArray.set([Math.random()], offset);
        }
        this.device.queue.writeBuffer(this.randomStorageBuffer, 0, this.randomsArray);
    }

    createLine() {
        const length = 2.0;
        const width = 1.0;
        var vertices = [];
        
        let offset = 0;
        const addVertex = (x, y) => {
            // TODO hardcoded aspect ratio
            vertices[offset++] = x;// * 6.0/9.0;
            vertices[offset++] = y;
        };
        
        const direction = light.createRay();
        
        const dx = direction.x * length;
        const dy = direction.y * length;
        const aliasing = Math.sqrt(dx*dx + dy*dy) / Math.max(Math.abs(dx), Math.abs(dy));
    
        addVertex(light.position.x     , light.position.y);
        addVertex(light.position.x + dx, light.position.y + dy);
    
        return { vertices, aliasing };
    }
}