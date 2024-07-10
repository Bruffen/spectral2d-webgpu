class TracePass {
    constructor(device, rayAmount, rayDepth) {
        this.verticesPerRay = 2;
        this.device = device;
        this.rayAmount = rayAmount;
        this.rayDepth = rayDepth;

        this.setup();
    }

    setup() {
        this.vertexUnitSize = 2 * 4; // position is 2 32bit floats (4bytes each)
        this.colorUnitSize  = 4 * 4; // color is 4 32bit floats (4bytes each)
        const vertexStorageBufferSize = this.vertexUnitSize * this.verticesPerRay * this.rayAmount;
        const colorStorageBufferSize  = this.colorUnitSize  * this.rayAmount;
        this.verticesArray = new Float32Array(vertexStorageBufferSize / 4);
        this.dataValues    = new Float32Array(colorStorageBufferSize  / 4);

        this.colorStorageBuffer = this.device.createBuffer({
            label: 'storage buffer for object data',
            size: colorStorageBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
    
        this.vertexStorageBuffer = this.device.createBuffer({
            label: 'storage buffer vertices',
            size: vertexStorageBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.verticesArray = new Float32Array(vertexStorageBufferSize / 4);
        this.colorsArray = new Float32Array(colorStorageBufferSize / 4);
    }

    run() {
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