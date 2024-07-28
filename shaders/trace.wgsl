struct Light {
    t: u32,
    position: vec2f,
    direction: vec2f,
    power: f32,
};

struct Ray {
    origin: vec2f,
    direction: vec2f,
};

struct RayHit {
    t : f32,
    position : vec2f,
    normal : vec2f,
};

@group(0) @binding(0) var<storage, read_write> positions: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> colors:    array<vec4f>;
@group(0) @binding(2) var<storage, read>       randoms:    array<f32>;
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
    var center = vec2f(-0.5, 0.5);
    var radius = 0.2;
    
    var hit : RayHit;

    var oc = origin - center;
    // aleady normalized therefore length is 1
    var a = 1.0; //direction.x * direction.x + direction.y * direction.y; 
    var h = dot(oc, direction);
    var c = oc.x * oc.x + oc.y * oc.y - radius * radius;
    var discriminant = h * h - a * c;

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
    hit.position = origin + direction * hit.t;
    hit.normal = (hit.position - center) / radius;

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

@compute @workgroup_size(64) fn trace(@builtin(global_invocation_id) id: vec3u) {
    let i = i32(id.x);

    var length = 10.0;

    var randomDepth = rayDepth + 1;
    var ray = generateFromLight(randoms[i * randomDepth]);

    for (var depth = 0; depth < rayDepth; depth++) {
        var hit = intersect_circle(ray.origin, ray.direction);
        if (hit.t > 0.0) {
            length = hit.t;
        }
        var step = ray.direction * length;

        positions[i * 2 * rayDepth + 0 + depth * 2] = ray.origin; // correct for aspect ratio
        positions[i * 2 * rayDepth + 1 + depth * 2] = ray.origin + step;

        let aliasing = sqrt(step.x*step.x + step.y*step.y) / max(abs(step.x), abs(step.y));
        let brightness = light.power * aliasing * (1.0 / f32(rayAmount));
        colors[i * rayDepth + depth] = vec4f(1.0, 1.0, 1.0, brightness);

        if (hit.t > 0.0) {
            var index_refraction = 0.657;

            if (dot(ray.direction, hit.normal) > 0.0) {
                hit.normal = -hit.normal;
                index_refraction = 1.0 / index_refraction;
            }

            let r = randoms[i * randomDepth + depth + 1];

            var cos_theta = min(dot(-ray.direction, hit.normal), 1.0);
            var sin_theta = sqrt(1.0 - cos_theta * cos_theta);

            var cannot_refract = index_refraction * sin_theta > 1.0;

            if (cannot_refract || reflectance(cos_theta, index_refraction) > r) {
                ray.direction = reflect(ray.direction, hit.normal);
            } else {
                ray.direction = refract(ray.direction, hit.normal, index_refraction);
            }
        }
        ray.origin = ray.origin + step + ray.direction * 0.00001;

        length = 10.0;
    }
}