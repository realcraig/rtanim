import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader, OrbitControls, TransformControls } from 'three-stdlib'
import './App.css'
import { CCDIKSolver } from 'three/addons/animation/CCDIKSolver.js';

const t = new THREE.Vector3();
const q = new THREE.Quaternion();
const p = new THREE.Plane();
const FORWARD = new THREE.Vector3(0,0,1);
let RESETQUAT = new THREE.Quaternion();

let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let gizmos: TransformControls[] = [];
let controls: OrbitControls;
let modelLoaded = false;

const config = {
    showAxes: true,
    showBones: true,
    wireframe: true,
    color: '#ff0077',
    constraintType: 'ball',
    constraintAngle: 180
};

let ccdik: CCDIKSolver;

// Define a discriminated union for joint constraints
type JointConstraint = { 
    limitation : THREE.Vector3; 
    rotationMin: THREE.Vector3;
    rotationMax: THREE.Vector3;
};

function setZForward(rootBone) {
    let worldPos = {};
    getOriginalWorldPositions(rootBone, worldPos);
    updateTransformations(rootBone, worldPos);
}
  
function updateTransformations(parentBone, worldPos) {
  
    let averagedDir = new THREE.Vector3();
    parentBone.children.forEach((childBone) => {
        //average the child bone world pos
        let childBonePosWorld = worldPos[childBone.id];
        averagedDir.add(childBonePosWorld);
    });

    averagedDir.multiplyScalar(1/(parentBone.children.length));

    //set quaternion
    parentBone.quaternion.copy(RESETQUAT);
    parentBone.updateMatrixWorld();
    //get the child bone position in local coordinates
    let childBoneDir = parentBone.worldToLocal(averagedDir).normalize();
    //set the direction to child bone to the forward direction
    let quat = getAlignmentQuaternion(FORWARD, childBoneDir);
    if (quat) {
    //rotate parent bone towards child bone
    parentBone.quaternion.premultiply(quat);
    parentBone.updateMatrixWorld();
    //set child bone position relative to the new parent matrix.
    parentBone.children.forEach((childBone) => {
        let childBonePosWorld = worldPos[childBone.id].clone();
        parentBone.worldToLocal(childBonePosWorld);
        childBone.position.copy(childBonePosWorld);
    });
    }

    parentBone.children.forEach((childBone) => {
    updateTransformations(childBone, worldPos);
    })
}
  
function getAlignmentQuaternion(fromDir, toDir) {
    const adjustAxis = t.crossVectors(fromDir, toDir).normalize();
    const adjustAngle = fromDir.angleTo(toDir);
    if (adjustAngle) {
      const adjustQuat = q.setFromAxisAngle(adjustAxis, adjustAngle);
      return adjustQuat;
    }
    return null;
}
  
function getOriginalWorldPositions(rootBone, worldPos) {
    rootBone.children.forEach((child) => {
      let childWorldPos = child.getWorldPosition(new THREE.Vector3());
      worldPos[child.id] = childWorldPos;
      getOriginalWorldPositions(child, worldPos);
    })
}

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
    gizmos.push(gizmo);

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
  
    setZForward(model.getObjectByName('mixamorigHips') as THREE.Bone);
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
    const animate = (time?: number) => {
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
