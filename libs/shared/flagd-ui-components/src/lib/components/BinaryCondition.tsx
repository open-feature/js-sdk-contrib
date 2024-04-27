import { SelectV2, SelectV2Content, TextInput } from '@dynatrace/strato-components-preview';
import { Container } from '@dynatrace/strato-components/layouts';
import React, { useState } from 'react';
import { AttributeType, BINARY_OPS, BinaryTokens, Node, VarToken } from '../types';
import { useAttributes } from './context';
import { getToken } from './utils';

interface Props {
  node: Node<BinaryTokens>;
  onChange: (node: Node<BinaryTokens>) => void;
  onUnhandledAttributeType: (key: string, type: AttributeType) => void;
}

const COMPATIBLE_ATTRIBUTE_TYPES = ['string', 'boolean', 'number'];

/**
 * Represents and renders a comparison between a context attribute ("var" node) and a value.
 */
export function BinaryCondition(props: Props) {
  const initialToken = getToken<BinaryTokens>(props.node);
  const initialLabel = BINARY_OPS.find((o) => o.token === initialToken)?.label;
  const initialArgs = props.node[initialToken];
  const initialLeftArg = initialArgs[0];
  const initialRightArg = initialArgs[1];
  const initialAttribute = (initialLeftArg?.var?.[0] || initialLeftArg?.var || '') as string; // TODO this can be a string

  const [token, setToken] = useState(initialToken);
  const [leftArg, setLeftArg] = useState(initialLeftArg);
  const [rightArg, setRightArg] = useState(initialRightArg);
  const [, setAttributeType] = useState<AttributeType>();
  const attributes = useAttributes();

  return (
    <Container>
      <div style={{ display: 'flex', flexDirection: 'row' }}>
        <SelectV2
          defaultValue={initialAttribute}
          onChange={(key) => {
            if (key) {
              const attributeType = attributes.find((a) => a.key === key)?.type;

              const la: Node<VarToken> = {
                var: [key],
              };

              // if this is not an attribute type supported by this component, run the appropriate handler
              if (attributeType && !COMPATIBLE_ATTRIBUTE_TYPES.includes(attributeType)) {
                props.onUnhandledAttributeType(key, attributeType);
                return;
              }

              setAttributeType(attributeType);
              setLeftArg(la);
              props.onChange({
                [token]: [la, rightArg],
              } as Node<BinaryTokens>);
            }
          }}
        >
          <SelectV2Content>
            {attributes.map((attribute) => {
              return (
                <SelectV2.Option key={attribute.key} value={attribute.key}>
                  {attribute.key}
                </SelectV2.Option>
              );
            })}
          </SelectV2Content>
        </SelectV2>
        <SelectV2
          defaultValue={initialLabel}
          onChange={(label) => {
            const t = BINARY_OPS.find((t) => t.label === label)?.token;
            if (t) {
              setToken(t);
              props.onChange({
                [t]: [leftArg, rightArg],
              } as Node<BinaryTokens>);
            }
          }}
        >
          <SelectV2Content>
            {BINARY_OPS.map((op) => {
              return (
                <SelectV2.Option key={op.token} value={op.label}>
                  {op.label}
                </SelectV2.Option>
              );
            })}
          </SelectV2Content>
        </SelectV2>
        <TextInput
          value={rightArg as string} // TODO: handle other types
          onChange={(value) => {
            setRightArg(value);
            props.onChange({
              [token]: [leftArg, value],
            } as Node<BinaryTokens>);
          }}
        ></TextInput>
      </div>
    </Container>
  );
}
