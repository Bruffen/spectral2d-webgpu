import { Vector2 } from "./vector.js"; 
import { Light, LightType } from "./light.js";

import { TracePass } from "./passes/trace.js";
import { RenderPass } from "./passes/render.js";
import { AccumulatePass } from "./passes/accumulate.js";
import { BlitPass } from "./passes/blit.js";

export class Spectral {
    constructor(device, canvas, settings, progressCallback) {
        this.device = device;
        this.canvas = canvas;
        this.context = canvas.getContext('webgpu');
        this.settings = settings;
        this.progressCallback = progressCallback;

        this.lightPower = 250;
        this.light = new Light(LightType.POINT, new Vector2(0.4, 0.4), new Vector2(1.0, 0.0), this.lightPower);
        this.sceneId = 0;
        this.sceneWalls = 1;
        this.rayAmount = 15000;
        this.rayDepth = 11;
        this.frameCounter = 1;
        this.isDone = false;

        this.targetRayAmount = 20000000;
        this.iterationsMax = Math.ceil(this.targetRayAmount / this.rayAmount);
        this.setup();
    }
    
    setup() {
        this.context.configure({
            device: this.device,
            format: this.settings.lowPrecisionFormat,
            //alphaMode: 'premultiplied',
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
        });

        this.frameCounterBuffer = this.device.createBuffer({
            label: 'Frame counter uniform',
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, //TODO remove COPY_DST
        });
        this.device.queue.writeBuffer(this.frameCounterBuffer, 0, new Uint32Array([this.frameCounter]));

        this.tracePass = new TracePass(
            this.device, 
            this.light,
            this.sceneId,
            this.sceneWalls,
            this.rayAmount, 
            this.rayDepth
        );
        
        this.renderPass = new RenderPass(
            this.device,
            this.settings,
            this.tracePass.verticesPerRay, 
            this.rayAmount, 
            this.rayDepth,
            this.tracePass.vertexStorageBuffer, 
            this.tracePass.colorStorageBuffer
        );
        
        this.accumPass = new AccumulatePass(
            this.device,
            this.settings,
            this.renderPass.raysRenderTexture, 
            this.frameCounterBuffer
        );
        
        this.blitPass = new BlitPass(
            this.device, 
            this.settings,
            this.accumPass.newAccumulateRenderTexture
        );
    }

    render() {
        this.tracePass.run();
        this.renderPass.run();
        this.accumPass.run();
        
        // Only copies between same texture formats are allowed, so we are limited to 16 bit floats.
        /*
        const blitEncoder = this.device.createCommandEncoder({ label: 'Blit to canvas encoder' });
        blitEncoder.copyTextureToTexture(
            { texture: this.accumPass.newAccumulateRenderTexture }, 
            { texture: this.context.getCurrentTexture() }, 
            resolution
        );
        const blitCommandBuffer = blitEncoder.finish();
        this.device.queue.submit([blitCommandBuffer]);
        */
        
        /**
         * Hack to allow 32 bit floats for some of the computation and then present at 16 bit.
         * Requires 'float32-filterable' feature, however.
         */
        this.blitPass.run(this.context.getCurrentTexture());
           
        this.frameCounter++;
        this.device.queue.writeBuffer(this.frameCounterBuffer, 0, new Uint32Array([this.frameCounter]));
        this.progressCallback();
    
        if (this.frameCounter < this.iterationsMax) {
            requestAnimationFrame(() => this.render());
        }
        else {
            console.log("Rendering over.");
            this.isDone = true;
            //this.saveRender();
        }
    }

    reset() {
        this.frameCounter = 1;
        this.device.queue.writeBuffer(this.frameCounterBuffer, 0, new Uint32Array([this.frameCounter]));
        this.iterationsMax = Math.ceil(this.targetRayAmount / this.rayAmount);

        this.tracePass.light = this.light;
        this.tracePass.sceneId = this.sceneId;
        this.tracePass.sceneWalls = this.sceneWalls;
        this.tracePass.rayAmount = this.rayAmount;
        this.tracePass.rayDepth = this.rayDepth; // TODO move uniform to here
        this.tracePass.reset();

        this.renderPass.rayAmount = this.rayAmount;
        this.renderPass.rayDepth = this.rayDepth;
        this.renderPass.reset();
        this.accumPass.reset();
        this.blitPass.reset();

        /* TODO obviously very slow and will fill vram if spammed
        this.tracePass = new TracePass(
            this.device, 
            this.light,
            this.rayAmount, 
            this.rayDepth
        );
        
        this.renderPass = new RenderPass(
            this.device,
            this.settings,
            this.tracePass.verticesPerRay, 
            this.rayAmount, 
            this.rayDepth,
            this.tracePass.vertexStorageBuffer, 
            this.tracePass.colorStorageBuffer
        );
        
        this.accumPass = new AccumulatePass(
            this.device,
            this.settings,
            this.renderPass.raysRenderTexture, 
            this.frameCounterBuffer
        );
        
        this.blitPass = new BlitPass(
            this.device, 
            this.settings,
            this.accumPass.newAccumulateRenderTexture
        );
        */

        if (this.isDone) {
            this.isDone = false;
            this.render();
        }
    }

    saveRender() {
        var image = this.canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
        let xhr = new XMLHttpRequest();
        xhr.responseType = 'blob';
        xhr.onload = function () {
            let a = document.createElement('a');
            a.href = window.URL.createObjectURL(xhr.response);
            a.download = 'render.png';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
        };
        xhr.open('GET', image);
        xhr.send();
    }
}