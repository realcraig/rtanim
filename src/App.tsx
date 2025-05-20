import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader, OrbitControls, TransformControls } from 'three-stdlib'
import './App.css'
import { CCDIKSolver } from 'three/addons/animation/CCDIKSolver.js';

let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let controls: OrbitControls;
let modelLoaded = false;

let ccdik: CCDIKSolver;

// Define a discriminated union for joint constraints
type JointConstraint = { 
    limitation : THREE.Vector3; 
    rotationMin: THREE.Vector3;
    rotationMax: THREE.Vector3;
};

function createTarget(bone: THREE.Bone, parent: THREE.Object3D) {
    const gizmo = new TransformControls(camera, renderer.domElement);
    const targetBone = new THREE.Bone();

    const worldPosition = new THREE.Vector3();
    bone.getWorldPosition(worldPosition);
    // Convert world position to model's local coordinates
    parent.worldToLocal(worldPosition);
    targetBone.position.copy(worldPosition);

    // Add to model graph before attaching
    parent.add(targetBone);

    gizmo.setSize(0.5);
    gizmo.attach(targetBone);

    scene.add(gizmo);

    gizmo.addEventListener('mouseDown', () => controls.enabled = false);
    gizmo.addEventListener('mouseUp', () => controls.enabled = true);

    return targetBone;
}

function buildChain(
    skeleton: THREE.Skeleton,
    boneNames: string[],
    targetName: string,
    parent: THREE.Object3D,
    constraints?: JointConstraint[]
) {
    const idx = boneNames.map(n => skeleton.bones.findIndex(b => b.name.endsWith(n)));
    const links = idx.slice(0, -1).reverse().map((i, j) => {
    const constraint = constraints && constraints[j] ? constraints[j] : { limitation: undefined, rotationMin: undefined, rotationMax: undefined };
        return {
            index: i,
            limitation: constraint.limitation,
            rotationMin: constraint.rotationMin,
            rotationMax: constraint.rotationMax
        };            
    });
    const target = createTarget(skeleton.bones[idx[idx.length - 1]!], parent);
    target.name = targetName;
    skeleton.bones.push(target);
    return { target: skeleton.bones.length - 1, effector: idx[idx.length - 1]!, links };
}

function setupCCDSolverIK(model: THREE.Object3D) {
    const skinnedMesh = model.getObjectByName('mesh') as THREE.SkinnedMesh;
    if (!skinnedMesh) return;

    // Find bone indices in the skeleton
    const skeleton = skinnedMesh.skeleton;

    const hips = model.getObjectByName('mixamorigHips') as THREE.Bone;
    // 1. list every end–effector you care about    
    const chains = [
        buildChain(skeleton, ['Spine', 'Spine1', 'Spine2', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'], 'RightHandTarget', hips),
        buildChain(skeleton, ['Spine', 'Spine1', 'Spine2', 'LeftShoulder',  'LeftArm',  'LeftForeArm',  'LeftHand'],  'LeftHandTarget', hips),
        buildChain(skeleton, ['RightUpLeg','RightLeg','RightFoot','RightToeBase'], 'RightFootTarget', hips),
        buildChain(skeleton, ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'],  'LeftFootTarget', hips),
        buildChain(skeleton, ['Spine2','Neck','Head'], 'HeadAimTarget', hips)
    ];
  
    skinnedMesh.bind(skeleton);

    ccdik = new CCDIKSolver(skinnedMesh, chains);
}

function App() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const currentMount = mountRef.current
    if (!currentMount) return

    // Scene setup
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(
      75,
      currentMount.clientWidth / currentMount.clientHeight,
      0.1,
      1000
    )
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight)
    currentMount.appendChild(renderer.domElement)

    // Orbit Controls
    controls = new OrbitControls(camera, renderer.domElement)
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
        if (modelLoaded) return;
        modelLoaded = true;
        model = gltf.scene
        setupCCDSolverIK(model);
        
        // Center the model horizontally and place feet at y=0
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        model.position.x -= center.x
        model.position.z -= center.z
        model.position.y -= box.min.y // move feet to y=0
        console.log("loaded model")
        scene.add(model)

        // Show skeleton
        const skeletonHelper = new THREE.SkeletonHelper(model);
        (skeletonHelper.material as THREE.LineBasicMaterial).linewidth = 2;
        scene.add(skeletonHelper);

        // Adjust controls and camera to look at the vertical center
        const verticalCenter = size.y / 2
        controls.target.set(0, verticalCenter, 0)
        controls.update()
        camera.lookAt(0, verticalCenter, 0)
      
    }, undefined, (error) => {
        console.error('Error loading GLB:', error)
    })

    camera.position.set(0, 1.5, 2.2)
    camera.lookAt(0, 0, 0)

    // Animation loop
    const animate = () => {
        if (model) {
            ccdik?.update();
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
