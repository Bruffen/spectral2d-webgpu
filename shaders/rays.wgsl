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