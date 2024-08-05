@group(0) @binding(0) var<uniform> frame: u32;
@group(0) @binding(1) var newRays:      texture_storage_2d<rgba16float, read>;
@group(0) @binding(2) var lastAvgRays:  texture_storage_2d<rgba32float, read>;
@group(0) @binding(3) var newAvgRays:   texture_storage_2d<rgba32float, write>;


@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
    var n : vec4f = textureLoad(newRays, id.xy);
    var a : vec4f = textureLoad(lastAvgRays, id.xy);
    var fframe = f32(frame);
    textureStore(newAvgRays, id.xy, (a * (fframe - 1.0) + n) / fframe);
}