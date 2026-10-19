// Procedural sticker finish: no textures, lights, extra geometry or postprocessing.
// Instance colors arrive in linear space; convert to the renderer's output space once.
export function createCube3dStickerMaterial(THREE) {
  return new THREE.ShaderMaterial({
    name: 'Cube sticker satin',
    side: THREE.DoubleSide,
    toneMapped: false,
    alphaToCoverage: true,
    vertexShader: /* glsl */ `
      varying vec2 stickerUv;
      varying vec3 stickerColor;
      varying float stickerLight;
      void main() {
        stickerUv = uv;
        stickerColor = instanceColor;
        // Instances only rotate and translate, so their normal transform is rigid.
        vec3 faceNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vec3 lightDirection = normalize(vec3(-0.35, 0.65, 1.0));
        stickerLight = 0.76 + 0.24 * max(dot(faceNormal, lightDirection), 0.0);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 stickerUv;
      varying vec3 stickerColor;
      varying float stickerLight;
      void main() {
        vec2 p = stickerUv - 0.5;
        // Rounded rectangle signed distance in sticker UV space.
        const float radius = 0.065;
        vec2 q = abs(p) - vec2(0.495 - radius);
        float distanceToEdge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
        float pixelWidth = max(fwidth(distanceToEdge), 0.0001);
        float coverage = 1.0 - smoothstep(-pixelWidth * 0.5, pixelWidth * 0.5, distanceToEdge);
        if (coverage <= 0.0) discard;
        float rim = smoothstep(-0.035, -0.003, distanceToEdge);
        float bevelLight = clamp((p.y - p.x) * 1.4, -0.65, 0.65);
        float finish = stickerLight * (1.0 - 0.10 * rim + 0.12 * rim * bevelLight);
        // A restrained satin sheen preserves white/yellow and red/orange contrast.
        float sheen = 0.018 * smoothstep(-0.5, 0.5, p.y - p.x);
        gl_FragColor = vec4(stickerColor * finish + vec3(sheen), coverage);
        #include <colorspace_fragment>
      }
    `,
  });
}
