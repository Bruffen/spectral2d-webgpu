export const shaderRays = 
`
struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
};

@group(0) @binding(0) var<storage, read> positions: array<vec2f>;
@group(0) @binding(1) var<storage, read> colors: array<vec4f>;

@vertex fn vs(
    @builtin(vertex_index) vertexIndex : u32,
    @builtin(instance_index) instanceIndex: u32
) -> VSOutput {
    var vsOut: VSOutput;
    vsOut.position = vec4f(positions[vertexIndex + instanceIndex * 2], 0.0, 1.0);
    vsOut.color = colors[instanceIndex];
    return vsOut;
}

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
    return vsOut.color;
}
`;

export const shaderAccumulate = 
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

export const shaderBlit = 
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
    return pow(textureSample(outputtex, nsampler, i.uv), vec4(1.0/2.2));
}
`;

export const shaderTrace =
`
struct Light {
    t         : u32,
    power     : f32,
    position  : vec2f,
    direction : vec2f,
};

struct Ray {
    origin    : vec2f,
    direction : vec2f,
};

struct RayHit {
    t         : f32,
    material  : u32, // 0 for glass, 1 for lambertian diffuse
    normal    : vec2f,
};

struct Object {
    center    : vec2f,
    data      : vec4f,
}

@group(0) @binding(0) var<storage, read_write> positions: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> colors:    array<vec4f>;
@group(0) @binding(2) var<storage, read>       randoms:    array<f32>;
@group(0) @binding(3) var<uniform> rayAmount : i32;
@group(0) @binding(4) var<uniform> rayDepth  : i32;
@group(0) @binding(5) var<uniform> light: Light;

fn intersect_box(origin : vec2f, direction : vec2f) -> RayHit {
    var tmin  : f32;
    var tmax  : f32;
    var tymin : f32;
    var tymax : f32;
    var bounds_min = vec2f(-1.0, -1.0);
    var bounds_max = vec2f( 1.0,  1.0);

    var hit : RayHit;

    var invdir = 1.0 / direction; 
    if (invdir.x >= 0) { 
        tmin = (bounds_min.x - origin.x) * invdir.x; 
        tmax = (bounds_max.x - origin.x) * invdir.x; 
    } 
    else { 
        tmin = (bounds_max.x - origin.x) * invdir.x; 
        tmax = (bounds_min.x - origin.x) * invdir.x; 
    }
    
    if (invdir.y >= 0) { 
        tymin = (bounds_min.y - origin.y) * invdir.y; 
        tymax = (bounds_max.y - origin.y) * invdir.y; 
    } 
    else { 
        tymin = (bounds_max.y - origin.y) * invdir.y; 
        tymax = (bounds_min.y - origin.y) * invdir.y; 
    }
    
    if ((tmin > tymax) || (tymin > tmax)) {
        hit.t = -1.0;
        return hit;
    }

    if (tymin > tmin) {
        tmin = tymin;
    }
    if (tymax < tmax) {
        tmax = tymax;
    }

    if (tmin < 0.0) {
        hit.t = -1.0;
        return hit;
    }

    hit.t = min(max(tmin, 0.0), tmax);
    
    hit.material = 0;
    hit.normal = vec2f(0.0, -1.0); //todo

    return hit;
}

fn intersect_line(origin :vec2f, direction : vec2f, center : vec2f, normal : vec2f, m : u32) -> RayHit {
    var hit : RayHit;

    var denom = dot(-normal, direction);
    if (denom > 0.00001) {
        var co = center - origin;
        hit.t = dot(co, -normal) / denom;
    }

    hit.material = m;
    hit.normal = normal;
    return hit;
}

fn intersect_circle(origin : vec2f, direction : vec2f) -> RayHit {
    var center = vec2f(-0.1, -0.1);
    var radius = 0.2;
    
    var hit : RayHit;

    var oc = origin - center;
    // a is already normalized therefore length is 1
    //var a = direction.x * direction.x + direction.y * direction.y; 
    var h = dot(oc, direction);
    var c = oc.x * oc.x + oc.y * oc.y - radius * radius;
    var discriminant = h * h - /*a **/ c;

    var sqrtd = sqrt(discriminant);
    var root = (-h - sqrtd);// / a;

    if (root < 0.0 || root > 1000000) {
        root = (-h + sqrtd);// / a;
        if (root < 0.0 || root > 1000000) {
            hit.t = -1.0;
            return hit;
        }
    }

    hit.t = root;
    var position = origin + direction * hit.t;
    hit.normal = (position - center) / radius;
    hit.material = 0;

    return hit;
}

fn reflectance(cosine : f32, refraction_index : f32) -> f32 {
    // Use Schlick's approximation for reflectance.
    //var r0 = (1.0 - refraction_index) / (1.0 + refraction_index);
    //r0 = r0 * r0;
    var r0 = 0.04257999496; // hardcoded value for air to and from glass
    return r0 + (1.0 - r0) * pow((1.0 - cosine), 5.0);
}

fn generateFromLight(random : f32) -> Ray {
    var ray : Ray;

    let M_PI = 3.1415926535897932384626433832795;

    switch light.t {
        case 0, default: { // Point
            let angle = random * M_PI * 2.0;
            ray.origin = light.position;
            ray.direction = vec2f(cos(angle), sin(angle));
        }
        case 1: { // Beam
            ray.direction = light.direction;
            var ortogonal = vec2f(ray.direction.y, -ray.direction.x);

            ray.origin = light.position + (random * 2.0 - 1.0) * ortogonal * 0.1;
        }
        case 2: { // Laser
            ray.origin = light.position;
            ray.direction = light.direction;
        }
    }

    return ray;
}

fn materialGlass(ray : Ray, hit : RayHit, random : f32) -> vec2f {
    var scattered : vec2f;
    
    var index_refraction = 0.657;
    var normal = hit.normal;

    if (dot(ray.direction, normal) > 0.0) {
        normal = -normal;
        index_refraction = 1.0 / index_refraction;
    }

    var cos_theta = min(dot(-ray.direction, normal), 1.0);
    var sin_theta = sqrt(1.0 - cos_theta * cos_theta);

    var cannot_refract = index_refraction * sin_theta > 1.0;

    if (cannot_refract || reflectance(cos_theta, index_refraction) > random) {
        scattered = reflect(ray.direction, normal);
    } else {
        scattered = refract(ray.direction, normal, index_refraction);
    }

    return scattered;
}

fn materialLambert(ray : Ray, hit : RayHit, random : f32) -> vec2f {
    var scattered : vec2f;

    let M_PI = 3.1415926535897932384626433832795;

    let angle = random * M_PI;
    var direction = vec2f(cos(angle), sin(angle));

    var transform : mat2x2f;

    if (hit.normal.y < -0.5) {
        transform = mat2x2f(vec2f(-1.0, 0.0), vec2f(0.0, -1.0));
    }
    if (hit.normal.y > 0.5) {
        transform = mat2x2f(vec2f(1.0, 0.0), vec2f(0.0, 1.0));
    }
    if (hit.normal.x < -0.5) {
        transform = mat2x2f(vec2f(0.0, 1.0), vec2f(-1.0, 0.0));
    }
    if (hit.normal.x > 0.5) {
        transform = mat2x2f(vec2f(0.0, -1.0), vec2f(1.0, 0.0));
    }

    scattered = transform * direction;
    return scattered;
}

fn scatter(ray : Ray, hit : RayHit, random : f32) -> vec2f {
    var scattered : vec2f;

    switch hit.material {
        case 0: {
            scattered = materialGlass(ray, hit, random);
        }
        case 1, default: {
            scattered = materialLambert(ray, hit, random);
        }
    }

    return scattered;
}

fn scene(ray : Ray) -> RayHit {
    var hit : RayHit;
    var tmp : RayHit;
    hit.t = 100000.0;
    tmp.t = -1.0;

    var lines = array<vec4f, 4>(
        vec4f(0.0, 1.0, 0.0, -1.0),
        vec4f(0.0, -1.0, 0.0, 1.0),
        vec4f(1.0, 0.0, -1.0, 0.0),
        vec4f(-1.0, 0.0, 1.0, 0.0)
    );

    for (var i = 0; i < 4; i++) {
        tmp = intersect_line(ray.origin, ray.direction, lines[i].xy, lines[i].zw, 1);
        if (tmp.t > 0.0 && tmp.t < hit.t) {
            hit = tmp;
        }
    }

    tmp = intersect_circle(ray.origin, ray.direction);
    if (tmp.t > 0.0 && tmp.t < hit.t) {
        hit = tmp;
    }

    return hit;
}

@compute @workgroup_size(64) fn trace(@builtin(global_invocation_id) id: vec3u) {
    let i = i32(id.x);

    var length = 10.0;

    var randomDepth = rayDepth + 1;
    var ray = generateFromLight(randoms[i * randomDepth]);

    for (var depth = 0; depth < rayDepth; depth++) {
        var hit = scene(ray);
        
        if (hit.t > 0.0) {
            length = hit.t;
        }
        var step = ray.direction * length;

        positions[i * 2 * rayDepth + 0 + depth * 2] = ray.origin; // correct for aspect ratio
        positions[i * 2 * rayDepth + 1 + depth * 2] = ray.origin + step;

        let aliasing = sqrt(step.x*step.x + step.y*step.y) / max(abs(step.x), abs(step.y));
        let brightness = light.power * aliasing * (1.0 / f32(rayAmount));
        colors[i * rayDepth + depth] = vec4f(1.0, 1.0, 1.0, brightness);

        let r = randoms[i * randomDepth + depth + 1];
        
        if (hit.t > 0.0) {
            ray.direction = scatter(ray, hit, r);
        }
        ray.origin = ray.origin + step + ray.direction * 0.00001;

        length = 10.0;
    }
}
`;