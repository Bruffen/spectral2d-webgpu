# spectral2d-webgpu

### TODO
- ~~Create a main class;~~
- ~~Simplify variable names in their own class;~~
- ~~Make light uniform work;~~
- Make common screen quad vertex shader;
- ~~Do bounds collision~~;
- ~~Do sphere intersection;~~
- Do triangle intersection;
- ~~Make mouse click interaction:~~
  - ~~Light click to position;~~
  - ~~Light drag position;~~
  - ~~Light point in direction of mouse drag.~~
- ~~Implement other types of lights;~~
- Make objects in scene easier to iterate;
- Implement full spectrum of light;
- Implement materials:
  - ~~Glass;~~
  - ~~Lambertian diffuse;~~
  - Metal;
  - Mirror.

### Bugs
- ~~Sphere intersection has weird results when light position is inside of sphere;~~
- GUI callback happens twice;
- Need to divide energy by pdf?

### Ideas
- In order to avoid requiring float32-filterable, try using a compute shader;
- Perhaps render a line-list for each set of rays of ray depth size
- Trace rays compute shader would be more efficient if the rays are grouped on threads based on their initial direction. This is easily done by making the first set of random numbers go from 0 to 1 in a sorted manner. This would allow for less branching since rays are much more likely to perform the same instructions as their neighbours.
- Jittering rays could improve aliasing;
