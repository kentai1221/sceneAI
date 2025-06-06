"use client";
import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense } from "react";

type SceneItem = {
  type: "box" | "model";
  path?: string; // for models
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: string; // for boxes
};

// Component to render a box
function Box({ position, rotation, color, scale }: Partial<SceneItem>) {
  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      <boxGeometry />
      <meshStandardMaterial color={color || "gray"} />
    </mesh>
  );
}

// Component to render a GLTF model
function Model({ path, position, rotation, scale }: Partial<SceneItem>) {
  const { scene } = useGLTF(path || "");
  return (
    <primitive
      object={scene}
      position={position}
      rotation={rotation}
      scale={scale}
    />
  );
}

// Main Canvas
export default function SceneCanvas({ sceneData }: { sceneData: SceneItem[] }) {

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Canvas camera={{ position: [0, 2, 5], fov: 60 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[2, 2, 2]} />
        <Suspense fallback={null}>
          {sceneData.map((item, index) => {
            if (item.type === "box") {
              return (
                <Box
                  key={index}
                  position={item.position}
                  rotation={item.rotation}
                  color={item.color}
                  scale={item.scale}
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
