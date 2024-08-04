struct Vertex {
    @location(0) position: vec2f,
};

struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

// TODO create single vertex shader for quad passes
@vertex fn vs(vert: Vertex) -> VSOutput {
    var o : VSOutput;
    o.position = vec4f(vert.position, 0.0, 1.0);

    // Convert top left corner from (-1, 1) in NDC to (0, 0) texture coordinates
    o.uv = vert.position;
    o.uv.x = (o.uv.x + 1.0) * 0.5;
    o.uv.y = (1.0 - o.uv.y) * 0.5;
    return o;
}

@group(0) @binding(0) var<uniform> frame: u32;
@group(0) @binding(1) var nsampler: sampler;
@group(0) @binding(2) var newRays: texture_2d<f32>;
@group(0) @binding(3) var avgRays: texture_2d<f32>;

@fragment fn fs(i: VSOutput) -> @location(0) vec4f {
    var n : vec4f = textureSample(newRays, nsampler, i.uv);
    var a : vec4f = textureSample(avgRays, nsampler, i.uv);
    var fframe = f32(frame);
    return (a * (fframe - 1.0) + n) / fframe;
}