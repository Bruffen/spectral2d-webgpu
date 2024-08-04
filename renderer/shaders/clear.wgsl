@group(0) @binding(0) var tex : texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(8, 8) fn clear(@builtin(global_invocation_id) id: vec3u) {
    textureStore(tex, id.xy, vec4f(0.0, 0.0, 0.0, 0.0));
}