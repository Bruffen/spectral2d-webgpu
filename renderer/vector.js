export class Vector2 {
    x;
    y;

    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    divide(divisor) {
        return new Vector2(this.x / divisor, this.y / divisor);
    }

    normalize() {
        return this.divide(this.length());
    }
}

export class Vector3 {
    x;
    y;
    z;

    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}