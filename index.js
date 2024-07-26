const canvas = document.querySelector('#c');

let style = getComputedStyle(canvas);
const width = style.width.replace(/[^0-9]/g, '');
const height = style.height.replace(/[^0-9]/g, '');

const resolution = [width, height];
const lowPrecisionFormat  = 'rgba16float';
const highPrecisionFormat = 'rgba32float';

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

    const context = canvas.getContext('webgpu');

    const spectral = new Spectral(device, context);

    /*const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
            const width = entry.devicePixelContentBoxSize?.[0].inlineSize ||
                entry.contentBoxSize[0].inlineSize * devicePixelRatio;
            const height = entry.devicePixelContentBoxSize?.[0].blockSize ||
                entry.contentBoxSize[0].blockSize * devicePixelRatio;
            const canvas = entry.target;*/
            canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
            canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));
        //}
        spectral.render();
    //});
    //try {
    //    observer.observe(canvas, { box: 'device-pixel-content-box' });
    //} catch {
    //    observer.observe(canvas, { box: 'content-box' });
    //}
}

start();