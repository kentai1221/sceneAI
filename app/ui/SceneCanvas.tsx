"use client";
import { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useFBX } from "@/app/hooks/useFBX";
import { useLoader } from '@react-three/fiber';
import { TextureLoader } from 'three';

type SceneItem = {
  type: "box" | "model";
  path?: string; // for models
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: string; // for boxes
};

// 🔶 Selection Ring Component
function SelectionRing({ radius = 1 }: { radius?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <ringGeometry args={[radius * 0.9, radius, 32]} />
      <meshBasicMaterial color="yellow" side={THREE.DoubleSide} transparent opacity={0.6} />
    </mesh>
  );
}

// 🔷 Box Component
function Box({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  color = "gray",
  onClick,
  isSelected,
}: Partial<SceneItem> & { onClick?: () => void; isSelected?: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const [radius, setRadius] = useState(1);

  useEffect(() => {
    if (groupRef.current) {
      const box = new THREE.Box3().setFromObject(groupRef.current);
      const size = new THREE.Vector3();
      box.getSize(size);
      setRadius(Math.max(size.x, size.z) / 2);
    }
  }, [scale]);

  // 🔁 Update ring position every frame
  useFrame(() => {
    if (isSelected && groupRef.current && ringRef.current) {
      const box = new THREE.Box3().setFromObject(groupRef.current);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const ringY = box.min.y + 0.01;

      ringRef.current.position.set(center.x, ringY, center.z);
      ringRef.current.rotation.set(-Math.PI / 2, 0, 0);
    }
  });

  return (
    <>
      {/* The object */}
      <group
        ref={groupRef}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={onClick}
      >
        <mesh>
          <boxGeometry />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>

      {/* The ring rendered separately, in world space */}
      {isSelected && (
        <mesh ref={ringRef}>
          <ringGeometry args={[radius * 0.9, radius, 32]} />
          <meshBasicMaterial
            color="yellow"
            side={THREE.DoubleSide}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}
    </>
  );
}

function applyMaterialWithTexture(scene: THREE.Object3D, defaultMaterial: THREE.Material) {
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const geometry = (child as THREE.Mesh).geometry as THREE.BufferGeometry;
      if (!geometry.attributes.uv) {
        console.warn("Missing UVs on mesh:", child.name);
      }
      const mesh = child as THREE.Mesh;
      // 🔁 Forcefully apply the new material regardless
      mesh.material = defaultMaterial;
      mesh.material.needsUpdate = true;
    }
  });
}

// 🔷 Model Component
function Model({
  path,
  position,
  rotation,
  scale,
  onClick,
  isSelected,
  color = 'orange',
  texturePath,
}: {
  path?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  onClick?: () => void;
  isSelected?: boolean;
  color?: string;
  texturePath?: string; // NEW: texture image path
}) {
  const extension = useMemo(() => path?.split('.').pop()?.toLowerCase(), [path]);

  const fbxScene = extension === 'fbx' && path ? useFBX(path) : null;
  const gltf = extension === 'glb' || extension === 'gltf' ? useGLTF(path || '') : null;
  const scene = fbxScene || gltf?.scene;

  // Load texture if provided
  const texture = texturePath ? useLoader(TextureLoader, texturePath) : null;
  const defaultMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color,
      map: texture || undefined,
      metalness: 0.3,
      roughness: 0.8,
    });
  }, [color, texture]);

  useEffect(() => {
    if (fbxScene) {
      applyMaterialWithTexture(fbxScene, defaultMaterial);
    }
  }, [fbxScene, defaultMaterial]);

  const groupRef = useRef<THREE.Group>(null);
  const [ringProps, setRingProps] = useState<{
    radius: number;
    position: [number, number, number];
  }>({ radius: 1, position: [0, 0, 0] });

  const ringRef = useRef<THREE.Mesh>(null);
  const [radius, setRadius] = useState(1);

  useEffect(() => {
    if (groupRef.current) {
      const box = new THREE.Box3().setFromObject(groupRef.current);
      const size = new THREE.Vector3();
      box.getSize(size);
      setRadius(Math.max(size.x, size.z) / 2);
    }
  }, [scene]);

  useFrame(() => {
    if (isSelected && groupRef.current && ringRef.current) {
      const box = new THREE.Box3().setFromObject(groupRef.current);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const ringY = box.min.y + 0.01;

      ringRef.current.position.set(center.x, ringY, center.z);
      ringRef.current.rotation.set(-Math.PI / 2, 0, 0);
    }
  });

  if (!scene) return null;

  return (
    <>
      <group
        ref={groupRef}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={onClick}
      >
        <primitive object={scene} />
      </group>
  
      {isSelected && (
        <mesh ref={ringRef}>
          <ringGeometry args={[radius * 0.9, radius, 32]} />
          <meshBasicMaterial
            color="yellow"
            side={THREE.DoubleSide}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}

    </>
  );
}


// 🎮 Main SceneCanvas Component
export default function SceneCanvas({
  sceneData,
  onSelect,
  selectedIndex,
}: {
  sceneData: SceneItem[];
  onSelect?: (index: number) => void;
  selectedIndex?: number;
}) {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Canvas camera={{ position: [0, 20, 10], fov: 15 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 2, 2]} />
        <Suspense fallback={null}>
          {sceneData.map((item, index) => {
            const isSelected = selectedIndex === index;
            const handleClick = () => onSelect?.(index);

            if (item.type === "box") {
              return (
                <Box
                  key={index}
                  position={item.position}
                  rotation={item.rotation}
                  color={item.color}
                  scale={item.scale}
                  onClick={handleClick}
                  isSelected={isSelected}
                />
              );
            } else if (item.type === "model") {
              return (
                <Model
                  key={index}
                  path={item.path}
                  position={item.position}
                  rotation={item.rotation}
                  scale={item.scale}
                  onClick={handleClick}
                  isSelected={isSelected}
                />
              );
            }
            return null;
          })}
        </Suspense>
        <OrbitControls />
      </Canvas>
    </div>
  );
}
