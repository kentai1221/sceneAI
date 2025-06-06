import { useLoader } from '@react-three/fiber';
import { FBXLoader } from 'three-stdlib';

export function useFBX(path: string) {
  return useLoader(FBXLoader, path);
}