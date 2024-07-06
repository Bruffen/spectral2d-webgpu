async function start() {
    if (!navigator.gpu) {
        alert('this browser does not support WebGPU');
        return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        alert('this browser supports webgpu but it appears disabled');
        return;
    }

    const device = await adapter?.requestDevice();
    device.lost.then((info) => {
        console.error(`WebGPU device was lost: ${info.message}`);

        // 'reason' will be 'destroyed' if we intentionally destroy the device.
        if (info.reason !== 'destroyed') {
            // try again
            start();
        }
    });

    main(device);
}

// A random number between [min and max)
// With 1 argument it will be [0 to min)
// With no arguments it will be [0 to 1)
const rand = (min, max) => {
    if (min === undefined) {
        min = 0;
        max = 1;
    } else if (max === undefined) {
        max = min;
        min = 0;
    }
    return min + Math.random() * (max - min);
};

const light = new Light(LightType.POINT, [0.0, 0.0], 400.0);

function createLine() {
    const length = 2.0;//rand(1.0, 2.0);
    const width = 1.0;
    var vertices = [];
    
    let offset = 0;
    const addVertex = (x, y) => {
        // TODO hardcoded aspect ratio
        vertices[offset++] = x * 6.0/9.0;
        vertices[offset++] = y;
    };
    
    const direction = light.createRay();
    
    const dx = direction[0] * length;
    const dy = direction[1] * length;
    const aliasing = Math.sqrt(dx*dx + dy*dy) / Math.max(Math.abs(dx), Math.abs(dy));

    addVertex(light.position[0], light.position[1]);
    addVertex(light.position[0] + dx, light.position[1] + dy);

    return { vertices, aliasing };
}

function main(device) {
    // Get a WebGPU context from the canvas and configure it
    const canvas = document.querySelector('#c');
    const context = canvas.getContext('webgpu');
    //const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    // TODO forcing a higher resolution on the canvas like this is extremely slow!
    const presentationFormat = 'rgba16float';

    context.configure({
        device,
        format: presentationFormat,
        //alphaMode: 'premultiplied'
    });

    const module = device.createShaderModule({
        label: 'hardcoded triangle',
        code: `
            struct VSOutput {
                @builtin(position) position: vec4f,
                @location(0) color: vec4f,
            };
            
            struct OurStruct {
                color: vec4f,
                aliasing: f32,
            };

            struct Vertex {
                position: vec2f,
            };
            
            @group(0) @binding(0) var<storage, read> ourStructs: array<OurStruct>;
            @group(0) @binding(1) var<storage, read> positions: array<Vertex>;

            @vertex fn vs(
                @builtin(vertex_index) vertexIndex : u32,
                @builtin(instance_index) instanceIndex: u32
            ) -> VSOutput {
                let ourStruct = ourStructs[instanceIndex];

                var vsOut: VSOutput;
                vsOut.position = vec4f(positions[vertexIndex + instanceIndex * 2].position, 0.0, 1.0);
                vsOut.color = ourStruct.color;
                return vsOut;
            }

            @fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
                //return vec4f(pow(vsOut.color.rgb, vec3f(1.0/2.2)), vsOut.color.a);
                return vsOut.color;
            }
        `,
    });

    const color = {
        operation: 'add',
        srcFactor: 'src-alpha',
        dstFactor: 'one-minus-src-alpha'
    };

    const alpha = {
        operation: 'add',
        srcFactor: 'src-alpha',
        dstFactor: 'one-minus-src-alpha'
    };

    const pipeline = device.createRenderPipeline({
        label: 'our hardcoded rgb triangle pipeline',
        layout: 'auto',
        vertex: {
            module: module,
        },
        fragment: {
            module: module,
            targets: [{
                format: presentationFormat,
                blend: {
                    color: color,
                    alpha: alpha,
                },
            }],
        },
        /*colorStates: [{
            format: 'rgba32float',
            alphaBlend: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
            },
            colorBlend: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
            },
        }],*/
        primitive: {
            topology: 'line-list',
        },
    });

    const kNumObjects = 1000;
    const verticesPerLine = 2;
    const vertexCount = verticesPerLine * kNumObjects;

    // create 2 storage buffers
    const staticUnitSize =
        4 * 4 + // color is 4 32bit floats (4bytes each)
        1 * 4 + // aliasing is 1 32bit float (4bytes each)
        3 * 4;  // padding
    const vertexUnitSize =
        2 * 4;  // position is 2 32bit floats (4bytes each)
    const staticStorageBufferSize = staticUnitSize * kNumObjects;
    const vertexStorageBufferSize = vertexUnitSize * vertexCount;

    const staticStorageBuffer = device.createBuffer({
        label: 'static storage for objects',
        size: staticStorageBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const vertexStorageBuffer = device.createBuffer({
        label: 'storage buffer vertices',
        size: vertexStorageBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // offsets to the various uniform values in float32 indices
    const kColorOffset = 0;
    const kOffsetOffset = 4;
    
    const staticStorageValues = new Float32Array(staticStorageBufferSize / 4);
    const verticesArray = new Float32Array(vertexStorageBufferSize / 4);
    for (let i = 0; i < kNumObjects; ++i) {
        const offset = i * ((vertexUnitSize * verticesPerLine) / 4);

        const {vertices, aliasing} = createLine();
        verticesArray.set(vertices, offset);

        const staticOffset = i * (staticUnitSize / 4);
        //const color = [rand(), rand(), rand(), 1];
        const color = [1, 1, 1, light.power * aliasing * (1.0 / kNumObjects)];
        staticStorageValues.set(color, staticOffset + kColorOffset);
        staticStorageValues.set([1.0], staticOffset + kOffsetOffset);
    }
    device.queue.writeBuffer(vertexStorageBuffer, 0, verticesArray);
    device.queue.writeBuffer(staticStorageBuffer, 0, staticStorageValues);
    
    const bindGroup = device.createBindGroup({
        label: 'bind group for objects',
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: staticStorageBuffer } },
            { binding: 1, resource: { buffer: vertexStorageBuffer } },
        ],
    });

    const renderPassDescriptor = {
        label: 'our basic canvas renderPass',
        colorAttachments: [{
            // view: <- to be filled out when we render
            clearValue: [0.0, 0.0, 0.0, 1.0],
            loadOp: 'clear',
            storeOp: 'store',
        },],
    };

    function render() {        
        for (let i = 0; i < kNumObjects; ++i) {
            const offset = i * ((vertexUnitSize * verticesPerLine) / 4);
            
            const {vertices, aliasing} = createLine();
            verticesArray.set(vertices, offset);
            
            const staticOffset = i * (staticUnitSize / 4);
            //const color = [rand(), rand(), rand(), 1];
            const color = [1, 1, 1, light.power * aliasing * (1.0 / kNumObjects)];
            staticStorageValues.set(color, staticOffset + kColorOffset);
            staticStorageValues.set([1.0], staticOffset + kOffsetOffset);
        }
        device.queue.writeBuffer(vertexStorageBuffer, 0, verticesArray);
        device.queue.writeBuffer(staticStorageBuffer, 0, staticStorageValues);
        
        // Get the current texture from the canvas context and
        // set it as the texture to render to.
        renderPassDescriptor.colorAttachments[0].view =
            context.getCurrentTexture().createView();

        // make a command encoder to start encoding commands
        const encoder = device.createCommandEncoder({ label: 'our encoder' });

        // make a render pass encoder to encode render specific commands
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(verticesPerLine, kNumObjects);
        pass.end();

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);

        requestAnimationFrame(render);
    }

    const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
            const width = entry.devicePixelContentBoxSize?.[0].inlineSize ||
                entry.contentBoxSize[0].inlineSize * devicePixelRatio;
            const height = entry.devicePixelContentBoxSize?.[0].blockSize ||
                entry.contentBoxSize[0].blockSize * devicePixelRatio;
            const canvas = entry.target;
            canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
            canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));
        }
        requestAnimationFrame(render);
    });
    try {
        observer.observe(canvas, { box: 'device-pixel-content-box' });
    } catch {
        observer.observe(canvas, { box: 'content-box' });
    }
}

start();