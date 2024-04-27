import { SelectV2, SelectV2Content, TextInput } from '@dynatrace/strato-components-preview';
import { Container } from '@dynatrace/strato-components/layouts';
import React, { useState } from 'react';
import { AttributeType, Node, SEM_VER_EXPRESSIONS, SemVerToken, VarToken } from '../types';
import { useAttributes } from './context';
import { getToken } from './utils';

interface Props {
  node: Node<SemVerToken>;
  onChange: (node: Node<SemVerToken>) => void;
  onUnhandledAttributeType: (key: string, type: AttributeType) => void;
}

const COMPATIBLE_ATTRIBUTE_TYPES = ['version'];

/**
 * Represents and renders a ternary operation between a context attribute, semantic version operation, and a value.
 */
export function SemVerCondition(props: Props) {
  const initialToken = getToken<SemVerToken>(props.node);
  const initialArgs = props.node[initialToken];
  const initialLeftArg = initialArgs[0];
  const initialSemVerArg = initialArgs[1] as string;
  const initialRightArg = initialArgs[2] as string;
  const initialAttribute = (initialLeftArg?.var?.[0] || initialLeftArg?.var || '') as string; // TODO this can be a string

  const [token] = useState(initialToken);
  const [leftArg, setLeftArg] = useState(initialLeftArg);
  const [semVerArg, setSemVerArg] = useState(initialSemVerArg);
  const [rightArg, setRightArg] = useState(initialRightArg);
  const attributes = useAttributes();

  return (
    <Container>
      <div style={{ display: 'flex', flexDirection: 'row' }}>
        {/* commonize this var thing? */}
        <SelectV2
          defaultValue={initialAttribute}
          onChange={(key) => {
            if (key) {
              const attributeType = attributes.find((a) => a.key === key)?.type;

              // if this is not an attribute type supported by this component, run the appropriate handler
              if (attributeType && !COMPATIBLE_ATTRIBUTE_TYPES.includes(attributeType)) {
                props.onUnhandledAttributeType(key, attributeType);
                return;
              }
              const la: Node<VarToken> = {
                var: [key],
              };
              setLeftArg(la);
              props.onChange({
                [token]: [la, semVerArg, rightArg],
              } as Node<SemVerToken>);
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
          defaultValue={initialSemVerArg}
          onChange={(ex) => {
            if (ex) {
              setSemVerArg(ex);
              props.onChange({
                [token]: [leftArg, ex, rightArg],
              } as Node<SemVerToken>);
            }
          }}
        >
          <SelectV2Content>
            {SEM_VER_EXPRESSIONS.map((ex) => {
              return (
                <SelectV2.Option key={ex} value={ex}>
                  {ex}
                </SelectV2.Option>
              );
            })}
          </SelectV2Content>
        </SelectV2>
        <TextInput
          value={rightArg}
          onChange={(value) => {
            setRightArg(value);
            props.onChange({
              [token]: [leftArg, semVerArg, value],
            } as Node<SemVerToken>);
          }}
        ></TextInput>
      </div>
    </Container>
  );
}
