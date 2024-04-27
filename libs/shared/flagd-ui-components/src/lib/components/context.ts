import { createContext, useContext } from 'react';
import { Attribute } from '../types';

export const BuilderContext = createContext<{ attributes: Attribute[]; variants: string[] }>({
  attributes: [],
  variants: [],
});

export function useAttributes() {
  const { attributes } = useContext(BuilderContext);
  return attributes;
}

export function useVariants() {
  const { variants } = useContext(BuilderContext);
  return variants;
}
