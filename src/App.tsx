import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader, OrbitControls, TransformControls } from 'three-stdlib'
import './App.css'
import { CCDIKSolver } from 'three/addons/animation/CCDIKSolver.js'
import boneMap from '../bone_map.json'
import { Pose, POSE_LANDMARKS } from '@mediapipe/pose'
import { Camera } from '@mediapipe/camera_utils'

let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let controls: OrbitControls
let modelLoaded = false

let ccdik: CCDIKSolver
let targetMap: Record<string, THREE.Object3D> = {}

type JointConstraint = {
  limitation: THREE.Vector3
  rotationMin: THREE.Vector3
  rotationMax: THREE.Vector3
}

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

  gizmo.addEventListener('mouseDown', () => (controls.enabled = false))
  gizmo.addEventListener('mouseUp', () => (controls.enabled = true))

  targetMap[bone.name] = targetBone
  return targetBone
}

function buildChain(
  skeleton: THREE.Skeleton,
  boneNames: string[],
  targetName: string,
  parent: THREE.Object3D,
  constraints?: JointConstraint[]
) {
  const idx = boneNames.map(n => skeleton.bones.findIndex(b => b.name.endsWith(n)))
  const links = idx.slice(0, -1).reverse().map((i, j) => {
    const constraint = constraints && constraints[j] ? constraints[j] : {
      limitation: undefined,
      rotationMin: undefined,
      rotationMax: undefined
    }
    return {
      index: i,
      limitation: constraint.limitation,
      rotationMin: constraint.rotationMin,
      rotationMax: constraint.rotationMax
    }
  })
  const target = createTarget(skeleton.bones[idx[idx.length - 1]!], parent)
  target.name = targetName
  skeleton.bones.push(target)
  return { target: skeleton.bones.length - 1, effector: idx[idx.length - 1]!, links }
}

function setupCCDSolverIK(model: THREE.Object3D) {
  const skinnedMesh = model.getObjectByName('mesh') as THREE.SkinnedMesh
  if (!skinnedMesh) return

  const skeleton = skinnedMesh.skeleton
  const hips = model.getObjectByName('mixamorigHips') as THREE.Bone

  const chains = [
    buildChain(skeleton, ['Spine', 'Spine1', 'Spine2', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'], 'mixamorigRightHand', hips),
    buildChain(skeleton, ['Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'], 'mixamorigLeftHand', hips),
    buildChain(skeleton, ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'], 'mixamorigRightToeBase', hips),
    buildChain(skeleton, ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'], 'mixamorigLeftToeBase', hips),
    buildChain(skeleton, ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head'], 'mixamorigHead', hips)
  ]

  skinnedMesh.bind(skeleton)
  ccdik = new CCDIKSolver(skinnedMesh, chains)
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

  pose.onResults(results => {
    if (!results.poseLandmarks) return
    for (const [key, boneName] of Object.entries(boneMap)) {
      const mpKey = key.toUpperCase().replace(/ /g, '_')
      const index = (POSE_LANDMARKS as any)[mpKey]
      const landmark = results.poseLandmarks[index]
      if (!landmark || !targetMap[boneName]) continue

      const position = new THREE.Vector3(
        landmark.x - 0.5,
        -landmark.y + 0.5,
        -landmark.z
      )
      targetMap[boneName].position.lerp(position, 0.5)
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

function App() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const currentMount = mountRef.current
    if (!currentMount) return

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

    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.target.set(0, 1, 0)
    controls.update()

    const ambientLight = new THREE.AmbientLight(0xffffff, 1)
    scene.add(ambientLight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(5, 10, 7.5)
    scene.add(directionalLight)

    const loader = new GLTFLoader()
    let model: THREE.Object3D | null = null

    loader.load('/zombie.glb', (gltf) => {
      if (modelLoaded) return
      modelLoaded = true
      model = gltf.scene
      setupCCDSolverIK(model)

      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      model.position.x -= center.x
      model.position.z -= center.z
      model.position.y -= box.min.y
      scene.add(model)

      const skeletonHelper = new THREE.SkeletonHelper(model)
      ;(skeletonHelper.material as THREE.LineBasicMaterial).linewidth = 2
      scene.add(skeletonHelper)

      const verticalCenter = size.y / 2
      controls.target.set(0, verticalCenter, 0)
      controls.update()
      camera.lookAt(0, verticalCenter, 0)

      startPoseTracking()
    }, undefined, (error) => {
      console.error('Error loading GLB:', error)
    })

    camera.position.set(0, 1.5, 2.2)
    camera.lookAt(0, 0, 0)

    const animate = () => {
      if (model) {
        ccdik?.update()
      }
      controls.update()
      renderer.render(scene, camera)
      requestAnimationFrame(animate)
    }
    animate()

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