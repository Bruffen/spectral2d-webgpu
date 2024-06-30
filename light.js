const LightType = {
    POINT : 0
}

class Light {
    constructor(type, position, power) {
        this.type = type;
        this.position = position;
        this.power = power;
    }

    createRay() {
        switch(this.type) {
            case LightType.POINT:
                var angle = Math.random() * Math.PI * 2.0;
                var x = Math.cos(angle);
                var y = Math.sin(angle);
                return [x, y];
        }
    }
}