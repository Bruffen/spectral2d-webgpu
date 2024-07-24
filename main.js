const canvas = document.querySelector('#c');

let style = getComputedStyle(canvas);
const width = style.width.replace(/[^0-9]/g, '');
const height = style.height.replace(/[^0-9]/g, '');
const resolution = [width, height];

//const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const presentationFormat = 'rgba16float';
const highResFormat = 'rgba32float';

var frameCounter = 1;

const light = new Light(LightType.POINT, new Vector2(0.0, 0.0), 500.0);

async function start() {
    if (!navigator.gpu) {
        alert('This browser does not support WebGPU.');
        return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        alert('This browser supports webgpu but it appears disabled.');
        return;
    }

    const canUseFloat32Filterable = adapter?.features.has('float32-filterable');
 
    if (!canUseFloat32Filterable) {
        alert('Sorry, your device doesn\'t support float32-filterable feature.');
        return;
    }

    const device = await adapter?.requestDevice({
        requiredFeatures: [ 'float32-filterable' ],
    });

    device.lost.then((info) => {
        console.error(`WebGPU device was lost: ${info.message}`);
        if (info.reason !== 'destroyed') {
            start();
        }
    });

    main(device);
}

start();

function main(device) {
    const context = canvas.getContext('webgpu');

    context.configure({
        device,
        format: presentationFormat,
        //alphaMode: 'premultiplied',
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT, 
    });

    const frameCounterBuffer = device.createBuffer({
        label: 'Frame counter uniform',
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, //TODO remove COPY_DST
    });
    device.queue.writeBuffer(frameCounterBuffer, 0, new Uint32Array([frameCounter]));

    const rayAmount   = 15000;
    const tracePass   = new TracePass(device, rayAmount, 1);
    const renderPass  = new RenderPass(device, tracePass.verticesPerRay, rayAmount, tracePass.vertexStorageBuffer, tracePass.colorStorageBuffer);
    const accumPass   = new AccumulatePass(device, renderPass.raysRenderTexture, frameCounterBuffer);
    const blitPass    = new BlitPass(device, accumPass.newAccumulateRenderTexture);

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
    
    function render() {
        tracePass.run();
        renderPass.run();
        accumPass.run();
        
        /*
        // Only copies between same texture formats are allowed, so we are limited to 16 bit floats.
        const blitEncoder = device.createCommandEncoder({ label: 'Blit to canvas encoder' });
        blitEncoder.copyTextureToTexture(
            { texture: accumPass.newAccumulateRenderTexture }, 
            { texture: context.getCurrentTexture() }, 
            resolution
            );
            const blitCommandBuffer = blitEncoder.finish();
            device.queue.submit([blitCommandBuffer]);
        */
        
        /**
         * Hack to allow 32 bit floats for some of the computation and then present at 16 bit.
         * Requires 'float32-filterable' feature, however.
         */
        blitPass.run(context.getCurrentTexture());
           
        frameCounter++;
        device.queue.writeBuffer(frameCounterBuffer, 0, new Uint32Array([frameCounter]));
    
        if (frameCounter < 1000) {
            requestAnimationFrame(render);
        }
        if (frameCounter == 1000) {
            console.log("Rendering over");
        }
    }
}