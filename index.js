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

function main(device) {
    // Get a WebGPU context from the canvas and configure it
    const canvas = document.querySelector('#c');
    const context = canvas.getContext('webgpu');
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: presentationFormat,
    });

    const vsModule = device.createShaderModule({
        label: 'hardcoded triangle',
        code: `
            struct OurStruct {
                color: vec4f,
                offset: vec2f,
            };

            struct OtherStruct {
                scale: vec2f,
            };

            @group(0) @binding(0) var<uniform> ourStruct: OurStruct;
            @group(0) @binding(1) var<uniform> otherStruct: OtherStruct;

            @vertex fn vs(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4f {
                let pos = array(
                    vec2f( 0.0,  0.5),  // top center
                    vec2f(-0.5, -0.5),  // bottom left
                    vec2f( 0.5, -0.5)   // bottom right
                );

                return vec4f(pos[vertexIndex] * otherStruct.scale + ourStruct.offset, 0.0, 1.0);
            }
        `,
    });

    const fsModule = device.createShaderModule({
        label: 'triangle',
        code: `
            struct OurStruct {
                color: vec4f,
                offset: vec2f,
            };

            @group(0) @binding(0) var<uniform> ourStruct: OurStruct;

            @fragment fn fs() -> @location(0) vec4f {
                return ourStruct.color;
            }
        `,
    });

    const pipeline = device.createRenderPipeline({
        label: 'our hardcoded rgb triangle pipeline',
        layout: 'auto',
        vertex: {
            module: vsModule,
        },
        fragment: {
            module: fsModule,
            targets: [{ format: presentationFormat }],
        },
    });

    // create 2 buffers for the uniform values
    const staticUniformBufferSize =
        4 * 4 + // color is 4 32bit floats (4bytes each)
        2 * 4 + // offset is 2 32bit floats (4bytes each)
        2 * 4;  // padding
    const uniformBufferSize =
        2 * 4;  // scale is 2 32bit floats (4bytes each)
    
    // offsets to the various uniform values in float32 indices
    const kColorOffset = 0;
    const kOffsetOffset = 4;
    
    const kScaleOffset = 0;
    
    const kNumObjects = 100;
    const objectInfos = [];
   
    for (let i = 0; i < kNumObjects; ++i) {
        const staticUniformBuffer = device.createBuffer({
            label: `static uniforms for obj: ${i}`,
            size: staticUniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    
        // These are only set once so set them now
        {
            const uniformValues = new Float32Array(staticUniformBufferSize / 4);
            uniformValues.set([rand(), rand(), rand(), 1], kColorOffset);        // set the color
            uniformValues.set([rand(-0.9, 0.9), rand(-0.9, 0.9)], kOffsetOffset);      // set the offset
    
            // copy these values to the GPU
            device.queue.writeBuffer(staticUniformBuffer, 0, uniformValues);
        }
    
        // create a typedarray to hold the values for the uniforms in JavaScript
        const uniformValues = new Float32Array(uniformBufferSize / 4);
        const uniformBuffer = device.createBuffer({
            label: `changing uniforms for obj: ${i}`,
            size: uniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
   
        const bindGroup = device.createBindGroup({
            label: `bind group for obj: ${i}`,
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: staticUniformBuffer }},
                { binding: 1, resource: { buffer: uniformBuffer }},
            ],
        });
   
        objectInfos.push({
            scale: rand(0.2, 0.5),
            uniformBuffer,
            uniformValues,
            bindGroup,
        });
    }
    
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
 
        for (const {scale, bindGroup, uniformBuffer, uniformValues} of objectInfos) {
            uniformValues.set([scale / aspect, scale], kScaleOffset); // set the scale
            device.queue.writeBuffer(uniformBuffer, 0, uniformValues);
            pass.setBindGroup(0, bindGroup);
            pass.draw(3);  // call our vertex shader 3 times
        }
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