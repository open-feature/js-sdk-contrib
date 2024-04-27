import { AnyToken, AttributeType, DEFAULT_ATTRIBUTE_CONDITIONS, Node, VarToken } from '../types';

/**
 * Gets the token from the supplied node.
 */
export function getToken<T extends AnyToken>(node: Partial<Node<T>>): T {
  return Object.keys(node)?.[0] as T;
}

/**
 * Gets the arguments from the supplied node.
 */
export function getArgs<T extends AnyToken>(node: Partial<Node<T>>): Node<T>[T] {
  return node[getToken(node)] as Node<T>[T];
}

export function buildAttributeSelectionByType<T extends AnyToken>(name: string, type: AttributeType): Node<T> {
  const newNode = DEFAULT_ATTRIBUTE_CONDITIONS[type];
  (Object.values(newNode)[0][0] as Node<VarToken>)['var'] = [name];
  return newNode as unknown as Node<T>;
}
