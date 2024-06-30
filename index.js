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

var light = new Light(LightType.POINT, [0.0, 0.0], 50.0);

function createLine() {
    const length = rand(1.0, 4.0);
    const width = 1.0;
    const direction = light.createRay();

    // 2 vertices, 2 values (x,y) each
    const vertexCount = 2;
    const vertexData = new Float32Array(vertexCount * 2);

    let offset = 0;
    const addVertex = (x, y) => {
        vertexData[offset++] = x;
        vertexData[offset++] = y;
    };

    addVertex(light.position[0], light.position[1]);
    addVertex(light.position[0] + direction[0] * length, light.position[1] + direction[1] * length);

    return {vertexData, vertexCount};
}

function main(device) {
    // Get a WebGPU context from the canvas and configure it
    const canvas = document.querySelector('#c');
    const context = canvas.getContext('webgpu');
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: presentationFormat,
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
                offset: vec2f,
            };

            struct OtherStruct {
                scale: vec2f,
            };

            struct Vertex {
                position: vec2f,
            };
            
            @group(0) @binding(0) var<storage, read> ourStructs: array<OurStruct>;
            @group(0) @binding(1) var<storage, read> otherStructs: array<OtherStruct>;
            @group(0) @binding(2) var<storage, read> pos: array<Vertex>;

            @vertex fn vs(
                @builtin(vertex_index) vertexIndex : u32,
                @builtin(instance_index) instanceIndex: u32
            ) -> VSOutput {
                let otherStruct = otherStructs[instanceIndex];
                let ourStruct = ourStructs[instanceIndex];

                var vsOut: VSOutput;
                vsOut.position = vec4f(pos[vertexIndex].position * otherStruct.scale + ourStruct.offset, 0.0, 1.0);
                vsOut.color = ourStruct.color;
                return vsOut;
            }

            @fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
                return vsOut.color;
            }
        `,
    });

    const pipeline = device.createRenderPipeline({
        label: 'our hardcoded rgb triangle pipeline',
        layout: 'auto',
        vertex: {
            module: module,
        },
        fragment: {
            module: module,
            targets: [{ format: presentationFormat }],
        },
        primitive: {
            topology: 'line-list',
        },
    });

    const kNumObjects = 100;
    const objectInfos = [];

    // create 2 storage buffers
    const staticUnitSize =
        4 * 4 + // color is 4 32bit floats (4bytes each)
        2 * 4 + // offset is 2 32bit floats (4bytes each)
        2 * 4;  // padding
    const changingUnitSize =
        2 * 4;  // scale is 2 32bit floats (4bytes each)
    const staticStorageBufferSize = staticUnitSize * kNumObjects;
    const changingStorageBufferSize = changingUnitSize * kNumObjects;

    const staticStorageBuffer = device.createBuffer({
        label: 'static storage for objects',
        size: staticStorageBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const changingStorageBuffer = device.createBuffer({
        label: 'changing storage for objects',
        size: changingStorageBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // offsets to the various uniform values in float32 indices
    const kColorOffset = 0;
    const kOffsetOffset = 4;

    const kScaleOffset = 0;

    {
        const staticStorageValues = new Float32Array(staticStorageBufferSize / 4);
        for (let i = 0; i < kNumObjects; ++i) {
            const staticOffset = i * (staticUnitSize / 4);

            // These are only set once so set them now
            staticStorageValues.set([rand(), rand(), rand(), 1], staticOffset + kColorOffset);        // set the color
            staticStorageValues.set([rand(-0.9, 0.9), rand(-0.9, 0.9)], staticOffset + kOffsetOffset);      // set the offset

            objectInfos.push({
                scale: rand(0.2, 0.5),
            });
        }
        device.queue.writeBuffer(staticStorageBuffer, 0, staticStorageValues);
    }

    // a typed array we can use to update the changingStorageBuffer
    const storageValues = new Float32Array(changingStorageBufferSize / 4);

    // setup a storage buffer with vertex data
    const { vertexData, vertexCount } = createLine({
        radius: 0.5,
        innerRadius: 0.25,
    });
    const vertexStorageBuffer = device.createBuffer({
        label: 'storage buffer vertices',
        size: vertexData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexStorageBuffer, 0, vertexData);

    const bindGroup = device.createBindGroup({
        label: 'bind group for objects',
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: staticStorageBuffer }},
            { binding: 1, resource: { buffer: changingStorageBuffer }},
            { binding: 2, resource: { buffer: vertexStorageBuffer }},
        ],
    });

    const renderPassDescriptor = {
        label: 'our basic canvas renderPass',
        colorAttachments: [{
            // view: <- to be filled out when we render
            clearValue: [0.0, 0.0, 0.0, 1],
            loadOp: 'clear',
            storeOp: 'store',
        },],
    };

    function render() {
        // Get the current texture from the canvas context and
        // set it as the texture to render to.
        renderPassDescriptor.colorAttachments[0].view =
            context.getCurrentTexture().createView();

        // make a command encoder to start encoding commands
        const encoder = device.createCommandEncoder({ label: 'our encoder' });

        // make a render pass encoder to encode render specific commands
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);

        // Set the uniform values in our JavaScript side Float32Array
        const aspect = canvas.width / canvas.height;

        // set the scales for each object
        objectInfos.forEach(({ scale }, ndx) => {
            const offset = ndx * (changingUnitSize / 4);
            storageValues.set([scale / aspect, scale], offset + kScaleOffset); // set the scale
        });
        // upload all scales at once
        device.queue.writeBuffer(changingStorageBuffer, 0, storageValues);

        pass.setBindGroup(0, bindGroup);
        pass.draw(vertexCount, kNumObjects);
        pass.end();

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
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
        render();
    });
    try {
        observer.observe(canvas, { box: 'device-pixel-content-box' });
    } catch {
        observer.observe(canvas, { box: 'content-box' });
    }
}

start();