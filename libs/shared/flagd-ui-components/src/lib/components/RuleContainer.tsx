import { Button } from '@dynatrace/strato-components/buttons';
import { Container } from '@dynatrace/strato-components/layouts';
import { PlusIcon } from '@dynatrace/strato-icons';
import React, { useMemo, useState } from 'react';
import { DEFAULT_RULE, FractionalToken, IfToken, Node } from '../types';
import { Rule } from './Rule';

interface Props {
  node: Partial<Node<IfToken | FractionalToken>>;
  onChange: (node: Partial<Node<IfToken | FractionalToken>>) => void;
}

export function RuleContainer(props: Props) {
  const [ifNode, setIfNode] = useState(props.node);

  useMemo(() => {
    setIfNode(props.node);
  }, [props.node]);

  return (
    <Container>
      <Rule
        node={ifNode}
        onChange={(node) => {
          props.onChange(node);
        }}
      ></Rule>

      <Button
        onClick={() => {
          const newArgs = [...ifNode.if!, ...DEFAULT_RULE];
          const newNode = { if: newArgs } as Node<IfToken>;
          props.onChange(newNode);
          setIfNode(newNode);
        }}
      >
        <PlusIcon />
        Rule
      </Button>
    </Container>
  );
}
