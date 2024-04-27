import { SelectV2, SelectV2Content } from '@dynatrace/strato-components-preview';
import { Button } from '@dynatrace/strato-components/buttons';
import { Container } from '@dynatrace/strato-components/layouts';
import { Text } from '@dynatrace/strato-components/typography';
import { PlusIcon } from '@dynatrace/strato-icons';
import React, { useState } from 'react';
import {
  AttributeType,
  BinaryTokens,
  BOOLEAN_OPS,
  BooleanTokens,
  DEFAULT_CONDITION,
  DEFAULT_GROUP,
  Node,
  SemVerToken,
} from '../types';
import { BinaryCondition } from './BinaryCondition';
import { SemVerCondition } from './SemVerCondition';
import { buildAttributeSelectionByType, getToken } from './utils';

interface Props {
  node: Partial<Node<BooleanTokens>>;
  allowNested: boolean;
  onChange: (node: Partial<Node<BooleanTokens>>) => void;
}

/**
 * Represents and renders a group of conditions and'd or or'd together.
 */
export function Group(props: Props) {
  const initialToken = getToken<BooleanTokens>(props.node);
  const initialArgs = props.node[initialToken];

  const [token, setToken] = useState(initialToken);
  const [args, setArgs] = useState(initialArgs);

  // replaces components if a context attribute requiring a different component type is selected
  function onUnhandledAttributeType(key: string, type: AttributeType, index: number) {
    const newToken = buildAttributeSelectionByType<BooleanTokens>(key, type);
    const newArgs = [...args!];
    newArgs[index] = newToken;
    setArgs(newArgs);
    props.onChange({ [token]: newArgs });
  }

  return (
    <div>
      <Text style={{ display: 'flex' }}>
        When{' '}
        <SelectV2
          defaultValue={BOOLEAN_OPS.find((t) => t.token === token)?.label}
          onChange={(label) => {
            if (label) {
              const t = BOOLEAN_OPS.find((t) => t.label === label)?.token;
              if (t) {
                setToken(t);
                props.onChange({ [t]: args }); // why?
              }
            }
          }}
        >
          <SelectV2Content>
            {BOOLEAN_OPS.map((op) => {
              return (
                <SelectV2.Option key={op.token} value={op.label}>
                  {op.label}
                </SelectV2.Option>
              );
            })}
          </SelectV2Content>
        </SelectV2>{' '}
        conditions match
      </Text>

      {args?.map((arg, index) => {
        // this is a group (another and/or node)
        if (typeof arg === 'object' && ('and' in arg || 'or' in arg)) {
          const boolArg = arg as Node<BooleanTokens>;
          return (
            <Container key={`group-arg-${index}`}>
              <Group
                allowNested={false}
                onChange={(node) => {
                  const newArgs = [...args];
                  newArgs[index] = node;
                  props.onChange({ [token]: newArgs });
                  setArgs(newArgs);
                }}
                node={boolArg}
              ></Group>
            </Container>
          );
        }

        // this is a semver
        if (arg.sem_ver) {
          const semVerArg = arg as Node<SemVerToken>;
          return (
            <SemVerCondition
              key={`group-arg-${index}`}
              onUnhandledAttributeType={(key, type) => onUnhandledAttributeType(key, type, index)}
              onChange={(node) => {
                const newArgs = [...args];
                newArgs[index] = node;
                props.onChange({ [token]: newArgs });
                setArgs(newArgs);
              }}
              node={semVerArg}
            ></SemVerCondition>
          );
        }

        // otherwise this assume binary
        else {
          const binArg = arg as Node<BinaryTokens>;
          return (
            <BinaryCondition
              key={`group-arg-${index}`}
              onUnhandledAttributeType={(key, type) => onUnhandledAttributeType(key, type, index)}
              onChange={(node) => {
                const newArgs = [...args];
                newArgs[index] = node;
                props.onChange({ [token]: newArgs });
                setArgs(newArgs);
              }}
              node={binArg}
            ></BinaryCondition>
          );
        }
      })}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Button
          onClick={() => {
            const newArgs = [...args!, DEFAULT_CONDITION];
            const node = { [token]: newArgs };
            props.onChange(node);
            setArgs(newArgs);
          }}
        >
          <PlusIcon />
          Condition
        </Button>
        {props.allowNested ? (
          <Button
            onClick={() => {
              const newArgs = [...args!, DEFAULT_GROUP];
              const node = { [token]: newArgs };
              props.onChange(node);
              setArgs(newArgs);
            }}
          >
            <PlusIcon />
            Group
          </Button>
        ) : (
          <></>
        )}
      </div>
    </div>
  );
}
