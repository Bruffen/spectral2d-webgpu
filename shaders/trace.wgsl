struct Light {
    t: u32,
    position: vec2f,
    power: f32,
};

struct RayHit {
    t : f32,
    position : vec2f,
    normal : vec2f,
};

@group(0) @binding(0) var<storage, read_write> positions: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> colors:    array<vec4f>;
@group(0) @binding(2) var<storage, read>       random:    array<f32>;
@group(0) @binding(3) var<uniform> rayAmount : i32;
@group(0) @binding(4) var<uniform> rayDepth  : i32;
@group(0) @binding(5) var<uniform> light: Light;

fn intersect_box(origin : vec2f, direction : vec2f) -> vec2f {
    var tmin  : f32;
    var tmax  : f32;
    var tymin : f32;
    var tymax : f32;
    var bounds_min = vec2f(-1.0, -1.0);
    var bounds_max = vec2f(-0.9, -0.9);

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
        return vec2f(1000000, 0);
    }

    if (tymin > tmin) {
        tmin = tymin;
    }
    if (tymax < tmax) {
        tmax = tymax;
    }

    if (tmin < 0.0) {
        return vec2f(1000000, 0);
    }

    var t = min(max(tmin, 0.0), tmax);

    return vec2f(t, 1.0);
}

fn intersect_circle(origin : vec2f, direction : vec2f) -> RayHit {
    var center = vec2f(-0.3, 0.3);
    var radius = 0.2;
    
    var hit : RayHit;

    var oc = center - origin;
    var a = direction.x * direction.x + direction.y * direction.y;
    var h = dot(direction, oc);
    var c = oc.x * oc.x + oc.y * oc.y - radius * radius;
    var discriminant = h * h - a * c;

    var sqrtd = sqrt(discriminant);
    var root = (h - sqrtd) / a;

    if (root < 0.0 || root > 1000000) {
        root = (h + sqrtd) / a;
    }

    if (root < 0.0 || root > 1000000) {
        hit.t = -1.0;
    } else {
        hit.t = root;
        hit.position = origin + direction * hit.t;
        hit.normal = (hit.position - center) / radius;
    }

    return hit;
}

fn reflectance(cosine : f32, refraction_index : f32) -> f32 {
    // Use Schlick's approximation for reflectance.
    var r0 = (1 - refraction_index) / (1 + refraction_index);
    r0 = r0 * r0;
    return r0 + (1 - r0) * pow((1 - cosine), 5);
}

@compute @workgroup_size(64) fn trace(@builtin(global_invocation_id) id: vec3u) {
    let i = i32(id.x);

    let M_PI = 3.1415926535897932384626433832795;
    let angle = random[i * rayDepth] * M_PI * 2.0;
    var length = 10.0;

    var direction = vec2f(cos(angle), sin(angle));
    var origin = light.position;

   for (var depth = 0; depth < rayDepth; depth++) {
        
        var hit = intersect_circle(origin, direction);
        if (hit.t > 0.0) {
            length = hit.t;
        }
        var step = direction * length;

        positions[i * 2 * rayDepth + 0 + depth * 2] = origin; // correct for aspect ratio
        positions[i * 2 * rayDepth + 1 + depth * 2] = origin + step;

        let aliasing = sqrt(step.x*step.x + step.y*step.y) / max(abs(step.x), abs(step.y));
        let brightness = light.power * aliasing * (1.0 / f32(rayAmount));
        colors[i * rayDepth + depth] = vec4f(1.0, 1.0, 1.0, brightness);

        if (hit.t > 0.0) {
            var index_refraction = 0.657;

            if (dot(direction, hit.normal) > 0.0) {
                hit.normal = -hit.normal;
                index_refraction = 1.0 / index_refraction;
            }

            let r = random[i * rayDepth + depth];

            var cos_theta = min(dot(-direction, hit.normal), 1.0);
            var sin_theta = sqrt(1.0 - cos_theta * cos_theta);

            var cannot_refract = index_refraction * sin_theta > 1.0; // is this really needed?

            if (cannot_refract || reflectance(cos_theta, index_refraction) > r) {
                direction = reflect(direction, hit.normal);
            } else {
                direction = refract(direction, hit.normal, index_refraction);
            }
        }
        origin = origin + step + direction * 0.00001;

        length = 10.0;
    }
}