struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
};

@group(0) @binding(0) var<storage, read> positions: array<vec2f>;
@group(0) @binding(1) var<storage, read> colors: array<vec4f>;
@group(0) @binding(2) var<uniform> inverse_scale: f32;

@vertex fn vs(
    @builtin(vertex_index) vertexIndex : u32,
    @builtin(instance_index) instanceIndex: u32
) -> VSOutput {
    var vsOut: VSOutput;
    var position = positions[vertexIndex + instanceIndex * 2];
    position.x *= 6.0 / 9.0;
    vsOut.position = vec4f(position * inverse_scale, 0.0, 1.0);
    vsOut.color = colors[instanceIndex];
    return vsOut;
}

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
    return vsOut.color;
}