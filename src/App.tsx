import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader, OrbitControls } from 'three-stdlib'
import './App.css'
import boneMap from '../bone_map.json'

// Returns the pose (position, rotation, scale) of a bone by name from the model
function getBonePose(boneName: string, model: THREE.Object3D) {
  let foundBone: THREE.Object3D | null = null;
  model.traverse((obj) => {
    if (obj.type === 'Bone' && obj.name === boneName) {
      foundBone = obj;
    }
  });
  if (!foundBone) return null;
  // Type guard for Bone
  if (
    'position' in foundBone &&
    'rotation' in foundBone &&
    'scale' in foundBone &&
    typeof (foundBone as THREE.Object3D).name === 'string'
  ) {
    return {
      name: (foundBone as THREE.Object3D).name,
      position: (foundBone as THREE.Object3D).position.clone(),
      rotation: (foundBone as THREE.Object3D).rotation.clone(),
      scale: (foundBone as THREE.Object3D).scale.clone(),
    };
  }
  return null;
}

// Walks the skeleton and prints the pose of each bone using getBonePose
function printAllBonePoses(model: THREE.Object3D) {
  model.traverse((obj) => {
    if (obj.type === 'Bone') {
      const pose = getBonePose(obj.name, model);
      if (pose) {
        console.log(
          `Bone: ${pose.name}\n  Position: ${pose.position.x.toFixed(3)}, ${pose.position.y.toFixed(3)}, ${pose.position.z.toFixed(3)}\n  Rotation: ${pose.rotation.x.toFixed(3)}, ${pose.rotation.y.toFixed(3)}, ${pose.rotation.z.toFixed(3)}\n  Scale: ${pose.scale.x.toFixed(3)}, ${pose.scale.y.toFixed(3)}, ${pose.scale.z.toFixed(3)}`
        );
      }
    }
  });
}

// Sets the rotation (THREE.Euler) of a bone by name in the model
function setBoneRotation(boneName: string, rotation: THREE.Euler, model: THREE.Object3D) {
  model.traverse((obj) => {
    if (obj.type === 'Bone' && obj.name === boneName) {
      (obj as THREE.Bone).rotation.copy(rotation)
    }
  })
}

// Sets the position (THREE.Vector3) of a bone by name in the model
function setBonePosition(boneName: string, position: THREE.Vector3, model: THREE.Object3D) {
  model.traverse((obj) => {
    if (obj.type === 'Bone' && obj.name === boneName) {
      (obj as THREE.Bone).position.copy(position)
    }
  })
}

function getMappedBoneName(name: string): string {
  // Try to map using boneMap, fallback to original name
  return (boneMap as Record<string, string>)[name] || name;
}

function App() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const currentMount = mountRef.current
    if (!currentMount) return

    // Scene setup
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      75,
      currentMount.clientWidth / currentMount.clientHeight,
      0.1,
      1000
    )
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight)
    currentMount.appendChild(renderer.domElement)

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.target.set(0, 1, 0)
    controls.update()

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1)
    scene.add(ambientLight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(5, 10, 7.5)
    scene.add(directionalLight)

    // Load zombie.glb
    const loader = new GLTFLoader()
    let model: THREE.Object3D | null = null;
    loader.load('/zombie.glb', (gltf) => {
      model = gltf.scene
      // Center the model horizontally and place feet at y=0
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      model.position.x -= center.x
      model.position.z -= center.z
      model.position.y -= box.min.y // move feet to y=0
      scene.add(model)

      // Adjust controls and camera to look at the vertical center
      const verticalCenter = size.y / 2
      controls.target.set(0, verticalCenter, 0)
      controls.update()
      camera.lookAt(0, verticalCenter, 0)

      // Print all bone poses
      printAllBonePoses(model)
    }, undefined, (error) => {
      console.error('Error loading GLB:', error)
    })

    camera.position.set(0, 1.5, 2.2)
    camera.lookAt(0, 0, 0)

    // Animation loop
    const animate = (time?: number) => {
      if (model) {
        // Animate arms (shoulder bones) up and down
        const t = (time ?? 0) * 0.002;
        const angle = -Math.PI/2 + Math.sin(t) * 0.7; // radians, swing amplitude
        // Use bone map for names, fallback to original
        setBoneRotation(getMappedBoneName('left shoulder'), new THREE.Euler(0, 0, angle), model);
        setBoneRotation(getMappedBoneName('right shoulder'), new THREE.Euler(0, 0, -angle), model);
      }
      controls.update()
      renderer.render(scene, camera)
      requestAnimationFrame(animate)
    }
    animate()

    // Cleanup
    return () => {
      controls.dispose()
      renderer.dispose()
      currentMount.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div
      ref={mountRef}
      style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}
    />
  )
}

export default App
