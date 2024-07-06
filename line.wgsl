struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
};

struct OurStruct {
    color: vec4f,
    aliasing: f32,
};

struct Vertex {
    position: vec2f,
};

@group(0) @binding(0) var<storage, read> ourStructs: array<OurStruct>;
@group(0) @binding(1) var<storage, read> positions: array<Vertex>;

@vertex fn vs(
    @builtin(vertex_index) vertexIndex : u32,
    @builtin(instance_index) instanceIndex: u32
) -> VSOutput {
    let ourStruct = ourStructs[instanceIndex];

    var vsOut: VSOutput;
    vsOut.position = vec4f(positions[vertexIndex + instanceIndex * 2].position, 0.0, 1.0);
    vsOut.color = ourStruct.color;
    return vsOut;
}

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
    //return vec4f(pow(vsOut.color.rgb, vec3f(1.0/2.2)), vsOut.color.a);
    return vsOut.color;
}