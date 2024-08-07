import { Spectral } from './renderer/spectral.js'
import { Settings } from './renderer/settings.js';
import { Light, LightType } from './renderer/light.js';
import { Vector2 } from './renderer/vector.js';

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
/*
    const canUseFloat32Filterable = adapter?.features.has('float32-filterable');
    if (!canUseFloat32Filterable) {
        alert('Sorry, your device doesn\'t support float32-filterable feature.');
        return;
    }
*/
    const device = await adapter?.requestDevice({
        //requiredFeatures: [ 'float32-filterable' ],
    });

    device.lost.then((info) => {
        console.error(`WebGPU device was lost: ${info.message}`);
        if (info.reason !== 'destroyed') {
            start();
        }
    });

    function setLightType(type) {
        spectral.light.type = type;
        spectral.reset();
    }

    var isMouseDown = false;
    var clickX, clickY;

    function setLightPosition(canvas, event) {
        const rect = canvas.getBoundingClientRect()
        clickX = event.clientX - rect.left;
        clickY = event.clientY - rect.top;

        const xndc = clickX / settings.resolution[0] * 2.0 - 1.0;
        const yndc = (1.0 - (clickY / settings.resolution[1])) * 2.0 - 1.0;

        spectral.light.position = new Vector2(xndc , yndc);
        spectral.reset();
    }

    function setLightDirection(canvas, event) {
        const rect = canvas.getBoundingClientRect()
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        spectral.light.direction = new Vector2(x - clickX, clickY - y).normalize();
        spectral.reset();
    }
    
    canvas.addEventListener('mousedown', function(e) {
        isMouseDown = true;
        setLightPosition(canvas, e);
    });
    
    canvas.addEventListener('mouseup', function() {
        isMouseDown = false;
    });

    canvas.addEventListener('mousemove', function(e) {
        if (isMouseDown) {
            if (spectral.light.type == LightType.BEAM || spectral.light.type == LightType.LASER) {
                setLightDirection(canvas, e);
            } else {
                setLightPosition(canvas, e);
            }
        }
    });

    /**
     * Light type
     */
    const dropdownLight = document.getElementById("dropdownLight");
    dropdownLight.onchange = () => dropdownLightOnChange();
    for (var lt in LightType) {
        let o = document.createElement("option");
        o.innerText = lt;
        dropdownLight.appendChild(o);
    }

    function dropdownLightOnChange() {
        setLightType(dropdownLight.selectedIndex);
    }

    /**
     * Render save
     */
    const btnSaveRender = document.getElementById("btnSave");
    btnSaveRender.addEventListener("click", () => spectral.saveRender());
    btnSaveRender.innerText = "Save image";

    /**
     * Rays progress
     */
    const textProgress = document.getElementById("textProgress");

    function progressUpdate() {
        let raysTraced = spectral.rayAmount * spectral.frameCounter;
        let raysTotal  = spectral.rayAmount * spectral.iterationsMax;
        let percentage = raysTraced / raysTotal * 100.0;
        textProgress.innerText = raysTraced + " rays traced: " + percentage.toFixed(0) + "%.";
    }
    
    const spectral = new Spectral(device, canvas, settings, () => progressUpdate());

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