import * as THREE from 'three';

// the light of a small product studio: a large overhead softbox on the key side, a
// dimmer fill opposite, a narrow rim strip behind, in a warm grey room. Built from
// emissive panels and captured once as a cube map, so it costs no download. Glossy
// plastic shows these panels as its reflections, which is most of what makes it
// read as plastic
// ********************************************************************************
// == Constants ===================================================================
const CUBE_SIZE = 256/*px per face*/;
const ROOM = 40/*units across*/;

// == Types =======================================================================
export type Studio = Readonly<{
  /** prefiltered for the rasterizer's glossy reflections */
  environment: THREE.Texture;
  /** the raw capture, which the path tracer samples */
  cube: THREE.CubeTexture;
}>;

// == Studio ======================================================================
/** captures the studio lit from `key` (the direction toward the key softbox) */
export const createStudio = (renderer: THREE.WebGLRenderer, key: THREE.Vector3): Studio => {
  const room = new THREE.Scene();

  // the room: warm grey walls, darker floor
  const walls = new THREE.Mesh(new THREE.BoxGeometry(ROOM, ROOM, ROOM), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.095, 0.09), side: THREE.BackSide }));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM, ROOM), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.047, 0.044) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -ROOM / 2 + 0.01;
  room.add(walls, floor);

  // the panels, each facing the subject at the origin
  const direction = key.clone().normalize();
  const fill = new THREE.Vector3(-direction.x, 0.35, -direction.z).normalize();
  const rim = new THREE.Vector3(direction.z, 0.55, -direction.x).normalize();
  room.add(
    panel(direction, 10, 7, 3.2/*key*/),
    panel(fill, 10, 6, 0.9/*fill*/),
    panel(rim, 2, 10, 2.6/*rim strip*/),
    panel(new THREE.Vector3(0, 1, 0), 7, 7, 1.0/*top bounce*/),
  );

  const target = new THREE.WebGLCubeRenderTarget(CUBE_SIZE, { type: THREE.HalfFloatType, generateMipmaps: false });
  new THREE.CubeCamera(0.1, ROOM, target).update(renderer, room);
  room.traverse(object => { const mesh = object as THREE.Mesh; if(mesh.isMesh) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); } });

  const prefilter = new THREE.PMREMGenerator(renderer);
  const environment = prefilter.fromCubemap(target.texture).texture;
  prefilter.dispose();
  return { environment, cube: target.texture };
};

/** an emissive rectangle at distance in `direction`, facing the origin */
const panel = (direction: THREE.Vector3, width: number, height: number, intensity: number): THREE.Mesh => {
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.985, 0.96).multiplyScalar(intensity), side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.copy(direction).multiplyScalar(ROOM * 0.42);
  mesh.lookAt(0, 0, 0);
  return mesh;
};
