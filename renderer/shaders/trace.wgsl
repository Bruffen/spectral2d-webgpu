struct Light {
    t         : u32,
    power     : f32,
    position  : vec2f,
    direction : vec2f,
};

struct RandomInitials {
    direction : f32,
    wavelength: f32,
};

struct Ray {
    origin    : vec2f,
    direction : vec2f,
    wavelength: f32,
    energy    : f32,
};

struct RayHit {
    t         : f32,
    material  : u32,
    normal    : vec2f,
};

struct Object {
    center    : vec2f,
    normal    : vec2f,
    size      : f32,
}

@group(0) @binding(0) var<storage, read_write> positions: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> colors:    array<vec4f>;
@group(0) @binding(2) var<storage, read>       random_initials: array<RandomInitials>;
@group(0) @binding(3) var<storage, read>       random_scatters: array<f32>;
@group(0) @binding(4) var<storage, read>       cie_table: array<f32>;
@group(0) @binding(5) var<uniform> rayAmount:  i32;
@group(0) @binding(6) var<uniform> rayDepth:   i32;
@group(0) @binding(7) var<uniform> light: Light;
@group(0) @binding(8) var<uniform> sceneId:    u32;
@group(0) @binding(9) var<uniform> sceneWalls: u32;
//@group(0) @binding(10) var<uniform> sceneScale: f32;

// Fix undefined behaviour of sqrt of negative zero/value for mobile
fn sqrt_positive(value : f32) -> f32 {
    return sqrt(max(0.0, value));
}

fn cie_to_rgb(wavelength : f32) -> vec3f {
    let w = min(max(wavelength, 390.0), 830.0);
    let i = i32((floor(w) - 390));

    let X = cie_table[i * 3 + 0];
    let Y = cie_table[i * 3 + 1];
    let Z = cie_table[i * 3 + 2];
    let XYZ = vec3f(X, Y, Z);

    let matrixXYZtoRGB = mat3x3f( 
        3.2404542, -0.9692660, 0.0556434, 
        -1.5371385, 1.8760108,-0.2040259,
        -0.4985314, 0.0415560, 1.0572252
    );

    var rgb = matrixXYZtoRGB * XYZ;
    rgb.r = min(max(0.0, rgb.r), 1.0);
    rgb.g = min(max(0.0, rgb.g), 1.0);
    rgb.b = min(max(0.0, rgb.b), 1.0);

    return rgb;
}

//-------------------------------------------------------------------------------------------------
// Intersections
//-------------------------------------------------------------------------------------------------

fn intersect_line(ray : Ray, center : vec2f, normal : vec2f, m : u32) -> RayHit {
    var hit : RayHit;

    var denom = dot(-normal, ray.direction);
    if (abs(denom) > 0.00001) {
        var co = center - ray.origin;
        hit.t = dot(co, -normal) / denom;
    }

    hit.material = m;
    hit.normal = normal;
    return hit;
}

fn intersect_bounded_line(ray : Ray, center : vec2f, normal : vec2f, size : f32, m : u32) -> RayHit {
    var hit = intersect_line(ray, center, normal, m);

    var distance = (ray.origin + ray.direction * hit.t) - center;
    var dsquared = distance.x * distance.x + distance.y * distance.y; 

    if (dsquared > size * size) {
        hit.t = -1.0;
    }

    return hit;
}

fn intersect_circle(ray : Ray, center : vec2f, radius : f32, material : u32) -> RayHit {    
    var hit : RayHit;

    var oc = ray.origin - center;
    // a is already normalized therefore length is 1
    //var a = direction.x * direction.x + direction.y * direction.y; 
    var h = dot(oc, ray.direction);
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
    var position = ray.origin + ray.direction * hit.t;
    hit.normal = (position - center) / radius;
    hit.material = material;

    return hit;
}

// Points need to be passed clockwise
fn intersect_triangle(ray : Ray, points : array<vec2f, 3>, material : u32) -> RayHit {
    var hit : RayHit;
    var tmp : RayHit;
    hit.t = 100000.0;
    tmp.t = -1.0;

    let centres = array<vec2f, 3>(
        (points[0] + points[1]) * 0.5,
        (points[1] + points[2]) * 0.5,
        (points[2] + points[0]) * 0.5,
    );

    let l1 = points[0] - points[1];
    let l2 = points[1] - points[2];
    let l3 = points[2] - points[0];
    let sizes = array<f32, 3>(
        length(l1) * 0.5,
        length(l2) * 0.5,
        length(l3) * 0.5,
    );

    let p1 = normalize(l1);
    let p2 = normalize(l2);
    let p3 = normalize(l3);
    let normals = array<vec2f, 3>(
        vec2f(p1.y, -p1.x),
        vec2f(p2.y, -p2.x),
        vec2f(p3.y, -p3.x),
    );

    for (var i = 0; i < 3; i++) {
        tmp = intersect_bounded_line(ray, centres[i], normals[i], sizes[i], material);
        if (tmp.t > 0.0 && tmp.t < hit.t) {
            hit = tmp;
        }
    }

    return hit;
}

fn intersect_polygon(ray : Ray, position : vec2f, size : vec2f, points_count : i32, material : u32) -> RayHit {
    var hit : RayHit;
    var tmp : RayHit;
    hit.t = 100000.0;
    tmp.t = -1.0;

    let M_PI = 3.1415926535897932384626433832795;
    
    var points  = array<vec2f, 20>();
    var centres = array<vec2f, 20>();
    var sizes   = array<f32,   20>();
    var normals = array<vec2f, 20>();

    let angle_increment = 1.0 / f32(points_count) * -2.0 * M_PI;
    let angle_start = M_PI * 0.5;
    for (var i = 0; i < points_count; i++) {
        let angle = angle_start + f32(i) * angle_increment;
        var pos = vec2f(cos(angle), sin(angle)) * size; //select(size, size * 0.4, i % 2 == 0);
        points[i] = pos + position;
    }

    for (var i = 0; i < points_count; i++) {
        centres[i] = (points[i] + points[(i+1) % points_count]) * 0.5;
        
        let l = points[i] - points[(i+1) % points_count];
        sizes[i] = length(l) * 0.5;

        let p = normalize(l);
        normals[i] = vec2f(p.y, -p.x);
    }

    for (var i = 0; i < points_count; i++) {
        tmp = intersect_bounded_line(ray, centres[i], normals[i], sizes[i], material);
        if (tmp.t > 0.0 && tmp.t < hit.t) {
            hit = tmp;
        }
    }

    return hit;
}

//-------------------------------------------------------------------------------------------------
// Materials
//-------------------------------------------------------------------------------------------------

fn reflectance(cosine : f32, refraction_index : f32) -> f32 {
    // Use Schlick's approximation for reflectance.
    var r0 = (1.0 - refraction_index) / (1.0 + refraction_index);
    r0 = r0 * r0;
    return r0 + (1.0 - r0) * pow((1.0 - cosine), 5.0);
}

// Cauchy's transmission equation, which is a simple approximation
fn cauchy_ior(wavelength : f32, a : f32, b : f32) -> f32 {
    // scale it so the effect is noticeable in our coordinate space
    let scale = 10000.0;

    return a + (b / (wavelength * wavelength / 1000.0)) * scale;
}

fn check_for_backface(direction : vec2f, normal : vec2f) -> bool {
    return dot(direction, normal) > 0.0;
}

fn material_glass(ray : Ray, hit : RayHit, random : f32, cauchy_a : f32, cauchy_b : f32) -> vec2f {
    var scattered : vec2f;
    
    var index_refraction = cauchy_ior(ray.wavelength, cauchy_a, cauchy_b);
    let backface = check_for_backface(ray.direction, hit.normal);
    var normal = hit.normal;

    if (backface) {
        normal = -normal;
    } else {
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

// TODO review
fn material_glass_rough(ray : Ray, hit : RayHit, random : f32, cauchy_a : f32, cauchy_b : f32) -> vec2f {
    var scattered = material_glass(ray, hit, random, cauchy_a, cauchy_b);

    let M_PI = 3.1415926535897932384626433832795;
    let angle = random * M_PI;
    var direction = vec2f(cos(angle), sin(angle));
    // Matrix to transform random [0, pi] direction into the object's tangent spance
    var transform = mat2x2f(scattered.y, -scattered.x, scattered.x, scattered.y);

    return normalize(scattered + transform * direction * 0.03);
}

fn material_lambert(ray : Ray, hit : RayHit, random : f32) -> vec2f {
    var scattered : vec2f;

    let M_PI = 3.1415926535897932384626433832795;
    let sin_theta = 2.0 * random - 1.0;
    let cos_theta = sqrt(1.0 - sin_theta * sin_theta);
    var direction = vec2f(sin_theta, cos_theta);

    var normal = hit.normal;
    if (check_for_backface(ray.direction, normal)) {
        normal = -normal;
    }

    // Matrix to transform random [0, pi] direction into the object's tangent spance
    var transform = mat2x2f(normal.y, -normal.x, normal.x, normal.y);

    scattered = transform * direction;
    return scattered;
}

fn material_mirror(ray : Ray, hit : RayHit) -> vec2f {
    return reflect(ray.direction, hit.normal);
}

fn scatter(ray : ptr<function, Ray>, hit : RayHit, random : f32) -> vec2f {
    var scattered : vec2f;

    switch hit.material {
        case 0: {
            let a = 1.522;
            let b = 0.00459;
            scattered = material_glass(*ray, hit, random, a, b);
        }
        case 1, default: {
            scattered = material_lambert(*ray, hit, random);
            (*ray).energy *= 0.5; // pdf
        }
        case 2: {
            scattered = material_mirror(*ray, hit);
        }
        case 3: {
            let a = 1.522;
            let b = 0.00459;
            scattered = material_glass_rough(*ray, hit, random, a, b);
        }
        case 4: {
            let a = 2.378;
            let b = 0.00801;
            scattered = material_glass_rough(*ray, hit, random, a, b);
        }
    }

    return scattered;
}

//-------------------------------------------------------------------------------------------------
// Scenes
//-------------------------------------------------------------------------------------------------

fn scene0(ray : Ray) -> RayHit {
    var hit : RayHit;
    var tmp : RayHit;
    hit.t = 100000.0;
    tmp.t = -1.0;

    if (sceneWalls == 1) {
        let lines = array<vec4f, 4>(
            vec4f(0.0, 1.0, 0.0, -1.0),
            vec4f(0.0, -1.0, 0.0, 1.0),
            vec4f(1.5, 0.0, -1.0, 0.0),
            vec4f(-1.5, 0.0, 1.0, 0.0),
        );

        for (var i = 0; i < 4; i++) {
            tmp = intersect_line(ray, lines[i].xy, lines[i].zw, 1);
            if (tmp.t > 0.0 && tmp.t < hit.t) {
                hit = tmp;
            }
        }
    }

    let bounded_lines = array<vec4f, 1>(
        vec4f(-0.8, -0.7, normalize(vec2f(2.0, 1.0))),
    );

    for (var i = 0; i < 1; i++) {
        tmp = intersect_bounded_line(ray, bounded_lines[i].xy, bounded_lines[i].zw, 0.3, 2);
        if (tmp.t > 0.0 && tmp.t < hit.t) {
            hit = tmp;
        }
    }

    let prism = array<vec2f, 3>(
        vec2f(-0.35, -0.2),
        vec2f( 0.0,  0.4), 
        vec2f( 0.35, -0.2),
    );

    for (var i = 0; i < 1; i++) {
        tmp = intersect_triangle(ray, prism, 3);
        if (tmp.t > 0.0 && tmp.t < hit.t) {
            hit = tmp;
        }
    }

    let spheres = array<vec3f, 2>(
        vec3f(0.6, 0.1, 0.2), 
        vec3f(0.2, -0.7, 0.1), 
    );

    for (var i = 0; i < 2; i++) {
        tmp = intersect_circle(ray, spheres[i].xy, spheres[i].z, 0);
        if (tmp.t > 0.0 && tmp.t < hit.t) {
            hit = tmp;
        }
    }

    return hit;
}

fn scene1(ray : Ray) -> RayHit {
    var hit : RayHit;
    var tmp : RayHit;
    hit.t = 100000.0;
    tmp.t = -1.0;

    if (sceneWalls == 1) {
        let lines = array<vec4f, 4>(
            vec4f(0.0, 1.0, 0.0, -1.0),
            vec4f(0.0, -1.0, 0.0, 1.0),
            vec4f(1.5, 0.0, -1.0, 0.0),
            vec4f(-1.5, 0.0, 1.0, 0.0),
        );

        for (var i = 0; i < 4; i++) {
            tmp = intersect_line(ray, lines[i].xy, lines[i].zw, 1);
            if (tmp.t > 0.0 && tmp.t < hit.t) {
                hit = tmp;
            }
        }
    }

    tmp = intersect_polygon(ray, vec2f(0.0, -0.2), vec2f(0.65, 0.65), 3, 3);
    if (tmp.t > 0.0 && tmp.t < hit.t) {
        hit = tmp;
    }

    return hit;
}

fn scene2(ray : Ray) -> RayHit {
    var hit : RayHit;
    var tmp : RayHit;
    hit.t = 100000.0;
    tmp.t = -1.0;

    if (sceneWalls == 1) {
        let lines = array<vec4f, 4>(
            vec4f(0.0, 1.0, 0.0, -1.0),
            vec4f(0.0, -1.0, 0.0, 1.0),
            vec4f(1.5, 0.0, -1.0, 0.0),
            vec4f(-1.5, 0.0, 1.0, 0.0),
        );

        for (var i = 0; i < 4; i++) {
            tmp = intersect_line(ray, lines[i].xy, lines[i].zw, 1);
            if (tmp.t > 0.0 && tmp.t < hit.t) {
                hit = tmp;
            }
        }
    }

    let bounded_lines = array<vec4f, 2>(
        vec4f(0.65, -0.75, normalize(vec2f(-0.270848, 0.962621))),
        vec4f(1.35, 0.65, normalize(vec2f(0.733721, 0.7945))),
    );

    for (var i = 0; i < 2; i++) {
        tmp = intersect_bounded_line(ray, bounded_lines[i].xy, bounded_lines[i].zw, 0.3, 2);
        if (tmp.t > 0.0 && tmp.t < hit.t) {
            hit = tmp;
        }
    }

    let spheres = array<vec3f, 3>(
        vec3f(-0.95,   0.25,    0.48), 
        vec3f(-0.15,  -0.25,    0.21), 
        vec3f(1.11667, 0.18333, 0.2), 
    );

    for (var i = 0; i < 3; i++) {
        tmp = intersect_circle(ray, spheres[i].xy, spheres[i].z, 0);
        if (tmp.t > 0.0 && tmp.t < hit.t) {
            hit = tmp;
        }
    }

    return hit;
}

fn scene3(ray : Ray) -> RayHit {
    var hit : RayHit;
    var tmp : RayHit;
    hit.t = 100000.0;
    tmp.t = -1.0;

    if (sceneWalls == 1) {
        let lines = array<vec4f, 4>(
            vec4f(0.0, 1.0, 0.0, -1.0),
            vec4f(0.0, -1.0, 0.0, 1.0),
            vec4f(1.5, 0.0, -1.0, 0.0),
            vec4f(-1.5, 0.0, 1.0, 0.0),
        );

        for (var i = 0; i < 4; i++) {
            tmp = intersect_line(ray, lines[i].xy, lines[i].zw, 1);
            if (tmp.t > 0.0 && tmp.t < hit.t) {
                hit = tmp;
            }
        }
    }

    tmp = intersect_line(ray,  vec2f(0.0, -0.5), vec2f(0.0, 1.0), 1);
    if (tmp.t > 0.0 && tmp.t < hit.t) {
        hit = tmp;
    }
    
    return hit;
}

fn scene4(ray : Ray) -> RayHit {
    var hit : RayHit;
    var tmp : RayHit;
    hit.t = 100000.0;
    tmp.t = -1.0;

    if (sceneWalls == 1) {
        let lines = array<vec4f, 4>(
            vec4f(0.0, 1.0, 0.0, -1.0),
            vec4f(0.0, -1.0, 0.0, 1.0),
            vec4f(1.5, 0.0, -1.0, 0.0),
            vec4f(-1.5, 0.0, 1.0, 0.0),
        );

        for (var i = 0; i < 4; i++) {
            tmp = intersect_line(ray, lines[i].xy, lines[i].zw, 1);
            if (tmp.t > 0.0 && tmp.t < hit.t) {
                hit = tmp;
            }
        }
    }

    tmp = intersect_polygon(ray, vec2f(0.0, 0.0), vec2f(0.2, 0.3), 20, 4);
    if (tmp.t > 0.0 && tmp.t < hit.t) {
        hit = tmp;
    }
    
    return hit;
}

fn scene5(ray : Ray) -> RayHit {
    var hit : RayHit;
    var tmp : RayHit;
    hit.t = 100000.0;
    tmp.t = -1.0;

    if (sceneWalls == 1) {
        let lines = array<vec4f, 4>(
            vec4f(0.0, 1.0, 0.0, -1.0),
            vec4f(0.0, -1.0, 0.0, 1.0),
            vec4f(1.5, 0.0, -1.0, 0.0),
            vec4f(-1.5, 0.0, 1.0, 0.0),
        );

        for (var i = 0; i < 4; i++) {
            tmp = intersect_line(ray, lines[i].xy, lines[i].zw, 1);
            if (tmp.t > 0.0 && tmp.t < hit.t) {
                hit = tmp;
            }
        }
    }

    let start_pos = vec2f(-0.9, -0.7);
    let add_pos   = vec2f(0.08, 0.08);
    for (var i = 0; i < 30; i++) {
        for (var j = 0; j < 20; j++) {
            let pos = start_pos + vec2f(add_pos.x * f32(i), add_pos.y * f32(j));
            let random_offset = vec2f(fract(pos.x * pos.y * 10.993483), fract(pos.x / pos.y * 123.14234)) * 0.02;
            tmp = intersect_circle(ray, pos + random_offset, 0.03, 3);
            if (tmp.t > 0.0 && tmp.t < hit.t) {
                hit = tmp;
            }
        }
    }
    
    return hit;
}

fn get_scene(ray : Ray) -> RayHit {
    switch sceneId {
        case 0, default: {
            return scene0(ray);
        }
        case 1: {
            return scene1(ray);
        }
        case 2: {
            return scene2(ray);
        }
        case 3: {
            return scene3(ray);
        }
        case 4: {
            return scene4(ray);
        }
        case 5: {
            return scene5(ray);
        }
    }
}

//-------------------------------------------------------------------------------------------------
// Generation
//-------------------------------------------------------------------------------------------------

fn generate_from_light(random : RandomInitials) -> Ray {
    var ray : Ray;

    let M_PI = 3.1415926535897932384626433832795;

    switch light.t {
        case 0, default: { // Point
            let angle = random.direction * M_PI * 2.0;
            ray.origin = light.position;
            ray.direction = vec2f(cos(angle), sin(angle));
        }
        case 1: { // Beam
            ray.direction = light.direction;
            var ortogonal = vec2f(ray.direction.y, -ray.direction.x);

            ray.origin = light.position + (random.direction * 2.0 - 1.0) * ortogonal * 0.2;
        }
        case 2: { // Laser
            ray.origin = light.position;
            ray.direction = light.direction;
        }
    }

    ray.wavelength = random.wavelength * 440.0 + 390.0;
    ray.energy = light.power;

    return ray;
}

@compute @workgroup_size(64) fn trace(@builtin(global_invocation_id) id: vec3u) {
    let i = i32(id.x);

    var length = 10.0;

    var ray = generate_from_light(random_initials[i]);
    let color = cie_to_rgb(ray.wavelength);

    for (var depth = 0; depth < rayDepth; depth++) {
        var hit = get_scene(ray);
        
        if (hit.t > 0.0) {
            length = hit.t;
        }
        var step = ray.direction * length;

        positions[i * 2 * rayDepth + 0 + depth * 2] = ray.origin; // correct for aspect ratio
        positions[i * 2 * rayDepth + 1 + depth * 2] = ray.origin + step;

        let anti_aliasing = sqrt(step.x*step.x + step.y*step.y) / max(abs(step.x), abs(step.y));
        let brightness = anti_aliasing * (1.0 / f32(rayAmount));
        colors[i * rayDepth + depth] = vec4f(color * ray.energy * brightness, 1.0);

        let r = random_scatters[i * rayDepth + depth];
        
        if (hit.t > 0.0) {
            ray.direction = scatter(&ray, hit, r);
        }
        ray.origin = ray.origin + step + ray.direction * 0.00005;

        length = 10.0;
    }
}