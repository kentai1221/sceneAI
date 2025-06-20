"use client";
import { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense } from "react";
import * as THREE from "three";
import { TextureLoader } from 'three';
import { SelectionArrow } from './SelectionArrow';
import { useFBX } from "@/app/hooks/useFBX";

type SceneItem = {
  type: "box" | "model";
  path?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: string;
  texturePath?: string;
};

function applyMaterialWithTexture(scene: THREE.Object3D, material: THREE.Material) {
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (!(mesh.geometry as THREE.BufferGeometry).attributes.uv) {
        console.warn("Missing UVs on mesh:", child.name);
      }
      mesh.material = material;
      mesh.material.needsUpdate = true;
    }
  });
}


// 🔶 Box Component
function Box({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  color = "gray",
  onClick,
  isSelected,
  texturePath,
}: Partial<SceneItem> & { onClick?: () => void; isSelected?: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const isFloor = color === "lightgray";
  const texture = texturePath ? useLoader(TextureLoader, texturePath) : null;
  const [, setTick] = useState(0);

  useEffect(() => {
    if (texture) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
  
      const tileSize = 1; // world units per tile
      const repeatX = scale[0] / tileSize;
      const repeatZ = scale[2] / tileSize;
  
      const applyRepeat = () => {
        texture.repeat.set(repeatX, repeatZ);
        texture.needsUpdate = true;
      };
  
      if (texture.image) {
        applyRepeat();
      } else {
        const interval = setInterval(() => {
          if (texture.image) {
            applyRepeat();
            clearInterval(interval);
          }
        }, 50);
      }
    }
  }, [texture, scale]);

  if (isFloor) {
    return (
      <>
        <group
          ref={groupRef}
          position={[position[0], 0.05, position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={onClick}
        >
          <mesh>
            <planeGeometry args={[scale[0], scale[2]]} />
            <meshStandardMaterial
              map={texture || undefined}
              color={texture ? undefined : color}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
              depthWrite={false}
            />
          </mesh>
        </group>
        {isSelected && groupRef.current && (
          <SelectionArrow targetRef={groupRef as React.RefObject<THREE.Group>} />
        )}
      </>
    );
  }

  // fallback box
  return (
    <>
      <group
        ref={groupRef}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={onClick}
      >
        <mesh>
          <boxGeometry />
          <meshStandardMaterial
            map={texture || undefined}
            color={texture ? undefined : color}
          />
        </mesh>
      </group>

      {isSelected && groupRef.current && (
        <SelectionArrow targetRef={groupRef as React.RefObject<THREE.Group>} />
      )}
    </>
  );
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
  texturePath?: string;
}) {
  const extension = useMemo(() => path?.split('.').pop()?.toLowerCase(), [path]);
  const fbxScene = extension === 'fbx' && path ? useFBX(path) : null;
  const gltf = extension === 'glb' || extension === 'gltf' ? useGLTF(path || '') : null;
  const scene = fbxScene || gltf?.scene;

  const texture = texturePath ? useLoader(TextureLoader, texturePath) : null;
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color,
    map: texture || undefined,
    metalness: 0.3,
    roughness: 0.8,
  }), [color, texture]);

  useEffect(() => {
    if (fbxScene) {
      applyMaterialWithTexture(fbxScene, material);
    }
  }, [fbxScene, material]);

  const groupRef = useRef<THREE.Group>(null);
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
      {isSelected && groupRef.current && (
        <SelectionArrow targetRef={groupRef as React.RefObject<THREE.Group>} />
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
                  texturePath={item.texturePath}
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
                  texturePath={item.texturePath}
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
