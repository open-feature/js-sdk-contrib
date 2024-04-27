import { createContext, useContext } from 'react';

export interface Attribute {
  type: 'string' | 'boolean' | 'number';
  key: string;
}

export const BuilderContext = createContext<{ attributes: Attribute[]; variants: (string | number | boolean)[] }>({
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
