import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader, OrbitControls, TransformControls } from 'three-stdlib'
import './App.css'
import boneMap from '../bone_map.json'
import { CCDIKHelper, CCDIKSolver } from 'three/addons/animation/CCDIKSolver.js'
import { Pose, POSE_LANDMARKS } from '@mediapipe/pose'
import { Camera } from '@mediapipe/camera_utils'

const debug = false;

let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let controls: OrbitControls
let modelLoaded = false

const targetMap: Record<string, THREE.Object3D> = {}

let ccdik: CCDIKSolver;

// Define a discriminated union for joint constraints
type JointConstraint = { 
    limitation : THREE.Vector3; 
    rotationMin: THREE.Vector3;
    rotationMax: THREE.Vector3;
    enabled: boolean;
};

function createTarget(bone: THREE.Bone, parent: THREE.Object3D) {
  const gizmo = new TransformControls(camera, renderer.domElement)
  const targetBone = new THREE.Bone()

  const worldPosition = new THREE.Vector3()
  bone.getWorldPosition(worldPosition)
  parent.worldToLocal(worldPosition)
  targetBone.position.copy(worldPosition)

  parent.add(targetBone)
  gizmo.setSize(0.5)
  gizmo.attach(targetBone)
  scene.add(gizmo)

  gizmo.addEventListener("mouseDown", () => (controls.enabled = false))
  gizmo.addEventListener("mouseUp", () => (controls.enabled = true))
  return targetBone
}

function buildChain(
    skeleton: THREE.Skeleton,
    boneNames: string[],
    targetName: string,
    parent: THREE.Object3D,
    constraints?: {[key: string]: JointConstraint}
) {
    const idx = boneNames.map(n => skeleton.bones.findIndex(b => b.name.endsWith(n)));
    const links = idx.slice(0, -1).reverse().map((i) => {
        const boneName = skeleton.bones[i]?.name;

        const constraintKey = Object.keys(constraints || {}).find(key => boneName.endsWith(key));
        const constraint = constraintKey ? constraints![constraintKey] : { limitation: undefined, rotationMin: undefined, rotationMax: undefined, enabled: undefined };;
        
        if (constraint) {
            console.log(`${boneName} has constraint`)
            console.log(constraint)
        }

        return {
            index: i,
            limitation: constraint.limitation || undefined,
            rotationMin: constraint.rotationMin || undefined,
            rotationMax: constraint.rotationMax || undefined,
            enabled: constraint.enabled || undefined
        };            
    });
    const target = createTarget(skeleton.bones[idx[idx.length - 1]!], parent);
    target.name = targetName;
    targetMap[targetName] = target;
    skeleton.bones.push(target);
    return { target: skeleton.bones.length - 1, effector: idx[idx.length - 1]!, links };
}

function setupCCDSolverIK(model: THREE.Object3D) {
    const skinnedMesh = model.getObjectByName('mesh') as THREE.SkinnedMesh;
    if (!skinnedMesh) return;

    // Find bone indices in the skeleton
    const skeleton = skinnedMesh.skeleton;

    const hips = model.getObjectByName('mixamorigHips') as THREE.Bone;

    const constraints = {        
        "RightShoulder":{
            rotationMin: new THREE.Vector3(-Math.PI / 2, 0, 0),
            rotationMax: new THREE.Vector3(Math.PI / 4, Math.PI / 2, Math.PI * 0.9),
            enabled: true
        }, 
        "RightArm":{
            rotationMin: new THREE.Vector3(0, 0, 0),
            rotationMax: new THREE.Vector3(0, 0, 0),
            enabled: true
        }, 
        "RightForeArm":{
            rotationMin: new THREE.Vector3(-Math.PI / 4, -Math.PI / 2, -Math.PI * 0.8),
            rotationMax: new THREE.Vector3(Math.PI / 4, Math.PI / 2, Math.PI / 32),
            enabled: true
        }, 
        "LeftShoulder":{
            rotationMin: new THREE.Vector3(-Math.PI / 4, -Math.PI / 2, -Math.PI * 0.9),
            rotationMax: new THREE.Vector3(Math.PI / 2, 0, 0),
            enabled: true
        }, 
        "LeftArm":{
            rotationMin: new THREE.Vector3(0, 0, 0),
            rotationMax: new THREE.Vector3(0, 0, 0),
            enabled: true
        }, 
        "LeftForeArm":{
            rotationMin: new THREE.Vector3(-Math.PI / 4, -Math.PI / 2, -Math.PI / 32),
            rotationMax: new THREE.Vector3(Math.PI / 4, Math.PI / 2, Math.PI * 0.8),
            enabled: true
        }, 
        "Spine": {
            rotationMin: new THREE.Vector3(-Math.PI / 32, -Math.PI / 32, -Math.PI / 32),
            rotationMax: new THREE.Vector3(Math.PI / 32, Math.PI / 32, Math.PI / 32),
            enabled: true
        }, 
        "Spine1": {
            rotationMin: new THREE.Vector3(-Math.PI / 32, -Math.PI / 32, -Math.PI / 32),
            rotationMax: new THREE.Vector3(Math.PI / 32, Math.PI / 32, Math.PI / 32),
            enabled: true
        }, 
        "Spine2": {
            rotationMin: new THREE.Vector3(-Math.PI / 32, -Math.PI / 32, -Math.PI / 32),
            rotationMax: new THREE.Vector3(Math.PI / 32, Math.PI / 32, Math.PI / 32),
            enabled: true
        }, 
        "Neck": {
            rotationMin: new THREE.Vector3(-Math.PI / 32, -Math.PI / 32, -Math.PI / 32),
            rotationMax: new THREE.Vector3(Math.PI / 32, Math.PI / 32, Math.PI / 32),
            enabled: true
        } , 
        "Head": {
            rotationMin: new THREE.Vector3(-Math.PI / 32, -Math.PI / 32, -Math.PI / 32),
            rotationMax: new THREE.Vector3(Math.PI / 32, Math.PI / 32, Math.PI / 32),
            enabled: true
        },
        "RightUpLeg": {
            rotationMin: new THREE.Vector3(-Math.PI * 0.8, 0, 2.54),
            rotationMax: new THREE.Vector3(Math.PI / 32, 0.13, 3.12),
            enabled: true
        },
        "RightLeg": {
            rotationMin: new THREE.Vector3(-1.54, 0, 0.04),
            rotationMax: new THREE.Vector3(-0.19, 0, 0.08),
            enabled: true
        },
        "RightFoot": {
            rotationMin: new THREE.Vector3(0.12, 0.10, -0.12),
            rotationMax: new THREE.Vector3(1.95, -0.21, -0.22),
            enabled: true
        },        
       "LeftUpLeg": {
            rotationMin: new THREE.Vector3(-Math.PI * 0.8, 0, -3.12),
            rotationMax: new THREE.Vector3(Math.PI / 32, -0.13, -2.54),
            enabled: true
        },
        "LeftLeg": {
            rotationMin: new THREE.Vector3(-1.54, 0, -0.08),
            rotationMax: new THREE.Vector3(-0.19, 0, -0.04),
            enabled: true
        },
        "LeftFoot": {
            rotationMin: new THREE.Vector3(0.12, 0.10, -0.22),
            rotationMax: new THREE.Vector3(1.95, -0.21, 0.12),
            enabled: true
        }
    }
    // 1. list every end–effector you care about    
    const chains = [
        buildChain(skeleton, ['Spine', 'Spine1', 'Spine2', 'RightShoulder','RightArm', 'RightForeArm', 'RightHand'], 'RightHandTarget', hips, constraints),
        buildChain(skeleton, ['Spine', 'Spine1', 'Spine2', 'LeftShoulder',  'LeftArm',  'LeftForeArm',  'LeftHand'],  'LeftHandTarget', hips, constraints),
        buildChain(skeleton, ['RightUpLeg','RightLeg','RightFoot','RightToeBase'], 'RightFootTarget', hips, constraints),
        buildChain(skeleton, ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'],  'LeftFootTarget', hips, constraints),
        buildChain(skeleton, ['Spine', 'Spine1', 'Spine2','Neck','Head'], 'HeadAimTarget', hips, constraints)
    ];
  
    skinnedMesh.bind(skeleton);

    ccdik = new CCDIKSolver(skinnedMesh, chains);

    const helper = new CCDIKHelper(skinnedMesh, chains, 0.025);
    scene.add(helper);
}

function startPoseTracking() {
  const videoElement = document.createElement('video')
  videoElement.style.position = 'absolute'
  videoElement.style.top = '10px'
  videoElement.style.left = '10px'
  videoElement.style.width = '400px'
  videoElement.style.height = '300px'
  videoElement.style.zIndex = '10'
  videoElement.style.border = '2px solid white'
  videoElement.style.borderRadius = '8px'
  videoElement.style.transform = 'scaleX(-1)'
  document.body.appendChild(videoElement)

  const pose = new Pose({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
  })

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  })

  let lastUpdateTime = 0;
  pose.onResults(results => {
    const now = Date.now();
    if (now - lastUpdateTime < 30) return; // Only update once per 100ms
    lastUpdateTime = now;

    if (!results.poseLandmarks) return
    for (const [key, boneName] of Object.entries(boneMap)) {
      const mpKey = key.toUpperCase().replace(/ /g, '_')
      const index = (POSE_LANDMARKS as any)[mpKey]
      const landmark = results.poseLandmarks[index]
      if (!landmark || !targetMap[boneName]) continue

      if (boneName.endsWith("RightHandTarget")) {
        console.log(landmark)
      }

      // Convert MediaPipe coordinates (0-1, y-down) to Three.js coordinates (-1 to 1, y-up)
      const position = new THREE.Vector3(
        landmark.x * 2 - 1,  // Convert x from 0-1 to -1 to 1
        -(landmark.y * 2 - 1), // Convert y from 0-1 to -1 to 1 and flip y-axis
        -landmark.z  // Invert z for correct depth
      )

      // Scale and offset the position based on model size
      position.multiplyScalar(0.9) // Scale up the movement range
      position.y += 1 // Offset up to match model height
      //position.z += 2 // Move forward to match model position

      // Add damping based on bone type
      const dampingFactor = boneName.includes('Hand') ? 0.3 : 
                           boneName.includes('Foot') ? 0.2 :
                           boneName.includes('Head') ? 0.4 : 0.5;

      targetMap[boneName].position.lerp(position, dampingFactor)
    }
  })

  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await pose.send({ image: videoElement })
    },
    width: 640,
    height: 480
  })
  camera.start()
}

const debugLeg = "LeftFoot";

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
  
          if (debug) {
              // Add axes helper to each bone
              const skinnedMesh = model.getObjectByName('mesh') as THREE.SkinnedMesh;
              if (skinnedMesh) {
                  // Set wireframe for all materials
                  const setWireframe = (mat: THREE.Material) => {
                      if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) {
                          mat.wireframe = true;
                      }
                  };
                  if (Array.isArray(skinnedMesh.material)) {
                      skinnedMesh.material.forEach(setWireframe);
                  } else {
                      setWireframe(skinnedMesh.material);
                  }
                  skinnedMesh.skeleton.bones.forEach(bone => {
  
                      if (bone.name.endsWith(debugLeg)) {
                          console.log(`${bone.name} ${bone.rotation.x}, ${bone.rotation.y}, ${bone.rotation.z}`)
                          const axes = new THREE.AxesHelper(1);
                          bone.add(axes);
                      }
                  });
              }
          }
  
          // Show skeleton
          const skeletonHelper = new THREE.SkeletonHelper(model);
          (skeletonHelper.material as THREE.LineBasicMaterial).linewidth = 2;
          scene.add(skeletonHelper);
  
          // Adjust controls and camera to look at the vertical center
          const verticalCenter = size.y / 2
          controls.target.set(0, verticalCenter, 0)
          controls.update()
          camera.lookAt(0, verticalCenter, 0)
          startPoseTracking();
        
      }, undefined, (error) => {
          console.error('Error loading GLB:', error)
      })
  
      camera.position.set(0, 1.5, 2.2)
      camera.lookAt(0, 0, 0)
  
      let ticks = 0
      // Animation loop
      const animate = () => {
          if (model) {
              ccdik?.update();
  
              if (debug && ticks % 60 === 0) {
                  const skinnedMesh = model.getObjectByName('mesh') as THREE.SkinnedMesh;
                  skinnedMesh.skeleton.bones.forEach(bone => {
                      if (bone.name.endsWith(debugLeg)) {
                          console.log(`${bone.name} ${bone.rotation.x}, ${bone.rotation.y}, ${bone.rotation.z}`)
                      }
                  });
              }
              ticks++;
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