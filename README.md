# spectral2d-webgpu

### TODO
- ~~Create a main class;~~
- ~~Simplify variable names in their own class;~~
- ~~Make light uniform work;~~
- Make common screen quad vertex shader;
- Do bounds collision;
- ~~Do sphere intersection;~~
- Do triangle intersection;
- Make mouse click interaction:
  - ~~Light click to position;~~
  - Light drag position;
  - Light point in direction of mouse drag.
- ~~Implement other types of lights.~~

### Ideas
- In order to avoid requiring float32-filterable, try using a compute shader;
- Perhaps render a line-list for each set of rays of ray depth size

### Bugs
- ~~Sphere intersection has weird results when light position is inside of sphere;~~
- Reset seems to be happening twice;