struct Vertex {
    @location(0) position: vec2f,
};

struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

@vertex fn vs(vert: Vertex) -> VSOutput {
    var o : VSOutput;
    o.position = vec4f(vert.position, 0.0, 1.0);
    o.uv = (vert.position + 1.0) * 0.5;
    return o;
}

@group(0) @binding(0) var<uniform> frame: u32;
@group(0) @binding(1) var newRaysSampler: sampler;
@group(0) @binding(2) var newRays: texture_2d<f32>;
@group(0) @binding(3) var avgRaysSampler: sampler;
@group(0) @binding(4) var avgRays: texture_2d<f32>;

@fragment fn fs(i: VSOutput) -> @location(0) vec4f {
    var n = textureSample(newRays, newRaysSampler, i.uv);
    var a = textureSample(avgRays, avgRaysSampler, i.uv);
    return (a * (f32(frame) - 1.0) + n) / f32(frame);
}