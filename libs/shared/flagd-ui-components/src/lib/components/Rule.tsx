import { SelectV2, SelectV2Content } from '@dynatrace/strato-components-preview';
import { Container } from '@dynatrace/strato-components/layouts';
import React, { useEffect, useState } from 'react';
import { AttributeType, BinaryTokens, BooleanTokens, FractionalToken, IfToken, Node, SemVerToken } from '../types';
import { BinaryCondition } from './BinaryCondition';
import { useVariants } from './context';
import { Fractional } from './Fractional';
import { Group } from './Group';
import { SemVerCondition } from './SemVerCondition';
import { buildAttributeSelectionByType, getArgs, getToken } from './utils';

interface Props {
  node: Partial<Node<IfToken | FractionalToken>>;
  onChange: (node: Partial<Node<IfToken | FractionalToken>>) => void;
}

/**
 * Top level component representing "if" node and all children; root of the rule-set.
 */
export function Rule(props: Props) {
  type Args = typeof args;
  type Arg = Args[number];
  const [token] = useState(getToken(props.node));
  const [args, setArgs] = useState(getArgs(props.node));
  const variants = useVariants();

  useEffect(() => {
    setArgs(props.node[token]!);
  }, [props.node]);

  // replaces components if a context attribute requiring a different component type is selected
  function onUnhandledAttributeType(key: string, type: AttributeType, index: number) {
    const newToken = buildAttributeSelectionByType<IfToken | FractionalToken>(key, type);
    const newArgs: Args = [...args!];
    newArgs[index] = newToken as Arg;
    setArgs(newArgs);
    props.onChange({ [token]: newArgs });
  }

  return (
    <Container>
      {props.node.fractional ? (
        <Fractional node={props.node as Node<FractionalToken>} />
      ) : (
        <>
          {args?.map((arg, index) => {
            // this is a group (another and/or node)
            if (typeof arg === 'object' && ('and' in arg || 'or' in arg)) {
              const booleanArg = arg as Node<BooleanTokens>;
              return (
                <Group
                  key={`rule-arg-${index}`}
                  allowNested={true}
                  node={booleanArg}
                  onChange={(node) => {
                    const newArgs = [...args];
                    newArgs[index] = node;
                    props.onChange({
                      [token]: newArgs,
                    });
                  }}
                ></Group>
              );

              // this is a semver
            } else if (typeof arg === 'object' && 'sem_ver' in arg) {
              const semVerArg = arg as Node<SemVerToken>;
              return (
                <SemVerCondition
                  key={`rule-arg-${index}`}
                  onUnhandledAttributeType={(key, type) => onUnhandledAttributeType(key, type, index)}
                  onChange={(node) => {
                    const newArgs: Args = [...args];
                    newArgs[index] = node;
                    props.onChange({ [token]: newArgs });
                    setArgs(newArgs);
                  }}
                  node={semVerArg}
                ></SemVerCondition>
              );

              // otherwise this assume binary
            } else if (typeof arg === 'object') {
              const binArg = arg as Node<BinaryTokens>;
              return (
                <BinaryCondition
                  key={`rule-arg-${index}`}
                  onUnhandledAttributeType={(key, type) => onUnhandledAttributeType(key, type, index)}
                  onChange={(node) => {
                    const newArgs: Args = [...args];
                    newArgs[index] = node;
                    props.onChange({ [token]: newArgs });
                    setArgs(newArgs);
                  }}
                  node={binArg}
                ></BinaryCondition>
              );
            } else if (typeof arg === 'string') {
              return (
                <SelectV2
                  key={`rule-arg-${index}`}
                  defaultValue={arg}
                  onChange={(value) => {
                    if (value) {
                      const newArgs = [...args];
                      newArgs[index] = value;
                      props.onChange({
                        [token]: newArgs,
                      });
                    }
                  }}
                >
                  <SelectV2Content>
                    {variants.map((variant) => {
                      return (
                        <SelectV2.Option key={variant} value={variant}>
                          {variant}
                        </SelectV2.Option>
                      );
                    })}
                  </SelectV2Content>
                </SelectV2>
              );
            } else {
              // TODO: think about unhandled case
              return <></>;
            }
          })}
        </>
      )}
    </Container>
  );
}
