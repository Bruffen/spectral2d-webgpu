struct Vertex {
    position: vec2f,
};

struct Color {
    color: vec4f,
};

struct Random {
    value: f32,
}

struct Light {
    t: u32,
    position: vec2f,
    power: f32,
};

@group(0) @binding(0) var<storage, read_write> positions: array<Vertex>;
@group(0) @binding(1) var<storage, read_write> colors:    array<Color>;
@group(0) @binding(2) var<storage, read>       random:    array<Random>;
@group(0) @binding(3) var<uniform> rayAmount : u32;
@group(0) @binding(4) var<uniform> light: Light;

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
    
    positions[i * 2].position = light.position; // correct for aspect ratio
    positions[i * 2 + 1].position = light.position + direction;         
    
    let brightness = light.power * aliasing * (1.0 / f32(rayAmount));
    colors[i].color = vec4f(1.0, 1.0, 1.0, brightness);
}