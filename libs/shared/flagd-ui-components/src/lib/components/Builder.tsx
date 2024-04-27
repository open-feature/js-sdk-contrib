import React, { useMemo, useState } from 'react';
import { Attribute, IfToken, Node } from '../types';
import { BuilderContext } from './context';
import { RuleContainer } from './RuleContainer';

interface Props {
  attributes: Attribute[];
  variants: string[];
  value: string;
  onChange: (value: string) => void;
}

export function Builder(props: Props) {
  const json = props.value;

  const [value, setValue] = useState<Node<IfToken>>({ if: [] });

  useMemo(() => {
    const parsed = JSON.parse(json);
    setValue(parsed);
  }, [props.value]);

  return (
    // context attributes and variants are available throughout the component with custom context hooks
    <BuilderContext.Provider value={{ attributes: props.attributes, variants: props.variants }}>
      <RuleContainer
        onChange={(node) => {
          props.onChange(JSON.stringify(node, undefined, 2));
        }}
        node={value}
      ></RuleContainer>
    </BuilderContext.Provider>
  );
}
