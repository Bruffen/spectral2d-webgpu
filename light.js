export const LightType = {
    POINT : 0,
    BEAM  : 1,
    LASER : 2,
}

export class Light {
    constructor(type, position, direction, power) {
        this.type = type;
        this.position = position;
        this.direction = direction.normalize();
        this.power = power;
    }
}