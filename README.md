# spectral2d-webgpu

## TODO

- ~~Create a main class;~~
- ~~Simplify variable names in their own class;~~
- ~~Make light uniform work;~~
- ~~Do bounds collision~~;
- ~~Do sphere intersection;~~
- ~~Do prism intersection;~~
- ~~Make mouse click interaction:~~
  - ~~Light click to position;~~
  - ~~Light drag position;~~
  - ~~Light point in direction of mouse drag.~~
- ~~Implement other types of lights;~~
- Make objects in scene easier to iterate;
- ~~Implement full spectrum of light;~~
- Implement materials:
  - ~~Glass;~~
  - ~~Rough glass;~~
  - ~~Lambertian diffuse;~~
  - Metal;
  - ~~Mirror.~~
- Send inverse aspect ratio to render shader;
- Change intersect_triangle to return an array of lines of any object;
- Implement light colors besides white;
- Implement transient rendering;
- Constant for PI;
- UI - inputable rays per frame, max rays
- UI - choose material roughness
- Introduce a world scale variable

## Bugs

- ~~Sphere intersection has weird results when light position is inside of sphere;~~
- ~~GUI callback happens twice;~~
- ~~Need to divide energy by pdf?~~
- ~~If alpha is over one, it will be opaque instead of blending;~~
- If light intensity is multiplied after rgb conversion, some colors will disappear. Is this really how our eyes perceive light?
- ~~Mobile devices have anti-aliasing already; (it's just bad line rasterization)~~

## Ideas

- ~~In order to avoid requiring float32-filterable, try using a compute shader;~~
- Perhaps render a line-strip for each set of rays of ray depth size
- Trace rays compute shader would be more efficient if the rays are grouped on threads based on their initial direction. This is easily done by making the first set of random numbers go from 0 to 1 in a sorted manner. This would allow for coherence/less branching since rays are much more likely to perform the same instructions as their neighbours.
- Jittering rays could improve aliasing;
