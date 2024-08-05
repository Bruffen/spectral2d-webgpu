@group(0) @binding(0) var i: texture_storage_2d<rgba32float, read>;
@group(0) @binding(1) var o: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
    var color = textureLoad(i, id.xy);
    textureStore(o, id.xy, pow(color, vec4f(1.0/2.2)));
}