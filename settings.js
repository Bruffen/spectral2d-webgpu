export class Settings {
    constructor(width, height) {
        this.width  = width;
        this.height = height;
        
        this.resolution = [width, height];
        this.highPrecisionFormat = 'rgba32float';
        this.lowPrecisionFormat  = 'rgba16float';
    }
}