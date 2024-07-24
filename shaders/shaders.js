const shaderRays = 
`
struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
};

struct Vertex {
    position: vec2f,
};

struct Color {
    color: vec4f,
};

@group(0) @binding(0) var<storage, read> positions: array<Vertex>;
@group(0) @binding(1) var<storage, read> colors: array<Color>;

@vertex fn vs(
    @builtin(vertex_index) vertexIndex : u32,
    @builtin(instance_index) instanceIndex: u32
) -> VSOutput {
    var vsOut: VSOutput;
    vsOut.position = vec4f(positions[vertexIndex + instanceIndex * 2].position, 0.0, 1.0);
    vsOut.color = colors[instanceIndex].color;
    return vsOut;
}

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
    return vsOut.color;
}
`;

const shaderAccumulate = 
`
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
`;

const shaderTrace =
`
struct Vertex {
    position: vec2f,
};

struct Color {
    color: vec4f,
};

struct Random {
    value: f32,
}

/*struct Light {
    t: u32,
    position: vec2f,
    power: f32,
};*/

@group(0) @binding(0) var<storage, read_write> positions: array<Vertex>;
@group(0) @binding(1) var<storage, read_write> colors:    array<Color>;
@group(0) @binding(2) var<storage, read>       random:    array<Random>;
@group(0) @binding(3) var<uniform> rayAmount : u32;
//@group(0) @binding(4) var<uniform> light: Light;

@compute @workgroup_size(64) fn trace(@builtin(global_invocation_id) id: vec3u) {
    let i = id.x;

    let M_PI = 3.1415926535897932384626433832795;
    let angle = random[i].value * M_PI * 2.0;
    var length = 2.0;       

    var direction = vec2f(cos(angle), sin(angle));
    var absdir = vec2f(abs(direction.x), abs(direction.y));
    if (absdir.x >= absdir.y) {
        length = 1.0 / absdir.x;
    } else {
        length = 1.0 / absdir.y;
    }
    direction *= length;
    absdir *= length;

    let aliasing = sqrt(direction.x*direction.x + direction.y*direction.y) / max(absdir.x, absdir.y);
    
    positions[i * 2].position = vec2f(0.0, 0.0);
    positions[i * 2 + 1].position = vec2f(0.0, 0.0) + direction;
    
    let brightness = /*light.power*/ 500 * aliasing * (1.0 / f32(rayAmount));
    colors[i].color = vec4f(1, 1, 1, brightness);
}
`;

const shaderBlit = 
`
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

@group(0) @binding(0) var nsampler: sampler;
@group(0) @binding(1) var outputtex: texture_2d<f32>;

@fragment fn fs(i: VSOutput) -> @location(0) vec4f {
    return textureSample(outputtex, nsampler, i.uv);
}
`;