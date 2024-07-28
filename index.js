import GUI from 'https://webgpufundamentals.org/3rdparty/muigui-0.x.module.js'
import { Spectral } from './spectral.js'
import { Settings } from './settings.js';
import { Light, LightType } from './light.js';
import { Vector2 } from './vector.js';

async function start() {
    const canvas = document.querySelector('#c');

    let style = getComputedStyle(canvas);
    const width = style.width.replace(/[^0-9]/g, '');
    const height = style.height.replace(/[^0-9]/g, '');
    
    const settings = new Settings(width, height);

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

    const dataGUI = {
        Type: LightType.POINT,
    };

    const spectral = new Spectral(device, canvas, settings);

    const gui = new GUI();
    gui.onChange(/*function() { spectral.reset(dataGUI) }*/ update);
    Object.assign(gui.domElement.style, {right: '15px', left: ''});
    
    gui.addLabel('Light:');
    gui.add(dataGUI, 'Type', {keyValues: {'Point': LightType.POINT, 'Beam': LightType.BEAM, 'Laser': LightType.LASER}});

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

    function update() {
        switch(dataGUI['Type']) {
            case LightType.POINT:
                spectral.light = new Light(LightType.POINT, new Vector2(0.0, 0.0), new Vector2(0.0, 0.0), 100.0);
                break;
            case LightType.BEAM:
                spectral.light = new Light(LightType.BEAM, new Vector2(0.0, 0.0), new Vector2(-1.0, 1.0), 100.0);
                break;
            case LightType.LASER:
                spectral.light = new Light(LightType.LASER, new Vector2(0.0, 0.0), new Vector2(-1.0, 1.2), 100.0);
                break;
            default:
                spectral.light = new Light(LightType.POINT, new Vector2(0.0, 0.0), new Vector2(0.0, 0.0), 100.0);
            break;
        }

        spectral.reset();
    }

    function setLightPosition(canvas, event) {
        const rect = canvas.getBoundingClientRect()
        const x = event.clientX - rect.left
        const y = event.clientY - rect.top

        const xndc = x / settings.resolution[0] * 2.0 - 1.0;
        const yndc = (1.0 - (y / settings.resolution[1])) * 2.0 - 1.0;

        spectral.light.position = new Vector2(xndc , yndc);
        spectral.reset();
    }
    
    canvas.addEventListener('mousedown', function(e) {
        setLightPosition(canvas, e)
    })
}


start();