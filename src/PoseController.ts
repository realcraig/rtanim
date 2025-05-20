import { Pose, POSE_LANDMARKS } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import * as THREE from 'three';
import boneMap from '../bone_map.json';

type Keypoint = { x: number, y: number, z: number, visibility?: number };

export class PoseController {
  private videoElement: HTMLVideoElement;
  private keypointTargets: Record<string, THREE.Object3D>;

  constructor(keypointTargets: Record<string, THREE.Object3D>) {
    this.videoElement = document.createElement('video');
    this.videoElement.style.display = 'none';
    document.body.appendChild(this.videoElement);
    this.keypointTargets = keypointTargets;
    this.initPose();
  }

  private initPose() {
    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    pose.onResults(this.onResults.bind(this));

    const camera = new Camera(this.videoElement, {
      onFrame: async () => {
        await pose.send({ image: this.videoElement });
      },
      width: 640,
      height: 480
    });
    camera.start();
  }

  private onResults(results: any) {
    if (!results.poseLandmarks) return;

    for (const [key, boneName] of Object.entries(boneMap)) {
      const kp = results.poseLandmarks.find((_, i) => POSE_LANDMARKS[key.toUpperCase().replace(' ', '_')] === i);
      if (!kp || !this.keypointTargets[boneName]) continue;

      const position = new THREE.Vector3(kp.x - 0.5, -kp.y + 0.5, -kp.z); // basic mirroring/scaling
      this.keypointTargets[boneName].position.copy(position);
    }
  }
}
