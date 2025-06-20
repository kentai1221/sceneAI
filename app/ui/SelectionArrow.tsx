// SelectionArrow.tsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function SelectionArrow({ targetRef }: { targetRef: React.RefObject<THREE.Group> | null }) {
  const arrowRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (targetRef?.current && arrowRef.current) {
      const box = new THREE.Box3().setFromObject(targetRef.current);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const topY = box.max.y;

      arrowRef.current.position.set(center.x, box.max.y + 0.2, center.z);
      arrowRef.current.rotation.set(Math.PI, 0, 0); // Point arrow down
    }
  });

  return (
    <group ref={arrowRef}>
      {/* Arrowhead */}
      <mesh position={[0, -0.4, 0]}>
        <coneGeometry args={[0.15, 0.3, 8]} />
        <meshStandardMaterial color="red" />
      </mesh>
    </group>
  );
}
