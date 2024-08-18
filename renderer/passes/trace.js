import { shaderTrace } from "../shaders/shaders.js";
import { bufferCIEXYZ } from "../tables.js";

export class TracePass {
    constructor(device, light, sceneId, sceneWalls, rayAmount, rayDepth) {
        this.verticesPerRay = 2;

        this.device = device;
        this.light = light;
        this.sceneId = sceneId;
        this.sceneWalls = sceneWalls;
        this.rayAmount = rayAmount;
        this.rayDepth = rayDepth;

        // use maximum ray depth so we don't have to reallocate different sized buffers
        // everytime the user selects a different ray depth
        this.maxDepth = 20;

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
        const vertexStorageBufferSize = this.vertexUnitSize * this.verticesPerRay * this.rayAmount * this.maxDepth;
        const colorStorageBufferSize  = this.colorUnitSize  * this.rayAmount * this.maxDepth;
        const randomInitialsStorageBufferSize = this.randomUnitSize * this.rayAmount * 2;
        const randomScattersStorageBufferSize = this.randomUnitSize * this.rayAmount * this.maxDepth;
        this.verticesArray = new Float32Array(vertexStorageBufferSize / 4);
        this.colorsArray   = new Float32Array(colorStorageBufferSize  / 4);
        this.randomInitialsArray  = new Float32Array(randomInitialsStorageBufferSize / 4);
        this.randomScattersArray  = new Float32Array(randomScattersStorageBufferSize / 4);
    
        this.vertexStorageBuffer = this.device.createBuffer({
            label: 'Storage buffer vertices',
            size: vertexStorageBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });

        this.colorStorageBuffer = this.device.createBuffer({
            label: 'Storage buffer color',
            size: colorStorageBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });

        this.randomInitialsStorageBuffer = this.device.createBuffer({
            label: 'Trace storage buffer initial randoms',
            size: randomInitialsStorageBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
    
        this.randomScattersStorageBuffer = this.device.createBuffer({
            label: 'Trace storage buffer scatter randoms',
            size: randomScattersStorageBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        const cieXYZStorageBuffer = this.device.createBuffer({
            label: 'Trace storage buffer CIE XYZ values',
            size: bufferCIEXYZ.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        
        this.rayAmountUniform = this.device.createBuffer({
            label: 'Trace ray amount uniform',
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.rayDepthUniform = this.device.createBuffer({
            label: 'Trace ray depth uniform',
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        
        const lightUniformSize = 
            1 * 4 + // type u32
            1 * 4 + // power f32
            2 * 4 + // position vec2f
            2 * 4;  // direction vec2f

        this.lightUniform = this.device.createBuffer({
            label: 'Light uniform',
            size: lightUniformSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 
        });
        
        this.lightUniformValues = new ArrayBuffer(lightUniformSize);
        this.typeUniform      = new Uint32Array (this.lightUniformValues, 0, 1);
        this.powerUniform     = new Float32Array(this.lightUniformValues, 4, 1);
        this.positionUniform  = new Float32Array(this.lightUniformValues, 8, 2);
        this.directionUniform = new Float32Array(this.lightUniformValues, 16, 2);
        
        this.updateLightUniform();

        this.sceneIdUniform = this.device.createBuffer({
            label: 'Trace scene id uniform',
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.sceneWallsUniform = this.device.createBuffer({
            label: 'Trace scene walls uniform',
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.bindGroup = this.device.createBindGroup({
            label: 'Trace binding',
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.vertexStorageBuffer } },
                { binding: 1, resource: { buffer: this.colorStorageBuffer } },
                { binding: 2, resource: { buffer: this.randomInitialsStorageBuffer } },
                { binding: 3, resource: { buffer: this.randomScattersStorageBuffer } },
                { binding: 4, resource: { buffer: cieXYZStorageBuffer } },
                { binding: 5, resource: { buffer: this.rayAmountUniform } },
                { binding: 6, resource: { buffer: this.rayDepthUniform } },
                { binding: 7, resource: { buffer: this.lightUniform } },
                { binding: 8, resource: { buffer: this.sceneIdUniform } },
                { binding: 9, resource: { buffer: this.sceneWallsUniform } },
            ],
        });

        this.device.queue.writeBuffer(cieXYZStorageBuffer, 0, bufferCIEXYZ);
        this.device.queue.writeBuffer(this.rayAmountUniform, 0, new Int32Array([this.rayAmount]));
        this.device.queue.writeBuffer(this.rayDepthUniform, 0, new Int32Array([this.rayDepth]));
        this.device.queue.writeBuffer(this.sceneIdUniform, 0, new Uint32Array([this.sceneId]));
        this.device.queue.writeBuffer(this.sceneWallsUniform, 0, new Uint32Array([this.sceneWalls]));
    }

    run() {
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

    reset() {
        this.updateLightUniform();
        this.device.queue.writeBuffer(this.sceneIdUniform, 0, new Uint32Array([this.sceneId]));
        this.device.queue.writeBuffer(this.sceneWallsUniform, 0, new Uint32Array([this.sceneWalls]));
        this.device.queue.writeBuffer(this.rayAmountUniform, 0, new Int32Array([this.rayAmount]));
        this.device.queue.writeBuffer(this.rayDepthUniform, 0, new Int32Array([this.rayDepth]));
    }

    updateLightUniform() {
        this.typeUniform[0]      = this.light.type;
        this.powerUniform[0]     = this.light.power;
        this.positionUniform[0]  = this.light.position.x;
        this.positionUniform[1]  = this.light.position.y;
        this.directionUniform[0] = this.light.direction.x;
        this.directionUniform[1] = this.light.direction.y;
        
        this.device.queue.writeBuffer(this.lightUniform, 0, this.lightUniformValues);
    }

    // Generate randoms for initial direction and wavelength + scatter directions
    generateRandoms() {
        for (let i = 0; i < this.rayAmount * 2; i++) {
            const offset = i * (this.randomUnitSize / 4);
            this.randomInitialsArray.set([Math.random()], offset);
        }
        this.device.queue.writeBuffer(this.randomInitialsStorageBuffer, 0, this.randomInitialsArray);

        for (let i = 0; i < this.rayAmount * this.maxDepth; i++) {
            const offset = i * (this.randomUnitSize / 4);
            this.randomScattersArray.set([Math.random()], offset);
        }
        this.device.queue.writeBuffer(this.randomScattersStorageBuffer, 0, this.randomScattersArray);
    }
}