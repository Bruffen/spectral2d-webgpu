async function start() {
    if (!navigator.gpu) {
        alert('This browser does not support WebGPU');
        return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        alert('This browser supports webgpu but it appears disabled');
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

var frameCounter = 1;

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

const light = new Light(LightType.POINT, new Vector2(0.0, 0.0), 400.0);

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
    
    const dx = direction.x * length;
    const dy = direction.y * length;
    const aliasing = Math.sqrt(dx*dx + dy*dy) / Math.max(Math.abs(dx), Math.abs(dy));

    addVertex(light.position.x     , light.position.y);
    addVertex(light.position.x + dx, light.position.y + dy);

    return { vertices, aliasing };
}

function main(device) {
    // Get a WebGPU context from the canvas and configure it
    const canvas = document.querySelector('#c');
    const context = canvas.getContext('webgpu');
    //const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    // TODO forcing a higher resolution on the canvas like this is extremely slow!
    const presentationFormat = 'rgba16float';

    const raysRenderTexture = device.createTexture({
        label: "Rays render texture",
        size: [900, 600],
        format: presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });

    context.configure({
        device,
        format: presentationFormat,
        //alphaMode: 'premultiplied',
        usage: GPUTextureUsage.COPY_DST
    });

    const raysModule = device.createShaderModule({
        label: 'Rays render shader',
        code: shaderRays,
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

    const raysPipeline = device.createRenderPipeline({
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
                    color: color,
                    alpha: alpha,
                },
            }],
        },
        primitive: {
            topology: 'line-list',
        },
    });

    const numberOfRays = 20000;
    const verticesPerLine = 2;
    const vertexCount = verticesPerLine * numberOfRays;

    // create 2 storage buffers
    const dataUnitSize =
        4 * 4 + // color is 4 32bit floats (4bytes each)
        1 * 4 + // aliasing is 1 32bit float (4bytes each)
        3 * 4;  // padding
    const vertexUnitSize =
        2 * 4;  // position is 2 32bit floats (4bytes each)
    const dataStorageBufferSize = dataUnitSize * numberOfRays;
    const vertexStorageBufferSize = vertexUnitSize * vertexCount;

    const dataStorageBuffer = device.createBuffer({
        label: 'storage buffer for object data',
        size: dataStorageBufferSize,
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
    
    const verticesArray = new Float32Array(vertexStorageBufferSize / 4);
    const dataValues = new Float32Array(dataStorageBufferSize / 4);
    
    const raysBindGroup = device.createBindGroup({
        label: 'Rays render binding',
        layout: raysPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: dataStorageBuffer } },
            { binding: 1, resource: { buffer: vertexStorageBuffer } },
        ],
    });

    const raysRenderPassDescriptor = {
        label: 'Rays render renderpass',
        colorAttachments: [{
            view: raysRenderTexture.createView(),
            clearValue: [0.0, 0.0, 0.0, 1.0],
            loadOp: 'clear',
            storeOp: 'store',
        },],
    };

    const averageModule = device.createShaderModule({
        label: 'Average result shader',
        code: shaderAverage,
    });

    const averagePipeline = device.createRenderPipeline({
        label: 'Average result pipeline',
        layout: 'auto',
        vertex: {
            module: averageModule,
            buffers: [{
                arrayStride: 2 * 4, // 2 floats, 4 bytes each
                attributes: [
                    {shaderLocation: 0, offset: 0, format: 'float32x2'},  // position
                ],},
            ],
        },
        fragment: {
            module: averageModule,
            targets: [{
                format: presentationFormat,
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

    const quadBuffer = device.createBuffer({
        label: 'Buffer for quad vertices',
        size: quadData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(quadBuffer, 0, quadData);

    const frameCounterBuffer = device.createBuffer({
        label: 'Frame counter uniform',
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(frameCounterBuffer, 0, new Uint32Array([frameCounter]));

    const averageRenderTexture1 = device.createTexture({
        label: "Average render texture 1",
        size: [900, 600],
        format: presentationFormat,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    const averageRenderTexture2 = device.createTexture({
        label: "Average render texture 2",
        size: [900, 600],
        format: presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    const sampler = device.createSampler({
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        magFilter: 'linear',
        minFilter: 'linear',
    });

    const averageBindGroup = device.createBindGroup({
        label: 'Average result render binding',
        layout: averagePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: frameCounterBuffer } },
            { binding: 1, resource: sampler },
            { binding: 2, resource: raysRenderTexture.createView() },
            { binding: 3, resource: sampler },
            { binding: 4, resource: averageRenderTexture1.createView() },
        ],
    });

    const averageRenderPassDescriptor = {
        label: 'Average result renderpass',
        colorAttachments: [{
            view: averageRenderTexture2.createView(),
            clearValue: [1.0, 0.0, 0.0, 1.0],
            loadOp: 'clear',
            storeOp: 'store',
        },],
    };

    function render() {        
        for (let i = 0; i < numberOfRays; ++i) {
            const offset = i * ((vertexUnitSize * verticesPerLine) / 4);
            
            const {vertices, aliasing} = createLine();
            verticesArray.set(vertices, offset);
            
            const staticOffset = i * (dataUnitSize / 4);
            //const color = [rand(), rand(), rand(), 1];
            const color = [1, 1, 1, light.power * aliasing * (1.0 / numberOfRays)];
            dataValues.set(color, staticOffset + kColorOffset);
            dataValues.set([1.0], staticOffset + kOffsetOffset);
        }
        device.queue.writeBuffer(vertexStorageBuffer, 0, verticesArray);
        device.queue.writeBuffer(dataStorageBuffer, 0, dataValues);
        

        //raysRenderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();
        
        // make a command encoder to start encoding commands
        const raysEncoder = device.createCommandEncoder({ label: 'Ray render encoder' });

        // make a render pass encoder to encode render specific commands
        const raysRenderPass = raysEncoder.beginRenderPass(raysRenderPassDescriptor);
        raysRenderPass.setPipeline(raysPipeline);
        raysRenderPass.setBindGroup(0, raysBindGroup);
        raysRenderPass.draw(verticesPerLine, numberOfRays);
        raysRenderPass.end();

        const raysCommandBuffer = raysEncoder.finish();
        device.queue.submit([raysCommandBuffer]);

        const averageEncoder = device.createCommandEncoder({ label: 'Average result encoder' });
        const averageRenderPass = averageEncoder.beginRenderPass(averageRenderPassDescriptor);
        averageRenderPass.setPipeline(averagePipeline);
        averageRenderPass.setBindGroup(0, averageBindGroup);
        averageRenderPass.setVertexBuffer(0, quadBuffer);
        averageRenderPass.draw(4, 1);
        averageRenderPass.end();
        const averageCommandBuffer = averageEncoder.finish();
        device.queue.submit([averageCommandBuffer]);

        const averageBlitEncoder = device.createCommandEncoder({ label: 'Blit to average render texture' });
        averageBlitEncoder.copyTextureToTexture(
            {texture: averageRenderTexture2}, 
            {texture: averageRenderTexture1}, 
            [900, 600, 1]
        );

        const averageBlitCommandBuffer = averageBlitEncoder.finish();
        device.queue.submit([averageBlitCommandBuffer]);

        const blitEncoder = device.createCommandEncoder({ label: 'Blit to canvas encoder' });
        blitEncoder.copyTextureToTexture(
            {texture: averageRenderTexture2}, 
            {texture: context.getCurrentTexture()}, 
            [900, 600, 1]
        );

        const blitCommandBuffer = blitEncoder.finish();
        device.queue.submit([blitCommandBuffer]);

        frameCounter++;
        device.queue.writeBuffer(frameCounterBuffer, 0, new Uint32Array([frameCounter]));

        //if (frameCounter < 300) {
        //    if (frameCounter == 299) {
        //        console.log("Rendering over");
        //    }
            requestAnimationFrame(render);
        //}
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